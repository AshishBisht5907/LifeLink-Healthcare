import pytest

from apps.admissions.models import Admission
from apps.hospitals.models import DepartmentType, StaffProfile
from apps.patients.models import PatientProfile
from apps.patients.services import generate_lifelink_patient_id
from tests.conftest import auth_client


@pytest.mark.django_db
def test_doctor_cannot_access_patient_with_no_admission_at_their_hospital(doctor_a, hospital_b):
    """Section 35: 'Doctor cannot access unauthorized patients.'"""
    other_patient = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(), full_name='Someone Else', is_unclaimed=True,
    )
    client = auth_client(doctor_a)
    resp = client.get(f'/api/patients/{other_patient.id}/')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_hospital_a_staff_cannot_view_patient_only_admitted_at_hospital_b(management_a, hospital_b, dept_general_a):
    """Section 35: 'Hospital A cannot silently modify Hospital B's records'
    — the read side of that: A cannot even *view* B-only patients."""
    from apps.hospitals.models import Department, StaffRole
    from tests.conftest import _make_staff  # noqa
    b_dept = Department.objects.create(hospital=hospital_b, department_type=DepartmentType.GENERAL, name='General')
    b_doctor = _make_staff(hospital_b, b_dept, StaffRole.DOCTOR, 'doctor_b_only')

    patient = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(), full_name='B Only Patient', is_unclaimed=True,
    )
    Admission.objects.create(patient=patient, hospital=hospital_b,
                              admission_number=Admission.generate_admission_number(hospital_b),
                              created_by=b_doctor)

    client = auth_client(management_a)
    resp = client.get(f'/api/patients/{patient.id}/')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_family_can_view_only_linked_patient(family_user, patient, hospital_a):
    other_patient = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(), full_name='Not My Relative', is_unclaimed=True,
    )
    client = auth_client(family_user)

    resp_ok = client.get(f'/api/patients/{patient.id}/')
    assert resp_ok.status_code == 200

    resp_denied = client.get(f'/api/patients/{other_patient.id}/')
    assert resp_denied.status_code == 403


@pytest.mark.django_db
def test_family_only_sees_family_visible_service_requests(family_user, patient, admission, doctor_a):
    """Section 4/53 — internal noise never reaches the family view."""
    from apps.workflow.services import create_service_request
    from apps.workflow.models import RequestTypeCode

    internal = create_service_request(patient=patient, admission=admission,
                                       request_type=RequestTypeCode.GENERIC_TASK, created_by=doctor_a)
    visible = create_service_request(patient=patient, admission=admission,
                                      request_type=RequestTypeCode.CONSULTATION, created_by=doctor_a)

    assert internal.is_family_visible is False
    assert visible.is_family_visible is True

    client = auth_client(family_user)
    resp = client.get(f'/api/patients/{patient.id}/live_status/')
    assert resp.status_code == 200
    ids_shown = [item['id'] for item in resp.json()]
    assert str(visible.id) in ids_shown
    assert str(internal.id) not in ids_shown


@pytest.mark.django_db
def test_user_cannot_change_their_own_role_via_api(patient_user):
    """Section 35: 'A user cannot change their own role from frontend.'"""
    client = auth_client(patient_user)
    resp = client.get('/api/auth/me/')
    assert resp.status_code == 200
    assert resp.json()['role'] == 'PATIENT'

    # There is no PATCH/PUT on MeView at all — the role field is read-only
    # even where a user model IS editable elsewhere. Confirm no update verb works.
    resp2 = client.put('/api/auth/me/', {'role': 'HOSPITAL_ADMIN'}, format='json')
    assert resp2.status_code in (405, 403)  # method not allowed — no mutation path exists

    patient_user.refresh_from_db()
    assert patient_user.role == 'PATIENT'
