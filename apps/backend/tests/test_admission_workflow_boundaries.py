import pytest
from rest_framework import status

from apps.accounts.models import Role, User
from apps.hospitals.models import StaffProfile, StaffRole


@pytest.mark.django_db
def test_admission_create_cannot_be_used_to_gain_access_to_an_unrelated_patient(
    api_client, patient, management_b
):
    api_client.force_authenticate(user=management_b)

    response = api_client.post(
        '/api/admissions/',
        {'patient': str(patient.id), 'reason': 'Unrelated admission'},
        format='json',
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_admission_create_rejects_doctor_from_another_hospital(
    api_client, patient, management_a, hospital_b, dept_general_b
):
    doctor_b = User.objects.create(username='doctor_b_for_admission', role=Role.HOSPITAL_STAFF)
    doctor_b.set_password('TestPass123!')
    doctor_b.save()
    StaffProfile.objects.create(
        user=doctor_b,
        hospital=hospital_b,
        department=dept_general_b,
        staff_role=StaffRole.DOCTOR,
        employee_id='EMP-DOCTOR-B-ADMISSION',
    )
    api_client.force_authenticate(user=management_a)

    response = api_client.post(
        '/api/admissions/',
        {
            'patient': str(patient.id),
            'reason': 'Admission with wrong-hospital doctor',
            'attending_doctor': str(doctor_b.id),
        },
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'attending_doctor' in response.data
