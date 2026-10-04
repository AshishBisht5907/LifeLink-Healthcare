"""Workflow for Management -> Patient access (normal + emergency).

Kept out of views.py so the rules live in one place and are easy to test.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.permissions import get_staff_profile
from apps.audit.utils import log_action
from apps.notifications.models import NotificationType
from apps.notifications.services import _create_once
from apps.patients.access import user_can_access_patient
from apps.patients.models import AccessGrantStatus, AccessGrantType, PatientAccessGrant

NORMAL_ACCESS_HOURS = 24
EMERGENCY_ACCESS_HOURS = 4
MIN_EMERGENCY_REASON = 15


def _management_staff(user):
    if user.role != 'HOSPITAL_MANAGEMENT':
        raise PermissionDenied('Only hospital management can request patient access.')
    staff = get_staff_profile(user)
    if not staff:
        raise PermissionDenied('No hospital profile found for this account.')
    return staff


def _clean_reason(reason, minimum):
    reason = (reason or '').strip()
    if len(reason) < minimum:
        raise ValidationError({'reason': f'Please give a reason of at least {minimum} characters.'})
    return reason[:1000]


def request_normal_access(user, patient, reason):
    staff = _management_staff(user)
    reason = _clean_reason(reason, 5)
    if user_can_access_patient(user, patient):
        raise ValidationError('You already have access to this patient.')
    if patient.user_id is None:
        raise ValidationError((
            'This patient has no LifeLink account yet, so nobody can approve access. '
            'If this is a genuine emergency, use emergency access.'))
    if PatientAccessGrant.objects.filter(
            patient=patient, requested_by=user, status=AccessGrantStatus.PENDING).exists():
        raise ValidationError('You already have a pending request for this patient.')

    grant = PatientAccessGrant.objects.create(
        patient=patient, requested_by=user, hospital=staff.hospital,
        grant_type=AccessGrantType.NORMAL, reason=reason)
    log_action('PATIENT_ACCESS_REQUESTED', actor=user, hospital_id=staff.hospital_id,
               patient_id=patient.id, target_description=f'grant={grant.id}')
    _create_once(
        recipient=patient.user, notification_type=NotificationType.ACCESS_REQUEST,
        title='A hospital wants to view your record',
        body=f'{staff.hospital.name} asked for access. Reason: {reason}',
        patient=patient, dedupe_key=f'access-request:{grant.id}')
    return grant


@transaction.atomic
def request_emergency_access(user, patient, reason):
    staff = _management_staff(user)
    reason = _clean_reason(reason, MIN_EMERGENCY_REASON)
    now = timezone.now()
    grant = PatientAccessGrant.objects.create(
        patient=patient, requested_by=user, hospital=staff.hospital,
        grant_type=AccessGrantType.EMERGENCY, status=AccessGrantStatus.APPROVED,
        reason=reason, resolved_at=now, expires_at=now + timedelta(hours=EMERGENCY_ACCESS_HOURS))
    log_action('EMERGENCY_ACCESS_GRANTED', actor=user, hospital_id=staff.hospital_id,
               patient_id=patient.id, target_description=f'grant={grant.id}',
               context={'reason': reason, 'expires_at': grant.expires_at.isoformat(),
                        'scope': 'PATIENT_PROFILE'})
    if patient.user_id:
        _create_once(
            recipient=patient.user, notification_type=NotificationType.EMERGENCY_ACCESS,
            title='Emergency access to your record',
            body=(f'{staff.hospital.name} opened your record in an emergency. '
                  f'Reason given: {reason}'),
            patient=patient, dedupe_key=f'emergency-access:{grant.id}')
    return grant


@transaction.atomic
def resolve_access_request(user, grant, approve: bool):
    if user.role != 'PATIENT' or grant.patient.user_id != user.id:
        raise PermissionDenied('Only the patient can answer this request.')
    if grant.grant_type != AccessGrantType.NORMAL:
        raise ValidationError('Emergency access is not a request; it cannot be approved or declined.')
    if grant.status != AccessGrantStatus.PENDING:
        raise ValidationError(f'This request is already {grant.status.lower()}.')
    now = timezone.now()
    grant.resolved_at = now
    if approve:
        grant.status = AccessGrantStatus.APPROVED
        grant.expires_at = now + timedelta(hours=NORMAL_ACCESS_HOURS)
    else:
        grant.status = AccessGrantStatus.DECLINED
    grant.save(update_fields=['status', 'resolved_at', 'expires_at'])
    log_action('PATIENT_ACCESS_APPROVED' if approve else 'PATIENT_ACCESS_DECLINED',
               actor=user, hospital_id=grant.hospital_id, patient_id=grant.patient_id,
               target_description=f'grant={grant.id}')
    _create_once(
        recipient=grant.requested_by, notification_type=NotificationType.ACCESS_REQUEST,
        title='Access request approved' if approve else 'Access request declined',
        body=f'{grant.patient.lifelink_patient_id}: the patient {"approved" if approve else "declined"} your request.',
        patient=grant.patient, dedupe_key=f'access-resolved:{grant.id}')
    return grant


def revoke_access(user, grant):
    if user.role != 'PATIENT' or grant.patient.user_id != user.id:
        raise PermissionDenied('Only the patient can revoke access.')
    if grant.status != AccessGrantStatus.APPROVED:
        raise ValidationError('Only approved access can be revoked.')
    grant.status = AccessGrantStatus.REVOKED
    grant.resolved_at = timezone.now()
    grant.save(update_fields=['status', 'resolved_at'])
    log_action('PATIENT_ACCESS_REVOKED', actor=user, hospital_id=grant.hospital_id,
               patient_id=grant.patient_id, target_description=f'grant={grant.id}')
    return grant
