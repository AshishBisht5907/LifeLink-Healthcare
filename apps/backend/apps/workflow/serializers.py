from rest_framework import serializers
from apps.workflow.models import RequestTypeCode, ServiceRequest, StatusTransition


class StatusTransitionSerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(source='changed_by.username', read_only=True, default=None)

    class Meta:
        model = StatusTransition
        fields = ['id', 'from_status', 'to_status', 'changed_by', 'changed_by_username', 'note', 'created_at']
        read_only_fields = fields


class ServiceRequestSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    department_name = serializers.CharField(source='target_department.name', read_only=True, default=None)
    transitions = StatusTransitionSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceRequest
        fields = [
            'id', 'patient', 'patient_name', 'admission', 'request_type', 'created_by',
            'target_department', 'department_name', 'assigned_to', 'priority', 'reason',
            'status', 'requires_consent', 'requires_payment', 'is_family_visible',
            'linked_consent', 'result_document', 'postpone_or_reject_reason',
            'created_at', 'updated_at', 'due_at', 'completed_at', 'completed_by', 'transitions',
        ]
        read_only_fields = [
            'id', 'created_by', 'target_department', 'status', 'requires_consent',
            'is_family_visible', 'created_at', 'updated_at', 'completed_at', 'completed_by', 'transitions',
        ]


class ServiceRequestCreateSerializer(serializers.Serializer):
    patient = serializers.UUIDField()
    admission = serializers.UUIDField()
    request_type = serializers.ChoiceField(choices=RequestTypeCode.choices)
    reason = serializers.CharField(required=False, allow_blank=True)
    priority = serializers.ChoiceField(choices=['LOW', 'NORMAL', 'HIGH', 'EMERGENCY'], default='NORMAL')


class TransitionActionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)
