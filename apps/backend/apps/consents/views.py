from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaffOrManagementOrAdmin, get_staff_profile
from apps.audit.middleware import get_client_ip
from apps.consents.models import ConsentRequest
from apps.consents.serializers import ConsentDecisionSerializer, ConsentRequestSerializer
from apps.consents.services import record_consent_action
from apps.patients.access import user_can_access_admission, user_can_access_patient


class ConsentRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ConsentRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PATIENT':
            return ConsentRequest.objects.filter(patient__user=user)
        if user.role == 'FAMILY':
            return ConsentRequest.objects.filter(
                patient__family_links__family_user=user, patient__family_links__is_active=True)
        staff = get_staff_profile(user)
        if staff:
            return ConsentRequest.objects.filter(admission__hospital=staff.hospital)
        return ConsentRequest.objects.none()

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        admission = serializer.validated_data['admission']
        if not user_can_access_admission(self.request.user, admission):
            raise PermissionDenied('You cannot create a consent request on another hospital\'s admission.')
        serializer.save(requested_by=self.request.user)

    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        """Only the PATIENT can decide a consent request. Not hospital staff
        (section 20) and not a family member: a family member's own access
        depends on the patient's consent, so letting them decide it would let
        them grant themselves access."""
        consent = self.get_object()
        user = request.user

        if not (user.role == 'PATIENT' and consent.patient.user_id == user.id):
            raise PermissionDenied('Only the patient can decide this consent request.')

        serializer = ConsentDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = record_consent_action(
                consent=consent, actor=user, action=serializer.validated_data['action'],
                ip_address=get_client_ip(request), user_agent=request.META.get('HTTP_USER_AGENT', ''),
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_409_CONFLICT)
        return Response(ConsentRequestSerializer(updated).data)
