from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q

from apps.accounts.permissions import get_staff_profile
from apps.ai_insights.engine import detect_missing_information, generate_emergency_summary
from apps.ai_insights.models import AIInsight
from apps.ai_insights.serializers import AIInsightSerializer
from apps.audit.utils import log_action
from apps.patients.access import user_can_access_patient
from apps.patients.models import PatientProfile


class AIInsightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only + on-demand generation. There is no path here that lets a
    client submit arbitrary free text and have it stored as an "AI insight"
    — content is only ever produced by generate_emergency_summary(), which
    reads real records (section 28/50/51).
    """
    serializer_class = AIInsightSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        patient_id = self.request.query_params.get('patient')
        patient = PatientProfile.objects.filter(id=patient_id).first() if patient_id else None
        if not patient or not user_can_access_patient(self.request.user, patient):
            return AIInsight.objects.none()
        return AIInsight.objects.filter(patient=patient)

    def get_object(self):
        """
        Gap fix: a receiving hospital must be able to open the AI summary
        attached to a referral BEFORE they've accepted it (and therefore
        before they have any admission-based access to the patient) —
        that's the entire point of an "AI referral summary" (section 17).
        Normal patient-based access still applies for every other case;
        this only ADDS a narrow extra path solely for staff whose own
        hospital genuinely appears as sender or receiver on a referral that
        references this exact insight.
        """
        insight = get_object_or_404(AIInsight, pk=self.kwargs['pk'])
        user = self.request.user

        if user_can_access_patient(user, insight.patient):
            return insight

        staff = get_staff_profile(user)
        if staff and insight.referral_set.filter(
            Q(from_hospital=staff.hospital) | Q(to_hospital=staff.hospital)
        ).exists():
            return insight

        raise PermissionDenied('Not authorised for this patient.')

    @action(detail=False, methods=['post'])
    def generate_emergency_summary(self, request):
        patient_id = request.data.get('patient')
        patient = PatientProfile.objects.filter(id=patient_id).first()
        if not patient or not user_can_access_patient(request.user, patient):
            raise PermissionDenied('Not authorised for this patient.')
        insight = generate_emergency_summary(patient, requested_by=request.user)
        log_action('AI_SUMMARY_GENERATED', actor=request.user, patient_id=patient.id,
                    target_description=str(insight.id))
        return Response(AIInsightSerializer(insight).data)

    @action(detail=False, methods=['get'])
    def missing_information(self, request):
        patient_id = request.query_params.get('patient')
        patient = PatientProfile.objects.filter(id=patient_id).first()
        if not patient or not user_can_access_patient(request.user, patient):
            raise PermissionDenied('Not authorised for this patient.')
        return Response({'flags': detect_missing_information(patient)})
