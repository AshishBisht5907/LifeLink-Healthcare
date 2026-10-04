import uuid

from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    NEW_CONSENT = 'NEW_CONSENT', 'New Consent Request'
    REPORT_READY = 'REPORT_READY', 'Report Ready'
    REQUEST_APPROVED = 'REQUEST_APPROVED', 'Request Approved'
    REQUEST_REJECTED = 'REQUEST_REJECTED', 'Request Rejected'
    REQUEST_POSTPONED = 'REQUEST_POSTPONED', 'Request Postponed'
    REFERRAL_ACCEPTED = 'REFERRAL_ACCEPTED', 'Referral Accepted'
    REFERRAL_REJECTED = 'REFERRAL_REJECTED', 'Referral Rejected'
    REFERRAL_CREATED = 'REFERRAL_CREATED', 'Referral Created'
    TRANSFER_COMPLETED = 'TRANSFER_COMPLETED', 'Transfer Completed'
    STATUS_UPDATE = 'STATUS_UPDATE', 'Status Update'
    REQUEST_COMPLETED = 'REQUEST_COMPLETED', 'Request Completed'
    ACCESS_REQUEST = 'ACCESS_REQUEST', 'Access Request'
    EMERGENCY_ACCESS = 'EMERGENCY_ACCESS', 'Emergency Access'
    GENERAL = 'GENERAL', 'General'


class Notification(models.Model):
    """In-app notification. Delivery channel (email/SMS/push) is behind the
    same provider-abstraction pattern as OTP — see notifications/providers.py.
    Only the in-app channel is actually wired in this build."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=NotificationType.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)

    patient = models.ForeignKey('patients.PatientProfile', null=True, blank=True, on_delete=models.SET_NULL)
    admission = models.ForeignKey('admissions.Admission', null=True, blank=True, on_delete=models.SET_NULL)
    dedupe_key = models.CharField(max_length=150, unique=True, null=True, blank=True)

    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class NotificationPreference(models.Model):
    """Stores user preferences for receiving notifications across different channels."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notification_preferences')
    in_app = models.BooleanField(default=True)
    sms = models.BooleanField(default=True)
    email = models.BooleanField(default=True)

    def __str__(self):
        return f"Preferences for {self.user.username}"


class FamilyCommunicationLog(models.Model):
    """Section 22 — a record of exactly what was told to a family member,
    by whom, and when. Internal-only notes are never written here."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey('patients.PatientProfile', on_delete=models.CASCADE, related_name='family_communications')
    admission = models.ForeignKey('admissions.Admission', null=True, blank=True, on_delete=models.SET_NULL)
    message = models.TextField()
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='sent_communications')
    sent_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='received_communications')
    related_service_request = models.ForeignKey('workflow.ServiceRequest', null=True, blank=True, on_delete=models.SET_NULL)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']
