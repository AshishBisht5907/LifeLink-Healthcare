import uuid

from django.conf import settings
from django.db import models, transaction


class AdmissionCounter(models.Model):
    """Per-hospital sequence for human-readable admission numbers, e.g.
    ABC-ADM-2026-00120."""
    hospital = models.OneToOneField('hospitals.Hospital', on_delete=models.CASCADE, primary_key=True)
    last_value = models.PositiveIntegerField(default=0)


class AdmissionStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    DISCHARGED = 'DISCHARGED', 'Discharged'
    TRANSFERRED = 'TRANSFERRED', 'Transferred Out'


class Admission(models.Model):
    """
    The hospital-specific 'case file' (section 5). Holds ALL operational
    clutter for one hospital stay. Only clinically-important, verified
    facts ever get promoted up to PatientProfile — everything else stays
    here, scoped to this hospital, forever (never silently deleted;
    section 46).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey('patients.PatientProfile', on_delete=models.PROTECT, related_name='admissions')
    hospital = models.ForeignKey('hospitals.Hospital', on_delete=models.PROTECT, related_name='admissions')
    admission_number = models.CharField(max_length=40, unique=True, editable=False)

    attending_doctor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                          on_delete=models.SET_NULL, related_name='attending_admissions')
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=AdmissionStatus.choices, default=AdmissionStatus.ACTIVE)

    admitted_at = models.DateTimeField(auto_now_add=True)
    discharged_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='created_admissions')

    class Meta:
        indexes = [models.Index(fields=['hospital', 'status'])]

    def __str__(self):
        return self.admission_number

    @staticmethod
    @transaction.atomic
    def generate_admission_number(hospital):
        import datetime
        counter, _ = AdmissionCounter.objects.select_for_update().get_or_create(hospital=hospital)
        counter.last_value += 1
        counter.save(update_fields=['last_value'])
        year = datetime.date.today().year
        return f'{hospital.code}-ADM-{year}-{counter.last_value:05d}'


class DoctorNote(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(Admission, on_delete=models.CASCADE, related_name='doctor_notes')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='doctor_notes')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class NursingNote(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(Admission, on_delete=models.CASCADE, related_name='nursing_notes')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='nursing_notes')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class DischargeSummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.OneToOneField(Admission, on_delete=models.CASCADE, related_name='discharge_summary')
    content = models.TextField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
