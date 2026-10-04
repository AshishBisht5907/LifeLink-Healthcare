from django.contrib import admin
from apps.patients.models import (
    PatientProfile, FamilyRelationship, Allergy, MedicalHistoryEntry, Medication,
    EmergencyContact, BloodGroupReport,
)

admin.site.register(PatientProfile)
admin.site.register(FamilyRelationship)
admin.site.register(Allergy)
admin.site.register(MedicalHistoryEntry)
admin.site.register(Medication)
admin.site.register(EmergencyContact)
admin.site.register(BloodGroupReport)
