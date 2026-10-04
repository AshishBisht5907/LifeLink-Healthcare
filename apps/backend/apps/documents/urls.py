from django.urls import path
from rest_framework.routers import DefaultRouter
from apps.documents.views import DocumentViewSet, SecureDownloadView

router = DefaultRouter()
router.register('', DocumentViewSet, basename='document')

urlpatterns = [
    path('secure-download/', SecureDownloadView.as_view(), name='document-secure-download'),
] + router.urls
