import datetime

import pytest
from rest_framework import status

from apps.admissions.models import Admission
from apps.patients.models import PatientProfile


@pytest.mark.django_db
def test_registered_patient_is_available_then_admitted_once(api_client, management_a, hospital_a):
    api_client.force_authenticate(user=management_a)

    before = PatientProfile.objects.count()
    registration = api_client.post(
        '/api/patients/create_unclaimed/',
        {
            'full_name': 'New Admission Candidate',
            'date_of_birth': datetime.date(2001, 2, 3).isoformat(),
            'gender': 'U',
            'phone': '9876501234',
        },
        format='json',
    )
    assert registration.status_code == status.HTTP_201_CREATED
    patient_id = registration.data['id']
    lifelink_id = registration.data['lifelink_patient_id']
    assert PatientProfile.objects.count() == before + 1
    assert not Admission.objects.filter(patient_id=patient_id).exists()

    candidates = api_client.get('/api/patients/admission-candidates/')
    assert candidates.status_code == status.HTTP_200_OK
    assert any(
        row['id'] == patient_id and row['lifelink_patient_id'] == lifelink_id
        for row in candidates.data
    )

    created = api_client.post(
        '/api/admissions/',
        {'patient': patient_id, 'reason': 'Focused regression test'},
        format='json',
    )
    assert created.status_code == status.HTTP_201_CREATED
    assert created.data['patient'] == patient_id
    assert Admission.objects.filter(patient_id=patient_id, hospital=hospital_a).count() == 1
    assert PatientProfile.objects.filter(pk=patient_id).count() == 1

    refreshed_candidates = api_client.get('/api/patients/admission-candidates/')
    assert refreshed_candidates.status_code == status.HTTP_200_OK
    assert all(row['id'] != patient_id for row in refreshed_candidates.data)


@pytest.mark.django_db
def test_admission_candidates_are_not_exposed_to_patient_accounts(api_client, patient_user):
    api_client.force_authenticate(user=patient_user)

    response = api_client.get('/api/patients/admission-candidates/')

    assert response.status_code == status.HTTP_403_FORBIDDEN
