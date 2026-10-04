from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from apps.accounts.permissions import IsStaffOrManagementOrAdmin, get_staff_profile
from apps.admissions.models import Admission, AdmissionStatus, DoctorNote, NursingNote
from apps.admissions.serializers import (
    AdmissionCreateSerializer, AdmissionDetailSerializer, AdmissionListSerializer,
    DoctorNoteSerializer, NursingNoteSerializer,
)
from apps.audit.utils import log_action
from apps.patients.access import user_can_access_admission, user_can_access_patient
from apps.patients.models import PatientProfile
from apps.notifications.services import notify_admission_created, notify_admission_discharged


class AdmissionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return AdmissionDetailSerializer if self.action == 'retrieve' else AdmissionListSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'PATIENT':
            return Admission.objects.filter(patient__user=user)
        if user.role == 'FAMILY':
            return Admission.objects.filter(patient__family_links__family_user=user,
                                             patient__family_links__is_active=True)
        staff = get_staff_profile(user)
        if staff:
            # Hospital isolation: Hospital A staff never see Hospital B's admissions.
            return Admission.objects.filter(hospital=staff.hospital)
        return Admission.objects.none()

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        if not user_can_access_admission(request.user, obj):
            raise PermissionDenied('You are not authorised to view this admission.')
        log_action('ADMISSION_VIEWED', actor=request.user, hospital_id=obj.hospital_id,
                    patient_id=obj.patient_id, admission_id=obj.id)
        return Response(self.get_serializer(obj).data)

    def get_permissions(self):
        if self.action in ('create', 'discharge'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = AdmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        staff = get_staff_profile(request.user)
        if not staff:
            raise PermissionDenied('Only hospital staff can create an admission.')

        patient = PatientProfile.objects.filter(id=d['patient']).first()
        if not patient:
            return Response({'detail': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        admission = Admission.objects.create(
            patient=patient,
            hospital=staff.hospital,
            admission_number=Admission.generate_admission_number(staff.hospital),
            reason=d.get('reason', ''),
            attending_doctor_id=d.get('attending_doctor'),
            created_by=request.user,
        )

        from apps.notifications.services import notify_admission_created
        notify_admission_created(admission)

        log_action('ADMISSION_CREATED', actor=request.user, hospital_id=staff.hospital_id,
                    patient_id=patient.id, admission_id=admission.id,
                    target_description=admission.admission_number)
        return Response(AdmissionDetailSerializer(admission).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def discharge(self, request, pk=None):
        admission = self.get_object()
        staff = get_staff_profile(request.user)
        if not staff or staff.hospital_id != admission.hospital_id:
            raise PermissionDenied('You cannot discharge from another hospital\'s admission.')
        admission.status = AdmissionStatus.DISCHARGED
        admission.discharged_at = timezone.now()
        admission.save(update_fields=['status', 'discharged_at'])

        from apps.notifications.services import notify_admission_discharged
        notify_admission_discharged(admission)

        log_action('ADMISSION_DISCHARGED', actor=request.user, hospital_id=admission.hospital_id,
                    patient_id=admission.patient_id, admission_id=admission.id)
        return Response(AdmissionDetailSerializer(admission).data)


class DoctorNoteViewSet(viewsets.ModelViewSet):
    serializer_class = DoctorNoteSerializer
    permission_classes = [IsAuthenticated, IsStaffOrManagementOrAdmin]

    def get_queryset(self):
        admission_id = self.request.query_params.get('admission')
        admission = Admission.objects.filter(id=admission_id).first() if admission_id else None
        if not admission or not user_can_access_admission(self.request.user, admission):
            return DoctorNote.objects.none()
        return DoctorNote.objects.filter(admission=admission)

    def perform_create(self, serializer):
        admission = serializer.validated_data['admission']
        if not user_can_access_admission(self.request.user, admission):
            raise PermissionDenied('You cannot write notes on another hospital\'s admission.')
        serializer.save(author=self.request.user)


class NursingNoteViewSet(viewsets.ModelViewSet):
    serializer_class = NursingNoteSerializer
    permission_classes = [IsAuthenticated, IsStaffOrManagementOrAdmin]

    def get_queryset(self):
        admission_id = self.request.query_params.get('admission')
        admission = Admission.objects.filter(id=admission_id).first() if admission_id else None
        if not admission or not user_can_access_admission(self.request.user, admission):
            return NursingNote.objects.none()
        return NursingNote.objects.filter(admission=admission)

    def perform_create(self, serializer):
        admission = serializer.validated_data['admission']
        if not user_can_access_admission(self.request.user, admission):
            raise PermissionDenied('You cannot write notes on another hospital\'s admission.')
        serializer.save(author=self.request.user)
