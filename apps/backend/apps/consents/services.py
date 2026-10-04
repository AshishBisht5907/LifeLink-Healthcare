from django.db import transaction
from django.utils import timezone

from apps.audit.utils import log_action
from apps.consents.models import ConsentAction, ConsentActionType, ConsentRequest, ConsentStatus


@transaction.atomic
def record_consent_action(*, consent: ConsentRequest, actor, action: str, ip_address='', user_agent=''):
    if action in (ConsentActionType.APPROVE, ConsentActionType.DECLINE):
        allowed_transition = (
            consent.status == ConsentStatus.PENDING or
            (action == ConsentActionType.APPROVE and consent.status == ConsentStatus.DECLINED) or
            (action == ConsentActionType.DECLINE and consent.status == ConsentStatus.APPROVED)
        )
        if not allowed_transition:
            raise ValueError('This consent request cannot be changed to that decision.')
    elif action == ConsentActionType.ASK_DOCTOR:
        if consent.status != ConsentStatus.PENDING:
            raise ValueError('This consent request is already resolved.')
    else:
        raise ValueError(f'Unsupported consent action: {action}')

    ConsentAction.objects.create(
        consent_request=consent, actor=actor, actor_role_at_time=actor.role,
        action=action, ip_address=ip_address or None, user_agent=user_agent,
    )

    if action == ConsentActionType.APPROVE:
        consent.status = ConsentStatus.APPROVED
        consent.resolved_at = timezone.now()
        consent.save(update_fields=['status', 'resolved_at'])
        _advance_linked_requests(consent, actor)
    elif action == ConsentActionType.DECLINE:
        consent.status = ConsentStatus.DECLINED
        consent.resolved_at = timezone.now()
        consent.save(update_fields=['status', 'resolved_at'])
        _reject_linked_requests(consent, actor)
    # ASK_DOCTOR leaves status PENDING — it's a communication action, not a decision.

    log_action(
        'CONSENT_ACTION', actor=actor, hospital_id=consent.admission.hospital_id,
        patient_id=consent.patient_id, admission_id=consent.admission_id,
        target_description=f'{action} on consent {consent.id}',
    )
    return consent


def _advance_linked_requests(consent, actor):
    from apps.workflow.models import RequestStatus
    from apps.workflow.services import transition_request
    for req in consent.service_requests.filter(status=RequestStatus.APPROVAL_REQUIRED):
        transition_request(req=req, new_status=RequestStatus.APPROVED, actor=actor,
                            note='Family/patient consent approved.')


def _reject_linked_requests(consent, actor):
    from apps.workflow.models import RequestStatus
    from apps.workflow.services import transition_request
    for req in consent.service_requests.filter(status=RequestStatus.APPROVAL_REQUIRED):
        transition_request(req=req, new_status=RequestStatus.REJECTED, actor=actor,
                            note='Consent declined by patient/family.')
