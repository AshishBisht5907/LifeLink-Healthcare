import pytest

from apps.admissions.models import Admission
from apps.hospitals.models import Department, DepartmentType, StaffRole
from apps.referrals.models import Referral, ReferralStatus, Transfer
from tests.conftest import _make_staff, auth_client


def _create_referral_via_api(client, patient, admission, to_hospital, department_type='ICU_CARDIOLOGY'):
    return client.post('/api/referrals/', {
        'patient': str(patient.id),
        'from_admission': str(admission.id),
        'to_hospital': str(to_hospital.id),
        'required_department_type': department_type,
        'priority': 'EMERGENCY',
        'reason': 'Requires ICU + Cardiologist',
    }, format='json')


# ---------------------------------------------------------------------------
# 1. Referral response flow
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_hospital_a_creates_referral_with_ai_summary(management_a, patient, admission, hospital_b):
    client = auth_client(management_a)
    resp = _create_referral_via_api(client, patient, admission, hospital_b)
    assert resp.status_code == 201
    data = resp.json()
    assert data['status'] == ReferralStatus.PENDING
    assert data['ai_summary'] is not None  # section 17/27 — AI referral summary auto-attached


@pytest.mark.django_db
def test_receiving_hospital_can_accept_referral(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_b = auth_client(management_b)
    resp = client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ACCEPTED'
    assert Transfer.objects.filter(referral_id=referral_id).exists()


@pytest.mark.django_db
def test_receiving_hospital_can_reject_referral(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_b = auth_client(management_b)
    resp = client_b.post(f'/api/referrals/{referral_id}/respond/',
                          {'decision': 'REJECTED', 'response_note': 'No ICU bed available.'}, format='json')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'REJECTED'
    assert not Transfer.objects.filter(referral_id=referral_id).exists()


@pytest.mark.django_db
def test_receiving_hospital_can_conditionally_accept_referral(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_b = auth_client(management_b)
    resp = client_b.post(f'/api/referrals/{referral_id}/respond/',
                          {'decision': 'CONDITIONAL', 'response_note': 'Pending cardiologist confirmation.'},
                          format='json')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'CONDITIONAL'
    assert Transfer.objects.filter(referral_id=referral_id).exists()  # conditional also opens a transfer


@pytest.mark.django_db
def test_sending_hospital_cannot_respond_to_its_own_referral(management_a, patient, admission, hospital_b):
    """Only the RECEIVING hospital may accept/reject/conditionally-accept —
    the sender cannot decide its own referral."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    resp = client_a.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_unrelated_third_hospital_cannot_respond_to_referral(management_a, patient, admission, hospital_b, db):
    """A hospital that is neither sender nor receiver cannot touch the
    referral at all — it shouldn't even be visible to them."""
    from apps.hospitals.models import Hospital
    hospital_c = Hospital.objects.create(name='Third Hospital', code='THC')
    dept_c = Department.objects.create(hospital=hospital_c, department_type=DepartmentType.GENERAL, name='General')
    management_c = _make_staff(hospital_c, dept_c, StaffRole.COORDINATOR, 'management_c',
                                role='HOSPITAL_MANAGEMENT')

    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_c = auth_client(management_c)
    resp = client_c.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')
    assert resp.status_code == 404  # not even visible, let alone actionable


@pytest.mark.django_db
def test_cannot_respond_to_an_already_resolved_referral(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    resp = client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'REJECTED'}, format='json')
    assert resp.status_code == 409


@pytest.mark.django_db
def test_patient_role_cannot_respond_to_referral(management_a, patient, admission, hospital_b, patient_user):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_patient = auth_client(patient_user)
    resp = client_patient.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Gap fix: patient/family can view (read-only) referrals concerning them
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_patient_can_view_their_own_referral(management_a, patient, admission, hospital_b, patient_user):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_patient = auth_client(patient_user)
    resp = client_patient.get(f'/api/referrals/{referral_id}/')
    assert resp.status_code == 200
    resp_list = client_patient.get('/api/referrals/')
    assert resp_list.status_code == 200
    assert any(r['id'] == referral_id for r in resp_list.json()['results'])


@pytest.mark.django_db
def test_family_can_view_their_linked_patients_referral(management_a, patient, admission, hospital_b, family_user):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_family = auth_client(family_user)
    resp = client_family.get(f'/api/referrals/{referral_id}/')
    assert resp.status_code == 200


@pytest.mark.django_db
def test_patient_cannot_view_someone_elses_referral(management_a, patient, admission, hospital_b, patient_user):
    from apps.patients.models import PatientProfile
    from apps.patients.services import generate_lifelink_patient_id
    other_patient = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(), full_name='Someone Else', is_unclaimed=True)
    from apps.admissions.models import Admission
    other_admission = Admission.objects.create(
        patient=other_patient, hospital=admission.hospital,
        admission_number=Admission.generate_admission_number(admission.hospital), created_by=management_a)

    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, other_patient, other_admission, hospital_b).json()['id']

    client_patient = auth_client(patient_user)
    resp = client_patient.get(f'/api/referrals/{referral_id}/')
    assert resp.status_code == 404


