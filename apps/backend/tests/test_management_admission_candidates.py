import datetime

import pytest
from rest_framework import status
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.admissions.models import Admission
from apps.patients.models import (
    AccessGrantStatus, DataSource, MedicalHistoryEntry, MedicalHistoryEventType,
    PatientAccessGrant, PatientProfile, VerificationStatus,
)
from apps.patients.services import generate_lifelink_patient_id


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
    assert str(created.data['patient']) == str(patient_id)
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



@pytest.mark.django_db
def test_patient_approved_self_registered_record_can_be_admitted_and_then_opened_by_hospital_staff(
    api_client, management_a, management_b, doctor_a, radiology_staff_a, hospital_a, hospital_b,
):
    """A patient's approved grant lets its requesting Management admit them;
    after admission, that hospital's clinical staff can access the real record.
    The grant itself must not authorize other users/hospitals.
    """
    patient_user = User.objects.create(
        username='self_registered_for_admission', role=Role.PATIENT, phone='9876507654',
    )
    patient_user.set_unusable_password()
    patient_user.save()
    patient = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(),
        user=patient_user,
        full_name='Self Registered Admission Patient',
        date_of_birth=datetime.date(1994, 7, 12),
        gender='F',
        phone=patient_user.phone,
        is_unclaimed=False,
    )
    MedicalHistoryEntry.objects.create(
        patient=patient,
        event_type=MedicalHistoryEventType.DIAGNOSIS,
        description='Patient-reported asthma history',
        event_date=datetime.date(2023, 4, 1),
        source=DataSource.SELF_REPORTED,
        verification_status=VerificationStatus.PENDING_VERIFICATION,
    )

    api_client.force_authenticate(user=management_a)
    initial_patient_count = PatientProfile.objects.count()

    # Before patient approval, the profile and admission candidate stay hidden.
    request_response = api_client.post(
        '/api/patients/access-requests/',
        {'patient': str(patient.id), 'reason': 'Admission assessment'},
        format='json',
    )
    assert request_response.status_code == status.HTTP_201_CREATED
    grant_id = request_response.data['id']
    grant = PatientAccessGrant.objects.get(pk=grant_id)
    assert grant.patient_id == patient.id
    assert grant.requested_by_id == management_a.id
    assert grant.hospital_id == hospital_a.id
    assert grant.status == AccessGrantStatus.PENDING
    assert api_client.get(f'/api/patients/{patient.id}/').status_code == status.HTTP_403_FORBIDDEN
    candidates_before = api_client.get('/api/patients/admission-candidates/')
    assert candidates_before.status_code == status.HTTP_200_OK
    assert all(row['id'] != str(patient.id) for row in candidates_before.data)

    # Patient approves the specific request. The grant is user- and hospital-bound.
    patient_client = type(api_client)()
    patient_client.force_authenticate(user=patient_user)
    approval = patient_client.post(f'/api/patients/access-requests/{grant_id}/approve/')
    assert approval.status_code == status.HTTP_200_OK
    grant.refresh_from_db()
    assert grant.status == AccessGrantStatus.APPROVED
    assert grant.patient_id == patient.id and grant.requested_by_id == management_a.id
    assert grant.hospital_id == hospital_a.id and grant.expires_at > timezone.now()

    # Management can now open the real profile and it appears as an admission candidate.
    profile_before_admission = api_client.get(f'/api/patients/{patient.id}/')
    assert profile_before_admission.status_code == status.HTTP_200_OK
    assert profile_before_admission.data['id'] == str(patient.id)
    assert profile_before_admission.data['history_entries'][0]['description'] == 'Patient-reported asthma history'
    candidates_after_approval = api_client.get('/api/patients/admission-candidates/')
    assert candidates_after_approval.status_code == status.HTTP_200_OK
    assert any(row['id'] == str(patient.id) for row in candidates_after_approval.data)

    # The approved grant alone is NOT shared with other staff.
    api_client.force_authenticate(user=doctor_a)
    assert api_client.get(f'/api/patients/{patient.id}/').status_code == status.HTTP_403_FORBIDDEN

    # Management uses the PatientProfile UUID, creating one admission (not a duplicate patient).
    api_client.force_authenticate(user=management_a)
    admission_response = api_client.post(
        '/api/admissions/',
        {'patient': str(patient.id), 'reason': 'Admission after patient approval'},
        format='json',
    )
    assert admission_response.status_code == status.HTTP_201_CREATED
    assert str(admission_response.data['patient']) == str(patient.id)
    assert Admission.objects.filter(patient=patient, hospital=hospital_a).count() == 1
    assert PatientProfile.objects.filter(pk=patient.id).count() == initial_patient_count

    # Admission creates the hospital relationship that permits same-hospital staff
    # to open the profile and retrieve its patient-scoped history.
    for staff_user in (doctor_a, radiology_staff_a):
        api_client.force_authenticate(user=staff_user)
        staff_profile = api_client.get(f'/api/patients/{patient.id}/')
        assert staff_profile.status_code == status.HTTP_200_OK
        assert staff_profile.data['history_entries'][0]['description'] == 'Patient-reported asthma history'
        staff_history = api_client.get(f'/api/patients/history/?patient={patient.id}')
        assert staff_history.status_code == status.HTTP_200_OK

    # A different hospital remains isolated even after the patient is admitted at Hospital A.
    api_client.force_authenticate(user=management_b)
    assert api_client.get(f'/api/patients/{patient.id}/').status_code == status.HTTP_403_FORBIDDEN
    candidates_other_hospital = api_client.get('/api/patients/admission-candidates/')
    assert candidates_other_hospital.status_code == status.HTTP_200_OK
    assert all(row['id'] != str(patient.id) for row in candidates_other_hospital.data)
