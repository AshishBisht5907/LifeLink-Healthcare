import uuid

from django.conf import settings
from django.db import models


class DataSource(models.TextChoices):
    """Section 32 — every important field tracks where it came from."""
    SELF_REPORTED = 'SELF_REPORTED', 'Self-Reported'
    FAMILY_REPORTED = 'FAMILY_REPORTED', 'Family-Reported'
    HOSPITAL_ENTERED = 'HOSPITAL_ENTERED', 'Hospital-Entered'
    DOCTOR_ENTERED = 'DOCTOR_ENTERED', 'Doctor-Entered'
    DOCUMENT_UPLOAD = 'DOCUMENT_UPLOAD', 'Uploaded Document'
    SYSTEM_GENERATED = 'SYSTEM_GENERATED', 'System-Generated'
    AI_GENERATED = 'AI_GENERATED', 'AI-Generated Summary'


class VerificationStatus(models.TextChoices):
    SELF_REPORTED = 'SELF_REPORTED', 'Self-Reported'
    VERIFIED = 'VERIFIED', 'Verified'
    PENDING_VERIFICATION = 'PENDING_VERIFICATION', 'Pending Verification'
    CONFLICT = 'CONFLICT', 'Conflict Detected'
    REJECTED = 'REJECTED', 'Rejected'
    SYSTEM_GENERATED = 'SYSTEM_GENERATED', 'System-Generated'


class PatientIDCounter(models.Model):
    """Singleton row used to atomically generate sequential LifeLink Patient
    IDs (LL-P-100001, ...). Using select_for_update() keeps this correct
    under concurrent registrations."""
    id = models.PositiveIntegerField(primary_key=True, default=1)
    last_value = models.PositiveIntegerField(default=100000)


class PatientProfile(models.Model):
    """
    THE clean, permanent, cross-hospital patient record (section 3). Only
    verified/completed important information belongs here — operational
    noise belongs on Admission (apps.admissions).
    """
    GENDER_CHOICES = [('M', 'Male'), ('F', 'Female'), ('O', 'Other'), ('U', 'Unspecified')]
    BLOOD_GROUP_CHOICES = [
        ('A+', 'A+'), ('A-', 'A-'), ('B+', 'B+'), ('B-', 'B-'),
        ('AB+', 'AB+'), ('AB-', 'AB-'), ('O+', 'O+'), ('O-', 'O-'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lifelink_patient_id = models.CharField(max_length=20, unique=True, editable=False)

    # Null until a real user account claims/links this profile (section 14).
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name='patient_profile')

    full_name = models.CharField(max_length=150)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES, default='U')
    phone = models.CharField(max_length=20, blank=True)

    blood_group = models.CharField(max_length=3, choices=BLOOD_GROUP_CHOICES, blank=True)
    blood_group_verification = models.CharField(
        max_length=30, choices=VerificationStatus.choices, default=VerificationStatus.PENDING_VERIFICATION)

    # Unclaimed/temporary profile support (section 14).
    is_unclaimed = models.BooleanField(default=False)
    created_by_staff = models.ForeignKey('hospitals.StaffProfile', null=True, blank=True,
                                          on_delete=models.SET_NULL, related_name='created_patient_profiles')
    created_by_hospital = models.ForeignKey('hospitals.Hospital', null=True, blank=True,
                                             on_delete=models.SET_NULL, related_name='created_patient_profiles')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.full_name} ({self.lifelink_patient_id})'


class BloodGroupReport(models.Model):
    """Evidence trail behind PatientProfile.blood_group so conflicting
    reports are never silently overwritten (section 31)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name='blood_group_reports')
    value = models.CharField(max_length=3, choices=PatientProfile.BLOOD_GROUP_CHOICES)
    source = models.CharField(max_length=30, choices=DataSource.choices)
    source_admission = models.ForeignKey('admissions.Admission', null=True, blank=True,
                                          on_delete=models.SET_NULL, related_name='blood_group_reports')
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    recorded_at = models.DateTimeField(auto_now_add=True)


class EmergencyContact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name='emergency_contacts')
    name = models.CharField(max_length=150)
    relationship = models.CharField(max_length=50)
    phone = models.CharField(max_length=20)
    is_primary = models.BooleanField(default=False)


class AccessLevel(models.TextChoices):
    FULL_REPRESENTATIVE = 'FULL_REPRESENTATIVE', 'Full Emergency Representative'
    UPDATES_ONLY = 'UPDATES_ONLY', 'Family Updates Only'
    LIMITED = 'LIMITED', 'Limited Access'


class FamilyRelationship(models.Model):
    """Links a family/representative USER account to a patient profile.
    Family members never share the patient's login (section 19)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name='family_links')
    family_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='family_links')
    relationship_type = models.CharField(max_length=50)  # e.g. "Spouse", "Son", "Daughter"
    access_level = models.CharField(max_length=30, choices=AccessLevel.choices, default=AccessLevel.UPDATES_ONLY)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('patient', 'family_user')
        ordering = ['-created_at']


