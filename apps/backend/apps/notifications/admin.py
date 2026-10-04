from django.contrib import admin
from apps.notifications.models import Notification, FamilyCommunicationLog

admin.site.register(Notification)
admin.site.register(FamilyCommunicationLog)
