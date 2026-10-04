"""Management -> patient access: normal (patient approves) and emergency.

Root cause of the old 'Access denied' on the management patient page:
search returned ANY patient, but opening one needed a hospital link
(created there / admitted there). A self-registered patient has neither,
so search worked and the profile 403'd. These tests pin the fix without
loosening the hospital-isolation rule.
"""
import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.audit.models import AuditLog
from apps.notifications.models import Notification
from apps.patients.models import AccessGrantStatus, PatientAccessGrant, PatientProfile
from apps.patients.services import generate_lifelink_patient_id
from tests.conftest import auth_client

pytestmark = pytest.mark.django_db


@pytest.fixture
def self_registered(db):
    """A real patient who signed up on their own: no hospital link at all."""
    user = User.objects.create(username='selfreg', role=Role.PATIENT, phone='9876500001')
    user.set_unusable_password()
    user.save()
    return PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(), user=user,
        full_name='Riya Sharma', date_of_birth=datetime.date(1995, 5, 5),
        gender='F', phone='9876500001', is_unclaimed=False)


def test_original_bug_search_ok_but_profile_denied_without_grant(management_a, self_registered):
    c = auth_client(management_a)
    assert c.get('/api/patients/search/', {'lifelink_patient_id': self_registered.lifelink_patient_id}).status_code == 200
    assert c.get(f'/api/patients/{self_registered.id}/').status_code == 403   # still blocked: correct


def test_search_hides_personal_details_outside_scope(management_a, self_registered):
    r = auth_client(management_a).get('/api/patients/search/', {'phone': '9876500001'})
    row = r.json()[0]
    assert row['access'] == 'NONE' and row['can_request_access'] is True
    assert row['full_name'] == 'R*** S*****'
    assert 'phone' not in row and 'date_of_birth' not in row


def test_search_shows_full_details_inside_scope(management_a, patient):
    row = auth_client(management_a).get('/api/patients/search/',
                                        {'lifelink_patient_id': patient.lifelink_patient_id}).json()[0]
    assert row['access'] == 'GRANTED' and row['full_name'] == 'Test Patient'


def test_normal_flow_request_then_patient_approves(management_a, self_registered):
    m = auth_client(management_a)
    r = m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Planned admission'})
    assert r.status_code == 201 and r.json()['status'] == 'PENDING'
    gid = r.json()['id']
    # still blocked while pending
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 403
    # patient was notified
    assert Notification.objects.filter(recipient=self_registered.user, notification_type='ACCESS_REQUEST').exists()

    p = auth_client(self_registered.user)
    assert p.post(f'/api/patients/access-requests/{gid}/approve/').json()['status'] == 'APPROVED'
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 200
    assert AuditLog.objects.filter(action='PATIENT_ACCESS_APPROVED', patient_id=self_registered.id).exists()


def test_declined_stays_blocked(management_a, self_registered):
    m = auth_client(management_a)
    gid = m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'}).json()['id']
    assert auth_client(self_registered.user).post(f'/api/patients/access-requests/{gid}/decline/').json()['status'] == 'DECLINED'
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 403


def test_expired_grant_stops_working(management_a, self_registered):
    m = auth_client(management_a)
    gid = m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'}).json()['id']
    auth_client(self_registered.user).post(f'/api/patients/access-requests/{gid}/approve/')
    PatientAccessGrant.objects.filter(pk=gid).update(expires_at=timezone.now() - datetime.timedelta(minutes=1))
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 403
    assert m.get('/api/patients/access-requests/').json()[0]['status'] == 'EXPIRED'


def test_patient_can_revoke(management_a, self_registered):
    m = auth_client(management_a)
    p = auth_client(self_registered.user)
    gid = m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'}).json()['id']
    p.post(f'/api/patients/access-requests/{gid}/approve/')
    assert p.post(f'/api/patients/access-requests/{gid}/revoke/').json()['status'] == 'REVOKED'
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 403


def test_cannot_approve_someone_elses_request(management_a, self_registered, patient_user):
    gid = auth_client(management_a).post('/api/patients/access-requests/',
                                         {'patient': str(self_registered.id), 'reason': 'Checkup'}).json()['id']
    # another patient gets a 404, not even a hint that it exists
    assert auth_client(patient_user).post(f'/api/patients/access-requests/{gid}/approve/').status_code == 404
    # requester cannot approve their own request
    assert auth_client(management_a).post(f'/api/patients/access-requests/{gid}/approve/').status_code == 404


