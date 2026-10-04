from django.db import IntegrityError, transaction

from apps.accounts.models import Role
from apps.hospitals.models import StaffProfile
from apps.notifications.models import Notification, NotificationType, NotificationPreference
from apps.patients.models import FamilyRelationship


def _create_once(*, recipient=None, recipient_id=None, notification_type, title,
 body, patient=None, admission=None, dedupe_key):
    recipient_field = {'recipient_id': recipient_id} if recipient_id is not None else {'recipient': recipient}
    user_id = recipient_id if recipient_id is not None else recipient.id
    
    # 1. Fetch preferences for this user (default all true if missing)
    prefs, _ = NotificationPreference.objects.get_or_create(user_id=user_id)
    
    # 2. Extract user contact if needed for external delivery
    from apps.accounts.models import User
    from apps.notifications.providers import get_notification_provider
    provider = get_notification_provider()
    
    try:
        user_obj = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None

    # 3. Handle external channels (non-transactional to avoid blocking DB if provider is slow, 
    # though here they are mocked)
    if prefs.sms and user_obj.phone:
        provider.send_sms(phone=user_obj.phone, title=title, body=body)
    
    if prefs.email and user_obj.email:
        provider.send_email(email=user_obj.email, title=title, body=body)
        
    # 4. Handle in-app channel
    if not prefs.in_app:
        return None

    try:
        with transaction.atomic():
            notification, _ = Notification.objects.get_or_create(
                dedupe_key=dedupe_key,
                defaults={
                    **recipient_field,
                    'notification_type': notification_type,
                    'title': title,
                    'body': body,
                    'patient': patient,
                    'admission': admission,
                },
            )
            return notification
    except IntegrityError:
        return Notification.objects.filter(dedupe_key=dedupe_key).first()


def _hospital_users(hospital_id, roles):
    return StaffProfile.objects.filter(
        hospital_id=hospital_id, is_active=True, user__role__in=roles,
    ).select_related('user').values_list('user', flat=True)


def _department_users(department_id):
    return StaffProfile.objects.filter(
        department_id=department_id, is_active=True,
    ).select_related('user').values_list('user', flat=True)


def _send_to_users(*, users, event_key, notification_type, title, body, patient, admission):
    for user_id in users:
        _create_once(
            recipient_id=user_id,
            notification_type=notification_type,
            title=title,
            body=body,
            patient=patient,
            admission=admission,
            dedupe_key=f'{event_key}:user:{user_id}',
        )


def notify_request_created(request):
    if request.status == 'APPROVAL_REQUIRED':
        users = _hospital_users(request.admission.hospital_id, [Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN])
    elif request.target_department_id:
        users = _department_users(request.target_department_id)
    else:
        users = _hospital_users(request.admission.hospital_id, [Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN])
    _send_to_users(
        users=users,
        event_key=f'request:{request.id}:created',
        notification_type=NotificationType.STATUS_UPDATE,
        title=f'{request.get_request_type_display()} request submitted',
        body=f'{request.patient.full_name} needs attention from the assigned workflow team.',
        patient=request.patient,
        admission=request.admission,
    )


def notify_request_transition(request, transition):
    event = {
        'APPROVED': (NotificationType.REQUEST_APPROVED, f'{request.get_request_type_display()} request approved', f'{request.patient.full_name} is ready for {request.target_department.name if request.target_department else "department"} action.'),
        'REJECTED': (NotificationType.REQUEST_REJECTED, f'{request.get_request_type_display()} request rejected', f'{request.patient.full_name}: {request.postpone_or_reject_reason or "The request was rejected."}'),
        'POSTPONED': (NotificationType.REQUEST_POSTPONED, f'{request.get_request_type_display()} request postponed', f'{request.patient.full_name}: {request.postpone_or_reject_reason or "The request was postponed."}'),
        'COMPLETED': (NotificationType.REQUEST_COMPLETED, f'{request.get_request_type_display()} request completed', f'{request.patient.full_name} has a completed {request.get_request_type_display().lower()} request.'),
    }.get(transition.to_status)
    if not event:
        return

    notification_type, title, body = event
    recipients = set()
    if transition.to_status == 'APPROVED' and request.target_department_id:
        recipients.update(_department_users(request.target_department_id))
    if request.created_by_id != transition.changed_by_id:
        recipients.add(request.created_by_id)
    if transition.to_status == 'COMPLETED' and request.patient.user_id:
        recipients.add(request.patient.user_id)
        if request.is_family_visible:
            recipients.update(FamilyRelationship.objects.filter(
                patient=request.patient, is_active=True,
            ).values_list('family_user_id', flat=True))
    _send_to_users(
        users=recipients,
        event_key=f'request:{request.id}:transition:{transition.id}',
        notification_type=notification_type,
        title=title,
        body=body,
        patient=request.patient,
        admission=request.admission,
    )


