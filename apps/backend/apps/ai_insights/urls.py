from rest_framework.routers import DefaultRouter
from apps.ai_insights.views import AIInsightViewSet

router = DefaultRouter()
router.register('', AIInsightViewSet, basename='aiinsight')
urlpatterns = router.urls
