"""Management -> patient access: normal (patient approves) and emergency.

Root cause of the old 'Access denied' on the management patient page:
search returned ANY patient, but opening one needed a hospital link
(created there / admitted there). A self-registered patient has neither,
so search worked and the profile 403'd. These tests pin the fix without
loosening the hospital-isolation rule.
"""
import json
import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.audit.models import AuditLog
from apps.admissions.models import Admission
from apps.notifications.models import Notification
from apps.hospitals.models import Department
from apps.patients.models import (
    AccessGrantStatus, Allergy, DataSource, MedicalHistoryEntry, MedicalHistoryEventType,
    Medication, MedicationStatus, PatientAccessGrant, PatientProfile, VerificationStatus,
)
from apps.referrals.models import Referral, ReferralStatus, Transfer
from apps.workflow.models import RequestStatus, RequestTypeCode, ServiceRequest, StatusTransition
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
    assert m.get(f'/api/patients/{self_registered.id}/care-summary/').status_code == 403
    assert m.get('/api/patients/access-requests/').json()[0]['status'] == 'EXPIRED'


def test_patient_can_revoke(management_a, self_registered):
    m = auth_client(management_a)
    p = auth_client(self_registered.user)
    gid = m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Checkup'}).json()['id']
    p.post(f'/api/patients/access-requests/{gid}/approve/')
    assert p.post(f'/api/patients/access-requests/{gid}/revoke/').json()['status'] == 'REVOKED'
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 403
    assert m.get(f'/api/patients/{self_registered.id}/care-summary/').status_code == 403


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


