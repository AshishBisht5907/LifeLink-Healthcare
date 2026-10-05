import uuid

from django.conf import settings
from django.db import models


class RequestTypeCode(models.TextChoices):
    CT_SCAN = 'CT_SCAN', 'CT Scan'
    MRI = 'MRI', 'MRI'
    XRAY = 'XRAY', 'X-Ray'
    BLOOD_TEST = 'BLOOD_TEST', 'Blood Test'
    PATHOLOGY = 'PATHOLOGY', 'Pathology'
    MEDICATION = 'MEDICATION', 'Medication Order'
    SURGERY = 'SURGERY', 'Surgery / Procedure'
    INSURANCE_APPROVAL = 'INSURANCE_APPROVAL', 'Insurance Approval'
    PAYMENT = 'PAYMENT', 'Payment'
    CONSULTATION = 'CONSULTATION', 'Specialist Consultation'
    DOCUMENT_VERIFICATION = 'DOCUMENT_VERIFICATION', 'Document Verification'
    GENERIC_TASK = 'GENERIC_TASK', 'Internal Task'


# Section 8 — the routing engine. Standard request types auto-route to the
# correct department without management having to do it manually every time.
ROUTING_RULES = {
    RequestTypeCode.CT_SCAN: 'RADIOLOGY',
    RequestTypeCode.MRI: 'RADIOLOGY',
    RequestTypeCode.XRAY: 'RADIOLOGY',
    RequestTypeCode.BLOOD_TEST: 'LABORATORY',
    RequestTypeCode.PATHOLOGY: 'LABORATORY',
    RequestTypeCode.MEDICATION: 'PHARMACY',
    RequestTypeCode.SURGERY: 'OT',
    RequestTypeCode.INSURANCE_APPROVAL: 'INSURANCE',
    RequestTypeCode.PAYMENT: 'BILLING',
    RequestTypeCode.CONSULTATION: 'GENERAL',
    RequestTypeCode.DOCUMENT_VERIFICATION: 'MANAGEMENT',
    RequestTypeCode.GENERIC_TASK: 'MANAGEMENT',
}

# Section 4 — which request types are meaningful enough to surface in the
# family-facing Live Status feed. Internal noise (generic tasks, routine
# document verification) stays internal by default.
FAMILY_VISIBLE_TYPES = {
    RequestTypeCode.SURGERY,
    RequestTypeCode.INSURANCE_APPROVAL,
    RequestTypeCode.CONSULTATION,
}

REQUIRES_CONSENT_TYPES = {RequestTypeCode.SURGERY}


class RequestStatus(models.TextChoices):
    """Section 6 — the critical status rule: approval is never completion.
    These are the ONLY valid states; transitions are enforced in services.py.
    """
    REQUESTED = 'REQUESTED', 'Requested'
    PENDING = 'PENDING', 'Pending'
    APPROVAL_REQUIRED = 'APPROVAL_REQUIRED', 'Approval Required'
    APPROVED = 'APPROVED', 'Approved / Awaiting Action'
    READY = 'READY', 'Ready'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    COMPLETED = 'COMPLETED', 'Completed'
    POSTPONED = 'POSTPONED', 'Postponed'
    CANCELLED = 'CANCELLED', 'Cancelled'
    BLOCKED = 'BLOCKED', 'Blocked'
    REJECTED = 'REJECTED', 'Rejected'


# Explicit allow-list of transitions. Anything not listed here is refused by
# ServiceRequest.transition_to(), regardless of who's asking.
ALLOWED_TRANSITIONS = {
    RequestStatus.REQUESTED: {RequestStatus.PENDING, RequestStatus.APPROVAL_REQUIRED, RequestStatus.APPROVED, RequestStatus.CANCELLED, RequestStatus.REJECTED},
    RequestStatus.PENDING: {RequestStatus.APPROVAL_REQUIRED, RequestStatus.APPROVED, RequestStatus.READY, RequestStatus.BLOCKED, RequestStatus.CANCELLED, RequestStatus.REJECTED},
    RequestStatus.APPROVAL_REQUIRED: {RequestStatus.APPROVED, RequestStatus.REJECTED, RequestStatus.CANCELLED},
    RequestStatus.APPROVED: {RequestStatus.READY, RequestStatus.IN_PROGRESS, RequestStatus.POSTPONED, RequestStatus.CANCELLED, RequestStatus.BLOCKED},
    RequestStatus.READY: {RequestStatus.IN_PROGRESS, RequestStatus.POSTPONED, RequestStatus.CANCELLED, RequestStatus.BLOCKED},
    RequestStatus.IN_PROGRESS: {RequestStatus.COMPLETED, RequestStatus.POSTPONED, RequestStatus.BLOCKED},
    RequestStatus.BLOCKED: {RequestStatus.PENDING, RequestStatus.APPROVED, RequestStatus.CANCELLED},
    RequestStatus.POSTPONED: {RequestStatus.APPROVED, RequestStatus.READY, RequestStatus.CANCELLED},
    # Terminal states — nothing may leave them. This is what stops a
    # cancelled/postponed procedure from ever quietly becoming "performed".
    RequestStatus.COMPLETED: set(),
    RequestStatus.CANCELLED: set(),
    RequestStatus.REJECTED: set(),
}


class Priority(models.TextChoices):
    LOW = 'LOW', 'Low'
    NORMAL = 'NORMAL', 'Normal'
    HIGH = 'HIGH', 'High'
    EMERGENCY = 'EMERGENCY', 'Emergency'


class ServiceRequest(models.Model):
    """
    The first-class request/task entity (section 21). Every department
    request, test order, procedure order, and internal task in the system
    is a ServiceRequest. This is what the routing engine, completion
    authority, and family Live Status feed are all built on top of.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey('patients.PatientProfile', on_delete=models.PROTECT, related_name='service_requests')
    admission = models.ForeignKey('admissions.Admission', on_delete=models.PROTECT, related_name='service_requests')

    request_type = models.CharField(max_length=30, choices=RequestTypeCode.choices)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_requests')
    target_department = models.ForeignKey('hospitals.Department', null=True, blank=True,
                                           on_delete=models.SET_NULL, related_name='requests')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='assigned_requests')

    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=30, choices=RequestStatus.choices, default=RequestStatus.REQUESTED)

    requires_consent = models.BooleanField(default=False)
    requires_payment = models.BooleanField(default=False)
    is_family_visible = models.BooleanField(default=False)

    linked_consent = models.ForeignKey('consents.ConsentRequest', null=True, blank=True,
                                        on_delete=models.SET_NULL, related_name='service_requests')
    result_document = models.ForeignKey('documents.Document', null=True, blank=True,
                                         on_delete=models.SET_NULL, related_name='+')

    postpone_or_reject_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                      on_delete=models.SET_NULL, related_name='completed_requests')

    class Meta:
        indexes = [
            models.Index(fields=['status', 'target_department']),
            models.Index(fields=['patient', 'status']),
            models.Index(fields=['admission', 'status']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_request_type_display()} [{self.status}] - {self.patient.lifelink_patient_id}'


class StatusTransition(models.Model):
    """Immutable record of every state change for a ServiceRequest — this is
    what makes 'approved != completed' provable after the fact, not just
    enforced in the moment."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_request = models.ForeignKey(ServiceRequest, on_delete=models.CASCADE, related_name='transitions')
    from_status = models.CharField(max_length=30)
    to_status = models.CharField(max_length=30)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
