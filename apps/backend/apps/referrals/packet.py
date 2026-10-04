from apps.admissions.serializers import AdmissionListSerializer, DoctorNoteSerializer, NursingNoteSerializer
from apps.documents.models import Document
from apps.patients.access import user_can_access_admission, user_can_access_patient
from apps.patients.serializers import AllergySerializer, MedicationSerializer
from apps.workflow.models import ServiceRequest


def _admission_summary(admission, include_notes=False):
    if not admission:
        return None
    data = AdmissionListSerializer(admission).data
    data['reason'] = admission.reason
    data['attending_doctor'] = str(admission.attending_doctor_id) if admission.attending_doctor_id else None
    if include_notes:
        data['doctor_notes'] = DoctorNoteSerializer(admission.doctor_notes.all(), many=True).data
        data['nursing_notes'] = NursingNoteSerializer(admission.nursing_notes.all(), many=True).data
    return data


def build_transfer_packet(referral, user):
    source_admission = referral.from_admission
    transfer = getattr(referral, 'transfer', None)
    target_admission = transfer.new_admission if transfer and transfer.new_admission_id else None
    can_access_source = user_can_access_admission(user, source_admission)
    can_access_target = bool(target_admission and user_can_access_admission(user, target_admission))
    can_access_patient = user_can_access_patient(user, referral.patient)
    can_access_medical_context = can_access_source or can_access_target or can_access_patient

    packet = {
        'referral': {
            'id': str(referral.id),
            'status': referral.status,
            'from_hospital': referral.from_hospital.name,
            'to_hospital': referral.to_hospital.name,
            'created_at': referral.created_at,
            'responded_at': referral.responded_at,
            'priority': referral.priority,
            'required_department_type': referral.required_department_type,
            'reason': referral.reason,
            'current_condition_summary': referral.current_condition_summary or 'Not provided',
        },
        'transfer': {
            'id': str(transfer.id) if transfer else None,
            'status': 'COMPLETED' if transfer and transfer.completed_at else referral.status,
            'ambulance_arranged': transfer.ambulance_arranged if transfer else None,
            'completed_at': transfer.completed_at if transfer else None,
            'checklist': transfer.checklist if transfer else {},
        },
        'patient': {
            'id': str(referral.patient.id),
            'lifelink_patient_id': referral.patient.lifelink_patient_id,
            'full_name': referral.patient.full_name,
            'date_of_birth': referral.patient.date_of_birth if can_access_medical_context else None,
            'gender': referral.patient.gender if can_access_medical_context else None,
            'blood_group': referral.patient.blood_group if can_access_medical_context else None,
            'access_limited': not can_access_medical_context,
        },
        'source_admission': _admission_summary(source_admission, include_notes=can_access_source) if can_access_source else None,
        'target_admission': _admission_summary(target_admission, include_notes=can_access_target),
        'clinical_context': {
            'ai_summary': None,
            'ai_references': [],
        },
        'allergies': [],
        'medications': [],
        'documents': [],
        'requests': [],
    }

    if referral.ai_summary_id:
        insight = referral.ai_summary
        packet['clinical_context']['ai_summary'] = {
            'content_text': insight.content_text,
            'status': insight.status,
            'generated_at': insight.generated_at,
            'generated_by_service': insight.generated_by_service,
        }
        packet['clinical_context']['ai_references'] = list(insight.references.values(
            'source_type', 'source_object_id', 'source_description'
        ))

    if not can_access_medical_context:
        return packet

    packet['allergies'] = AllergySerializer(referral.patient.allergies.all(), many=True).data
    packet['medications'] = MedicationSerializer(
        referral.patient.medications.filter(status='ACTIVE'), many=True
    ).data

    if can_access_source:
        packet['documents'] = [
            {
                'id': str(document.id),
                'doc_type': document.doc_type,
                'verification_status': document.verification_status,
                'uploaded_at': document.uploaded_at,
                'admission': str(document.admission_id) if document.admission_id else None,
                'access': 'Available through existing authorized document access',
            }
            for document in Document.objects.filter(
                patient=referral.patient, admission=source_admission,
            )
        ]
        active_requests = ServiceRequest.objects.filter(admission=source_admission).exclude(
            status__in=['COMPLETED', 'CANCELLED', 'REJECTED']
        ).select_related('target_department')
        recent_completed_requests = ServiceRequest.objects.filter(
            admission=source_admission, status='COMPLETED',
        ).select_related('target_department')[:5]
        packet['requests'] = [
            {
                'id': str(request.id),
                'request_type': request.request_type,
                'status': request.status,
                'priority': request.priority,
                'department': request.target_department.name if request.target_department else None,
                'created_at': request.created_at,
                'completed_at': request.completed_at,
            }
            for request in list(active_requests[:15]) + list(recent_completed_requests)
        ]

    return packet