def test_management_approved_grant_loads_real_profile_and_safe_care_summary(
    management_a, management_b, doctor_a, self_registered, hospital_a, hospital_b, dept_general_b
):
    """End-to-end API path: request -> patient approval -> profile + care summary.

    The grant opens patient-level facts and read-only care status across hospitals.
    Hospital-specific admission notes, referral narratives, staff identities, and
    transfer checklist data must remain outside this summary.
    """
    from tests.conftest import auth_client

    # Populate real patient-level clinical data and a separate hospital case file.
    Allergy.objects.create(
        patient=self_registered, substance='Penicillin', severity='MILD',
        source=DataSource.SELF_REPORTED, verification_status=VerificationStatus.VERIFIED,
    )
    MedicalHistoryEntry.objects.create(
        patient=self_registered, event_type=MedicalHistoryEventType.DIAGNOSIS,
        description='Verified asthma history', event_date=datetime.date(2024, 2, 1),
        source=DataSource.DOCTOR_ENTERED, verification_status=VerificationStatus.VERIFIED,
        originating_hospital=hospital_b, created_by=management_b,
    )
    Medication.objects.create(
        patient=self_registered, name='Salbutamol', dosage='2 puffs', frequency='As needed',
        start_date=datetime.date(2024, 2, 1), status=MedicationStatus.ACTIVE,
        source=DataSource.DOCTOR_ENTERED, prescribing_doctor=management_b,
    )

    admission = Admission.objects.create(
        patient=self_registered, hospital=hospital_b,
        admission_number=Admission.generate_admission_number(hospital_b),
        reason='PRIVATE admission narrative', created_by=management_b,
    )
    service_request = ServiceRequest.objects.create(
        patient=self_registered, admission=admission, request_type=RequestTypeCode.CT_SCAN,
        created_by=management_b, target_department=dept_general_b, priority='HIGH',
        reason='PRIVATE request narrative', status=RequestStatus.IN_PROGRESS,
        due_at=timezone.now() + datetime.timedelta(days=1),
    )
    StatusTransition.objects.create(
        service_request=service_request, from_status=RequestStatus.APPROVED,
        to_status=RequestStatus.IN_PROGRESS, changed_by=management_b,
        note='PRIVATE staff-only transition note',
    )
    referral = Referral.objects.create(
        patient=self_registered, from_hospital=hospital_b, from_admission=admission,
        to_hospital=hospital_a, required_department_type='GENERAL', priority='HIGH',
        reason='PRIVATE referral narrative', current_condition_summary='PRIVATE clinical summary',
        status=ReferralStatus.ACCEPTED, created_by=management_b, responded_by=management_a,
        response_note='PRIVATE receiving-hospital note',
    )
    Transfer.objects.create(
        referral=referral, ambulance_arranged=True,
        checklist={'PRIVATE_CHECKLIST_ITEM': {'done': True}},
    )

    management_client = auth_client(management_a)
    patient_client = auth_client(self_registered.user)

    # Before approval, neither profile nor patient-specific care summary is exposed.
    assert management_client.get(f'/api/patients/{self_registered.id}/').status_code == 403
    assert management_client.get(f'/api/patients/{self_registered.id}/care-summary/').status_code == 403

    request_response = management_client.post(
        '/api/patients/access-requests/',
        {'patient': str(self_registered.id), 'reason': 'Review current care plan'},
    )
    assert request_response.status_code == 201
    grant_id = request_response.json()['id']
    grant = PatientAccessGrant.objects.get(pk=grant_id)
    assert grant.patient_id == self_registered.id
    assert grant.requested_by_id == management_a.id
    assert grant.hospital_id == hospital_a.id
    assert grant.status == AccessGrantStatus.PENDING

    approval = patient_client.post(f'/api/patients/access-requests/{grant_id}/approve/')
    assert approval.status_code == 200
    assert approval.json()['status'] == 'APPROVED'

    # Profile GET returns the intended patient's real, nested clinical details.
    profile = management_client.get(f'/api/patients/{self_registered.id}/')
    assert profile.status_code == 200
    profile_data = profile.json()
    assert profile_data['id'] == str(self_registered.id)
    assert profile_data['allergies'][0]['substance'] == 'Penicillin'
    assert profile_data['history_entries'][0]['description'] == 'Verified asthma history'
    assert profile_data['medications'][0]['name'] == 'Salbutamol'

    # Care summary returns real status/scheduling metadata without hospital-only
    # narratives, transition notes, staff IDs, or transfer checklist contents.
    summary_response = management_client.get(f'/api/patients/{self_registered.id}/care-summary/')
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert len(summary['admissions']) == 1
    assert summary['admissions'][0]['hospital_name'] == hospital_b.name
    assert summary['requests'][0]['request_type'] == RequestTypeCode.CT_SCAN
    assert summary['requests'][0]['status'] == RequestStatus.IN_PROGRESS
    assert summary['requests'][0]['due_at']
    assert summary['requests'][0]['assigned'] is False
    assert summary['requests'][0]['transitions'][0]['note'] == ''
    assert summary['referrals'][0]['status'] == ReferralStatus.ACCEPTED
    assert summary['referrals'][0]['to_hospital_name'] == hospital_a.name
    assert summary['transfers'][str(referral.id)]['ambulance_arranged'] is True
    assert summary['transfers'][str(referral.id)]['checklist'] == {}
    encoded = json.dumps(summary)
    for private_text in (
        'PRIVATE admission narrative', 'PRIVATE request narrative',
        'PRIVATE staff-only transition note', 'PRIVATE referral narrative',
        'PRIVATE clinical summary', 'PRIVATE receiving-hospital note',
        'PRIVATE_CHECKLIST_ITEM',
    ):
        assert private_text not in encoded

    # A browser refresh repeats the same authorized API reads successfully.
    assert management_client.get(f'/api/patients/{self_registered.id}/').status_code == 200
    assert management_client.get(f'/api/patients/{self_registered.id}/care-summary/').status_code == 200

    # A same-hospital doctor who did not receive this user-bound grant is still blocked.
    assert auth_client(doctor_a).get(f'/api/patients/{self_registered.id}/').status_code == 403
    assert auth_client(doctor_a).get(f'/api/patients/{self_registered.id}/care-summary/').status_code == 403

    # Revocation immediately closes both protected endpoints.
    assert patient_client.post(f'/api/patients/access-requests/{grant_id}/revoke/').status_code == 200
    assert management_client.get(f'/api/patients/{self_registered.id}/').status_code == 403
    assert management_client.get(f'/api/patients/{self_registered.id}/care-summary/').status_code == 403


def test_management_without_patient_grant_care_summary_stays_in_own_hospital(
    management_a, management_b, patient, admission, hospital_b, dept_general_b
):
    """Own-hospital scope must not silently reveal another hospital's case summary."""
    from tests.conftest import auth_client

    outside_admission = Admission.objects.create(
        patient=patient, hospital=hospital_b,
        admission_number=Admission.generate_admission_number(hospital_b),
        reason='Other hospital case', created_by=management_b,
    )
    outside_request = ServiceRequest.objects.create(
        patient=patient, admission=outside_admission, request_type=RequestTypeCode.MRI,
        created_by=management_b, target_department=dept_general_b,
        status=RequestStatus.REQUESTED, reason='Other hospital task',
    )

    response = auth_client(management_a).get(f'/api/patients/{patient.id}/care-summary/')
    assert response.status_code == 200
    summary = response.json()
    assert [item['id'] for item in summary['admissions']] == [str(admission.id)]
    assert all(item['admission'] != str(outside_admission.id) for item in summary['requests'])
    assert str(outside_request.id) not in json.dumps(summary)
