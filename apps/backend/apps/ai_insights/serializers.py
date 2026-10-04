from rest_framework import serializers
from apps.ai_insights.models import AIInsight, AIReference


class AIReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIReference
        fields = ['id', 'source_type', 'source_object_id', 'source_description']
        read_only_fields = fields


class AIInsightSerializer(serializers.ModelSerializer):
    references = AIReferenceSerializer(many=True, read_only=True)

    class Meta:
        model = AIInsight
        fields = ['id', 'patient', 'insight_type', 'content_text', 'status',
                  'generated_by_service', 'generated_at', 'requested_by', 'references']
        read_only_fields = fields
