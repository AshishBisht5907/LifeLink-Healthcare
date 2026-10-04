from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsHospitalAdmin, get_staff_profile
from apps.audit.utils import log_action
from apps.hospitals.models import Department, Hospital, HospitalCapacity, StaffProfile, StaffRole
from apps.hospitals.serializers import (
    DepartmentSerializer, HospitalCapacitySerializer, HospitalSerializer,
    ProvisionStaffSerializer, StaffProfileSerializer,
)


class HospitalViewSet(viewsets.ModelViewSet):
    """Any authenticated user can list hospitals (needed for referral
    matching / hospital search) but only Hospital Admin can create/edit.
    Real-world provisioning of a *new* hospital tenant would normally be a
    separate onboarding flow; here Hospital Admin can manage their own
    hospital's record."""
    queryset = Hospital.objects.filter(is_active=True)
    serializer_class = HospitalSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsHospitalAdmin()]
        return [IsAuthenticated()]


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['hospital', 'department_type']

    def get_queryset(self):
        return Department.objects.filter(is_active=True)

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsHospitalAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        # Hospital Admin can only create departments inside their own hospital.
        staff = get_staff_profile(self.request.user)
        serializer.save(hospital=staff.hospital)


class StaffProfileViewSet(viewsets.ModelViewSet):
    """Hospital Admin provisions staff accounts (section 12). Staff never
    self-register with a chosen role, and cannot edit their own role/
    hospital/department — only Hospital Admin (via this viewset, itself
    gated by IsHospitalAdmin) can, and only within their own hospital.
    """
    serializer_class = StaffProfileSerializer
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_queryset(self):
        staff = get_staff_profile(self.request.user)
        if not staff:
            return StaffProfile.objects.none()
        # Hospital Admin only ever sees/manages their own hospital's staff.
        return StaffProfile.objects.filter(hospital=staff.hospital)

    def perform_create(self, serializer):
        staff = get_staff_profile(self.request.user)
        department = serializer.validated_data.get('department')
        if department and department.hospital_id != staff.hospital_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Department must belong to your own hospital.')
        serializer.save(hospital=staff.hospital)

    def perform_update(self, serializer):
        # get_object() already scopes to the admin's own hospital via
        # get_queryset(), so reaching here means hospital ownership is
        # already confirmed. Still re-validate department cross-hospital
        # assignment explicitly (defence in depth).
        staff = get_staff_profile(self.request.user)
        department = serializer.validated_data.get('department')
        if department and department.hospital_id != staff.hospital_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Department must belong to your own hospital.')
        serializer.save(hospital=staff.hospital)

    @action(detail=False, methods=['post'])
    def provision(self, request):
        """
        Section 12 — the actual 'create a hospital staff account' flow:
        Hospital Admin supplies identity + role/department, the system
        creates the User (with a real hashed password) and StaffProfile
        together, scoped to the admin's own hospital only.
        """
        serializer = ProvisionStaffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        admin_staff = get_staff_profile(request.user)

        if User.objects.filter(username=d['username']).exists():
            return Response({'detail': 'That username is already taken.'}, status=status.HTTP_409_CONFLICT)

        department = None
        if d.get('department'):
            department = Department.objects.filter(id=d['department'], hospital=admin_staff.hospital).first()
            if not department:
                return Response({'detail': 'Department not found in your hospital.'}, status=status.HTTP_404_NOT_FOUND)

        role = Role.HOSPITAL_MANAGEMENT if d['staff_role'] == StaffRole.COORDINATOR else (
            Role.HOSPITAL_ADMIN if d['staff_role'] == StaffRole.ADMIN else Role.HOSPITAL_STAFF)

        with transaction.atomic():
            user = User.objects.create(username=d['username'], role=role, must_change_password=True)
            user.set_password(d['initial_password'])
            user.save()
            new_staff = StaffProfile.objects.create(
                user=user, hospital=admin_staff.hospital, department=department,
                staff_role=d['staff_role'], employee_id=d['employee_id'], job_title=d.get('job_title', ''),
            )

        log_action('STAFF_PROVISIONED', actor=request.user, hospital_id=admin_staff.hospital_id,
                    target_description=f'{d["username"]} ({d["staff_role"]})')
        return Response(StaffProfileSerializer(new_staff).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        target = self.get_object()  # already hospital-scoped via get_queryset()
        target.is_active = False
        target.user.is_active = False
        target.user.save(update_fields=['is_active'])
        target.save(update_fields=['is_active'])
        log_action('STAFF_DEACTIVATED', actor=request.user, hospital_id=target.hospital_id,
                    target_description=target.user.username)
        return Response(StaffProfileSerializer(target).data)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        target = self.get_object()
        target.is_active = True
        target.user.is_active = True
        target.user.save(update_fields=['is_active'])
        target.save(update_fields=['is_active'])
        log_action('STAFF_ACTIVATED', actor=request.user, hospital_id=target.hospital_id,
                    target_description=target.user.username)
        return Response(StaffProfileSerializer(target).data)


class HospitalCapacityViewSet(viewsets.ModelViewSet):
    """Section 18. Management/Admin update their own hospital's capacity;
    everyone authenticated can read (needed for referral matching)."""
    serializer_class = HospitalCapacitySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['hospital', 'resource_type']
    queryset = HospitalCapacity.objects.all()

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        staff = get_staff_profile(request.user)
        if not staff or request.user.role not in ('HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only management/admin can set hospital capacity.')

        resource_type = request.data.get('resource_type')
        hospital_id = request.data.get('hospital') or str(staff.hospital_id)
        if str(staff.hospital_id) != str(hospital_id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You cannot modify another hospital\'s capacity.')

        existing = HospitalCapacity.objects.filter(hospital_id=hospital_id, resource_type=resource_type).first()
        if existing is not None:
            serializer = self.get_serializer(existing, data=request.data, partial=False)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(hospital=staff.hospital)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        staff = get_staff_profile(self.request.user)
        if not staff or self.request.user.role not in ('HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only management/admin can set hospital capacity.')
        serializer.save(hospital=staff.hospital)

    def perform_update(self, serializer):
        staff = get_staff_profile(self.request.user)
        obj = self.get_object()
        if not staff or staff.hospital_id != obj.hospital_id or self.request.user.role not in ('HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You cannot modify another hospital\'s capacity.')
        serializer.save()
