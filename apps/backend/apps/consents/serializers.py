from rest_framework import serializers
from apps.consents.models import ConsentAction, ConsentRequest
from apps.workflow.models import ServiceRequest


class ConsentActionSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True)

    class Meta:
        model = ConsentAction
        fields = ['id', 'actor', 'actor_username', 'actor_role_at_time', 'action', 'created_at']
        read_only_fields = fields


class ConsentRequestSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    actions = ConsentActionSerializer(many=True, read_only=True)
    service_request = serializers.PrimaryKeyRelatedField(
        queryset=ServiceRequest.objects.all(), required=False, allow_null=True, write_only=True,
    )

    class Meta:
        model = ConsentRequest
        fields = ['id', 'patient', 'patient_name', 'admission', 'service_request', 'procedure_description',
                  'risk_information', 'requested_by', 'supporting_document', 'status',
                  'created_at', 'resolved_at', 'actions']
        read_only_fields = ['id', 'requested_by', 'status', 'created_at', 'resolved_at', 'actions']


class ConsentDecisionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['APPROVE', 'DECLINE', 'ASK_DOCTOR'])
