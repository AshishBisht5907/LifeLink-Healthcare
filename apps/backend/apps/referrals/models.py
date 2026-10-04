import uuid

from django.conf import settings
from django.db import models


class ReferralStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    ACCEPTED = 'ACCEPTED', 'Accepted'
    REJECTED = 'REJECTED', 'Rejected'
    CONDITIONAL = 'CONDITIONAL', 'Conditional Accept'


class Referral(models.Model):
    """Section 17 — Hospital A -> Hospital B referral. Hospital B only ever
    sees what this referral explicitly carries over (an AI-assisted summary
    + attached reports), never Hospital A's full internal admission file
    (section 16 — no automatic clutter transfer)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey('patients.PatientProfile', on_delete=models.PROTECT, related_name='referrals')
    from_hospital = models.ForeignKey('hospitals.Hospital', on_delete=models.PROTECT, related_name='referrals_sent')
    from_admission = models.ForeignKey('admissions.Admission', on_delete=models.PROTECT, related_name='referrals')
    to_hospital = models.ForeignKey('hospitals.Hospital', on_delete=models.PROTECT, related_name='referrals_received')

    required_department_type = models.CharField(max_length=30)
    priority = models.CharField(max_length=20, default='HIGH')
    reason = models.TextField()
    current_condition_summary = models.TextField(blank=True)

    ai_summary = models.ForeignKey('ai_insights.AIInsight', null=True, blank=True, on_delete=models.SET_NULL)

    status = models.CharField(max_length=20, choices=ReferralStatus.choices, default=ReferralStatus.PENDING)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='referrals_created')
    responded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                      on_delete=models.SET_NULL, related_name='referrals_responded')
    response_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class Transfer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral = models.OneToOneField(Referral, on_delete=models.CASCADE, related_name='transfer')
    ambulance_arranged = models.BooleanField(default=False)
    checklist = models.JSONField(default=dict, blank=True)  # identity, notes, reports, meds, allergies, consent, insurance
    new_admission = models.ForeignKey('admissions.Admission', null=True, blank=True,
                                       on_delete=models.SET_NULL, related_name='+')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
