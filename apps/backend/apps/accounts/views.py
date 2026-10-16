import pyotp
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import IdentityVerification, OTPRequest, Role, User
from apps.patients.models import AccessLevel, FamilyRelationship, PatientProfile
from apps.patients.services import generate_lifelink_patient_id
from apps.accounts.identity import get_identity_provider
from apps.accounts.otp import generate_code, get_otp_provider, hash_code
from apps.accounts.serializers import (
    AadhaarMockVerifySerializer, MeSerializer, OTPRequestSerializer,
    OTPVerifySerializer, StaffLoginSerializer,
)
from apps.audit.middleware import get_client_ip
from apps.audit.utils import log_action
from django.conf import settings


def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class StaffLoginView(APIView):
    """Real username/password auth + optional real TOTP MFA. Lockout after
    repeated failures (section 33)."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user = User.objects.get(username=data['username'])
        except User.DoesNotExist:
            log_action('LOGIN_FAILED', result='DENIED', target_description='unknown username')
            return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if user.is_locked():
            log_action('LOGIN_BLOCKED_LOCKOUT', actor=user, result='DENIED')
            return Response({'detail': 'Account temporarily locked due to repeated failed attempts.'},
                             status=status.HTTP_423_LOCKED)

        auth_user = authenticate(username=data['username'], password=data['password'])
        if not auth_user:
            user.register_failed_login()
            log_action('LOGIN_FAILED', actor=user, result='DENIED')
            return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if auth_user.role not in (Role.HOSPITAL_STAFF, Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN):
            return Response({'detail': 'This login is for hospital accounts only.'}, status=status.HTTP_403_FORBIDDEN)

        if auth_user.mfa_enabled:
            code = data.get('mfa_code', '')
            if not code or not pyotp.TOTP(auth_user.mfa_secret).verify(code, valid_window=1):
                log_action('LOGIN_MFA_FAILED', actor=auth_user, result='DENIED')
                return Response({'detail': 'Invalid or missing MFA code.'}, status=status.HTTP_401_UNAUTHORIZED)

        auth_user.register_successful_login()
        log_action('LOGIN_SUCCESS', actor=auth_user)
        return Response({'user': MeSerializer(auth_user).data, **_tokens_for(auth_user)})


class OTPRequestView(APIView):
    """Requests an OTP for patient/family login or registration. Section 13:
    real hashed/expiring OTP lifecycle behind a swappable send-provider."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone, purpose = serializer.validated_data['phone'], serializer.validated_data['purpose']

        if purpose == 'LOGIN' and not User.objects.filter(phone=phone).exists():
            return Response({'detail': 'No account found for this number.'}, status=status.HTTP_404_NOT_FOUND)
        if purpose in ('REGISTER', 'REGISTER_FAMILY') and User.objects.filter(phone=phone).exists():
            return Response({'detail': 'An account already exists for this number.'}, status=status.HTTP_409_CONFLICT)

        code = generate_code()
        OTPRequest.objects.create(
            phone=phone, purpose=purpose, code_hash=hash_code(code, phone),
            expires_at=timezone.now() + timezone.timedelta(seconds=settings.OTP_TTL_SECONDS),
        )
        try:
            delivered = get_otp_provider().send(phone, code, purpose)
            if not delivered:
                raise RuntimeError('OTP provider did not confirm delivery.')
        except (RuntimeError, ValueError) as exc:
            log_action('OTP_DISPATCH_FAILED', result='ERROR', target_description=purpose)
            return Response({'detail': str(exc) or 'Could not send verification code.'}, status=status.HTTP_502_BAD_GATEWAY)

        payload = {'detail': 'OTP sent.'}
        if settings.OTP_DEV_MODE and settings.DEBUG and settings.OTP_PROVIDER == 'mock':
            payload['dev_otp'] = code  # Only for local mock-provider demos; never echo a real SMS OTP
        return Response(payload)


class OTPVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        otp = OTPRequest.objects.filter(
            phone=d['phone'], purpose=d['purpose'], verified=False
        ).order_by('-created_at').first()

        if not otp or otp.is_expired():
            return Response({'detail': 'OTP expired or not found. Please request a new one.'},
                             status=status.HTTP_400_BAD_REQUEST)
        if otp.attempts >= 5:
            return Response({'detail': 'Too many attempts. Please request a new OTP.'},
                             status=status.HTTP_429_TOO_MANY_REQUESTS)

        otp.attempts += 1
        otp.save(update_fields=['attempts'])

        if otp.code_hash != hash_code(d['code'], d['phone']):
            log_action('OTP_VERIFY_FAILED', result='DENIED', target_description=d['purpose'])
            return Response({'detail': 'Incorrect OTP.'}, status=status.HTTP_400_BAD_REQUEST)

        unclaimed_profiles = PatientProfile.objects.filter(
            phone__iexact=d['phone'], is_unclaimed=True
        )
        family_patient = None
        if d['purpose'] == 'REGISTER_FAMILY':
            lifelink_id = (d.get('lifelink_patient_id') or '').strip()
            if not lifelink_id:
                return Response({'lifelink_patient_id': 'Enter the patient LifeLink ID.'}, status=status.HTTP_400_BAD_REQUEST)
            family_patient = PatientProfile.objects.filter(
                lifelink_patient_id__iexact=lifelink_id, user__isnull=False, is_unclaimed=False
            ).first()
            if not family_patient:
                return Response({'detail': 'No claimed patient account was found for that LifeLink ID.'}, status=status.HTTP_404_NOT_FOUND)

        if d['purpose'] == 'REGISTER' and unclaimed_profiles.count() > 1:
            return Response(
                {'detail': 'Multiple unclaimed patient records match this phone number. Please contact the hospital.'},
                status=status.HTTP_409_CONFLICT,
            )

        otp.verified = True
        otp.save(update_fields=['verified'])

        if d['purpose'] in ('REGISTER', 'REGISTER_FAMILY'):
            is_family_registration = d['purpose'] == 'REGISTER_FAMILY'
            username_prefix = 'family_' if is_family_registration else 'patient_'
            user = User.objects.create(
                username=username_prefix + d['phone'], phone=d['phone'],
                first_name=d.get('full_name', ''), email=d.get('email', ''),
                role=Role.FAMILY if is_family_registration else Role.PATIENT,
            )
            user.set_unusable_password()
            user.save()

            if is_family_registration:
                # Family sign-up never grants access immediately. The patient
                # must explicitly activate the pending relationship first.
                FamilyRelationship.objects.create(
                    patient=family_patient,
                    family_user=user,
                    relationship_type=d.get('relationship_type', 'Representative'),
                    access_level=AccessLevel.FULL_REPRESENTATIVE,
                    is_active=False,
                )
                # Make the pending request visible to the patient immediately.
                from apps.notifications.models import NotificationType
                from apps.notifications.services import _create_once
                _create_once(
                    recipient=family_patient.user,
                    notification_type=NotificationType.GENERAL,
                    title='Family link request',
                    body=f'{user.get_full_name() or user.username} requested to link to your LifeLink record. Open Family access to approve or pause the link.',
                    patient=family_patient,
                    dedupe_key=f'family-link-pending:{family_patient.id}:{user.id}',
                )
            else:
                existing_profile = unclaimed_profiles.first()
                if existing_profile:
                    existing_profile.user = user
                    existing_profile.is_unclaimed = False
                    update_fields = ['user', 'is_unclaimed', 'updated_at']
                    # Keep hospital-entered address when present; fill only a
                    # missing value from the newly verified account form.
                    submitted_address = (d.get('address') or '').strip()
                    if submitted_address and not existing_profile.address:
                        existing_profile.address = submitted_address
                        update_fields.append('address')
                    existing_profile.save(update_fields=update_fields)
                else:
                    # Self-registration creates a profile unless a hospital has
                    # already registered this phone as an unclaimed patient.
                    PatientProfile.objects.create(
                        lifelink_patient_id=generate_lifelink_patient_id(),
                        user=user,
                        full_name=d.get('full_name', ''),
                        phone=d['phone'],
                        address=d.get('address', ''),
                        date_of_birth=d.get('date_of_birth'),
                        gender=d.get('gender', 'U'),
                        is_unclaimed=False,
                    )
            log_action('PATIENT_ACCOUNT_CREATED', actor=user)
        else:
            user = User.objects.get(phone=d['phone'])

        user.register_successful_login()
        log_action('OTP_LOGIN_SUCCESS', actor=user)
        return Response({'user': MeSerializer(user).data, **_tokens_for(user)})


class AadhaarMockVerifyView(APIView):
    """
    DEMO ONLY. Never a real UIDAI call (section 13/73). Verifies against a
    seeded demo identity table and records an IdentityVerification row with
    only a masked identifier — the raw Aadhaar number is never stored.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AadhaarMockVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        result = get_identity_provider().verify(d['aadhaar_number'], d['demo_otp'])
        record = IdentityVerification.objects.create(
            user=request.user, method='AADHAAR_MOCK',
            status='VERIFIED' if result.success else 'FAILED',
            provider_reference=result.provider_reference,
            masked_identifier=result.masked_identifier,
            verified_at=timezone.now() if result.success else None,
        )
        log_action('IDENTITY_VERIFICATION_ATTEMPT', actor=request.user,
                    result='SUCCESS' if result.success else 'DENIED',
                    target_description='Mock Aadhaar verification')

        if not result.success:
            return Response({'detail': result.error, 'is_mock': True}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'detail': 'Identity verified (mock/demo provider).',
            'is_mock': True,
            'masked_identifier': result.masked_identifier,
            'full_name': result.full_name,
        })
