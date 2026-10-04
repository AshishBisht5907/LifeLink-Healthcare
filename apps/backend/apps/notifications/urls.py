from rest_framework.routers import DefaultRouter
from apps.notifications.views import FamilyCommunicationLogViewSet, NotificationViewSet, NotificationPreferenceViewSet

router = DefaultRouter()
router.register('family-communications', FamilyCommunicationLogViewSet, basename='familycommunication')
router.register('preferences', NotificationPreferenceViewSet, basename='notificationpreference')
router.register('', NotificationViewSet, basename='notification')
urlpatterns = router.urls
