from django.contrib import admin
from apps.admissions.models import Admission, DoctorNote, NursingNote, DischargeSummary

admin.site.register(Admission)
admin.site.register(DoctorNote)
admin.site.register(NursingNote)
admin.site.register(DischargeSummary)