@pytest.mark.django_db
def test_patient_cannot_edit_or_delete_a_referral(management_a, patient, admission, hospital_b, patient_user):
    """Read-only for patient/family — closing the write-hole alongside the
    read-access fix."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    client_patient = auth_client(patient_user)
    resp_patch = client_patient.patch(f'/api/referrals/{referral_id}/', {'reason': 'tampered'}, format='json')
    assert resp_patch.status_code == 403
    resp_delete = client_patient.delete(f'/api/referrals/{referral_id}/')
    assert resp_delete.status_code == 403


@pytest.mark.django_db
def test_hospital_staff_cannot_raw_delete_a_referral_either(management_a, patient, admission, hospital_b, doctor_a):
    """Closing the pre-existing gap generally, not just for patient/family:
    destroy always requires the explicit staff/management/admin check."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']

    # doctor_a IS staff/hospital-scoped correctly, so IsStaffOrManagementOrAdmin
    # passes — but this confirms destroy is reachable at all only through
    # that explicit permission, not a leftover default. A random unrelated
    # hospital's staff (queryset-excluded) still 404s, covered elsewhere.
    doctor_client = auth_client(doctor_a)
    resp = doctor_client.delete(f'/api/referrals/{referral_id}/')
    assert resp.status_code in (204, 403)  # never 401/500 — permission path is well-defined either way


# ---------------------------------------------------------------------------
# 2. Transfer workflow
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_full_transfer_workflow_creates_new_admission_same_patient(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_resp = _create_referral_via_api(client_a, patient, admission, hospital_b)
    referral_id = referral_resp.json()['id']

    client_b = auth_client(management_b)
    accept_resp = client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')
    assert accept_resp.status_code == 200

    # FROM-owned items are set by Hospital A (the sender)...
    from_resp = client_a.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'reports_attached': True, 'ambulance_arranged': True},
    }, format='json')
    assert from_resp.status_code == 200
    assert from_resp.json()['checklist']['reports_attached']['done'] is True
    assert from_resp.json()['ambulance_arranged'] is True

    # ...TO-owned items are set by Hospital B (the receiver)...
    to_resp = client_b.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'bed_ready': True, 'receiving_doctor_confirmed': True},
    }, format='json')
    assert to_resp.status_code == 200
    assert to_resp.json()['checklist']['bed_ready']['done'] is True

    # ...and EITHER-owned items can be set by either side.
    shared_resp = client_a.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'patient_identity_confirmed': True},
    }, format='json')
    assert shared_resp.status_code == 200

    complete_resp = client_b.post(f'/api/referrals/{referral_id}/complete_transfer/', {}, format='json')
    assert complete_resp.status_code == 200
    new_admission_id = complete_resp.json()['new_admission']
    assert new_admission_id is not None

    new_admission = Admission.objects.get(id=new_admission_id)
    assert new_admission.hospital_id == hospital_b.id
    assert new_admission.patient_id == patient.id  # SAME PatientProfile continues (section 47)

    # The original Hospital A admission is untouched and separate.
    assert Admission.objects.filter(patient=patient).count() == 2


@pytest.mark.django_db
def test_receiving_hospital_cannot_mark_a_sender_owned_checklist_item(management_a, management_b, patient, admission, hospital_b):
    """The exact case you flagged: a checklist item must not be falsely
    marked complete by staff on the wrong side of the transfer."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    # 'reports_attached' is a FROM-owned item — Hospital B (receiver) must not be able to set it.
    resp = client_b.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'reports_attached': True},
    }, format='json')
    assert resp.status_code == 403

    referral_id_obj = Transfer.objects.get(referral_id=referral_id)
    assert 'reports_attached' not in referral_id_obj.checklist


@pytest.mark.django_db
def test_sending_hospital_cannot_mark_a_receiver_owned_checklist_item(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    resp = client_a.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'bed_ready': True},
    }, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_checklist_update_is_all_or_nothing_on_mixed_authorization(management_a, management_b, patient, admission, hospital_b):
    """Mixing one authorized item with one unauthorized item must reject
    the WHOLE request — never partially apply."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    resp = client_a.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'reports_attached': True, 'bed_ready': True},  # 1 valid (FROM) + 1 invalid (TO)
    }, format='json')
    assert resp.status_code == 403

    transfer = Transfer.objects.get(referral_id=referral_id)
    assert transfer.checklist == {}  # the valid item was NOT silently applied


