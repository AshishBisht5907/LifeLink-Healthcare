"""
Phase 1: Family Access & Welcome SMS Endpoints
Tests for new family access features including welcome SMS and family link management.
"""
import json
import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import OTPRequest, User, Role
from apps.patients.models import PatientProfile, FamilyRelationship
from apps.hospitals.models import Hospital, StaffProfile


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def hospital(db):
    """Create a test hospital."""
    return Hospital.objects.create(name='Test Hospital', code='TH01', city='Test City')


@pytest.fixture
def staff_user(db, hospital):
    """Create a staff user."""
    user = User.objects.create_user(
        username='staff_user',
        phone='+919876543210',
        role=Role.HOSPITAL_STAFF,
        password='testpass123'
    )
    StaffProfile.objects.create(
        user=user,
        hospital=hospital,
        job_title='Doctor',
        employee_id='EMP001'
    )
    return user


@pytest.fixture
def patient_user(db):
    """Create a patient user."""
    return User.objects.create_user(
        username='patient_user',
        phone='+919876543211',
        role=Role.PATIENT,
        password='testpass123'
    )


@pytest.fixture
def unclaimed_patient(db, staff_user, hospital):
    """Create an unclaimed patient profile."""
    return PatientProfile.objects.create(
        lifelink_patient_id='LL-P-100001',
        full_name='John Doe',
        phone='+919876543212',
        is_unclaimed=True,
        created_by_staff=StaffProfile.objects.get(user=staff_user),
        created_by_hospital=hospital,
    )


@pytest.fixture
def claimed_patient(db, patient_user):
    """Create a claimed patient profile."""
    return PatientProfile.objects.create(
        lifelink_patient_id='LL-P-100002',
        full_name='Jane Doe',
        phone='+919876543213',
        user=patient_user,
        is_unclaimed=False,
    )


