import pytest

from apps.audit.models import AuditLog
from apps.consents.models import ConsentAction, ConsentActionType, ConsentRequest
from apps.consents.services import record_consent_action
from apps.patients.access import user_can_access_patient
from apps.workflow.models import RequestStatus, RequestTypeCode
from apps.workflow.services import create_service_request
from tests.conftest import auth_client


@pytest.mark.django_db
def test_consent_approval_moves_request_to_approved_not_completed(patient, admission, doctor_a, patient_user):
    """Section 6/20 — the single most important rule in the whole spec."""
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.SURGERY, created_by=doctor_a)
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Test surgery', requested_by=doctor_a,
    )
    req.linked_consent = consent
    req.save(update_fields=['linked_consent'])

    record_consent_action(consent=consent, actor=patient_user, action=ConsentActionType.APPROVE)

    req.refresh_from_db()
    assert req.status == RequestStatus.APPROVED
    assert req.status != RequestStatus.COMPLETED


@pytest.mark.django_db
def test_consent_decline_rejects_linked_request(patient, admission, doctor_a, patient_user):
    req = create_service_request(patient=patient, admission=admission,
                                  request_type=RequestTypeCode.SURGERY, created_by=doctor_a)
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Test surgery', requested_by=doctor_a,
    )
    req.linked_consent = consent
    req.save(update_fields=['linked_consent'])

    record_consent_action(consent=consent, actor=patient_user, action=ConsentActionType.DECLINE)

    req.refresh_from_db()
    assert req.status == RequestStatus.REJECTED


@pytest.mark.django_db
def test_family_profile_access_is_separate_from_procedure_consent(
    patient, admission, doctor_a, family_user, patient_user,
):
    # The active full-representative link grants family access without any procedure consent.
    assert user_can_access_patient(family_user, patient) is True

    newer_consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Procedure consent', requested_by=doctor_a,
    )
    record_consent_action(consent=newer_consent, actor=patient_user, action=ConsentActionType.DECLINE)
    assert newer_consent.status == 'DECLINED'
    # Procedure consent controls the procedure, not the separate family data-sharing link.
    assert user_can_access_patient(family_user, patient) is True

    record_consent_action(consent=newer_consent, actor=patient_user, action=ConsentActionType.APPROVE)
    assert newer_consent.status == 'APPROVED'
    assert user_can_access_patient(family_user, patient) is True


@pytest.mark.django_db
def test_patient_can_decline_and_reapprove_procedure_consent(patient, admission, doctor_a, patient_user):
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Test', requested_by=doctor_a,
    )
    client = auth_client(patient_user)
    url = f'/api/consents/{consent.id}/decide/'

    assert client.post(url, {'action': 'APPROVE'}, format='json').json()['status'] == 'APPROVED'
    assert client.post(url, {'action': 'DECLINE'}, format='json').json()['status'] == 'DECLINED'
    assert client.post(url, {'action': 'APPROVE'}, format='json').json()['status'] == 'APPROVED'

    consent.refresh_from_db()
    assert consent.status == 'APPROVED'
    actions = list(ConsentAction.objects.filter(consent_request=consent))
    assert [action.action for action in actions] == ['APPROVE', 'DECLINE', 'APPROVE']
    assert all(action.actor_id == patient_user.id for action in actions)


@pytest.mark.parametrize('method', ['patch', 'put', 'delete'])
@pytest.mark.parametrize('user_fixture', ['patient_user', 'family_user', 'doctor_a'])
@pytest.mark.django_db
def test_consent_request_cannot_be_updated_or_deleted(request, method, user_fixture,
                                                       patient, admission, doctor_a):
    user = request.getfixturevalue(user_fixture)
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Original procedure',
        risk_information='Original risks', requested_by=doctor_a,
    )
    client = auth_client(user)
    url = f'/api/consents/{consent.id}/'
    if method == 'delete':
        response = client.delete(url)
    else:
        response = getattr(client, method)(
            url,
            {'procedure_description': 'Changed procedure', 'risk_information': 'Changed risks'},
            format='json',
        )

    assert response.status_code == 405
    consent.refresh_from_db()
    assert consent.procedure_description == 'Original procedure'
    assert consent.risk_information == 'Original risks'
    assert consent.status == 'PENDING'
    assert not ConsentAction.objects.filter(consent_request=consent).exists()


