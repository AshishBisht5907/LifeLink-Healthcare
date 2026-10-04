from rest_framework import serializers
from apps.audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'actor', 'actor_username', 'actor_role', 'action', 'result',
            'hospital_id', 'patient_id', 'admission_id', 'target_description',
            'context', 'ip_address', 'created_at',
        ]
        read_only_fields = fields