def test_only_management_can_request(doctor_a, hospital_admin_a, self_registered):
    for u in (doctor_a, hospital_admin_a):
        c = auth_client(u)
        assert c.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'x' * 20}).status_code == 403
        assert c.post('/api/patients/access-requests/emergency/', {'patient': str(self_registered.id), 'reason': 'x' * 20}).status_code == 403


def test_grant_is_per_user_not_per_hospital(management_a, doctor_a, self_registered):
    m = auth_client(management_a)
    gid = m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'}).json()['id']
    auth_client(self_registered.user).post(f'/api/patients/access-requests/{gid}/approve/')
    assert auth_client(doctor_a).get(f'/api/patients/{self_registered.id}/').status_code == 403


def test_grant_does_not_cross_hospitals(management_a, management_b, self_registered):
    gid = auth_client(management_a).post('/api/patients/access-requests/',
                                         {'patient': str(self_registered.id), 'reason': 'Checkup'}).json()['id']
    auth_client(self_registered.user).post(f'/api/patients/access-requests/{gid}/approve/')
    assert auth_client(management_b).get(f'/api/patients/{self_registered.id}/').status_code == 403


def test_emergency_access_is_immediate_time_limited_and_audited(management_a, self_registered):
    m = auth_client(management_a)
    r = m.post('/api/patients/access-requests/emergency/',
               {'patient': str(self_registered.id), 'reason': 'Unconscious, arrived at ER'})
    assert r.status_code == 201
    body = r.json()
    assert body['grant_type'] == 'EMERGENCY' and body['status'] == 'APPROVED' and body['expires_at']
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 200
    log = AuditLog.objects.get(action='EMERGENCY_ACCESS_GRANTED')
    assert log.patient_id == self_registered.id and log.actor == management_a
    assert 'Unconscious' in log.context['reason']
    # patient learns about it afterwards
    assert Notification.objects.filter(recipient=self_registered.user, notification_type='EMERGENCY_ACCESS').exists()


def test_emergency_needs_a_real_reason(management_a, self_registered):
    r = auth_client(management_a).post('/api/patients/access-requests/emergency/',
                                        {'patient': str(self_registered.id), 'reason': 'urgent'})
    assert r.status_code == 400
    assert not PatientAccessGrant.objects.exists()


def test_emergency_grant_cannot_be_approved_or_declined(management_a, self_registered):
    gid = auth_client(management_a).post('/api/patients/access-requests/emergency/',
                                         {'patient': str(self_registered.id), 'reason': 'Unconscious, arrived at ER'}).json()['id']
    assert auth_client(self_registered.user).post(f'/api/patients/access-requests/{gid}/decline/').status_code == 400


def test_no_duplicate_pending_and_no_request_when_already_allowed(management_a, self_registered, patient):
    m = auth_client(management_a)
    assert m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'}).status_code == 201
    assert m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'}).status_code == 400
    assert m.post('/api/patients/access-requests/', {'patient': str(patient.id), 'reason': 'Checkup'}).status_code == 400


def test_unclaimed_patient_needs_emergency_path(management_b, patient):
    r = auth_client(management_b).post('/api/patients/access-requests/', {'patient': str(patient.id), 'reason': 'Checkup'})
    assert r.status_code == 400 and 'emergency' in r.json()['message'].lower()


def test_bad_patient_ids_give_404_not_500(management_a):
    c = auth_client(management_a)
    assert c.post('/api/patients/access-requests/', {'patient': 'not-a-uuid', 'reason': 'Checkup'}).status_code == 404
    assert c.post('/api/patients/access-requests/emergency/', {'patient': 'not-a-uuid', 'reason': 'x' * 20}).status_code == 404


def test_lists_are_private(management_a, management_b, self_registered, patient_user):
    auth_client(management_a).post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'})
    assert len(auth_client(management_a).get('/api/patients/access-requests/').json()) == 1
    assert auth_client(management_b).get('/api/patients/access-requests/').json() == []
    assert auth_client(patient_user).get('/api/patients/access-requests/').json() == []
    assert len(auth_client(self_registered.user).get('/api/patients/access-requests/').json()) == 1
