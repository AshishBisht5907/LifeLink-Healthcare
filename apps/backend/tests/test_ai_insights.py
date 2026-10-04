import datetime

import pytest

from apps.ai_insights.engine import detect_missing_information, generate_emergency_summary
from apps.ai_insights.models import InsightStatus
from apps.patients.models import (
    Allergy, DataSource, EmergencyContact, MedicalHistoryEntry, MedicalHistoryEventType,
    Medication, VerificationStatus,
)
from apps.patients.services import add_blood_group_report


# ---------------------------------------------------------------------------
# Source references (section 29)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_every_fact_in_summary_has_a_source_reference(patient):
    Allergy.objects.create(patient=patient, substance='Penicillin', severity='SEVERE',
                            source=DataSource.DOCTOR_ENTERED, verification_status=VerificationStatus.VERIFIED)
    EmergencyContact.objects.create(patient=patient, name='Jane Doe', relationship='Spouse',
                                     phone='9998887777', is_primary=True)

    insight = generate_emergency_summary(patient)

    assert insight.references.count() >= 2
    ref_types = set(insight.references.values_list('source_type', flat=True))
    assert 'Allergy' in ref_types
    assert 'EmergencyContact' in ref_types
    for ref in insight.references.all():
        assert ref.source_description  # never a blank/unattributed claim


@pytest.mark.django_db
def test_allergy_fact_text_matches_the_actual_stored_allergy(patient):
    Allergy.objects.create(patient=patient, substance='Latex', severity='MODERATE',
                            source=DataSource.DOCTOR_ENTERED, verification_status=VerificationStatus.VERIFIED)
    insight = generate_emergency_summary(patient)
    assert 'Latex' in insight.content_text


@pytest.mark.django_db
def test_medication_reference_points_to_the_real_medication_record(patient):
    med = Medication.objects.create(patient=patient, name='Atorvastatin', dosage='20mg', frequency='Nightly',
                                     start_date=datetime.date(2024, 1, 1), status='ACTIVE',
                                     source=DataSource.DOCTOR_ENTERED)
    insight = generate_emergency_summary(patient)
    med_refs = insight.references.filter(source_type='Medication')
    assert med_refs.exists()
    assert med_refs.first().source_object_id == str(med.id)


# ---------------------------------------------------------------------------
# Missing information (section 26)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_summary_flags_missing_allergy_and_contact_info(patient):
    """A completely bare patient record must be reported as missing, never guessed."""
    insight = generate_emergency_summary(patient)
    assert insight.status == InsightStatus.FLAGGED_INCOMPLETE
    assert 'MISSING / NOT VERIFIED' in insight.content_text
    assert 'Allergy information' in insight.content_text
    assert 'Emergency contact' in insight.content_text


@pytest.mark.django_db
def test_detect_missing_information_rule_based_flags(patient):
    flags = detect_missing_information(patient)
    assert 'Allergy information unavailable' in flags
    assert 'Emergency contact missing' in flags
    assert 'No verified medical history on file' in flags


@pytest.mark.django_db
def test_detect_missing_information_clears_once_data_exists(patient):
    Allergy.objects.create(patient=patient, substance='Penicillin', severity='SEVERE',
                            source=DataSource.DOCTOR_ENTERED, verification_status=VerificationStatus.VERIFIED)
    EmergencyContact.objects.create(patient=patient, name='Jane Doe', relationship='Spouse',
                                     phone='9998887777', is_primary=True)
    MedicalHistoryEntry.objects.create(
        patient=patient, event_type=MedicalHistoryEventType.DIAGNOSIS, description='Type 2 Diabetes',
        event_date=datetime.date(2020, 1, 1), source=DataSource.DOCTOR_ENTERED,
        verification_status=VerificationStatus.VERIFIED,
    )
    flags = detect_missing_information(patient)
    assert 'Allergy information unavailable' not in flags
    assert 'Emergency contact missing' not in flags
    assert 'No verified medical history on file' not in flags


