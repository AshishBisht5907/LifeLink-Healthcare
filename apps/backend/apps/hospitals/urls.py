from rest_framework.routers import DefaultRouter
from apps.hospitals.views import (
    DepartmentViewSet, HospitalCapacityViewSet, HospitalViewSet, StaffProfileViewSet,
)

router = DefaultRouter()
router.register('hospitals', HospitalViewSet, basename='hospital')
router.register('departments', DepartmentViewSet, basename='department')
router.register('staff', StaffProfileViewSet, basename='staffprofile')
router.register('capacity', HospitalCapacityViewSet, basename='hospitalcapacity')
urlpatterns = router.urls
