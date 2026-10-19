import datetime

import pytest
from rest_framework import status

from apps.accounts.permissions import get_staff_profile
from apps.admissions.models import Admission, AdmissionStatus
from apps.hospitals.models import StaffProfile
from apps.patients.models import PatientProfile
from apps.patients.services import generate_lifelink_patient_id


@pytest.mark.django_db
def test_management_can_register_candidate_and_admit_once(api_client, management_a, hospital_a):
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
    patient_id = str(registration.data['id'])
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
    assert str(created.data['patient']) == patient_id
    assert Admission.objects.filter(patient_id=patient_id, hospital=hospital_a).count() == 1
    assert PatientProfile.objects.filter(pk=patient_id).count() == 1

    refreshed_candidates = api_client.get('/api/patients/admission-candidates/')
    assert refreshed_candidates.status_code == status.HTTP_200_OK
    assert all(row['id'] != patient_id for row in refreshed_candidates.data)


@pytest.mark.django_db
def test_candidate_list_is_hospital_scoped(api_client, management_a, hospital_a, hospital_b, management_b):
    api_client.force_authenticate(user=management_a)
    patient_a = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(),
        full_name='Hospital A Candidate',
        created_by_hospital=hospital_a,
        created_by_staff=get_staff_profile(management_a),
        is_unclaimed=True,
    )
    patient_b = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(),
        full_name='Hospital B Private Candidate',
        created_by_hospital=hospital_b,
        created_by_staff=get_staff_profile(management_b),
        is_unclaimed=True,
    )

    response = api_client.get('/api/patients/admission-candidates/')

    assert response.status_code == status.HTTP_200_OK
    returned_ids = {row['id'] for row in response.data}
    assert str(patient_a.id) in returned_ids
    assert str(patient_b.id) not in returned_ids


@pytest.mark.django_db
def test_active_admission_excludes_candidate_but_discharged_stay_does_not(
    api_client, management_a, patient, hospital_a, doctor_a
):
    api_client.force_authenticate(user=management_a)
    admission = Admission.objects.create(
        patient=patient,
        hospital=hospital_a,
        admission_number=Admission.generate_admission_number(hospital_a),
        attending_doctor=doctor_a,
        reason='Existing stay',
        created_by=doctor_a,
        status=AdmissionStatus.ACTIVE,
    )

    active_response = api_client.get('/api/patients/admission-candidates/')
    assert active_response.status_code == status.HTTP_200_OK
    assert str(patient.id) not in {row['id'] for row in active_response.data}

    admission.status = AdmissionStatus.DISCHARGED
    admission.save(update_fields=['status'])
    discharged_response = api_client.get('/api/patients/admission-candidates/')
    assert discharged_response.status_code == status.HTTP_200_OK
    assert str(patient.id) in {row['id'] for row in discharged_response.data}


@pytest.mark.django_db
def test_management_without_staff_hospital_profile_gets_explanatory_403(
    api_client, management_a
):
    api_client.force_authenticate(user=management_a)
    StaffProfile.objects.filter(user=management_a).delete()

    response = api_client.get('/api/patients/admission-candidates/')

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert 'active hospital staff profile' in response.data['detail']


@pytest.mark.django_db
def test_patient_role_cannot_access_admission_candidates(api_client, patient_user):
    api_client.force_authenticate(user=patient_user)

    response = api_client.get('/api/patients/admission-candidates/')

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
@pytest.mark.parametrize('user_fixture', ['doctor_a', 'hospital_admin_a'])
def test_staff_and_hospital_admin_keep_candidate_access(api_client, request, user_fixture, patient):
    user = request.getfixturevalue(user_fixture)
    api_client.force_authenticate(user=user)

    response = api_client.get('/api/patients/admission-candidates/')

    assert response.status_code == status.HTTP_200_OK
    assert str(patient.id) in {row['id'] for row in response.data}
