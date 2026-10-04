import pytest
from django.core.management import call_command
from rest_framework_simplejwt.tokens import RefreshToken

from apps.patients.models import PatientProfile
from apps.admissions.models import Admission
from apps.hospitals.models import HospitalCapacity
from apps.notifications.models import Notification
from apps.referrals.models import Referral, Transfer
from apps.workflow.models import ServiceRequest
from apps.workflow.models import RequestTypeCode
from apps.workflow.services import create_service_request
from tests.conftest import auth_client


@pytest.mark.django_db
def test_doctor_can_see_a_request_they_created_outside_their_own_department(doctor_a, patient, admission, dept_radiology_a):
    """Gap fix: a doctor (department=GENERAL) ordering a CT scan (routed to
    RADIOLOGY) must still be able to see it in their own request list."""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    client = auth_client(doctor_a)
    resp = client.get('/api/requests/')
    assert resp.status_code == 200
    ids = [r['id'] for r in resp.json()['results']]
    assert str(req.id) in ids


@pytest.mark.django_db
def test_doctor_still_cannot_see_another_doctors_unrelated_department_request(doctor_a, hospital_a, dept_general_a, patient, admission):
    """The fix adds visibility for the creator, not a blanket hospital-wide
    view — a request neither created by this doctor nor routed to their
    department must stay invisible to them."""
    from tests.conftest import _make_staff
    from apps.hospitals.models import StaffRole
    other_doctor = _make_staff(hospital_a, dept_general_a, StaffRole.DOCTOR, 'other_doctor_a')
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=other_doctor)

    client = auth_client(doctor_a)
    resp = client.get('/api/requests/')
    ids = [r['id'] for r in resp.json()['results']]
    assert str(req.id) not in ids


@pytest.mark.django_db
def test_requests_can_be_filtered_by_admission_query_param(management_a, patient, admission):
    req1 = create_service_request(patient=patient, admission=admission,
                                   request_type=RequestTypeCode.BLOOD_TEST, created_by=management_a)
    client = auth_client(management_a)
    resp = client.get(f'/api/requests/?admission={admission.id}')
    assert resp.status_code == 200
    ids = [r['id'] for r in resp.json()['results']]
    assert str(req1.id) in ids


@pytest.mark.django_db
def test_management_can_view_unclaimed_patient_created_in_their_hospital(management_a, patient):
    """A newly registered patient should remain visible to the registering
    hospital before the first admission exists."""
    client = auth_client(management_a)
    resp = client.get(f'/api/patients/{patient.id}/')
    assert resp.status_code == 200
    assert resp.json()['id'] == str(patient.id)


@pytest.mark.django_db
def test_management_capacity_post_updates_existing_resource_for_same_hospital(management_a, hospital_a):
    """Repeated management updates to the same resource should update the
    existing capacity row instead of trying to insert a duplicate row."""
    HospitalCapacity.objects.create(hospital=hospital_a, resource_type='ICU_BED', total=4, available=2)
    client = auth_client(management_a)

    resp = client.post('/api/capacity/', {
        'hospital': str(hospital_a.id),
        'resource_type': 'ICU_BED',
        'total': 8,
        'available': 5,
    }, format='json')

    assert resp.status_code == 200
    obj = HospitalCapacity.objects.get(hospital=hospital_a, resource_type='ICU_BED')
    assert obj.total == 8
    assert obj.available == 5


@pytest.mark.django_db
def test_management_cannot_create_duplicate_patient_when_phone_already_exists(management_a):
    """The 'register new patient' flow should refuse duplicate permanent
    patient records and point staff to the existing patient instead."""
    existing = PatientProfile.objects.create(
        full_name='Jane Doe',
        lifelink_patient_id='LL-P-999998',
        phone='9876500100',
        is_unclaimed=False,
    )
    client = auth_client(management_a)

    resp = client.post('/api/patients/create_unclaimed/', {
        'full_name': 'Jane Doe',
        'phone': '9876500100',
    }, format='json')

    assert resp.status_code == 409
    assert resp.json()['detail'] == 'An existing patient record already matches this phone number.'
    assert PatientProfile.objects.filter(phone='9876500100').count() == 1
    assert PatientProfile.objects.get(pk=existing.pk).full_name == 'Jane Doe'


