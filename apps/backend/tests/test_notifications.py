import pytest

from apps.notifications.models import Notification, NotificationType
from apps.notifications.services import notify_request_created
from apps.workflow.models import RequestTypeCode, RequestStatus
from apps.workflow.services import create_service_request, transition_request


@pytest.mark.django_db
def test_request_notification_is_scoped_and_idempotent(patient, admission, management_a, radiology_staff_a):
    request = create_service_request(
        patient=patient,
        admission=admission,
        request_type=RequestTypeCode.CT_SCAN,
        created_by=management_a,
    )

    notify_request_created(request)
    notify_request_created(request)

    assert Notification.objects.filter(
        recipient=radiology_staff_a,
        notification_type=NotificationType.STATUS_UPDATE,
        dedupe_key__startswith=f'request:{request.id}:created:',
    ).count() == 1
    assert not Notification.objects.filter(recipient=management_a, patient=patient).exists()


@pytest.mark.django_db
def test_approved_request_notifies_target_department(patient, admission, doctor_a, radiology_staff_a):
    request = create_service_request(
        patient=patient,
        admission=admission,
        request_type=RequestTypeCode.CT_SCAN,
        created_by=doctor_a,
    )
    request.status = RequestStatus.PENDING
    request.save(update_fields=['status'])

    transition_request(req=request, new_status=RequestStatus.APPROVED, actor=radiology_staff_a)

    notification = Notification.objects.get(
        recipient=radiology_staff_a,
        notification_type=NotificationType.REQUEST_APPROVED,
    )
    assert 'Test Patient' in notification.body


@pytest.mark.django_db
def test_mark_read_is_recipient_scoped(api_client, patient, admission, management_a):
    request = create_service_request(
        patient=patient,
        admission=admission,
        request_type=RequestTypeCode.SURGERY,
        created_by=management_a,
    )
    notification = Notification.objects.get(recipient=management_a, patient=patient)

    api_client.force_authenticate(user=management_a)
    response = api_client.post(f'/api/notifications/{notification.id}/mark_read/')

    assert response.status_code == 200
    notification.refresh_from_db()
    assert notification.is_read is True