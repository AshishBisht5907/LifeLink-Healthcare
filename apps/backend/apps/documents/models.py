import uuid

from django.conf import settings
from django.db import models


def patient_document_path(instance, filename):
    return f'patients/{instance.patient_id}/documents/{uuid.uuid4()}_{filename}'


class DocumentType(models.TextChoices):
    LAB_REPORT = 'LAB_REPORT', 'Lab Report'
    IMAGING_REPORT = 'IMAGING_REPORT', 'Imaging Report'
    DISCHARGE_SUMMARY = 'DISCHARGE_SUMMARY', 'Discharge Summary'
    PRESCRIPTION = 'PRESCRIPTION', 'Prescription'
    CONSENT_FORM = 'CONSENT_FORM', 'Consent Form'
    INSURANCE_DOCUMENT = 'INSURANCE_DOCUMENT', 'Insurance Document'
    IDENTITY_DOCUMENT = 'IDENTITY_DOCUMENT', 'Identity Document'
    OTHER = 'OTHER', 'Other'


class Document(models.Model):
    """
    Section 45. Local disk storage in this build (MEDIA_ROOT); the field
    layout matches what an S3-compatible backend would need, so switching
    django-storages backends later is a config change, not a model change.
    File-type/size validation happens in serializers.py (section 33).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey('patients.PatientProfile', on_delete=models.CASCADE, related_name='documents')
    admission = models.ForeignKey('admissions.Admission', null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='documents')
    file = models.FileField(upload_to=patient_document_path)
    doc_type = models.CharField(max_length=30, choices=DocumentType.choices)
    version = models.PositiveIntegerField(default=1)
    supersedes = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='versions')

    source = models.CharField(max_length=30, blank=True)
    verification_status = models.CharField(max_length=30, default='PENDING_VERIFICATION')
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='verified_documents')
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True)

    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='uploaded_documents')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-uploaded_at']
