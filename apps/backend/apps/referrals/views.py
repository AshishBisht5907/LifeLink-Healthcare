from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from apps.accounts.permissions import IsStaffOrManagementOrAdmin, get_staff_profile
from apps.admissions.models import Admission
from apps.ai_insights.engine import generate_emergency_summary
from apps.audit.utils import log_action
from apps.hospitals.models import Hospital
from apps.patients.access import user_can_access_admission
from apps.patients.models import PatientProfile
from apps.referrals.checklist import ChecklistError, apply_checklist_updates
from apps.referrals.models import Referral, ReferralStatus, Transfer
from apps.referrals.packet import build_transfer_packet
from apps.referrals.serializers import (
    ChecklistUpdateSerializer, ReferralCreateSerializer, ReferralResponseSerializer,
    ReferralSerializer, TransferSerializer,
)


class ReferralViewSet(viewsets.ModelViewSet):
    """
    Section 17. Hospital A creates + sends; Hospital B only ever sees this
    referral record plus its AI-generated summary — NOT Hospital A's full
    internal admission file (section 16).
    """
    serializer_class = ReferralSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Patient/family may only ever see referrals concerning their OWN
        # patient — read-only, and scoped exactly like live_status/consents
        # elsewhere in the app (section 19: family sees referral/transfer
        # status, never anyone else's).
        if user.role == 'PATIENT':
            return Referral.objects.filter(patient__user=user)
        if user.role == 'FAMILY':
            return Referral.objects.filter(
                patient__family_links__family_user=user, patient__family_links__is_active=True)

        staff = get_staff_profile(user)
        if not staff:
            return Referral.objects.none()
        # Visible if this hospital is either the sender or the receiver —
        # never any *other* hospital's referral.
        from django.db.models import Q
        return Referral.objects.filter(Q(from_hospital=staff.hospital) | Q(to_hospital=staff.hospital))

    def get_permissions(self):
        # NOTE: this also closes a pre-existing gap — update/partial_update/
        # destroy previously fell through to plain IsAuthenticated, meaning
        # any authenticated user whose queryset included a referral could
        # edit or delete it. Now that patient/family can also see referrals
        # (read-only, above), this must be explicit: only hospital staff/
        # management/admin may ever mutate a referral, and only through the
        # named actions below (never a raw PATCH/DELETE from anyone).
        if self.action in ('create', 'respond', 'complete_transfer', 'update_checklist'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['get'], url_path='transfer_packet')
    def transfer_packet(self, request, pk=None):
        if request.user.role not in ('HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
            raise PermissionDenied('Only authorised hospital staff can view a transfer packet.')
        referral = self.get_object()
        return Response(build_transfer_packet(referral, request.user))

    def create(self, request, *args, **kwargs):
        serializer = ReferralCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        admission = Admission.objects.filter(id=d['from_admission']).first()
        patient = PatientProfile.objects.filter(id=d['patient']).first()
        to_hospital = Hospital.objects.filter(id=d['to_hospital']).first()
        if not admission or not patient or not to_hospital:
            return Response({'detail': 'Patient, admission, or destination hospital not found.'},
                             status=status.HTTP_404_NOT_FOUND)
        if not user_can_access_admission(request.user, admission):
            raise PermissionDenied('You cannot refer from another hospital\'s admission.')

        # Auto-generate an AI, source-linked summary to carry over — the
        # concrete implementation of "AI referral summary" (section 17/27).
        summary = generate_emergency_summary(patient, requested_by=request.user)

        referral = Referral.objects.create(
            patient=patient, from_hospital=admission.hospital, from_admission=admission,
            to_hospital=to_hospital, required_department_type=d['required_department_type'],
            priority=d.get('priority', 'HIGH'), reason=d['reason'],
            current_condition_summary=d.get('current_condition_summary', ''),
            ai_summary=summary, created_by=request.user,
        )
        log_action('REFERRAL_CREATED', actor=request.user, hospital_id=admission.hospital_id,
                    patient_id=patient.id, admission_id=admission.id,
                    target_description=f'to {to_hospital.name}')
        from apps.notifications.services import notify_referral_created
        notify_referral_created(referral)
        return Response(ReferralSerializer(referral).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        referral = self.get_object()
        staff = get_staff_profile(request.user)
        if not staff or staff.hospital_id != referral.to_hospital_id:
            raise PermissionDenied('Only the receiving hospital can respond to this referral.')
        if referral.status != ReferralStatus.PENDING:
            return Response({'detail': 'This referral has already been responded to.'}, status=status.HTTP_409_CONFLICT)

        serializer = ReferralResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        with transaction.atomic():
            referral.status = d['decision']
            referral.responded_by = request.user
            referral.response_note = d.get('response_note', '')
            referral.responded_at = timezone.now()
            referral.save()
            if d['decision'] in (ReferralStatus.ACCEPTED, ReferralStatus.CONDITIONAL):
                Transfer.objects.get_or_create(referral=referral)

        from apps.notifications.services import notify_referral_response
        notify_referral_response(referral)

        log_action('REFERRAL_RESPONDED', actor=request.user, hospital_id=referral.to_hospital_id,
                    patient_id=referral.patient_id, target_description=d['decision'])
        return Response(ReferralSerializer(referral).data)

    @action(detail=True, methods=['get'], url_path='transfer')
    def get_transfer(self, request, pk=None):
        """
        Read-only view of the Transfer/checklist state (gap fix — previously
        the only way to see checklist progress was as a side effect of the
        two mutating POST actions below, which would mean using an empty
        POST as a fake "read" and polluting the audit log with no-op
        entries on every page view). Visible to anyone who can see the
        referral itself (same queryset scoping — participants' staff, plus
        the patient/family read-only access added alongside this).
        """
        referral = self.get_object()
        if not hasattr(referral, 'transfer'):
            return Response({'detail': 'No transfer exists for this referral yet.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(TransferSerializer(referral.transfer).data)

    @action(detail=True, methods=['post'])
    def complete_transfer(self, request, pk=None):
        """Hospital B creates the NEW Admission File; the same PatientProfile
        continues (section 17/27/47)."""
        referral = self.get_object()
        staff = get_staff_profile(request.user)
        if not staff or staff.hospital_id != referral.to_hospital_id:
            raise PermissionDenied('Only the receiving hospital can complete this transfer.')
        if referral.status not in (ReferralStatus.ACCEPTED, ReferralStatus.CONDITIONAL):
            return Response({'detail': 'Referral must be accepted before completing transfer.'},
                             status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            new_admission = Admission.objects.create(
                patient=referral.patient, hospital=referral.to_hospital,
                admission_number=Admission.generate_admission_number(referral.to_hospital),
                reason=f'Transferred from {referral.from_hospital.name}: {referral.reason}',
                created_by=request.user,
            )
            transfer = referral.transfer
            transfer.new_admission = new_admission
            transfer.completed_at = timezone.now()
            transfer.save(update_fields=['new_admission', 'completed_at'])

        from apps.notifications.services import notify_transfer_completed
        notify_transfer_completed(referral, transfer)

        log_action('TRANSFER_COMPLETED', actor=request.user, hospital_id=referral.to_hospital_id,
                    patient_id=referral.patient_id, admission_id=new_admission.id)
        return Response(TransferSerializer(transfer).data)

    @action(detail=True, methods=['post'], url_path='checklist')
    def update_checklist(self, request, pk=None):
        """
        Section 17 checklist. Every item has a designated owning hospital
        side (apps/referrals/checklist.py) — a hospital can NEVER mark an
        item owned by the other side, and unauthorized/unknown items cause
        the WHOLE request to be rejected (no partial/silent application).
        """
        referral = self.get_object()
        staff = get_staff_profile(request.user)
        if not staff or staff.hospital_id not in (referral.from_hospital_id, referral.to_hospital_id):
            raise PermissionDenied('You are not part of this referral.')
        if not hasattr(referral, 'transfer'):
            return Response({'detail': 'This referral has not been accepted yet — no transfer exists.'},
                             status=status.HTTP_409_CONFLICT)

        serializer = ChecklistUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updates = serializer.validated_data['checklist_updates']

        transfer = referral.transfer
        try:
            new_checklist = apply_checklist_updates(transfer, referral, updates, request.user)
        except ChecklistError as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)

        transfer.checklist = new_checklist
        update_fields = ['checklist']
        if 'ambulance_arranged' in updates:
            transfer.ambulance_arranged = bool(updates['ambulance_arranged'])
            update_fields.append('ambulance_arranged')
        transfer.save(update_fields=update_fields)

        log_action('TRANSFER_CHECKLIST_UPDATED', actor=request.user, hospital_id=staff.hospital_id,
                    patient_id=referral.patient_id, target_description=str(list(updates.keys())))
        return Response(TransferSerializer(transfer).data)
