from rest_framework.routers import DefaultRouter
from apps.referrals.views import ReferralViewSet

router = DefaultRouter()
router.register('', ReferralViewSet, basename='referral')
urlpatterns = router.urls