class Allergy(models.Model):
    SEVERITY_CHOICES = [('MILD', 'Mild'), ('MODERATE', 'Moderate'), ('SEVERE', 'Severe')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name='allergies')
    substance = models.CharField(max_length=150)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='MODERATE')
    source = models.CharField(max_length=30, choices=DataSource.choices)
    verification_status = models.CharField(max_length=30, choices=VerificationStatus.choices,
                                            default=VerificationStatus.PENDING_VERIFICATION)
    recorded_at = models.DateTimeField(auto_now_add=True)


class MedicalHistoryEventType(models.TextChoices):
    DIAGNOSIS = 'DIAGNOSIS', 'Diagnosis'
    CHRONIC_CONDITION = 'CHRONIC_CONDITION', 'Chronic Condition'
    SURGERY = 'SURGERY', 'Major Surgery/Procedure'
    ADMISSION_SUMMARY = 'ADMISSION_SUMMARY', 'Admission Summary'
    LAB_RESULT = 'LAB_RESULT', 'Important Lab Result'
    IMAGING_RESULT = 'IMAGING_RESULT', 'Important Imaging Result'


class MedicalHistoryEntry(models.Model):
    """Permanent timeline entries (section 30). Only enters here when
    clinically important AND verified/completed — never from a mere request
    or approval (section 3/6)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name='history_entries')
    event_type = models.CharField(max_length=30, choices=MedicalHistoryEventType.choices)
    description = models.TextField()
    event_date = models.DateField()
    source = models.CharField(max_length=30, choices=DataSource.choices)
    verification_status = models.CharField(max_length=30, choices=VerificationStatus.choices,
                                            default=VerificationStatus.PENDING_VERIFICATION)
    originating_hospital = models.ForeignKey('hospitals.Hospital', null=True, blank=True, on_delete=models.SET_NULL)
    originating_admission = models.ForeignKey('admissions.Admission', null=True, blank=True,
                                               on_delete=models.SET_NULL, related_name='history_entries')
    source_document = models.ForeignKey('documents.Document', null=True, blank=True, on_delete=models.SET_NULL)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-event_date']


class MedicationStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    STOPPED = 'STOPPED', 'Stopped'
    COMPLETED = 'COMPLETED', 'Completed Course'


class Medication(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name='medications')
    admission = models.ForeignKey('admissions.Admission', null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='medications')
    name = models.CharField(max_length=150)
    dosage = models.CharField(max_length=100, blank=True)
    frequency = models.CharField(max_length=100, blank=True)
    start_date = models.DateField()
    stop_date = models.DateField(null=True, blank=True)
    prescribing_doctor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                            on_delete=models.SET_NULL, related_name='prescribed_medications')
    status = models.CharField(max_length=20, choices=MedicationStatus.choices, default=MedicationStatus.ACTIVE)
    source = models.CharField(max_length=30, choices=DataSource.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date']


class AccessGrantType(models.TextChoices):
    NORMAL = 'NORMAL', 'Normal (patient approved)'
    EMERGENCY = 'EMERGENCY', 'Emergency (break-glass)'


class AccessGrantStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    DECLINED = 'DECLINED', 'Declined'
    EXPIRED = 'EXPIRED', 'Expired'
    REVOKED = 'REVOKED', 'Revoked'


class PatientAccessGrant(models.Model):
    """Time-limited permission for ONE management user to open ONE patient
    who has no link to the user's hospital yet.

    NORMAL: management asks, the patient approves or declines.
    EMERGENCY: management gives a written reason and gets access at once;
    the patient is told afterwards and everything is audited.

    A grant is tied to the requesting user (not the whole hospital), so it
    never widens access for other staff.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name='access_grants')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                     related_name='patient_access_grants')
    hospital = models.ForeignKey('hospitals.Hospital', on_delete=models.PROTECT,
                                 related_name='patient_access_grants')
    grant_type = models.CharField(max_length=12, choices=AccessGrantType.choices)
    status = models.CharField(max_length=12, choices=AccessGrantStatus.choices,
                              default=AccessGrantStatus.PENDING)
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['requested_by', 'patient', 'status'])]

    def is_active(self):
        from django.utils import timezone
        return (self.status == AccessGrantStatus.APPROVED
                and self.expires_at is not None and self.expires_at > timezone.now())

    @property
    def effective_status(self):
        """Approved grants past their end time read as EXPIRED without
        needing a background job."""
        from django.utils import timezone
        if (self.status == AccessGrantStatus.APPROVED and self.expires_at
                and self.expires_at <= timezone.now()):
            return AccessGrantStatus.EXPIRED
        return self.status
