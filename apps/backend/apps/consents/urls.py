from rest_framework.routers import DefaultRouter
from apps.consents.views import ConsentRequestViewSet

router = DefaultRouter()
router.register('', ConsentRequestViewSet, basename='consentrequest')
urlpatterns = router.urls
