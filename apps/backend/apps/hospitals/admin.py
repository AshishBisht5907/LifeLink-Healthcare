from django.contrib import admin
from apps.hospitals.models import Hospital, Department, StaffProfile, HospitalCapacity

admin.site.register(Hospital)
admin.site.register(Department)
admin.site.register(StaffProfile)
admin.site.register(HospitalCapacity)
