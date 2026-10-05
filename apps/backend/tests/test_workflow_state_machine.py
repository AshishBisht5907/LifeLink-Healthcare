import pytest
from django.core.exceptions import PermissionDenied

from apps.workflow.models import RequestStatus, RequestTypeCode
from apps.workflow.services import WorkflowError, create_service_request, transition_request
from apps.notifications.models import Notification
from tests.conftest import auth_client


@pytest.mark.django_db
def test_ct_scan_auto_routes_to_radiology_department(patient, admission, doctor_a, dept_radiology_a):
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    assert req.target_department_id == dept_radiology_a.id


@pytest.mark.django_db
def test_radiology_staff_can_complete_ct_scan(patient, admission, doctor_a, radiology_staff_a, dept_radiology_a):
    """Section 7/35: correct department staff CAN complete their own request."""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    transition_request(req=req, new_status=RequestStatus.APPROVED, actor=radiology_staff_a)
    transition_request(req=req, new_status=RequestStatus.IN_PROGRESS, actor=radiology_staff_a)
    updated = transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=radiology_staff_a)
    assert updated.status == RequestStatus.COMPLETED
    assert updated.completed_by_id == radiology_staff_a.id


@pytest.mark.django_db
def test_billing_staff_cannot_complete_ct_scan(patient, admission, doctor_a, billing_staff_a, dept_radiology_a):
    """Section 35: 'Radiology cannot edit diagnosis' style rule, generalised:
    wrong-department staff cannot complete clinical work outside their remit."""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    # Fast-forward past the states a real UI would gate — we're testing the
    # hard server-side boundary directly, not the UI path to reach it.
    req.status = RequestStatus.IN_PROGRESS
    req.save(update_fields=['status'])

    with pytest.raises(PermissionDenied):
        transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=billing_staff_a)

    req.refresh_from_db()
    assert req.status == RequestStatus.IN_PROGRESS


@pytest.mark.django_db
def test_management_cannot_complete_clinical_request(patient, admission, doctor_a, management_a, dept_radiology_a):
    """Section 7: 'Hospital Management should NOT be able to falsely mark
    any clinical procedure as completed.'"""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    req.status = RequestStatus.IN_PROGRESS
    req.save(update_fields=['status'])

    with pytest.raises(PermissionDenied):
        transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=management_a)


@pytest.mark.django_db
def test_management_can_complete_administrative_task(patient, admission, doctor_a, management_a):
    """Management IS allowed to close out non-clinical coordination tasks."""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.DOCUMENT_VERIFICATION, created_by=doctor_a)
    req.status = RequestStatus.IN_PROGRESS
    req.save(update_fields=['status'])
    updated = transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=management_a)
    assert updated.status == RequestStatus.COMPLETED


@pytest.mark.django_db
def test_postponed_procedure_never_becomes_performed(patient, admission, doctor_a, radiology_staff_a, dept_radiology_a):
    """Section 35: 'Cancelled/postponed operation cannot appear as performed.'
    A postponed request must go back through APPROVED before it can ever be
    completed — it can never jump straight from POSTPONED to COMPLETED."""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    transition_request(req=req, new_status=RequestStatus.APPROVED, actor=radiology_staff_a)
    transition_request(req=req, new_status=RequestStatus.POSTPONED, actor=radiology_staff_a, note='Patient unwell.')

    with pytest.raises(WorkflowError):
        transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=radiology_staff_a)

    req.refresh_from_db()
    assert req.status == RequestStatus.POSTPONED
    assert not patient.history_entries.filter(event_type='SURGERY').exists()


@pytest.mark.django_db
def test_completed_request_is_a_terminal_state(patient, admission, doctor_a, radiology_staff_a):
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a)
    transition_request(req=req, new_status=RequestStatus.APPROVED, actor=radiology_staff_a)
    transition_request(req=req, new_status=RequestStatus.IN_PROGRESS, actor=radiology_staff_a)
    transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=radiology_staff_a)

    with pytest.raises(WorkflowError):
        transition_request(req=req, new_status=RequestStatus.IN_PROGRESS, actor=radiology_staff_a)


@pytest.mark.django_db
def test_surgery_completion_promotes_to_permanent_history(patient, admission, doctor_a, hospital_a, dept_general_a):
    """Section 3/6: only an actual COMPLETED surgery enters PatientProfile
    history — approval alone must not."""
    from apps.hospitals.models import DepartmentType, Department, StaffProfile, StaffRole
    from tests.conftest import _make_staff
    ot_dept = Department.objects.create(hospital=hospital_a, department_type=DepartmentType.OT, name='OT')
    ot_staff = _make_staff(hospital_a, ot_dept, StaffRole.NURSE, 'ot_test')

    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.SURGERY, created_by=doctor_a)
    # SURGERY requires consent -> starts in APPROVAL_REQUIRED, not directly approvable.
    assert req.status == RequestStatus.APPROVAL_REQUIRED
    assert not patient.history_entries.filter(event_type='SURGERY').exists()

    req.status = RequestStatus.APPROVED  # simulate consent having been approved
    req.save(update_fields=['status'])
    assert not patient.history_entries.filter(event_type='SURGERY').exists()  # approved != completed

    transition_request(req=req, new_status=RequestStatus.IN_PROGRESS, actor=ot_staff)
    transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=ot_staff)

    assert patient.history_entries.filter(event_type='SURGERY', verification_status='VERIFIED').exists()


