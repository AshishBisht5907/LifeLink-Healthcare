from django.contrib import admin
from apps.workflow.models import ServiceRequest, StatusTransition

admin.site.register(ServiceRequest)
admin.site.register(StatusTransition)
