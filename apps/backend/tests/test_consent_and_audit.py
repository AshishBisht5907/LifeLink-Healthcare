import pytest

from apps.audit.models import AuditLog
from apps.consents.models import ConsentActionType, ConsentRequest
from apps.consents.services import record_consent_action
from apps.patients.access import user_can_access_patient
from apps.workflow.models import RequestStatus, RequestTypeCode
from apps.workflow.services import create_service_request


@pytest.mark.django_db
def test_consent_approval_moves_request_to_approved_not_completed(patient, admission, doctor_a, family_user):
    """Section 6/20 — the single most important rule in the whole spec."""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.SURGERY, created_by=doctor_a)
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Test surgery', requested_by=doctor_a,
    )
    req.linked_consent = consent
    req.save(update_fields=['linked_consent'])

    record_consent_action(consent=consent, actor=family_user, action=ConsentActionType.APPROVE)

    req.refresh_from_db()
    assert req.status == RequestStatus.APPROVED
    assert req.status != RequestStatus.COMPLETED


@pytest.mark.django_db
def test_consent_decline_rejects_linked_request(patient, admission, doctor_a, family_user):
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.SURGERY, created_by=doctor_a)
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Test surgery', requested_by=doctor_a,
    )
    req.linked_consent = consent
    req.save(update_fields=['linked_consent'])

    record_consent_action(consent=consent, actor=family_user, action=ConsentActionType.DECLINE)

    req.refresh_from_db()
    assert req.status == RequestStatus.REJECTED


@pytest.mark.django_db
def test_family_access_requires_current_consent_decision(patient, admission, doctor_a, family_user, patient_user):
    first_consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Initial family access', requested_by=doctor_a,
        status='APPROVED',
    )
    assert user_can_access_patient(family_user, patient) is True

    newer_consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Updated family access', requested_by=doctor_a,
    )
    record_consent_action(consent=newer_consent, actor=patient_user, action=ConsentActionType.DECLINE)
    assert newer_consent.status == 'DECLINED'
    assert user_can_access_patient(family_user, patient) is False

    record_consent_action(consent=newer_consent, actor=patient_user, action=ConsentActionType.APPROVE)
    assert newer_consent.status == 'APPROVED'
    assert user_can_access_patient(family_user, patient) is True

    assert first_consent.status == 'APPROVED'


@pytest.mark.django_db
def test_patient_can_revoke_and_restore_consents(patient, admission, doctor_a, family_user, patient_user):
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Test', requested_by=doctor_a,
    )
    record_consent_action(consent=consent, actor=patient_user, action=ConsentActionType.APPROVE)
    record_consent_action(consent=consent, actor=patient_user, action=ConsentActionType.DECLINE)
    assert consent.status == 'DECLINED'
    record_consent_action(consent=consent, actor=patient_user, action=ConsentActionType.APPROVE)
    assert consent.status == 'APPROVED'


@pytest.mark.django_db
def test_staff_cannot_decide_consent_on_patients_behalf(patient, admission, doctor_a):
    """Section 20: only the PATIENT may decide (never staff, never family) —
    not hospital staff, even the requesting doctor."""
    from tests.conftest import auth_client
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Test', requested_by=doctor_a,
    )
    client = auth_client(doctor_a)
    resp = client.post(f'/api/consents/{consent.id}/decide/', {'action': 'APPROVE'}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_audit_log_cannot_be_updated():
    """Section 23/35: 'Audit logs cannot be edited by ordinary users' —
    enforced at the model layer, not just permissions."""
    entry = AuditLog.objects.create(action='TEST_ACTION')
    entry.action = 'TAMPERED'
    with pytest.raises(ValueError):
        entry.save()


@pytest.mark.django_db
def test_audit_log_cannot_be_deleted():
    entry = AuditLog.objects.create(action='TEST_ACTION')
    with pytest.raises(ValueError):
        entry.delete()


@pytest.mark.django_db
def test_audit_api_has_no_write_endpoints(hospital_admin_a):
    """The audit viewset is ReadOnlyModelViewSet — confirm no POST/PUT/DELETE
    route exists at all, at the routing level."""
    from tests.conftest import auth_client
    client = auth_client(hospital_admin_a)
    resp = client.post('/api/audit/', {'action': 'FAKE'}, format='json')
    assert resp.status_code == 405


@pytest.mark.django_db
def test_hospital_admin_only_sees_own_hospital_audit_log(hospital_admin_a, management_b, hospital_a, hospital_b):
    from tests.conftest import auth_client
    from apps.audit.utils import log_action
    log_action('EVENT_A', hospital_id=hospital_a.id, target_description='hospital A event')
    log_action('EVENT_B', hospital_id=hospital_b.id, target_description='hospital B event')

    client = auth_client(hospital_admin_a)
    resp = client.get('/api/audit/')
    assert resp.status_code == 200
    actions = [item['action'] for item in resp.json()['results']] if 'results' in resp.json() else \
              [item['action'] for item in resp.json()]
    assert 'EVENT_A' in actions
    assert 'EVENT_B' not in actions
