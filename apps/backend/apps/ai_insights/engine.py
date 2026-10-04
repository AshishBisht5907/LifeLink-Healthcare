"""
This is the AI layer described in section 28/50 of the spec, built as a
retrieval-and-organize pipeline rather than a live LLM call.

Why not a real LLM call: this sandbox has no way to hold a real model
provider API key, and section 29 explicitly forbids sending private
patient data to an external AI provider without a proper compliant
pathway. So this engine does the RAG "R" (retrieval) and "G" (generation)
steps as deterministic template composition over real DB rows — every
sentence it writes is backed by an AIReference row pointing at the actual
source record. Swapping in a real, compliant model later means replacing
`_compose_summary_text()` with a call to that model using the same
retrieved `facts` list as its only context — the retrieval/traceability/
safety scaffolding around it does not change.

HARD RULES actually enforced here (not just documented):
- Never invents a fact: every fact comes from a real query.
- Missing data is reported as "MISSING / NOT VERIFIED", never guessed (26).
- Conflicting blood group reports are flagged, never auto-resolved (31).
"""
from apps.ai_insights.models import AIInsight, AIReference, InsightStatus, InsightType


def generate_emergency_summary(patient, requested_by=None):
    facts = []
    missing = []

    # Blood group — may be a conflict (section 31)
    if patient.blood_group_verification == 'CONFLICT':
        reports = list(patient.blood_group_reports.all().order_by('-recorded_at')[:5])
        values = ', '.join(sorted({r.value for r in reports}))
        facts.append((f'Conflict detected in blood group records ({values}). Verification required before use.',
                      'BloodGroupReport', '', 'Multiple conflicting blood group reports'))
    elif patient.blood_group:
        facts.append((f'Blood group: {patient.blood_group} ({patient.get_blood_group_verification_display()}).',
                      'PatientProfile', str(patient.id), 'Patient Profile'))
    else:
        missing.append('Blood group')

    # Allergies
    allergies = list(patient.allergies.all())
    if allergies:
        for a in allergies:
            facts.append((f'Allergy: {a.substance} (severity: {a.get_severity_display()}, '
                          f'{a.get_verification_status_display()}).',
                          'Allergy', str(a.id), f'Allergy record dated {a.recorded_at.date()}'))
    else:
        missing.append('Allergy information')

    # Active medications
    meds = list(patient.medications.filter(status='ACTIVE'))
    if meds:
        for m in meds:
            facts.append((f'Current medication: {m.name} {m.dosage} ({m.frequency}).',
                          'Medication', str(m.id), f'Medication record started {m.start_date}'))
    else:
        missing.append('Current medication list')

    # Major history (verified only — never surface pending/unverified as fact, section 51)
    history = list(patient.history_entries.filter(verification_status='VERIFIED')[:10])
    if history:
        for h in history:
            hospital = h.originating_hospital.name if h.originating_hospital else 'Unknown hospital'
            facts.append((f'{h.event_date}: {h.get_event_type_display()} — {h.description}',
                          'MedicalHistoryEntry', str(h.id), f'{h.get_event_type_display()}, {hospital}, {h.event_date}'))
    else:
        missing.append('Verified major medical history')

    # Emergency contacts
    contact = patient.emergency_contacts.filter(is_primary=True).first()
    if contact:
        facts.append((f'Primary emergency contact: {contact.name} ({contact.relationship}), {contact.phone}.',
                      'EmergencyContact', str(contact.id), 'Patient Profile — Emergency Contacts'))
    else:
        missing.append('Emergency contact')

    status = InsightStatus.GENERATED
    if patient.blood_group_verification == 'CONFLICT':
        status = InsightStatus.FLAGGED_CONFLICT
    elif missing:
        status = InsightStatus.FLAGGED_INCOMPLETE

    content = _compose_summary_text(patient, facts, missing)

    insight = AIInsight.objects.create(
        patient=patient,
        insight_type=InsightType.EMERGENCY_SUMMARY,
        content_text=content,
        status=status,
        requested_by=requested_by,
    )
    AIReference.objects.bulk_create([
        AIReference(insight=insight, source_type=src_type, source_object_id=src_id, source_description=src_desc)
        for _, src_type, src_id, src_desc in facts
    ])
    return insight


def _compose_summary_text(patient, facts, missing):
    lines = [f'Emergency Summary — {patient.full_name} ({patient.lifelink_patient_id})', '']
    for text, *_ in facts:
        lines.append(f'- {text}')
    if missing:
        lines.append('')
        lines.append('MISSING / NOT VERIFIED:')
        for m in missing:
            lines.append(f'- {m}')
    return '\n'.join(lines)


def detect_missing_information(patient):
    """Section 26 — a lightweight, rule-based checker (not an LLM call)."""
    flags = []
    if not patient.allergies.exists():
        flags.append('Allergy information unavailable')
    if not patient.emergency_contacts.exists():
        flags.append('Emergency contact missing')
    if not patient.history_entries.filter(verification_status='VERIFIED').exists():
        flags.append('No verified medical history on file')
    if patient.blood_group_verification == 'CONFLICT':
        flags.append('Conflicting blood group records — verification required')
    return flags
