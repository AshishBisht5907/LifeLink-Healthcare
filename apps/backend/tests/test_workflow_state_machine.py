import pytest
from django.core.exceptions import PermissionDenied

from apps.workflow.models import RequestStatus, RequestTypeCode
from apps.workflow.services import WorkflowError, create_service_request, transition_request
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