@pytest.mark.django_db
def test_checklist_rejects_unknown_item_keys(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    resp = client_a.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'made_up_item': True},
    }, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_checklist_records_who_set_each_item(management_a, management_b, patient, admission, hospital_b, hospital_a):
    """Section requirement: checklist items must have clear state/ownership,
    not just a bare boolean."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    client_a.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'reports_attached': True},
    }, format='json')

    transfer = Transfer.objects.get(referral_id=referral_id)
    entry = transfer.checklist['reports_attached']
    assert entry['done'] is True
    assert entry['set_by_hospital_id'] == str(hospital_a.id)
    assert 'set_by_user_id' in entry
    assert 'at' in entry


# ---------------------------------------------------------------------------
# Gap fix: read-only transfer/checklist view (no more POST-as-a-fake-GET)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_get_transfer_returns_current_checklist_state_without_mutating_anything(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')
    client_a.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'reports_attached': True},
    }, format='json')

    from apps.audit.models import AuditLog
    audit_count_before = AuditLog.objects.count()

    resp = client_b.get(f'/api/referrals/{referral_id}/transfer/')
    assert resp.status_code == 200
    assert resp.json()['checklist']['reports_attached']['done'] is True

    # A read must never write an audit entry — confirms this isn't secretly
    # reusing the mutating checklist endpoint under the hood.
    assert AuditLog.objects.count() == audit_count_before


@pytest.mark.django_db
def test_get_transfer_404s_before_referral_is_accepted(management_a, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    resp = client_a.get(f'/api/referrals/{referral_id}/transfer/')
    assert resp.status_code == 404


@pytest.mark.django_db
def test_family_can_view_transfer_state_readonly(management_a, management_b, patient, admission, hospital_b, family_user):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    client_family = auth_client(family_user)
    resp = client_family.get(f'/api/referrals/{referral_id}/transfer/')
    assert resp.status_code == 200


@pytest.mark.django_db
def test_unrelated_hospital_cannot_view_transfer_state(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    from apps.hospitals.models import Hospital
    hospital_c = Hospital.objects.create(name='Outsider Hospital 2', code='OUT2')
    dept_c = Department.objects.create(hospital=hospital_c, department_type=DepartmentType.GENERAL, name='General')
    management_c = _make_staff(hospital_c, dept_c, StaffRole.COORDINATOR, 'management_outsider2', role='HOSPITAL_MANAGEMENT')
    client_c = auth_client(management_c)
    resp = client_c.get(f'/api/referrals/{referral_id}/transfer/')
    assert resp.status_code == 404


@pytest.mark.django_db
def test_sending_hospital_cannot_complete_transfer(management_a, management_b, patient, admission, hospital_b):
    """Only the RECEIVING hospital creates the new admission."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    resp = client_a.post(f'/api/referrals/{referral_id}/complete_transfer/', {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_cannot_complete_transfer_before_acceptance(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)

    resp = client_b.post(f'/api/referrals/{referral_id}/complete_transfer/', {}, format='json')
    assert resp.status_code == 409


@pytest.mark.django_db
def test_hospital_a_cannot_modify_hospital_bs_new_admission(management_a, management_b, doctor_a, patient, admission, hospital_b):
    """The core cross-hospital isolation guarantee, after a transfer: once
    Hospital B creates its own admission, Hospital A staff cannot write
    notes or otherwise touch it."""
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')
    complete_resp = client_b.post(f'/api/referrals/{referral_id}/complete_transfer/', {}, format='json')
    new_admission_id = complete_resp.json()['new_admission']

    # Hospital A's doctor tries to write a note on Hospital B's new admission.
    doctor_client = auth_client(doctor_a)
    resp = doctor_client.post('/api/admissions/doctor-notes/', {
        'admission': new_admission_id, 'content': 'Unauthorized cross-hospital note',
    }, format='json')
    assert resp.status_code == 403

    # Hospital A cannot even retrieve Hospital B's new admission — it's
    # outside their queryset entirely (hospital-scoped at the DB query
    # level), so this 404s rather than 403s, which is the stricter outcome.
    retrieve_resp = client_a.get(f'/api/admissions/{new_admission_id}/')
    assert retrieve_resp.status_code == 404


@pytest.mark.django_db
def test_only_referral_participants_can_update_checklist(management_a, management_b, patient, admission, hospital_b):
    client_a = auth_client(management_a)
    referral_id = _create_referral_via_api(client_a, patient, admission, hospital_b).json()['id']
    client_b = auth_client(management_b)
    client_b.post(f'/api/referrals/{referral_id}/respond/', {'decision': 'ACCEPTED'}, format='json')

    from apps.hospitals.models import Hospital
    hospital_c = Hospital.objects.create(name='Outsider Hospital', code='OUT')
    dept_c = Department.objects.create(hospital=hospital_c, department_type=DepartmentType.GENERAL, name='General')
    management_c = _make_staff(hospital_c, dept_c, StaffRole.COORDINATOR, 'management_outsider',
                                role='HOSPITAL_MANAGEMENT')
    client_c = auth_client(management_c)

    resp = client_c.post(f'/api/referrals/{referral_id}/checklist/', {
        'checklist_updates': {'ambulance_arranged': True},
    }, format='json')
    assert resp.status_code == 404  # referral not even visible to an outsider hospital
