from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaffOrManagementOrAdmin, get_staff_profile
from apps.admissions.models import Admission
from apps.patients.access import user_can_access_admission
from apps.patients.models import PatientProfile
from apps.workflow.models import RequestStatus, ServiceRequest
from apps.workflow.serializers import (
    ServiceRequestCreateSerializer, ServiceRequestSerializer, TransitionActionSerializer,
)
from apps.workflow.services import WorkflowError, create_service_request, transition_request


class ServiceRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceRequestSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['admission', 'patient', 'status', 'request_type']

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PATIENT':
            return ServiceRequest.objects.filter(patient__user=user)
        if user.role == 'FAMILY':
            return ServiceRequest.objects.filter(
                patient__family_links__family_user=user, patient__family_links__is_active=True,
                is_family_visible=True,
            )
        staff = get_staff_profile(user)
        if not staff:
            return ServiceRequest.objects.none()
        qs = ServiceRequest.objects.filter(admission__hospital=staff.hospital)
        # Department dashboards see their own department's queue, PLUS any
        # request they personally created regardless of which department it
        # was routed to (e.g. a doctor tracking the CT scan they ordered).
        # Still hospital-scoped by the filter above — this never exposes
        # anything outside the staff member's own hospital, and grants no
        # extra write/completion authority (that's enforced separately in
        # apps/workflow/services.py::_can_complete()).
        if user.role == 'HOSPITAL_STAFF':
            if not staff.department_id:
                return qs.filter(created_by=user)
            department_queue = Q(target_department=staff.department_id) & ~Q(
                status__in=[RequestStatus.REQUESTED, RequestStatus.APPROVAL_REQUIRED]
            )
            qs = qs.filter(department_queue | Q(created_by=user))
        return qs

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        if request.user.role not in ('PATIENT', 'HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
            raise PermissionDenied('You are not authorised to create service requests.')
        serializer = ServiceRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        admission = Admission.objects.filter(id=d['admission']).first()
        patient = PatientProfile.objects.filter(id=d['patient']).first()
        if not admission or not patient:
            return Response({'detail': 'Patient or admission not found.'}, status=status.HTTP_404_NOT_FOUND)
        if admission.patient_id != patient.id:
            return Response({'detail': 'The patient does not belong to this admission.'}, status=status.HTTP_400_BAD_REQUEST)
        if not user_can_access_admission(request.user, admission):
            raise PermissionDenied('You cannot create requests on another hospital\'s admission.')

        req = create_service_request(
            patient=patient, admission=admission, request_type=d['request_type'],
            created_by=request.user, reason=d.get('reason', ''), priority=d.get('priority', 'NORMAL'),
        )
        return Response(ServiceRequestSerializer(req).data, status=status.HTTP_201_CREATED)

    def _do_transition(self, request, new_status):
        # get_object() already scopes to get_queryset(), which is hospital-
        # and department-filtered for staff — so reaching this point means
        # the object-level hospital check already passed.
        req = self.get_object()
        serializer = TransitionActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = transition_request(req=req, new_status=new_status, actor=request.user,
                                          note=serializer.validated_data.get('note', ''))
        except WorkflowError as e:
            return Response({'detail': str(e)}, status=status.HTTP_409_CONFLICT)
        except DjangoPermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        return Response(ServiceRequestSerializer(updated).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def accept(self, request, pk=None):
        req = self.get_object()
        new_status = (
            RequestStatus.APPROVAL_REQUIRED
            if req.status == RequestStatus.REQUESTED and req.requires_consent
            else RequestStatus.APPROVED
        )
        return self._do_transition(request, new_status)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def start(self, request, pk=None):
        return self._do_transition(request, RequestStatus.IN_PROGRESS)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def complete(self, request, pk=None):
        """Completion authority is enforced inside transition_request() /
        _can_complete() — this endpoint does not itself decide who's allowed."""
        return self._do_transition(request, RequestStatus.COMPLETED)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def postpone(self, request, pk=None):
        return self._do_transition(request, RequestStatus.POSTPONED)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def cancel(self, request, pk=None):
        return self._do_transition(request, RequestStatus.CANCELLED)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsStaffOrManagementOrAdmin])
    def reject(self, request, pk=None):
        return self._do_transition(request, RequestStatus.REJECTED)
