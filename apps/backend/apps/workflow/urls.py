from rest_framework.routers import DefaultRouter
from apps.workflow.views import ServiceRequestViewSet

router = DefaultRouter()
router.register('', ServiceRequestViewSet, basename='servicerequest')
urlpatterns = router.urls