# ---------------------------------------------------------------------------
# Conflicting information (section 31)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_conflicting_blood_group_reports_are_flagged_not_resolved(patient):
    add_blood_group_report(patient, 'B+', DataSource.HOSPITAL_ENTERED)
    add_blood_group_report(patient, 'O+', DataSource.HOSPITAL_ENTERED)

    patient.refresh_from_db()
    assert patient.blood_group_verification == VerificationStatus.CONFLICT
    assert patient.blood_group == ''  # never auto-picks a winner

    insight = generate_emergency_summary(patient)
    assert insight.status == InsightStatus.FLAGGED_CONFLICT
    assert 'Conflict detected' in insight.content_text
    assert 'Verification required' in insight.content_text


@pytest.mark.django_db
def test_non_conflicting_blood_group_is_marked_verified(patient):
    add_blood_group_report(patient, 'A+', DataSource.HOSPITAL_ENTERED)
    patient.refresh_from_db()
    assert patient.blood_group == 'A+'
    assert patient.blood_group_verification == VerificationStatus.VERIFIED

    insight = generate_emergency_summary(patient)
    assert insight.status != InsightStatus.FLAGGED_CONFLICT
    assert 'A+' in insight.content_text


@pytest.mark.django_db
def test_missing_information_flags_blood_group_conflict(patient):
    add_blood_group_report(patient, 'AB+', DataSource.HOSPITAL_ENTERED)
    add_blood_group_report(patient, 'O-', DataSource.HOSPITAL_ENTERED)
    flags = detect_missing_information(patient)
    assert any('Conflicting blood group' in f for f in flags)


# ---------------------------------------------------------------------------
# Timeline / source handling (section 30/50)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_only_verified_history_entries_are_surfaced_as_fact(patient):
    """Section 51 — unverified history must never be presented as a
    confirmed fact in the emergency summary."""
    MedicalHistoryEntry.objects.create(
        patient=patient, event_type=MedicalHistoryEventType.SURGERY, description='Appendectomy',
        event_date=datetime.date(2019, 5, 1), source=DataSource.SELF_REPORTED,
        verification_status=VerificationStatus.PENDING_VERIFICATION,
    )
    insight = generate_emergency_summary(patient)
    assert 'Appendectomy' not in insight.content_text
    assert 'Verified major medical history' in insight.content_text  # correctly flagged as missing/unverified


@pytest.mark.django_db
def test_verified_history_entry_is_surfaced_with_source(patient):
    entry = MedicalHistoryEntry.objects.create(
        patient=patient, event_type=MedicalHistoryEventType.SURGERY, description='Knee surgery',
        event_date=datetime.date(2023, 8, 12), source=DataSource.HOSPITAL_ENTERED,
        verification_status=VerificationStatus.VERIFIED,
    )
    insight = generate_emergency_summary(patient)
    assert 'Knee surgery' in insight.content_text
    ref = insight.references.get(source_type='MedicalHistoryEntry')
    assert ref.source_object_id == str(entry.id)
    assert '2023-08-12' in ref.source_description


# ---------------------------------------------------------------------------
# No fabrication (section 28/51 — the hard rule)
# ---------------------------------------------------------------------------

def _fact_bullets_only(content_text):
    """Missing-info lines also start with '- ', so split at the marker to
    isolate only the asserted-fact bullets above it."""
    facts_section = content_text.split('MISSING / NOT VERIFIED:')[0]
    return [l for l in facts_section.split('\n') if l.startswith('- ')]


@pytest.mark.django_db
def test_ai_never_invents_facts_for_a_completely_empty_patient(patient):
    """With zero clinical data on file, the summary must contain ONLY the
    patient identity line and a missing-information section — nothing that
    looks like an invented clinical fact."""
    insight = generate_emergency_summary(patient)
    body_lines = _fact_bullets_only(insight.content_text)
    # Every bullet line must correspond to an actual AIReference row —
    # there must be no more "fact" bullets than reference rows.
    assert len(body_lines) == insight.references.count()
    assert insight.references.count() == 0  # nothing at all to cite for a blank record


