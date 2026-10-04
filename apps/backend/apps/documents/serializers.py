from django.conf import settings
from rest_framework import serializers

from apps.documents.models import Document


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source='uploaded_by.username', read_only=True)
    verified_by_username = serializers.CharField(source='verified_by.username', read_only=True, default=None)

    class Meta:
        model = Document
        fields = ['id', 'patient', 'admission', 'file', 'doc_type', 'version', 'supersedes',
                  'source', 'verification_status', 'verified_by', 'verified_by_username', 'verified_at',
                  'rejection_reason', 'uploaded_by', 'uploaded_by_username',
                  'uploaded_at', 'content_type', 'size_bytes']
        # verification_status (and everything about who/when verified) is
        # NEVER writable through the plain serializer — it can only change
        # via the dedicated verify()/reject() actions below, which enforce
        # staff-only + hospital-scoped access. Section 4: "Patient must NOT
        # be able to mark information as verified."
        read_only_fields = ['id', 'version', 'verification_status', 'verified_by', 'verified_by_username',
                             'verified_at', 'rejection_reason', 'uploaded_by', 'uploaded_at',
                             'content_type', 'size_bytes']

    def validate_file(self, value):
        # Section 33 — file upload validation: type + size, checked
        # server-side regardless of what the browser claims.
        content_type = getattr(value, 'content_type', '')
        if content_type not in settings.LIFELINK_ALLOWED_UPLOAD_TYPES:
            raise serializers.ValidationError(
                f'Unsupported file type "{content_type}". Allowed: {settings.LIFELINK_ALLOWED_UPLOAD_TYPES}'
            )
        if value.size > settings.LIFELINK_MAX_UPLOAD_BYTES:
            raise serializers.ValidationError('File exceeds the maximum allowed upload size.')
        return value
