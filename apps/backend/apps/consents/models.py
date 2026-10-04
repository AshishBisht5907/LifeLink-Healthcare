import uuid

from django.conf import settings
from django.db import models


class ConsentStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    DECLINED = 'DECLINED', 'Declined'


class ConsentRequest(models.Model):
    """Section 20. Note: the software does not itself certify legal
    validity of a signature — it records who approved what, when, and how,
    so hospital policy / a legally-recognised e-sign mechanism can sit on
    top of this record (see docs/SECURITY.md)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey('patients.PatientProfile', on_delete=models.PROTECT, related_name='consent_requests')
    admission = models.ForeignKey('admissions.Admission', on_delete=models.PROTECT, related_name='consent_requests')
    procedure_description = models.TextField()
    risk_information = models.TextField(blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='consents_requested')
    supporting_document = models.ForeignKey('documents.Document', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=ConsentStatus.choices, default=ConsentStatus.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class ConsentActionType(models.TextChoices):
    APPROVE = 'APPROVE', 'Approve'
    DECLINE = 'DECLINE', 'Decline'
    ASK_DOCTOR = 'ASK_DOCTOR', 'Ask Doctor / Coordinator'


class ConsentAction(models.Model):
    """Immutable audit-grade record of the actual consent decision
    (section 20): who, role, timestamp, device/IP context."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consent_request = models.ForeignKey(ConsentRequest, on_delete=models.CASCADE, related_name='actions')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='consent_actions')
    actor_role_at_time = models.CharField(max_length=32)
    action = models.CharField(max_length=20, choices=ConsentActionType.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