@pytest.mark.django_db
def test_fact_count_matches_reference_count_for_populated_patient(patient):
    """The number of asserted facts can never exceed the number of sourced
    references — this is what stops silent fabrication."""
    Allergy.objects.create(patient=patient, substance='Penicillin', severity='SEVERE',
                            source=DataSource.DOCTOR_ENTERED, verification_status=VerificationStatus.VERIFIED)
    Allergy.objects.create(patient=patient, substance='Shellfish', severity='MILD',
                            source=DataSource.SELF_REPORTED, verification_status=VerificationStatus.PENDING_VERIFICATION)
    Medication.objects.create(patient=patient, name='Metformin', dosage='500mg', frequency='BD',
                               start_date=datetime.date(2024, 1, 1), status='ACTIVE',
                               source=DataSource.DOCTOR_ENTERED)

    insight = generate_emergency_summary(patient)
    body_lines = _fact_bullets_only(insight.content_text)
    assert len(body_lines) == insight.references.count()
    # Both allergies ARE surfaced (allergies aren't gated on verification
    # status the way history is) but each still carries its own real source.
    assert insight.references.filter(source_type='Allergy').count() == 2


@pytest.mark.django_db
def test_ai_insight_api_has_no_free_text_write_path(management_a, patient, admission):
    """There is no endpoint that lets a client POST arbitrary text and have
    it stored as an AIInsight — generation only ever happens via
    generate_emergency_summary(), which is retrieval-grounded."""
    from tests.conftest import auth_client
    client = auth_client(management_a)
    resp = client.post('/api/ai/', {
        'patient': str(patient.id), 'insight_type': 'EMERGENCY_SUMMARY',
        'content_text': 'Patient definitely has cancer.',  # attempted fabrication
    }, format='json')
    assert resp.status_code == 405  # AIInsightViewSet is read-only + generate action only


# ---------------------------------------------------------------------------
# Gap fix: receiving hospital must be able to view the AI summary attached
# to a pending referral BEFORE they have any admission-based patient access
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_receiving_hospital_can_view_ai_summary_on_a_pending_referral(management_a, management_b, patient, admission, hospital_b):
    from apps.referrals.models import Referral
    from tests.conftest import auth_client
    insight = generate_emergency_summary(patient, requested_by=management_a)
    referral = Referral.objects.create(
        patient=patient, from_hospital=admission.hospital, from_admission=admission, to_hospital=hospital_b,
        required_department_type='ICU_CARDIOLOGY', reason='Needs ICU', ai_summary=insight, created_by=management_a,
    )
    client_b = auth_client(management_b)
    # Sanity check: hospital B has NO admission-based access yet.
    resp_patient = client_b.get(f'/api/patients/{patient.id}/')
    assert resp_patient.status_code == 403

    # But the AI summary attached to the referral IS visible to them.
    resp_ai = client_b.get(f'/api/ai/{insight.id}/')
    assert resp_ai.status_code == 200
    assert str(resp_ai.json()['id']) == str(insight.id)


@pytest.mark.django_db
def test_unrelated_hospital_still_cannot_view_the_ai_summary(management_a, patient, admission, hospital_b, db):
    from apps.hospitals.models import Hospital, Department, DepartmentType, StaffRole
    from tests.conftest import auth_client, _make_staff
    hospital_c = Hospital.objects.create(name='Uninvolved Hospital', code='UNI')
    dept_c = Department.objects.create(hospital=hospital_c, department_type=DepartmentType.GENERAL, name='General')
    management_c = _make_staff(hospital_c, dept_c, StaffRole.COORDINATOR, 'management_uninvolved', role='HOSPITAL_MANAGEMENT')

    insight = generate_emergency_summary(patient, requested_by=management_a)
    from apps.referrals.models import Referral
    Referral.objects.create(
        patient=patient, from_hospital=admission.hospital, from_admission=admission, to_hospital=hospital_b,
        required_department_type='ICU_CARDIOLOGY', reason='Needs ICU', ai_summary=insight, created_by=management_a,
    )
    client_c = auth_client(management_c)
    resp = client_c.get(f'/api/ai/{insight.id}/')
    assert resp.status_code == 403
