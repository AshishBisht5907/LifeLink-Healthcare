import uuid

from django.conf import settings
from django.db import models


class Hospital(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True)  # e.g. "ABC"
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.name} ({self.code})'


class DepartmentType(models.TextChoices):
    GENERAL = 'GENERAL', 'General / OPD'
    RADIOLOGY = 'RADIOLOGY', 'Radiology'
    LABORATORY = 'LABORATORY', 'Laboratory'
    PHARMACY = 'PHARMACY', 'Pharmacy'
    OT = 'OT', 'Operation Theatre'
    WARD = 'WARD', 'Ward / Nursing'
    BILLING = 'BILLING', 'Billing'
    INSURANCE = 'INSURANCE', 'Insurance Desk'
    MANAGEMENT = 'MANAGEMENT', 'Hospital Management / Care Coordination'
    ADMIN = 'ADMIN', 'Hospital Admin'


class Department(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='departments')
    name = models.CharField(max_length=100)
    department_type = models.CharField(max_length=20, choices=DepartmentType.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('hospital', 'department_type', 'name')

    def __str__(self):
        return f'{self.name} @ {self.hospital.code}'


class StaffRole(models.TextChoices):
    DOCTOR = 'DOCTOR', 'Doctor'
    NURSE = 'NURSE', 'Nurse'
    TECHNICIAN = 'TECHNICIAN', 'Technician'
    PHARMACIST = 'PHARMACIST', 'Pharmacist'
    COORDINATOR = 'COORDINATOR', 'Care Coordinator'
    BILLING_CLERK = 'BILLING_CLERK', 'Billing Clerk'
    INSURANCE_OFFICER = 'INSURANCE_OFFICER', 'Insurance Officer'
    ADMIN = 'ADMIN', 'Hospital Admin'


class StaffProfile(models.Model):
    """One row per hospital employee account. A single login manages many
    patients — there is deliberately no per-patient login (section 1/12)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_profile')
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='staff')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    staff_role = models.CharField(max_length=30, choices=StaffRole.choices)
    employee_id = models.CharField(max_length=40)
    job_title = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('hospital', 'employee_id')

    def __str__(self):
        return f'{self.user.username} - {self.staff_role} @ {self.hospital.code}'


class ResourceType(models.TextChoices):
    ICU_BED = 'ICU_BED', 'ICU Bed'
    GENERAL_BED = 'GENERAL_BED', 'General Bed'
    OT_SLOT = 'OT_SLOT', 'OT Slot'
    CARDIOLOGIST = 'CARDIOLOGIST', 'Cardiologist Availability'
    VENTILATOR = 'VENTILATOR', 'Ventilator'


class HospitalCapacity(models.Model):
    """Configurable operational availability used for referral matching
    (section 18). Kept intentionally simple — total vs available counters,
    updated by management/admin staff."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='capacities')
    resource_type = models.CharField(max_length=30, choices=ResourceType.choices)
    total = models.PositiveIntegerField(default=0)
    available = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('hospital', 'resource_type')

    def __str__(self):
        return f'{self.hospital.code}: {self.resource_type} {self.available}/{self.total}'
