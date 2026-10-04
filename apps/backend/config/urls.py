from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/patients/', include('apps.patients.urls')),
    path('api/admissions/', include('apps.admissions.urls')),
    path('api/requests/', include('apps.workflow.urls')),
    path('api/consents/', include('apps.consents.urls')),
    path('api/referrals/', include('apps.referrals.urls')),
    path('api/documents/', include('apps.documents.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/audit/', include('apps.audit.urls')),
    path('api/ai/', include('apps.ai_insights.urls')),
    path('api/', include('apps.hospitals.urls')),
]

# NOTE: MEDIA_ROOT is deliberately NOT served here, not even in DEBUG. Uploaded documents are
# patient records; they must only be reachable through the authorised, short-lived signed
# download (apps.documents.views.SecureDownloadView), never via a permanent public URL.
