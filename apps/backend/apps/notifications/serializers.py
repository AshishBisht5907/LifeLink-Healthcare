from rest_framework import serializers

from apps.notifications.models import FamilyCommunicationLog, Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'notification_type', 'title', 'body', 'patient', 'admission', 'is_read', 'created_at']
        read_only_fields = ['id', 'notification_type', 'title', 'body', 'patient', 'admission', 'created_at']


class FamilyCommunicationLogSerializer(serializers.ModelSerializer):
    sent_by_username = serializers.CharField(source='sent_by.username', read_only=True)

    class Meta:
        model = FamilyCommunicationLog
        fields = ['id', 'patient', 'admission', 'message', 'sent_by', 'sent_by_username',
                  'sent_to', 'related_service_request', 'sent_at']
        read_only_fields = ['id', 'sent_by', 'sent_at']


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ['in_app', 'sms', 'email']
