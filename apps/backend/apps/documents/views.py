from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import serializers as drf_serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStaffOrManagementOrAdmin
from apps.audit.utils import log_action
from apps.documents.models import Document
from apps.documents.serializers import DocumentSerializer
from apps.patients.access import user_can_access_patient

SIGNER = signing.TimestampSigner(salt='lifelink.document.download')
SIGNED_URL_MAX_AGE_SECONDS = 300  # 5 minutes


class DocumentRejectSerializer(drf_serializers.Serializer):
    reason = drf_serializers.CharField(min_length=3, max_length=255)


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # IMPORTANT: only the list action requires (and filters by) a
        # ?patient= query param. Detail-level actions (retrieve, verify,
        # reject, signed_url) look up a document by its own id directly —
        # requiring ?patient= there as well made them unreachable through
        # any realistic detail URL, since a client calling
        # POST /api/documents/<id>/verify/ has no reason to also attach a
        # patient query string. Each of those actions already performs its
        # own explicit user_can_access_patient() check before acting, so
        # this is safe: get_object() finding the row is not the same as
        # being authorised to act on it.
        if self.action != 'list':
            return Document.objects.all()
        patient_id = self.request.query_params.get('patient')
        if not patient_id:
            return Document.objects.none()
        from apps.patients.models import PatientProfile
        patient = PatientProfile.objects.filter(id=patient_id).first()
        if not patient or not user_can_access_patient(self.request.user, patient):
            return Document.objects.none()
        return Document.objects.filter(patient=patient)

    def get_permissions(self):
        # Section 5: patients/family upload their OWN documents; staff
        # upload on behalf of any patient they have access to. Either way,
        # perform_create()'s user_can_access_patient() check is what
        # actually enforces "only for a patient you're authorised for" —
        # this permission class only decides which roles may attempt it.
        if self.action in ('verify', 'reject', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsStaffOrManagementOrAdmin()]
        return [IsAuthenticated()]

    def update(self, request, *args, **kwargs):
        # Section 45/49: closes the hole this audit found — verification_
        # status was previously PATCH-able by anyone with object access,
        # including the uploading patient themselves. The only sanctioned
        # mutations now are verify()/reject() below.
        return Response({'detail': 'Documents cannot be edited directly. Upload a new version instead.'},
                         status=status.HTTP_405_METHOD_NOT_ALLOWED)
    partial_update = update

    def retrieve(self, request, *args, **kwargs):
        doc = self.get_object()
        if not user_can_access_patient(request.user, doc.patient):
            raise PermissionDenied('Not authorised.')
        log_action('DOCUMENT_VIEWED', actor=request.user, patient_id=doc.patient_id,
                    admission_id=doc.admission_id, target_description=str(doc.id))
        return Response(self.get_serializer(doc).data)

    def perform_create(self, serializer):
        patient = serializer.validated_data['patient']
        if not user_can_access_patient(self.request.user, patient):
            raise PermissionDenied('You are not authorised to upload documents for this patient.')
        f = serializer.validated_data['file']
        doc = serializer.save(
            uploaded_by=self.request.user, content_type=getattr(f, 'content_type', ''), size_bytes=f.size,
        )
        log_action('DOCUMENT_UPLOADED', actor=self.request.user, patient_id=patient.id,
                    admission_id=doc.admission_id, target_description=str(doc.id))

    def _staff_can_act_on(self, request, doc) -> bool:
        """Verify/reject require the staff member to actually have
        hospital-scoped access to this patient — not just any staff/mgmt/
        admin role in the system."""
        return user_can_access_patient(request.user, doc.patient)

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        doc = self.get_object()
        if not self._staff_can_act_on(request, doc):
            raise PermissionDenied('You are not authorised to verify documents for this patient.')
        doc.verification_status = 'VERIFIED'
        doc.verified_by = request.user
        doc.verified_at = timezone.now()
        doc.rejection_reason = ''
        doc.save(update_fields=['verification_status', 'verified_by', 'verified_at', 'rejection_reason'])
        log_action('DOCUMENT_VERIFIED', actor=request.user, patient_id=doc.patient_id,
                    admission_id=doc.admission_id, target_description=str(doc.id))
        return Response(DocumentSerializer(doc).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        doc = self.get_object()
        if not self._staff_can_act_on(request, doc):
            raise PermissionDenied('You are not authorised to reject documents for this patient.')
        serializer = DocumentRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        doc.verification_status = 'REJECTED'
        doc.verified_by = request.user
        doc.verified_at = timezone.now()
        doc.rejection_reason = serializer.validated_data['reason']
        doc.save(update_fields=['verification_status', 'verified_by', 'verified_at', 'rejection_reason'])
        log_action('DOCUMENT_REJECTED', actor=request.user, patient_id=doc.patient_id,
                    admission_id=doc.admission_id, target_description=f'{doc.id}: {doc.rejection_reason}')
        return Response(DocumentSerializer(doc).data)

    @action(detail=True, methods=['get'])
    def signed_url(self, request, pk=None):
        """Section 33/45 — instead of a permanently-public media URL, issue
        a short-lived signed token that the (unauthenticated) file-serving
        endpoint below will accept for SIGNED_URL_MAX_AGE_SECONDS only."""
        doc = self.get_object()
        if not user_can_access_patient(request.user, doc.patient):
            raise PermissionDenied('Not authorised.')
        token = SIGNER.sign(str(doc.id))
        log_action('DOCUMENT_DOWNLOAD_LINK_ISSUED', actor=request.user, patient_id=doc.patient_id,
                    target_description=str(doc.id))
        return Response({'download_path': f'/api/documents/secure-download/?token={token}',
                          'expires_in_seconds': SIGNED_URL_MAX_AGE_SECONDS})


class SecureDownloadView(APIView):
    """Deliberately AllowAny — authorization is enforced by requiring a
    freshly-signed, short-lived token from signed_url() above, rather than
    a bearer token, so this can be handed to e.g. a print dialog or a
    mobile webview without exposing the user's session."""
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get('token', '')
        try:
            doc_id = SIGNER.unsign(token, max_age=SIGNED_URL_MAX_AGE_SECONDS)
        except signing.SignatureExpired:
            return Response({'detail': 'This download link has expired.'}, status=status.HTTP_410_GONE)
        except signing.BadSignature:
            return Response({'detail': 'Invalid download link.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            doc = Document.objects.get(id=doc_id)
        except Document.DoesNotExist:
            raise Http404
        log_action('DOCUMENT_DOWNLOADED', target_description=str(doc.id), patient_id=doc.patient_id)
        return FileResponse(doc.file.open('rb'), as_attachment=True, filename=doc.file.name.split('/')[-1])
