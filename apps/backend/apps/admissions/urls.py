from rest_framework.routers import DefaultRouter
from apps.admissions.views import AdmissionViewSet, DoctorNoteViewSet, NursingNoteViewSet

router = DefaultRouter()
router.register('doctor-notes', DoctorNoteViewSet, basename='doctornote')
router.register('nursing-notes', NursingNoteViewSet, basename='nursingnote')
router.register('', AdmissionViewSet, basename='admission')
urlpatterns = router.urls
