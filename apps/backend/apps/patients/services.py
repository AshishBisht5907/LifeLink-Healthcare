from django.db import transaction

from apps.patients.models import BloodGroupReport, PatientIDCounter, VerificationStatus


@transaction.atomic
def generate_lifelink_patient_id() -> str:
    counter, _ = PatientIDCounter.objects.select_for_update().get_or_create(id=1)
    counter.last_value += 1
    counter.save(update_fields=['last_value'])
    return f'LL-P-{counter.last_value}'


def add_blood_group_report(patient, value, source, source_admission=None, recorded_by=None):
    """Adds a new blood group report and re-evaluates for conflicts.
    Never silently picks a winner (section 31)."""
    BloodGroupReport.objects.create(
        patient=patient, value=value, source=source,
        source_admission=source_admission, recorded_by=recorded_by,
    )
    distinct_values = set(
        patient.blood_group_reports.values_list('value', flat=True)
    )
    if len(distinct_values) > 1:
        patient.blood_group = ''
        patient.blood_group_verification = VerificationStatus.CONFLICT
    else:
        patient.blood_group = value
        patient.blood_group_verification = VerificationStatus.VERIFIED
    patient.save(update_fields=['blood_group', 'blood_group_verification'])
    return patient.blood_group_verification
