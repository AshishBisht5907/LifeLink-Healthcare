from rest_framework import serializers
from apps.referrals.models import Referral, Transfer


class ReferralSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    from_hospital_name = serializers.CharField(source='from_hospital.name', read_only=True)
    to_hospital_name = serializers.CharField(source='to_hospital.name', read_only=True)

    class Meta:
        model = Referral
        fields = ['id', 'patient', 'patient_name', 'from_hospital', 'from_hospital_name',
                  'from_admission', 'to_hospital', 'to_hospital_name', 'required_department_type',
                  'priority', 'reason', 'current_condition_summary', 'ai_summary', 'status',
                  'created_by', 'responded_by', 'response_note', 'created_at', 'responded_at']
        read_only_fields = ['id', 'from_hospital', 'created_by', 'status', 'responded_by',
                             'responded_at', 'created_at']


class ReferralCreateSerializer(serializers.Serializer):
    patient = serializers.UUIDField()
    from_admission = serializers.UUIDField()
    to_hospital = serializers.UUIDField()
    required_department_type = serializers.CharField()
    priority = serializers.CharField(default='HIGH')
    reason = serializers.CharField()
    current_condition_summary = serializers.CharField(required=False, allow_blank=True)


class ReferralResponseSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=['ACCEPTED', 'REJECTED', 'CONDITIONAL'])
    response_note = serializers.CharField(required=False, allow_blank=True)


class ChecklistUpdateSerializer(serializers.Serializer):
    checklist_updates = serializers.DictField(child=serializers.BooleanField())


class TransferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transfer
        fields = ['id', 'referral', 'ambulance_arranged', 'checklist', 'new_admission', 'completed_at', 'created_at']
        read_only_fields = ['id', 'created_at']