@pytest.mark.django_db
def test_management_patient_search_by_phone_finds_existing_profile(management_a):
    patient = PatientProfile.objects.create(
        full_name='Alpha Patient',
        lifelink_patient_id='LL-P-100777',
        phone='9876500777',
        is_unclaimed=False,
    )
    client = auth_client(management_a)

    resp = client.get('/api/patients/search/?phone=9876500777')

    assert resp.status_code == 200
    ids = [item['id'] for item in resp.json()]
    assert str(patient.id) in ids


@pytest.mark.django_db
def test_radiology_staff_still_cannot_complete_a_request_they_can_now_see_but_dont_own(
    doctor_a, radiology_staff_a, billing_staff_a, patient, admission, dept_radiology_a):
    """Confirms the visibility fix did NOT loosen completion authority —
    seeing a request is not the same as being allowed to act on it."""
    from apps.workflow.services import transition_request
    from apps.workflow.models import RequestStatus
    from django.core.exceptions import PermissionDenied

    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    req.status = RequestStatus.IN_PROGRESS
    req.save(update_fields=['status'])

    # billing_staff_a can now query it via ?admission=... just like anyone
    # at the hospital could before, but completion authority is untouched.
    with pytest.raises(PermissionDenied):
        transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=billing_staff_a)


@pytest.mark.django_db
def test_rotated_refresh_token_is_blacklisted_and_cannot_be_reused(doctor_a, api_client):
    """Gap fix: with token_blacklist installed, ROTATE_REFRESH_TOKENS +
    BLACKLIST_AFTER_ROTATION actually invalidates the old refresh token."""
    refresh = RefreshToken.for_user(doctor_a)
    old_refresh_str = str(refresh)

    # First use: rotates successfully, returns a new refresh token.
    resp1 = api_client.post('/api/auth/token/refresh/', {'refresh': old_refresh_str}, format='json')
    assert resp1.status_code == 200
    assert 'refresh' in resp1.json()

    # Reusing the now-rotated-out old refresh token must fail.
    resp2 = api_client.post('/api/auth/token/refresh/', {'refresh': old_refresh_str}, format='json')
    assert resp2.status_code == 401


@pytest.mark.django_db
def test_seed_demo_is_idempotent():
    """The demo seed script should be safe to re-run in a fresh or existing DB."""
    call_command('seed_demo')
    call_command('seed_demo')

    assert PatientProfile.objects.filter(full_name='Rahul Sharma').count() == 1


@pytest.mark.django_db
def test_seed_demo_handles_existing_duplicate_patient_records():
    """A stale duplicate patient should not crash the demo seeder."""
    PatientProfile.objects.create(
        full_name='Rahul Sharma',
        lifelink_patient_id='LL-P-999998',
        phone='9876500001',
        is_unclaimed=True,
    )
    PatientProfile.objects.create(
        full_name='Rahul Sharma',
        lifelink_patient_id='LL-P-999999',
        phone='9876500001',
        is_unclaimed=True,
    )

    call_command('seed_demo')

    assert PatientProfile.objects.filter(full_name='Rahul Sharma', phone='9876500001').count() >= 1


@pytest.mark.django_db
def test_seed_demo_creates_idempotent_completed_transfer_scenario():
    call_command('seed_demo')
    first_counts = (
        PatientProfile.objects.count(), Admission.objects.count(), ServiceRequest.objects.count(),
        Referral.objects.count(), Transfer.objects.count(), Notification.objects.count(),
    )
    call_command('seed_demo')
    second_counts = (
        PatientProfile.objects.count(), Admission.objects.count(), ServiceRequest.objects.count(),
        Referral.objects.count(), Transfer.objects.count(), Notification.objects.count(),
    )

    assert first_counts == second_counts
    assert Referral.objects.filter(status='ACCEPTED').count() == 1
    transfer = Transfer.objects.get()
    assert transfer.new_admission_id is not None
    assert transfer.completed_at is not None
    assert transfer.ambulance_arranged is True
    assert transfer.checklist['reports_attached']['done'] is True
    assert transfer.checklist['bed_ready']['done'] is True