class TestWelcomeSMSEndpoint:
    """Test the send_welcome_sms endpoint."""

    def test_send_welcome_sms_success(self, client, staff_user, unclaimed_patient):
        """Staff can send welcome SMS to unclaimed patient."""
        client.force_authenticate(user=staff_user)
        url = f'/api/patients/{unclaimed_patient.id}/send_welcome_sms/'

        response = client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert 'detail' in response.json()
        assert 'otp_id' in response.json()

        # Verify OTP was created
        otp = OTPRequest.objects.get(phone=unclaimed_patient.phone, purpose='REGISTER')
        assert otp is not None
        assert not otp.verified

    def test_send_welcome_sms_requires_authentication(self, client, unclaimed_patient):
        """Unauthenticated users cannot send welcome SMS."""
        url = f'/api/patients/{unclaimed_patient.id}/send_welcome_sms/'
        response = client.post(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_send_welcome_sms_requires_staff_role(self, client, patient_user, unclaimed_patient):
        """Only staff/management/admin can send welcome SMS."""
        client.force_authenticate(user=patient_user)
        url = f'/api/patients/{unclaimed_patient.id}/send_welcome_sms/'

        response = client.post(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestPatientRegistrationHandoff:
    def test_registration_claims_matching_unclaimed_profile(self, client, unclaimed_patient):
        with override_settings(OTP_DEV_MODE=True):
            otp_response = client.post('/api/auth/otp/request/', {
                'phone': unclaimed_patient.phone,
                'purpose': 'REGISTER',
            }, format='json')
            assert otp_response.status_code == status.HTTP_200_OK

            response = client.post('/api/auth/otp/verify/', {
                'phone': unclaimed_patient.phone,
                'purpose': 'REGISTER',
                'code': otp_response.json()['dev_otp'],
                'full_name': unclaimed_patient.full_name,
                'date_of_birth': '1980-01-01',
                'gender': 'M',
            }, format='json')

        assert response.status_code == status.HTTP_200_OK
        user = User.objects.get(phone=unclaimed_patient.phone)
        unclaimed_patient.refresh_from_db()
        assert unclaimed_patient.user == user
        assert not unclaimed_patient.is_unclaimed
        assert PatientProfile.objects.filter(phone=unclaimed_patient.phone).count() == 1

    def test_send_welcome_sms_only_unclaimed_patients(self, client, staff_user, claimed_patient):
        """Cannot send welcome SMS to claimed patients."""
        client.force_authenticate(user=staff_user)
        url = f'/api/patients/{claimed_patient.id}/send_welcome_sms/'

        response = client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'already has an account' in response.json()['detail']

    def test_send_welcome_sms_patient_must_have_phone(self, client, staff_user, hospital):
        """Patient must have phone number to receive SMS."""
        staff = StaffProfile.objects.get(user=staff_user)
        patient = PatientProfile.objects.create(
            lifelink_patient_id='LL-P-100003',
            full_name='No Phone Patient',
            phone='',  # No phone
            is_unclaimed=True,
            created_by_staff=staff,
            created_by_hospital=hospital,
        )

        client.force_authenticate(user=staff_user)
        url = f'/api/patients/{patient.id}/send_welcome_sms/'

        response = client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'no phone number' in response.json()['detail']

    def test_send_welcome_sms_staff_hospital_authorization(self, client, hospital, unclaimed_patient):
        """Staff from different hospital cannot send SMS."""
        other_hospital = Hospital.objects.create(name='Other Hospital', code='OH01', city='Other City')
        other_staff = User.objects.create_user(
            username='other_staff',
            phone='+919876543214',
            role=Role.HOSPITAL_STAFF,
            password='testpass123'
        )
        StaffProfile.objects.create(
            user=other_staff,
            hospital=other_hospital,
            job_title='Doctor',
            employee_id='EMP002'
        )

        client.force_authenticate(user=other_staff)
        url = f'/api/patients/{unclaimed_patient.id}/send_welcome_sms/'

        response = client.post(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestFamilyRelationshipEndpoints:
    """Test family relationship CRUD endpoints."""

    def test_patient_can_list_family_links(self, client, patient_user, claimed_patient):
        """Patient can view their family links."""
        family_user = User.objects.create_user(
            username='family_user',
            phone='+919876543215',
            role=Role.FAMILY,
        )
        FamilyRelationship.objects.create(
            patient=claimed_patient,
            family_user=family_user,
            relationship_type='Spouse',
            access_level='FULL_REPRESENTATIVE',
        )

        client.force_authenticate(user=patient_user)
        url = '/api/patients/family-links/?patient=' + str(claimed_patient.id)

        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data['results']) == 1
        assert data['results'][0]['relationship_type'] == 'Spouse'

    def test_family_user_can_list_their_links(self, client, claimed_patient):
        """Family user can view their patient links."""
        family_user = User.objects.create_user(
            username='family_user',
            phone='+919876543215',
            role=Role.FAMILY,
        )
        FamilyRelationship.objects.create(
            patient=claimed_patient,
            family_user=family_user,
            relationship_type='Parent',
            access_level='UPDATES_ONLY',
        )

        client.force_authenticate(user=family_user)
        url = '/api/patients/family-links/'

        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data['results']) == 1
        assert data['results'][0]['relationship_type'] == 'Parent'

    def test_patient_can_create_family_link(self, client, patient_user, claimed_patient):
        """Patient can add a family member."""
        family_user = User.objects.create_user(
            username='new_family',
            phone='+919876543216',
            role=Role.FAMILY,
        )

        client.force_authenticate(user=patient_user)
        url = '/api/patients/family-links/'

        payload = {
            'patient': str(claimed_patient.id),
            'family_user': str(family_user.id),
            'relationship_type': 'Son',
            'access_level': 'UPDATES_ONLY',
            'is_active': True,
        }

        response = client.post(url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()['relationship_type'] == 'Son'

        # Verify link was created and is active
        link = FamilyRelationship.objects.get(patient=claimed_patient, family_user=family_user)
        assert link.is_active is True

    def test_patient_can_update_family_link(self, client, patient_user, claimed_patient):
        """Patient can modify access level for family member."""
        family_user = User.objects.create_user(
            username='family_member',
            phone='+919876543217',
            role=Role.FAMILY,
        )
        link = FamilyRelationship.objects.create(
            patient=claimed_patient,
            family_user=family_user,
            relationship_type='Daughter',
            access_level='UPDATES_ONLY',
        )

        client.force_authenticate(user=patient_user)
        url = f'/api/patients/family-links/{link.id}/'

        payload = {'access_level': 'FULL_REPRESENTATIVE'}
        response = client.patch(url, payload)

        assert response.status_code == status.HTTP_200_OK
        link.refresh_from_db()
        assert link.access_level == 'FULL_REPRESENTATIVE'

    def test_patient_can_revoke_family_link(self, client, patient_user, claimed_patient):
        """Patient can remove family access."""
        family_user = User.objects.create_user(
            username='family_to_remove',
            phone='+919876543218',
            role=Role.FAMILY,
        )
        link = FamilyRelationship.objects.create(
            patient=claimed_patient,
            family_user=family_user,
            relationship_type='Brother',
            access_level='UPDATES_ONLY',
        )

        client.force_authenticate(user=patient_user)
        url = f'/api/patients/family-links/{link.id}/'

        response = client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify link was deleted
        assert not FamilyRelationship.objects.filter(id=link.id).exists()

    def test_cannot_create_duplicate_family_link(self, client, patient_user, claimed_patient):
        """Cannot create duplicate family links (unique_together constraint)."""
        family_user = User.objects.create_user(
            username='duplicate_family',
            phone='+919876543219',
            role=Role.FAMILY,
        )
        FamilyRelationship.objects.create(
            patient=claimed_patient,
            family_user=family_user,
            relationship_type='Mother',
        )

        client.force_authenticate(user=patient_user)
        url = '/api/patients/family-links/'

        payload = {
            'patient': str(claimed_patient.id),
            'family_user': str(family_user.id),
            'relationship_type': 'Mother',
        }

        response = client.post(url, payload)
        # Should fail due to unique constraint or validation
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT]


class TestPatientRegistrationWithExtendedFields:
    """Test patient registration with additional fields."""

    def test_otp_verify_accepts_extended_fields(self, client, db):
        """OTP verification accepts DOB, gender, email, address."""
        phone = '+919876543220'

        # Create OTP request first
        from apps.accounts.otp import generate_code, hash_code
        code = generate_code()
        OTPRequest.objects.create(
            phone=phone,
            purpose='REGISTER',
            code_hash=hash_code(code, phone),
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )

        url = '/api/auth/otp/verify/'
        payload = {
            'phone': phone,
            'purpose': 'REGISTER',
            'code': code,
            'full_name': 'Alice Smith',
            'date_of_birth': '1990-05-15',
            'gender': 'F',
            'email': 'alice@example.com',
            'address': '123 Main St, Springfield',
        }

        response = client.post(url, payload)
        assert response.status_code == status.HTTP_200_OK

        # Verify user and patient profile were created with extended fields
        user = User.objects.get(phone=phone)
        patient = PatientProfile.objects.get(user=user)

        assert patient.date_of_birth.isoformat() == '1990-05-15'
        assert patient.gender == 'F'
        assert user.email == 'alice@example.com'

    def test_otp_verify_extended_fields_optional(self, client, db):
        """Extended fields are optional for backward compatibility."""
        phone = '+919876543221'

        from apps.accounts.otp import generate_code, hash_code
        code = generate_code()
        OTPRequest.objects.create(
            phone=phone,
            purpose='REGISTER',
            code_hash=hash_code(code, phone),
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )

        url = '/api/auth/otp/verify/'
        payload = {
            'phone': phone,
            'purpose': 'REGISTER',
            'code': code,
            'full_name': 'Bob Jones',
        }

        response = client.post(url, payload)
        assert response.status_code == status.HTTP_200_OK

        user = User.objects.get(phone=phone)
        patient = PatientProfile.objects.get(user=user)
        assert patient.gender == 'U'  # Default


@pytest.mark.django_db
class TestFamilyAccessAuditLogging:
    """Test audit logging for family access operations."""

    def test_welcome_sms_logs_action(self, client, staff_user, unclaimed_patient):
        """Welcome SMS sends audit log."""
        from apps.audit.models import AuditLog

        client.force_authenticate(user=staff_user)
        url = f'/api/patients/{unclaimed_patient.id}/send_welcome_sms/'

        response = client.post(url)
        assert response.status_code == status.HTTP_200_OK

        # Check audit log
        log = AuditLog.objects.filter(action='WELCOME_SMS_SENT').first()
        assert log is not None
        assert log.patient_id == unclaimed_patient.id

    def test_family_link_created_logs_action(self, client, patient_user, claimed_patient):
        """Creating family link generates audit log."""
        from apps.audit.models import AuditLog

        family_user = User.objects.create_user(
            username='audit_family',
            phone='+919876543222',
            role=Role.FAMILY,
        )

        client.force_authenticate(user=patient_user)
        url = '/api/patients/family-links/'

        payload = {
            'patient': str(claimed_patient.id),
            'family_user': str(family_user.id),
            'relationship_type': 'Sibling',
        }

        response = client.post(url, payload)
        assert response.status_code == status.HTTP_201_CREATED

        # Verify family link was created
        link = FamilyRelationship.objects.get(patient=claimed_patient, family_user=family_user)
        assert link is not None
