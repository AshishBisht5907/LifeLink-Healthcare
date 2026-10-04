from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from apps.accounts.permissions import IsStaffOrManagementOrAdmin, get_staff_profile


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only, by design (section 23: ordinary users cannot edit/delete
    audit records — there is no update/destroy action at all, at the HTTP
    routing level, not just via permission checks).
    """
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrManagementOrAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['action', 'patient_id', 'hospital_id', 'admission_id', 'actor_role']

    def get_queryset(self):
        user = self.request.user
        qs = AuditLog.objects.all()
        # Hospital Admin / Management only see their own hospital's audit
        # trail, never other hospitals' (section 10 — never unlimited access
        # just because of a title).
        if user.role != 'HOSPITAL_ADMIN' or True:
            staff_profile = get_staff_profile(user)
            if staff_profile:
                qs = qs.filter(hospital_id=staff_profile.hospital_id)
            else:
                qs = qs.none()
        return qs
