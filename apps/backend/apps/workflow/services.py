from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone

from apps.accounts.permissions import get_staff_profile
from apps.audit.utils import log_action
from apps.workflow.models import (
    ALLOWED_TRANSITIONS, FAMILY_VISIBLE_TYPES, REQUIRES_CONSENT_TYPES,
    ROUTING_RULES, RequestStatus, RequestTypeCode, ServiceRequest, StatusTransition,
)

# Administrative request types that Hospital Management IS allowed to
# complete directly (section 7 — clinical completion stays with clinical
# departments; management may only close out non-clinical coordination
# tasks).
MANAGEMENT_COMPLETABLE_TYPES = {RequestTypeCode.DOCUMENT_VERIFICATION, RequestTypeCode.GENERIC_TASK}


class WorkflowError(Exception):
    pass


@transaction.atomic
def create_service_request(*, patient, admission, request_type, created_by, reason='', priority='NORMAL'):
    """Creates a request and auto-routes it to the correct department
    (section 8), without management having to do it by hand."""
    from apps.hospitals.models import Department

    dept_type = ROUTING_RULES.get(request_type)
    target_department = Department.objects.filter(
        hospital=admission.hospital, department_type=dept_type, is_active=True
    ).first()

    req = ServiceRequest.objects.create(
        patient=patient,
        admission=admission,
        request_type=request_type,
        created_by=created_by,
        target_department=target_department,
        priority=priority,
        reason=reason,
        requires_consent=request_type in REQUIRES_CONSENT_TYPES,
        is_family_visible=request_type in FAMILY_VISIBLE_TYPES,
        status=RequestStatus.APPROVAL_REQUIRED if request_type in REQUIRES_CONSENT_TYPES else RequestStatus.PENDING,
    )
    StatusTransition.objects.create(
        service_request=req, from_status='', to_status=req.status, changed_by=created_by,
        note='Request created and auto-routed.',
    )
    from apps.notifications.services import notify_request_created
    notify_request_created(req)
    log_action(
        'REQUEST_CREATED', actor=created_by, hospital_id=admission.hospital_id,
        patient_id=patient.id, admission_id=admission.id,
        target_description=f'{request_type} -> {target_department}',
    )
    return req


def _can_complete(user, req: ServiceRequest) -> bool:
    """Completion authority (section 7): only staff in the correct
    department may mark clinical work completed. Management may only
    complete administrative task types. Nobody can shortcut this from the
    frontend — this check lives entirely server-side.
    """
    staff = get_staff_profile(user)
    if not staff or not staff.is_active:
        return False
    if staff.hospital_id != req.admission.hospital_id:
        return False

    if user.role == 'HOSPITAL_MANAGEMENT':
        return req.request_type in MANAGEMENT_COMPLETABLE_TYPES

    if user.role == 'HOSPITAL_STAFF':
        return staff.department_id is not None and staff.department_id == req.target_department_id

    return False


@transaction.atomic
def transition_request(*, req: ServiceRequest, new_status, actor, note=''):
    """The single choke point for every status change on a ServiceRequest.
    Enforces: (1) only allow-listed transitions, (2) completion authority,
    (3) an immutable transition log every time.
    """
    current = req.status
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        log_action('REQUEST_TRANSITION_DENIED', actor=actor, result='DENIED',
                    hospital_id=req.admission.hospital_id, patient_id=req.patient_id,
                    admission_id=req.admission_id,
                    target_description=f'{current} -> {new_status} (not allowed)')
        raise WorkflowError(f'Cannot move request from {current} to {new_status}.')

    if new_status == RequestStatus.COMPLETED and not _can_complete(actor, req):
        log_action('REQUEST_COMPLETION_DENIED', actor=actor, result='DENIED',
                    hospital_id=req.admission.hospital_id, patient_id=req.patient_id,
                    admission_id=req.admission_id,
                    target_description=f'user lacks completion authority for {req.request_type}')
        raise PermissionDenied('You are not authorised to mark this request completed.')

    req.status = new_status
    if new_status == RequestStatus.COMPLETED:
        req.completed_at = timezone.now()
        req.completed_by = actor
    if new_status in (RequestStatus.POSTPONED, RequestStatus.REJECTED, RequestStatus.CANCELLED):
        req.postpone_or_reject_reason = note
    req.save()

    transition = StatusTransition.objects.create(
        service_request=req, from_status=current, to_status=new_status, changed_by=actor, note=note,
    )
    from apps.notifications.services import notify_request_transition
    notify_request_transition(req, transition)
    log_action(
        'REQUEST_STATUS_CHANGED', actor=actor, hospital_id=req.admission.hospital_id,
        patient_id=req.patient_id, admission_id=req.admission_id,
        target_description=f'{current} -> {new_status}',
    )

    # Only a genuinely COMPLETED, clinically-important result may ever be
    # promoted into the permanent PatientProfile (section 3/6). This is
    # deliberately NOT automatic for every request type — a human/AI-flagged
    # review step decides clinical importance; here we only handle the
    # unambiguous case of surgery completion as a concrete example.
    if new_status == RequestStatus.COMPLETED and req.request_type == RequestTypeCode.SURGERY:
        _promote_surgery_to_history(req, actor)

    return req


def _promote_surgery_to_history(req, actor):
    from apps.patients.models import MedicalHistoryEntry, MedicalHistoryEventType, DataSource, VerificationStatus
    MedicalHistoryEntry.objects.create(
        patient=req.patient,
        event_type=MedicalHistoryEventType.SURGERY,
        description=req.reason or 'Surgical procedure completed.',
        event_date=timezone.now().date(),
        source=DataSource.HOSPITAL_ENTERED,
        verification_status=VerificationStatus.VERIFIED,
        originating_hospital=req.admission.hospital,
        originating_admission=req.admission,
        created_by=actor,
    )