@pytest.mark.django_db
def test_only_authorized_staff_can_create_consent_requests(
    patient, admission, doctor_a, patient_user, family_user,
):
    payload = {
        'patient': str(patient.id),
        'admission': str(admission.id),
        'procedure_description': 'Requested procedure',
    }

    staff_response = auth_client(doctor_a).post('/api/consents/', payload, format='json')
    assert staff_response.status_code == 201
    created = ConsentRequest.objects.get(pk=staff_response.json()['id'])
    assert created.requested_by_id == doctor_a.id

    assert auth_client(patient_user).post('/api/consents/', payload, format='json').status_code == 403
    assert auth_client(family_user).post('/api/consents/', payload, format='json').status_code == 403


@pytest.mark.django_db
def test_consent_list_and_detail_are_scoped_by_patient_link_and_hospital(
    patient, patient_user, admission, doctor_a, management_a, hospital_admin_a,
    management_b, family_user,
):
    from apps.admissions.models import Admission
    from apps.patients.models import PatientProfile
    from apps.patients.services import generate_lifelink_patient_id

    own_consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Own request', requested_by=doctor_a,
    )
    other_patient = PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(), full_name='Other patient', is_unclaimed=True,
    )
    other_admission = Admission.objects.create(
        patient=other_patient,
        hospital=admission.hospital,
        admission_number=Admission.generate_admission_number(admission.hospital),
        created_by=doctor_a,
    )
    other_consent = ConsentRequest.objects.create(
        patient=other_patient, admission=other_admission,
        procedure_description='Other request', requested_by=doctor_a,
    )

    # Patients and full representatives are restricted to their linked patient,
    # even when another patient's consent ID is known.
    for user in (patient_user, family_user):
        client = auth_client(user)
        assert client.get('/api/consents/').status_code == 200
        assert client.get(f'/api/consents/{own_consent.id}/').status_code == 200
        assert client.get(f'/api/consents/{other_consent.id}/').status_code == 404

    # Staff, management, and admin are scoped to their hospital, not the
    # patient's identity; a different hospital cannot retrieve by direct ID.
    for user in (doctor_a, management_a, hospital_admin_a):
        client = auth_client(user)
        response = client.get('/api/consents/')
        assert response.status_code == 200
        assert {item['id'] for item in response.json()['results']} >= {
            str(own_consent.id), str(other_consent.id),
        }
        assert client.get(f'/api/consents/{own_consent.id}/').status_code == 200
        assert client.get(f'/api/consents/{other_consent.id}/').status_code == 200

    assert auth_client(management_b).get(f'/api/consents/{own_consent.id}/').status_code == 404
    assert auth_client(management_b).get('/api/consents/').json()['results'] == []


@pytest.mark.parametrize('method', ['patch', 'put', 'delete'])
@pytest.mark.parametrize(
    'user_fixture',
    ['patient_user', 'family_user', 'doctor_a', 'management_a', 'hospital_admin_a'],
)
@pytest.mark.django_db
def test_consent_mutation_verbs_are_disabled_for_all_roles(
    request, method, user_fixture, patient, admission, doctor_a,
):
    user = request.getfixturevalue(user_fixture)
    consent = ConsentRequest.objects.create(
        patient=patient, admission=admission, procedure_description='Original', requested_by=doctor_a,
    )
    client = auth_client(user)
    url = f'/api/consents/{consent.id}/'
    response = client.delete(url) if method == 'delete' else getattr(client, method)(
        url, {'procedure_description': 'Tampered'}, format='json',
    )

    assert response.status_code == 405
    consent.refresh_from_db()
    assert consent.procedure_description == 'Original'
    assert not ConsentAction.objects.filter(consent_request=consent).exists()


@pytest.mark.django_db
def test_family_link_mutation_and_audit_roll_back_together_on_audit_failure(
    patient_user, patient, family_user, monkeypatch,
):
    from apps.patients.models import FamilyRelationship

    link = FamilyRelationship.objects.get(patient=patient, family_user=family_user)

    def fail_audit(*args, **kwargs):
        raise RuntimeError('simulated audit failure')

    monkeypatch.setattr('apps.patients.views.log_action', fail_audit)
    client = auth_client(patient_user)
    client.raise_request_exception = False
    response = client.patch(f'/api/patients/family-links/{link.id}/', {'is_active': False}, format='json')

    assert response.status_code == 500
    link.refresh_from_db()
    assert link.is_active is True
    assert not AuditLog.objects.filter(
        action='FAMILY_LINK_PAUSED', target_description=str(link.id),
    ).exists()
@pytest.mark.django_db
def test_staff_cannot_decide_consent_on_patients_behalf(patient, admission, doctor_a):
    """Only the patient may decide, not hospital staff, including the requester."""
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
