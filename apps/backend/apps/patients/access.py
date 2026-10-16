from apps.accounts.permissions import get_staff_profile
from apps.patients.models import AccessLevel


def user_can_access_patient(user, patient) -> bool:
    """The single source of truth for 'is this user allowed to see this
    patient at all'. Every other view (admissions, requests, consents,
    documents...) should call this rather than re-implementing the logic.
    """
    if user.role == 'PATIENT':
        return patient.user_id == user.id

    if user.role == 'FAMILY':
        # An active FULL_REPRESENTATIVE link is the patient's explicit
        # data-sharing approval. Treatment/procedure consent is a separate
        # workflow and must not accidentally lock or unlock the whole profile.
        return patient.family_links.filter(
            family_user=user,
            is_active=True,
            access_level=AccessLevel.FULL_REPRESENTATIVE,
        ).exists()

    if user.role in ('HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
        staff = get_staff_profile(user)
        if not staff:
            return False
        if _has_hospital_scope(staff, patient):
            return True
        # Last resort: a live access grant. Only Management can hold one,
        # it belongs to this exact user, and it must be for this hospital.
        return user.role == 'HOSPITAL_MANAGEMENT' and user_has_active_grant(user, patient, staff.hospital_id)

    return False


def _has_hospital_scope(staff, patient) -> bool:
    """The patient genuinely belongs to this staff member's hospital:
    created there, created by its staff, or has (had) an admission there.
    Deliberately does NOT include temporary access grants."""
    if patient.created_by_hospital_id == staff.hospital_id:
        return True
    if patient.created_by_staff_id and patient.created_by_staff.hospital_id == staff.hospital_id:
        return True
    return patient.admissions.filter(hospital_id=staff.hospital_id).exists()


def user_can_manage_family_links(user, patient) -> bool:
    """Who may create, change or remove a family link for this patient.

    Family links hand out lasting privileges, so this is stricter than
    'may view the patient':
      * the patient themself;
      * hospital staff whose hospital genuinely owns the patient record;
      * NEVER a FAMILY user (they cannot grant access to others or to themselves);
      * NEVER anyone whose only access is a temporary grant (emergency or
        patient-approved), because a temporary grant must not leave lasting
        privileges behind.
    """
    if user.role == 'PATIENT':
        return patient.user_id == user.id
    if user.role in ('HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
        staff = get_staff_profile(user)
        return bool(staff) and _has_hospital_scope(staff, patient)
    return False


def user_has_active_grant(user, patient, hospital_id) -> bool:
    from django.utils import timezone
    from apps.patients.models import AccessGrantStatus, PatientAccessGrant
    return PatientAccessGrant.objects.filter(
        patient=patient, requested_by=user, hospital_id=hospital_id,
        status=AccessGrantStatus.APPROVED, expires_at__gt=timezone.now(),
    ).exists()


def user_can_view_patient_updates(user, patient) -> bool:
    """Allow family update-only links to see the patient-visible status feed,
    without granting access to the clinical profile or admission notes.
    """
    if user.role == 'FAMILY':
        return patient.family_links.filter(
            family_user=user,
            is_active=True,
            access_level__in=[AccessLevel.FULL_REPRESENTATIVE, AccessLevel.UPDATES_ONLY],
        ).exists()
    return user_can_access_patient(user, patient)


def user_can_access_admission(user, admission) -> bool:
    if user.role == 'PATIENT':
        return admission.patient.user_id == user.id
    if user.role == 'FAMILY':
        return admission.patient.family_links.filter(
            family_user=user, is_active=True, access_level=AccessLevel.FULL_REPRESENTATIVE,
        ).exists()
    if user.role in ('HOSPITAL_STAFF', 'HOSPITAL_MANAGEMENT', 'HOSPITAL_ADMIN'):
        staff = get_staff_profile(user)
        return bool(staff) and staff.hospital_id == admission.hospital_id
    return False
