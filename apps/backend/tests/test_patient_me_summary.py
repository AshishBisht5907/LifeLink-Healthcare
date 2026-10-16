import pytest
from rest_framework import status

from apps.accounts.models import Role, User
from apps.patients.models import Allergy, FamilyRelationship


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
