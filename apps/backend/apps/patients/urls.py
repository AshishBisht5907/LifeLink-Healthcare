from rest_framework.routers import DefaultRouter
from apps.patients.views import (
    AllergyViewSet, EmergencyContactViewSet, FamilyRelationshipViewSet,
    MedicalHistoryEntryViewSet, MedicationViewSet, PatientAccessGrantViewSet, PatientProfileViewSet,
)

router = DefaultRouter()
# IMPORTANT: PatientProfileViewSet is registered with an EMPTY prefix, whose
# detail route (^(?P<pk>[^/.]+)/$) matches any single path segment. If it
# were registered first, it would shadow every other sub-resource's list
# route below (e.g. a GET to /api/patients/family-links/ would incorrectly
# match patient-detail with pk="family-links" instead of the intended
# family-links list route). It must always be registered LAST.
router.register('access-requests', PatientAccessGrantViewSet, basename='accessgrant')
router.register('family-links', FamilyRelationshipViewSet, basename='familyrelationship')
router.register('allergies', AllergyViewSet, basename='allergy')
router.register('history', MedicalHistoryEntryViewSet, basename='medicalhistory')
router.register('medications', MedicationViewSet, basename='medication')
router.register('emergency-contacts', EmergencyContactViewSet, basename='emergencycontact')
router.register('', PatientProfileViewSet, basename='patient')
urlpatterns = router.urls
