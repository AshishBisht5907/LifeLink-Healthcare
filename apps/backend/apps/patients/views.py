from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaffOrManagementOrAdmin, get_staff_profile
from apps.audit.utils import log_action
from apps.patients import access_grants
from apps.patients.access import user_can_access_patient, user_can_manage_family_links
from apps.patients.models import (
    AccessGrantStatus, Allergy, DataSource, EmergencyContact, FamilyRelationship,
    MedicalHistoryEntry, Medication, PatientAccessGrant, PatientProfile, VerificationStatus,
)
from apps.patients.serializers import (
    AllergySerializer, ClaimPatientProfileSerializer, CreateUnclaimedPatientSerializer,
    EmergencyContactSerializer, FamilyRelationshipSerializer, MedicalHistoryEntrySerializer,
    MedicationSerializer, PatientProfileDetailSerializer, PatientProfileListSerializer,
)
from apps.patients.services import generate_lifelink_patient_id
from apps.workflow.models import RequestStatus


class PatientProfileViewSet(viewsets.ModelViewSet):
    """
    No global unrestricted search (section 44) — `list()` deliberately
    returns nothing by default; patients are reached via `retrieve()` (by
    ID, which requires access) or the scoped `search` action.
    """
    serializer_class = PatientProfileDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PatientProfile.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return PatientProfileListSerializer
        return PatientProfileDetailSerializer

    def list(self, request, *args, **kwargs):
        # No unrestricted browsing of all patients, ever.
        return Response([], status=status.HTTP_200_OK)

    def retrieve(self, request, *args, **kwargs):
        patient = self.get_object()
        if not user_can_access_patient(request.user, patient):
            log_action('PATIENT_VIEW_DENIED', actor=request.user, result='DENIED', patient_id=patient.id)
            raise PermissionDenied('You are not authorised to view this patient.')
        log_action('PATIENT_VIEWED', actor=request.user, patient_id=patient.id)
        return Response(self.get_serializer(patient).data)

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        """
        The real fix for "how does a logged-in patient/family user find
        their own PatientProfile" (previously there was no such endpoint —
        list() always returns [] and search/ is staff-only). Always
        returns a list for a consistent frontend contract: PATIENT will
        have 0 or 1 entries; FAMILY may have more than one linked patient.
        """
        if request.user.role == 'PATIENT':
            patients = PatientProfile.objects.filter(user=request.user)
        elif request.user.role == 'FAMILY':
            patients = PatientProfile.objects.filter(
                family_links__family_user=request.user, family_links__is_active=True
            )
        else:
            raise PermissionDenied('This endpoint is for patient/family accounts only.')
        return Response(PatientProfileDetailSerializer(patients, many=True).data)

    @action(detail=False, methods=['get'])
    def search(self, request):
        """Restricted search (section 44): staff only, must match an exact
        identifier — never a free-text name-only global search."""
        if request.user.role not in ('HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
            raise PermissionDenied('Patient search is restricted to hospital staff.')
        lifelink_id = request.query_params.get('lifelink_patient_id')
        phone = request.query_params.get('phone')
        if not lifelink_id and not phone:
            return Response({'detail': 'Provide lifelink_patient_id or phone to search.'},
                             status=status.HTTP_400_BAD_REQUEST)
        qs = PatientProfile.objects.all()
        if lifelink_id:
            qs = qs.filter(lifelink_patient_id__iexact=lifelink_id)
        elif phone:
            qs = qs.filter(phone=phone)
        log_action('PATIENT_SEARCH', actor=request.user, target_description=f'id={lifelink_id} phone={phone}')
        return Response([self._search_row(request.user, p) for p in qs[:10]])

    @staticmethod
    def _search_row(user, patient):
        """Patients inside the caller's hospital scope come back in full.
        Everyone else only comes back as a minimal 'you can ask for access'
        card - no phone, no date of birth, no full name."""
        if user_can_access_patient(user, patient):
            return {**PatientProfileListSerializer(patient).data, 'access': 'GRANTED'}
        latest = (PatientAccessGrant.objects.filter(patient=patient, requested_by=user)
                  .order_by('-created_at').first())
        name = patient.full_name or ''
        masked = ' '.join((part[:1] + '*' * max(len(part) - 1, 0)) for part in name.split())
        return {
            'id': str(patient.id),
            'lifelink_patient_id': patient.lifelink_patient_id,
            'full_name': masked,
            'is_unclaimed': patient.is_unclaimed,
            'access': latest.effective_status if latest else 'NONE',
            'access_request_id': str(latest.id) if latest else None,
            'can_request_access': user.role == 'HOSPITAL_MANAGEMENT',
        }

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def create_unclaimed(self, request):
        """Section 14 — emergency arrival with no LifeLink account."""
        serializer = CreateUnclaimedPatientSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_profile(request.user)
        if not staff:
            raise PermissionDenied('Only hospital staff can register a new patient.')

        validated = serializer.validated_data
        phone = (validated.get('phone') or '').strip()
        full_name = (validated.get('full_name') or '').strip()
        date_of_birth = validated.get('date_of_birth')

        existing_match = None
        if phone:
            existing_match = PatientProfile.objects.filter(phone__iexact=phone).first()
        elif full_name and date_of_birth:
            existing_match = PatientProfile.objects.filter(
                full_name__iexact=full_name,
                date_of_birth=date_of_birth,
            ).first()

        if existing_match:
            detail = (
                'An existing patient record already matches this phone number.'
                if phone else
                'An existing patient record already matches this name and date of birth.'
            )
            return Response({
                'detail': detail,
                'existing_patient': {
                    'id': str(existing_match.id),
                    'lifelink_patient_id': existing_match.lifelink_patient_id,
                    'full_name': existing_match.full_name,
                },
            }, status=status.HTTP_409_CONFLICT)

        patient = PatientProfile.objects.create(
            lifelink_patient_id=generate_lifelink_patient_id(),
            is_unclaimed=True,
            created_by_staff=staff,
            created_by_hospital=staff.hospital,
            **validated,
        )
        log_action('UNCLAIMED_PATIENT_CREATED', actor=request.user, hospital_id=staff.hospital_id,
                    patient_id=patient.id, target_description=patient.lifelink_patient_id)
        return Response(PatientProfileDetailSerializer(patient).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def claim(self, request):
        """Section 14 — patient/family links their verified account to an
        existing unclaimed profile. Requires the user to already have
        completed OTP/identity verification (checked by the account having
        an IdentityVerification or being freshly OTP-authenticated — for
        this MVP we simply require the caller be authenticated as
        PATIENT/FAMILY and know the exact LifeLink Patient ID, which acts as
        a shared secret handed out by hospital staff at registration)."""
        serializer = ClaimPatientProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            patient = PatientProfile.objects.get(
                lifelink_patient_id__iexact=serializer.validated_data['lifelink_patient_id'],
                is_unclaimed=True,
            )
        except PatientProfile.DoesNotExist:
            return Response({'detail': 'No unclaimed profile found with that ID.'}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == 'PATIENT':
            patient.user = request.user
            patient.is_unclaimed = False
            patient.save(update_fields=['user', 'is_unclaimed'])
        elif request.user.role == 'FAMILY':
            FamilyRelationship.objects.get_or_create(
                patient=patient, family_user=request.user,
                defaults={'relationship_type': 'Representative', 'access_level': 'FULL_REPRESENTATIVE'},
            )
        else:
            raise PermissionDenied('Only patient or family accounts can claim a profile.')

        log_action('PATIENT_PROFILE_CLAIMED', actor=request.user, patient_id=patient.id)
        return Response(PatientProfileDetailSerializer(patient).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def send_welcome_sms(self, request, pk=None):
        """
        Send welcome SMS with OTP to an unclaimed patient. This endpoint allows staff
        to initiate the patient onboarding flow by sending an invite to their phone.
        The OTP is generated and sent via the configured provider (SMS/email).
        """
        from apps.accounts.models import OTPRequest
        from apps.accounts.otp import generate_code, get_otp_provider, hash_code
        from django.conf import settings
        from django.utils import timezone

        patient = self.get_object()

        # Only unclaimed patients can receive welcome SMS
        if not patient.is_unclaimed:
            return Response(
                {'detail': 'Patient already has an account. Cannot send welcome SMS.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Patient must have a phone number
        if not patient.phone:
            return Response(
                {'detail': 'Patient has no phone number on file.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check staff access to hospital
        staff = get_staff_profile(request.user)
        if not staff or staff.hospital_id != patient.created_by_hospital_id:
            raise PermissionDenied('You are not authorised to send invite for this patient.')

        # Generate OTP for REGISTER purpose
        code = generate_code()
        otp = OTPRequest.objects.create(
            phone=patient.phone,
            purpose='REGISTER',
            code_hash=hash_code(code, patient.phone),
            expires_at=timezone.now() + timezone.timedelta(seconds=settings.OTP_TTL_SECONDS),
        )

        # Send via OTP provider (SMS/email)
        try:
            get_otp_provider().send(patient.phone, code, 'REGISTER')
        except Exception as e:
            otp.delete()
            log_action('WELCOME_SMS_FAILED', actor=request.user, patient_id=patient.id,
                      result='DENIED', target_description=str(e))
            return Response(
                {'detail': f'Failed to send SMS: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        log_action('WELCOME_SMS_SENT', actor=request.user, patient_id=patient.id,
                  target_description=patient.lifelink_patient_id)

        payload = {'detail': 'Welcome SMS sent successfully.', 'otp_id': str(otp.id)}
        if settings.OTP_DEV_MODE:
            payload['dev_otp'] = code  # dev mode only
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def live_status(self, request, pk=None):
        """Section 4 — the family-facing feed. Only `is_family_visible`
        requests in an active (non-terminal) state are shown; internal
        noise never reaches here."""
        patient = self.get_object()
        if not user_can_access_patient(request.user, patient):
            raise PermissionDenied('You are not authorised to view this patient.')

        active_statuses = [s for s in RequestStatus.values if s not in
                            (RequestStatus.COMPLETED, RequestStatus.CANCELLED, RequestStatus.REJECTED)]
        requests = patient.service_requests.filter(
            is_family_visible=True, status__in=active_statuses
        ).select_related('target_department')

        data = [{
            'id': str(r.id),
            'type': r.get_request_type_display(),
            'status': r.get_status_display(),
            'priority': r.priority,
            'department': r.target_department.name if r.target_department else None,
            'created_at': r.created_at,
        } for r in requests]
        return Response(data)


class CannotWriteIfFamily(BasePermission):
    """A FAMILY account may read its own links but never create, change or
    delete any link (that would let a family member grant access to others,
    or widen their own)."""
    message = 'Family accounts cannot change family access.'

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.role != 'FAMILY'


class FamilyRelationshipViewSet(viewsets.ModelViewSet):
    serializer_class = FamilyRelationshipSerializer
    permission_classes = [IsAuthenticated, CannotWriteIfFamily]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'FAMILY':
            return FamilyRelationship.objects.filter(family_user=user)

        # For detail routes (retrieve, update, delete), allow access if user can manage the patient
        # For list routes, require patient query parameter
        if self.action in ('retrieve', 'update', 'partial_update', 'destroy'):
            return FamilyRelationship.objects.all()

        patient_id = self.request.query_params.get('patient')
        if patient_id:
            patient = PatientProfile.objects.filter(id=patient_id).first()
            if patient and user_can_access_patient(user, patient):
                return FamilyRelationship.objects.filter(patient=patient)
        return FamilyRelationship.objects.none()

    def retrieve(self, request, *args, **kwargs):
        """Override to check permission on specific link."""
        link = self.get_object()
        if not user_can_access_patient(request.user, link.patient):
            raise PermissionDenied('You are not authorised to view this family link.')
        return super().retrieve(request, *args, **kwargs)

    # Writes use user_can_manage_family_links(), NOT user_can_access_patient():
    # being allowed to VIEW a patient (including through a temporary emergency
    # or patient-approved grant) must never allow handing out lasting privileges.
    def perform_create(self, serializer):
        patient = serializer.validated_data['patient']
        if not user_can_manage_family_links(self.request.user, patient):
            raise PermissionDenied('You are not authorised to manage this patient\'s family access.')
        serializer.save()

    def perform_update(self, serializer):
        patient = serializer.instance.patient
        if not user_can_manage_family_links(self.request.user, patient):
            raise PermissionDenied('You are not authorised to manage this patient\'s family access.')
        serializer.save()

    def perform_destroy(self, instance):
        if not user_can_manage_family_links(self.request.user, instance.patient):
            raise PermissionDenied('You are not authorised to manage this patient\'s family access.')
        instance.delete()


def _patient_scoped_queryset(model, request):
    patient_id = request.query_params.get('patient')
    if not patient_id:
        return model.objects.none()
    patient = PatientProfile.objects.filter(id=patient_id).first()
    if not patient or not user_can_access_patient(request.user, patient):
        return model.objects.none()
    return model.objects.filter(patient=patient)


class AllergyRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=255)


class AllergyViewSet(viewsets.ModelViewSet):
    """
    Section 3/4: patients/family CAN submit self-reported allergy
    information, but can never mark it verified — that requires a hospital
    staff member calling verify()/reject() below. `source` and
    `verification_status` are always forced server-side, never taken from
    client input, regardless of who's creating the record.
    """
    serializer_class = AllergySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.action in ('verify', 'reject'):
            return Allergy.objects.all()
        return _patient_scoped_queryset(Allergy, self.request)

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        if self.action in ('verify', 'reject'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        patient = serializer.validated_data['patient']
        user = self.request.user
        if not user_can_access_patient(user, patient):
            raise PermissionDenied("You are not authorised to add to this patient's record.")

        if user.role == 'PATIENT':
            source = DataSource.SELF_REPORTED
        elif user.role == 'FAMILY':
            source = DataSource.FAMILY_REPORTED
        elif user.role in ('HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT'):
            source = DataSource.HOSPITAL_ENTERED
        else:
            source = DataSource.HOSPITAL_ENTERED

        # Staff-entered allergies still start PENDING_VERIFICATION — only
        # an explicit verify() call promotes anything to VERIFIED, so
        # there's always a real verifying actor on record (section 49).
        serializer.save(source=source, verification_status=VerificationStatus.PENDING_VERIFICATION)
        log_action('ALLERGY_REPORTED', actor=user, patient_id=patient.id,
                    target_description=f'{serializer.instance.substance} ({source})')

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        allergy = self.get_object()
        if not user_can_access_patient(request.user, allergy.patient):
            raise PermissionDenied('Not authorised for this patient.')
        allergy.verification_status = VerificationStatus.VERIFIED
        allergy.save(update_fields=['verification_status'])
        log_action('ALLERGY_VERIFIED', actor=request.user, patient_id=allergy.patient_id,
                    target_description=str(allergy.id))
        return Response(AllergySerializer(allergy).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        allergy = self.get_object()
        if not user_can_access_patient(request.user, allergy.patient):
            raise PermissionDenied('Not authorised for this patient.')
        serializer = AllergyRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        allergy.verification_status = 'REJECTED'
        allergy.save(update_fields=['verification_status'])
        log_action('ALLERGY_REJECTED', actor=request.user, patient_id=allergy.patient_id,
                    target_description=f'{allergy.id}: {serializer.validated_data["reason"]}')
        return Response(AllergySerializer(allergy).data)


class MedicalHistoryEntryViewSet(viewsets.ModelViewSet):
    serializer_class = MedicalHistoryEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _patient_scoped_queryset(MedicalHistoryEntry, self.request)

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]


class MedicationViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _patient_scoped_queryset(Medication, self.request)

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]


class EmergencyContactViewSet(viewsets.ModelViewSet):
    serializer_class = EmergencyContactSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _patient_scoped_queryset(EmergencyContact, self.request)


def _grant_row(grant):
    return {
        'id': str(grant.id),
        'patient_id': str(grant.patient_id),
        'lifelink_patient_id': grant.patient.lifelink_patient_id,
        'grant_type': grant.grant_type,
        'status': grant.effective_status,
        'reason': grant.reason,
        'hospital_name': grant.hospital.name,
        'requested_by_name': grant.requested_by.get_full_name() or grant.requested_by.username,
        'created_at': grant.created_at,
        'resolved_at': grant.resolved_at,
        'expires_at': grant.expires_at,
    }


class PatientAccessGrantViewSet(viewsets.ViewSet):
    """Management -> Patient access requests and emergency access.

    Management sees only its OWN requests. A patient sees only requests
    about their OWN record. Nobody else sees anything.
    """
    permission_classes = [IsAuthenticated]

    def _patient_from_body(self, request):
        pid = request.data.get('patient')
        if not pid:
            raise serializers.ValidationError({'patient': 'This field is required.'})
        try:
            return PatientProfile.objects.get(pk=pid)
        except (PatientProfile.DoesNotExist, ValueError, DjangoValidationError):
            # Same answer for "does not exist" and "malformed id".
            raise NotFound('Patient not found.')

    def list(self, request):
        user = request.user
        qs = PatientAccessGrant.objects.select_related('patient', 'hospital', 'requested_by')
        if user.role == 'PATIENT':
            qs = qs.filter(patient__user=user)
        elif user.role == 'HOSPITAL_MANAGEMENT':
            qs = qs.filter(requested_by=user)
        else:
            raise PermissionDenied('You cannot view access requests.')
        return Response([_grant_row(g) for g in qs[:100]])

    def create(self, request):
        patient = self._patient_from_body(request)
        grant = access_grants.request_normal_access(request.user, patient, request.data.get('reason'))
        return Response(_grant_row(grant), status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def emergency(self, request):
        patient = self._patient_from_body(request)
        grant = access_grants.request_emergency_access(request.user, patient, request.data.get('reason'))
        return Response(_grant_row(grant), status=status.HTTP_201_CREATED)

    def _own_grant(self, request, pk):
        try:
            grant = PatientAccessGrant.objects.select_related('patient', 'hospital', 'requested_by').get(pk=pk)
        except (PatientAccessGrant.DoesNotExist, ValueError, DjangoValidationError):
            raise NotFound('Access request not found.')
        # Hide other people's requests behind a 404, not a 403.
        if request.user.role != 'PATIENT' or grant.patient.user_id != request.user.id:
            raise NotFound('Access request not found.')
        return grant

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        grant = access_grants.resolve_access_request(request.user, self._own_grant(request, pk), True)
        return Response(_grant_row(grant))

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        grant = access_grants.resolve_access_request(request.user, self._own_grant(request, pk), False)
        return Response(_grant_row(grant))

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        grant = access_grants.revoke_access(request.user, self._own_grant(request, pk))
        return Response(_grant_row(grant))
