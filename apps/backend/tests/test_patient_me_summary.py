import pytest
from rest_framework import status

from apps.accounts.models import Role, User
from apps.patients.models import Allergy, FamilyRelationship, PatientProfile


@pytest.mark.django_db
def test_family_me_endpoint_returns_identity_summary_without_consent(api_client, patient):
    """A family link may identify its patient without exposing clinical details."""
    family_user = User.objects.create(
        username='family_without_consent',
        role=Role.FAMILY,
        phone='9990003333',
    )
    family_user.set_unusable_password()
    family_user.save()
    FamilyRelationship.objects.create(
        patient=patient,
        family_user=family_user,
        relationship_type='Spouse',
        access_level='FULL_REPRESENTATIVE',
    )
    Allergy.objects.create(
        patient=patient,
        substance='Peanuts',
        severity='SEVERE',
        source='SELF_REPORTED',
    )

    api_client.force_authenticate(user=family_user)
    response = api_client.get('/api/patients/me/')

    assert response.status_code == status.HTTP_200_OK
    assert response.data == [{
        'id': str(patient.id),
        'lifelink_patient_id': patient.lifelink_patient_id,
        'full_name': patient.full_name,
        'is_unclaimed': patient.is_unclaimed,
    }]
    assert 'allergies' not in response.data[0]
    assert 'medications' not in response.data[0]
    assert 'history_entries' not in response.data[0]

    # The full-detail endpoint still enforces consent independently.
    detail_response = api_client.get(f'/api/patients/{patient.id}/')
    assert detail_response.status_code == status.HTTP_403_FORBIDDEN



@pytest.mark.django_db
def test_patient_registration_persists_address_from_registration_form(api_client, settings):
    settings.OTP_DEV_MODE = True
    phone = '9990004444'

    otp_response = api_client.post(
        '/api/auth/otp/request/',
        {'phone': phone, 'purpose': 'REGISTER'},
        format='json',
    )
    assert otp_response.status_code == status.HTTP_200_OK
    code = otp_response.data['dev_otp']

    registration_response = api_client.post(
        '/api/auth/otp/verify/',
        {
            'phone': phone,
            'purpose': 'REGISTER',
            'code': code,
            'full_name': 'Address Test Patient',
            'date_of_birth': '2000-02-03',
            'gender': 'U',
            'email': 'address-test@example.com',
            'address': '12 Test Road, Srinagar',
        },
        format='json',
    )

    assert registration_response.status_code == status.HTTP_200_OK
    profile = PatientProfile.objects.get(user__phone=phone)
    assert profile.full_name == 'Address Test Patient'
    assert profile.address == '12 Test Road, Srinagar'


@pytest.mark.django_db
def test_family_registration_creates_pending_link_that_patient_can_activate(
    api_client, patient, patient_user
):
    phone = '9990005555'
    otp_response = api_client.post(
        '/api/auth/otp/request/',
        {'phone': phone, 'purpose': 'REGISTER_FAMILY'},
        format='json',
    )
    assert otp_response.status_code == status.HTTP_200_OK

    registration_response = api_client.post(
        '/api/auth/otp/verify/',
        {
            'phone': phone,
            'purpose': 'REGISTER_FAMILY',
            'code': otp_response.data['dev_otp'],
            'full_name': 'Family Test User',
            'lifelink_patient_id': patient.lifelink_patient_id,
            'relationship_type': 'Sibling',
        },
        format='json',
    )
    assert registration_response.status_code == status.HTTP_200_OK
    family_user = User.objects.get(phone=phone)
    assert family_user.role == Role.FAMILY

    link = FamilyRelationship.objects.get(patient=patient, family_user=family_user)
    assert link.is_active is False

    # The patient sees the pending link and explicitly activates it.
    api_client.force_authenticate(user=patient_user)
    links_response = api_client.get(f'/api/patients/family-links/?patient={patient.id}')
    assert links_response.status_code == status.HTTP_200_OK
    assert any(row['id'] == str(link.id) and not row['is_active'] for row in links_response.data['results'])

    activate_response = api_client.patch(
        f'/api/patients/family-links/{link.id}/',
        {'is_active': True},
        format='json',
    )
    assert activate_response.status_code == status.HTTP_200_OK
    link.refresh_from_db()
    assert link.is_active is True

    # Family discovery becomes available after approval, but clinical details
    # still require the patient's separate consent.
    api_client.force_authenticate(user=family_user)
    summary_response = api_client.get('/api/patients/me/')
    assert summary_response.status_code == status.HTTP_200_OK
    assert summary_response.data[0]['id'] == str(patient.id)
    detail_response = api_client.get(f'/api/patients/{patient.id}/')
    assert detail_response.status_code == status.HTTP_403_FORBIDDEN