@pytest.mark.django_db
def test_patient_request_waits_for_management_then_routes_to_department(
    patient_user, patient, admission, management_a, radiology_staff_a, dept_radiology_a,
):
    patient_client = auth_client(patient_user)
    response = patient_client.post('/api/requests/', {
        'patient': str(patient.id), 'admission': str(admission.id),
        'request_type': RequestTypeCode.CT_SCAN, 'reason': 'Patient-requested scan',
    }, format='json')

    assert response.status_code == 201
    request_id = response.json()['id']
    assert response.json()['status'] == RequestStatus.REQUESTED
    assert response.json()['target_department'] == str(dept_radiology_a.id)
    assert Notification.objects.filter(recipient=management_a, admission=admission).exists()

    department_client = auth_client(radiology_staff_a)
    assert str(request_id) not in [item['id'] for item in department_client.get('/api/requests/').json()['results']]

    management_client = auth_client(management_a)
    management_requests = management_client.get('/api/requests/').json()['results']
    assert str(request_id) in [item['id'] for item in management_requests]
    approved = management_client.post(f'/api/requests/{request_id}/accept/', {}, format='json')
    assert approved.status_code == 200
    assert approved.json()['status'] == RequestStatus.APPROVED
    assert Notification.objects.filter(
        recipient=radiology_staff_a, notification_type='REQUEST_APPROVED', admission=admission,
    ).exists()

    visible_ids = [item['id'] for item in department_client.get('/api/requests/').json()['results']]
    assert str(request_id) in visible_ids
    assert department_client.post(f'/api/requests/{request_id}/start/', {}, format='json').json()['status'] == RequestStatus.IN_PROGRESS
    completed = department_client.post(f'/api/requests/{request_id}/complete/', {}, format='json')
    assert completed.status_code == 200
    assert completed.json()['status'] == RequestStatus.COMPLETED

    patient_requests = patient_client.get('/api/requests/').json()['results']
    patient_request = next(item for item in patient_requests if item['id'] == str(request_id))
    assert patient_request['status'] == RequestStatus.COMPLETED
    assert [item['to_status'] for item in patient_request['transitions']] == [
        RequestStatus.REQUESTED, RequestStatus.APPROVED, RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED,
    ]


@pytest.mark.django_db
def test_request_creator_cannot_process_request_outside_their_department(patient, admission, doctor_a):
    req = create_service_request(
        patient=patient, admission=admission, request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a,
    )

    with pytest.raises(PermissionDenied):
        transition_request(req=req, new_status=RequestStatus.APPROVED, actor=doctor_a)


@pytest.mark.django_db
def test_staff_without_department_only_sees_requests_they_created(
    patient, admission, doctor_a, hospital_a,
):
    from apps.hospitals.models import StaffRole
    from tests.conftest import _make_staff

    unassigned_staff = _make_staff(hospital_a, None, StaffRole.TECHNICIAN, 'unassigned_staff')
    other_request = create_service_request(
        patient=patient, admission=admission, request_type=RequestTypeCode.CT_SCAN, created_by=doctor_a,
    )
    own_request = create_service_request(
        patient=patient, admission=admission, request_type=RequestTypeCode.BLOOD_TEST, created_by=unassigned_staff,
    )

    response = auth_client(unassigned_staff).get('/api/requests/')
    visible_ids = [item['id'] for item in response.json()['results']]
    assert str(own_request.id) in visible_ids
    assert str(other_request.id) not in visible_ids


@pytest.mark.django_db
def test_management_cannot_approve_surgery_before_linked_consent(patient, admission, doctor_a, management_a):
    req = create_service_request(
        patient=patient, admission=admission, request_type=RequestTypeCode.SURGERY, created_by=doctor_a,
    )

    with pytest.raises(PermissionDenied):
        transition_request(req=req, new_status=RequestStatus.APPROVED, actor=management_a)


@pytest.mark.django_db
def test_linked_consent_approval_releases_surgery_to_department(
    patient_user, patient, admission, management_a, hospital_a,
):
    from apps.hospitals.models import Department, DepartmentType, StaffRole
    from tests.conftest import _make_staff

    ot_department = Department.objects.create(
        hospital=hospital_a, department_type=DepartmentType.OT, name='Consent Test OT',
    )
    ot_staff = _make_staff(hospital_a, ot_department, StaffRole.NURSE, 'consent_ot_staff')
    patient_client = auth_client(patient_user)
    submitted = patient_client.post('/api/requests/', {
        'patient': str(patient.id), 'admission': str(admission.id),
        'request_type': RequestTypeCode.SURGERY, 'reason': 'Patient-requested procedure',
    }, format='json')
    assert submitted.status_code == 201
    request_id = submitted.json()['id']
    assert submitted.json()['status'] == RequestStatus.REQUESTED

    management_client = auth_client(management_a)
    routed = management_client.post(f'/api/requests/{request_id}/accept/', {}, format='json')
    assert routed.status_code == 200
    assert routed.json()['status'] == RequestStatus.APPROVAL_REQUIRED

    created = management_client.post('/api/consents/', {
        'patient': str(patient.id), 'admission': str(admission.id),
        'service_request': request_id, 'procedure_description': 'Requested procedure',
    }, format='json')
    assert created.status_code == 201
    from apps.notifications.models import Notification
    assert Notification.objects.filter(
        recipient=patient_user, notification_type='NEW_CONSENT', patient=patient,
    ).exists()
    from apps.workflow.models import ServiceRequest
    req = ServiceRequest.objects.get(pk=request_id)
    req.refresh_from_db()
    assert str(req.linked_consent_id) == created.json()['id']

    decision = patient_client.post(
        f"/api/consents/{created.json()['id']}/decide/", {'action': 'APPROVE'}, format='json',
    )
    assert decision.status_code == 200
    req.refresh_from_db()
    assert req.status == RequestStatus.APPROVED

    transition_request(req=req, new_status=RequestStatus.IN_PROGRESS, actor=ot_staff)
    completed = transition_request(req=req, new_status=RequestStatus.COMPLETED, actor=ot_staff)
    assert completed.status == RequestStatus.COMPLETED