def notify_referral_created(referral):
    users = set(_hospital_users(referral.from_hospital_id, [Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN]))
    users.update(_hospital_users(referral.to_hospital_id, [Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN]))
    _send_to_users(
        users=users,
        event_key=f'referral:{referral.id}:created',
        notification_type=NotificationType.REFERRAL_CREATED,
        title='New referral requires review',
        body=f'{referral.patient.full_name} has a referral from {referral.from_hospital.name} to {referral.to_hospital.name}.',
        patient=referral.patient,
        admission=referral.from_admission,
    )


def notify_referral_response(referral):
    notification_type = NotificationType.REFERRAL_ACCEPTED if referral.status in ('ACCEPTED', 'CONDITIONAL') else NotificationType.REFERRAL_REJECTED
    title = f'Referral {referral.status.lower()}'
    body = f'{referral.patient.full_name}: {referral.response_note or "The referral status was updated."}'
    users = {referral.created_by_id}
    users.update(_hospital_users(referral.from_hospital_id, [Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN]))
    _send_to_users(
        users=users,
        event_key=f'referral:{referral.id}:response:{referral.responded_at.isoformat()}',
        notification_type=notification_type,
        title=title,
        body=body,
        patient=referral.patient,
        admission=referral.from_admission,
    )


def notify_transfer_completed(referral, transfer):
    users = {referral.created_by_id}
    users.update(_hospital_users(referral.from_hospital_id, [Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN]))
    _send_to_users(
        users=users,
        event_key=f'transfer:{transfer.id}:completed:{transfer.completed_at.isoformat()}',
        notification_type=NotificationType.TRANSFER_COMPLETED,
        title='Patient transfer completed',
        body=f'{referral.patient.full_name} has been admitted at {referral.to_hospital.name}.',
        patient=referral.patient,
        admission=transfer.new_admission or referral.from_admission,
    )


def notify_admission_created(admission):
    """Phase 2 milestone notification: Patient admitted"""
    recipients = set()
    if admission.patient.user_id:
        recipients.add(admission.patient.user_id)
    recipients.update(FamilyRelationship.objects.filter(
        patient=admission.patient, is_active=True,
    ).values_list('family_user_id', flat=True))
    
    if not recipients:
        return
        
    _send_to_users(
        users=recipients,
        event_key=f'admission:{admission.id}:created',
        notification_type=NotificationType.STATUS_UPDATE,
        title='Admission Confirmed',
        body=f'{admission.patient.full_name} has been admitted to {admission.hospital.name}.',
        patient=admission.patient,
        admission=admission,
    )


def notify_admission_discharged(admission):
    """Phase 2 milestone notification: Patient discharged"""
    recipients = set()
    if admission.patient.user_id:
        recipients.add(admission.patient.user_id)
    recipients.update(FamilyRelationship.objects.filter(
        patient=admission.patient, is_active=True,
    ).values_list('family_user_id', flat=True))
    
    if not recipients:
        return
        
    _send_to_users(
        users=recipients,
        event_key=f'admission:{admission.id}:discharged:{admission.discharged_at.isoformat()}',
        notification_type=NotificationType.STATUS_UPDATE,
        title='Ready for Discharge',
        body=f'{admission.patient.full_name} has been discharged from {admission.hospital.name}.',
        patient=admission.patient,
        admission=admission,
    )