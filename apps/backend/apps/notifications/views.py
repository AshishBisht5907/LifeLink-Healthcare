from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaffOrManagementOrAdmin
from apps.audit.utils import log_action
from apps.notifications.models import FamilyCommunicationLog, Notification, NotificationPreference
from apps.notifications.serializers import FamilyCommunicationLogSerializer, NotificationSerializer, NotificationPreferenceSerializer
from apps.patients.access import user_can_access_patient
from apps.patients.models import FamilyRelationship


class NotificationPreferenceViewSet(viewsets.ModelViewSet):
    """Users manage their own notification preferences."""
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [IsAuthenticated]
    
    # We don't want standard list/create methods to be used by the frontend
    # the frontend should just call /api/notifications/preferences/me/
    http_method_names = ['get', 'patch', 'options']

    def get_queryset(self):
        return NotificationPreference.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        if request.method == 'PATCH':
            serializer = self.get_serializer(prefs, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return Response(self.get_serializer(prefs).data)


class NotificationViewSet(viewsets.ModelViewSet):
    """Users only ever see their OWN notifications."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        n = self.get_object()
        n.is_read = True
        n.save(update_fields=['is_read'])
        return Response(NotificationSerializer(n).data)


class FamilyCommunicationLogViewSet(viewsets.ModelViewSet):
    serializer_class = FamilyCommunicationLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'FAMILY':
            return FamilyCommunicationLog.objects.filter(sent_to=user)
        patient_id = self.request.query_params.get('patient')
        patient = _get_patient(patient_id) if patient_id else None
        if patient and user_can_access_patient(user, patient):
            return FamilyCommunicationLog.objects.filter(patient_id=patient_id)
        return FamilyCommunicationLog.objects.none()

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        patient = serializer.validated_data['patient']
        if not user_can_access_patient(self.request.user, patient):
            raise PermissionDenied('You cannot message family for this patient.')
        sent_to = serializer.validated_data['sent_to']
        if not FamilyRelationship.objects.filter(patient=patient, family_user=sent_to, is_active=True).exists():
            raise PermissionDenied('Recipient is not an authorised family member for this patient.')
        log_entry = serializer.save(sent_by=self.request.user)
        Notification.objects.create(
            recipient=sent_to, notification_type='GENERAL', title='New update from the hospital',
            body=log_entry.message, patient=patient, admission=log_entry.admission,
        )
        log_action('FAMILY_COMMUNICATION_SENT', actor=self.request.user, patient_id=patient.id)


def _get_patient(patient_id):
    from apps.patients.models import PatientProfile
    return PatientProfile.objects.filter(id=patient_id).first()
