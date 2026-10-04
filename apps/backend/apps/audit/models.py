import uuid

from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """
    Append-only audit trail (section 23). No API surface exposes update or
    delete for this model (see views.py — ReadOnlyModelViewSet only, and no
    admin bulk-delete). Ordinary users, including Hospital Admin, cannot
    modify or remove entries.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                               on_delete=models.SET_NULL, related_name='audit_entries')
    actor_role = models.CharField(max_length=32, blank=True)
    action = models.CharField(max_length=64)  # e.g. LOGIN, PATIENT_VIEWED, CONSENT_APPROVED
    result = models.CharField(max_length=20, default='SUCCESS')  # SUCCESS | DENIED | ERROR

    hospital_id = models.UUIDField(null=True, blank=True)
    patient_id = models.UUIDField(null=True, blank=True)
    admission_id = models.UUIDField(null=True, blank=True)

    target_description = models.CharField(max_length=255, blank=True)
    context = models.JSONField(default=dict, blank=True)  # small, non-medical context only

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['action', 'created_at']),
            models.Index(fields=['patient_id', 'created_at']),
            models.Index(fields=['hospital_id', 'created_at']),
            models.Index(fields=['actor', 'created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.action} by {self.actor_id} @ {self.created_at}'

    def save(self, *args, **kwargs):
        if self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise ValueError('AuditLog entries are immutable and cannot be updated.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('AuditLog entries cannot be deleted.')
