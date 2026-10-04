"""Regression tests for five verified authorization gaps.

 1. FAMILY could approve/decline a patient's consent.
 2. Emergency (temporary) access could create a lasting FULL_REPRESENTATIVE family link.
 3. A family link could point at a staff/management/admin/patient account.
 4. A FAMILY user could create/modify/delete family links.
 5. A family link could be re-pointed at a different patient.

Each block proves the old unauthorised action now fails AND that the
legitimate flow next to it still works.
"""
import datetime

import pytest

from apps.accounts.models import Role, User
from apps.audit.models import AuditLog
from apps.consents.models import ConsentAction, ConsentRequest, ConsentStatus
from apps.patients.models import FamilyRelationship, PatientAccessGrant, PatientProfile
from apps.patients.services import generate_lifelink_patient_id
from tests.conftest import auth_client

pytestmark = pytest.mark.django_db

LINKS = '/api/patients/family-links/'


def mk_user(username, role=Role.FAMILY, phone='9100000000', **kw):
    u = User.objects.create(username=username, role=role, phone=phone, **kw)
    u.set_unusable_password()
    u.save()
    return u


@pytest.fixture
def pending_consent(patient, admission, doctor_a):
    """A consent the patient still has to answer."""
    return ConsentRequest.objects.create(patient=patient, admission=admission, procedure_description='Knee surgery',
                                         risk_information='Standard risks', requested_by=doctor_a)


@pytest.fixture
def self_registered(db):
    """A claimed patient with no link to hospital A."""
    user = mk_user('selfreg', Role.PATIENT, '9100000001')
    return PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(), user=user, full_name='Riya Sharma',
        date_of_birth=datetime.date(1995, 5, 5), gender='F', phone='9100000001', is_unclaimed=False)


def payload(patient, family_user, level='UPDATES_ONLY', rel='Cousin'):
    return {'patient': str(patient.id), 'family_user': str(family_user.id), 'relationship_type': rel, 'access_level': level}


# =========================================================================
# GAP 1 - only the PATIENT decides consent
# =========================================================================

@pytest.mark.parametrize('action', ['APPROVE', 'DECLINE', 'ASK_DOCTOR'])
def test_gap1_full_representative_family_cannot_decide_consent(family_user, pending_consent, action):
    r = auth_client(family_user).post(f'/api/consents/{pending_consent.id}/decide/', {'action': action}, format='json')
    assert r.status_code == 403
    pending_consent.refresh_from_db()
    assert pending_consent.status == ConsentStatus.PENDING          # unchanged
    assert not ConsentAction.objects.filter(consent_request=pending_consent).exists()   # nothing recorded


def test_gap1_updates_only_family_cannot_decide_consent(patient, pending_consent):
    low = mk_user('lowfam', phone='9100000002')
    FamilyRelationship.objects.create(patient=patient, family_user=low, relationship_type='Cousin', access_level='UPDATES_ONLY')
    assert auth_client(low).post(f'/api/consents/{pending_consent.id}/decide/', {'action': 'APPROVE'}, format='json').status_code == 403


def test_gap1_family_cannot_approve_to_unlock_their_own_access(patient, admission, doctor_a):
    """The circular attack: a full-representative link with no approved consent
    must not be able to approve its way into the record."""
    fam = mk_user('selfunlock', phone='9100000003')
    FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Friend', access_level='FULL_REPRESENTATIVE')
    consent = ConsentRequest.objects.create(patient=patient, admission=admission, procedure_description='x', requested_by=doctor_a)
    c = auth_client(fam)
    assert c.get(f'/api/patients/{patient.id}/').status_code == 403
    assert c.post(f'/api/consents/{consent.id}/decide/', {'action': 'APPROVE'}, format='json').status_code == 403
    assert c.get(f'/api/patients/{patient.id}/').status_code == 403


def test_gap1_patient_can_still_approve_decline_and_ask(patient, patient_user, pending_consent):
    c = auth_client(patient_user)
    url = f'/api/consents/{pending_consent.id}/decide/'
    assert c.post(url, {'action': 'APPROVE'}, format='json').json()['status'] == 'APPROVED'
    assert c.post(url, {'action': 'DECLINE'}, format='json').json()['status'] == 'DECLINED'
    assert c.post(url, {'action': 'APPROVE'}, format='json').json()['status'] == 'APPROVED'
    assert ConsentAction.objects.filter(consent_request=pending_consent, actor=patient_user).count() == 3


def test_gap1_other_patient_and_staff_still_cannot_decide(pending_consent, doctor_a, management_a, self_registered):
    for u in (doctor_a, management_a, self_registered.user):
        assert auth_client(u).post(f'/api/consents/{pending_consent.id}/decide/', {'action': 'APPROVE'}, format='json').status_code in (403, 404)
    pending_consent.refresh_from_db()
    assert pending_consent.status == ConsentStatus.PENDING


def test_gap1_family_can_still_view_consents_and_access_when_rules_allow(family_user, patient):
    """Existing consent/access rules are untouched: approved consent + full link = access."""
    c = auth_client(family_user)
    assert c.get('/api/consents/').status_code == 200
    assert c.get(f'/api/patients/{patient.id}/').status_code == 200


# =========================================================================
# GAP 2 - temporary access never leaves lasting family privileges
# =========================================================================

def test_gap2_emergency_access_cannot_create_family_link(management_a, self_registered):
    m = auth_client(management_a)
    assert m.post('/api/patients/access-requests/emergency/', {'patient': str(self_registered.id), 'reason': 'Unconscious, arrived at ER'}).status_code == 201
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 200            # emergency access itself still works
    accomplice = mk_user('accomplice', phone='9100000004')
    r = m.post(LINKS, payload(self_registered, accomplice, 'FULL_REPRESENTATIVE'), format='json')
    assert r.status_code == 403
    assert not FamilyRelationship.objects.filter(patient=self_registered).exists()


def test_gap2_emergency_access_cannot_modify_or_delete_existing_links(management_a, self_registered):
    fam = mk_user('existingfam', phone='9100000005')
    link = FamilyRelationship.objects.create(patient=self_registered, family_user=fam, relationship_type='Son', access_level='UPDATES_ONLY')
    m = auth_client(management_a)
    m.post('/api/patients/access-requests/emergency/', {'patient': str(self_registered.id), 'reason': 'Unconscious, arrived at ER'})
    assert m.patch(f'{LINKS}{link.id}/', {'access_level': 'FULL_REPRESENTATIVE'}, format='json').status_code == 403
    assert m.delete(f'{LINKS}{link.id}/').status_code == 403
    link.refresh_from_db()
    assert link.access_level == 'UPDATES_ONLY'


def test_gap2_patient_approved_grant_is_also_view_only(management_a, self_registered):
    """A normal (patient-approved) grant is temporary too, so it cannot create lasting links either."""
    m = auth_client(management_a)
    gid = m.post('/api/patients/access-requests/', {'patient': str(self_registered.id), 'reason': 'Planned admission'}).json()['id']
    auth_client(self_registered.user).post(f'/api/patients/access-requests/{gid}/approve/')
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 200
    r = m.post(LINKS, payload(self_registered, mk_user('f2', phone='9100000006'), 'FULL_REPRESENTATIVE'), format='json')
    assert r.status_code == 403


def test_gap2_emergency_access_stays_temporary(management_a, self_registered):
    m = auth_client(management_a)
    body = m.post('/api/patients/access-requests/emergency/', {'patient': str(self_registered.id), 'reason': 'Unconscious, arrived at ER'}).json()
    assert body['grant_type'] == 'EMERGENCY' and body['expires_at']
    grant = PatientAccessGrant.objects.get(pk=body['id'])
    PatientAccessGrant.objects.filter(pk=grant.pk).update(expires_at=grant.created_at - datetime.timedelta(minutes=1))
    assert m.get(f'/api/patients/{self_registered.id}/').status_code == 403
    assert AuditLog.objects.filter(action='EMERGENCY_ACCESS_GRANTED', patient_id=self_registered.id).exists()


def test_gap2_hospital_isolation_for_link_management(management_b, patient):
    """Another hospital's management has no scope at all over hospital A's patient."""
    fam = mk_user('f3', phone='9100000007')
    assert auth_client(management_b).post(LINKS, payload(patient, fam), format='json').status_code == 403


# =========================================================================
# GAP 3 - only FAMILY accounts can be linked
# =========================================================================

def test_gap3_staff_management_admin_and_patient_accounts_are_refused(patient_user, patient, doctor_a, management_a, hospital_admin_a, self_registered):
    c = auth_client(patient_user)
    for bad in (doctor_a, management_a, hospital_admin_a, self_registered.user):
        r = c.post(LINKS, payload(patient, bad), format='json')
        assert r.status_code == 400, bad.username
        assert 'family_user' in r.json().get('detail', r.json())  or 'cannot be linked' in r.json().get('message', '')
    assert not FamilyRelationship.objects.filter(patient=patient).exists()


def test_gap3_inactive_family_account_is_refused(patient_user, patient):
    gone = mk_user('inactivefam', phone='9100000008', is_active=False)
    assert auth_client(patient_user).post(LINKS, payload(patient, gone), format='json').status_code == 400


def test_gap3_cannot_swap_an_existing_link_to_a_staff_account(patient_user, patient, doctor_a):
    fam = mk_user('swapme', phone='9100000009')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='UPDATES_ONLY')
    r = auth_client(patient_user).patch(f'{LINKS}{link.id}/', {'family_user': str(doctor_a.id)}, format='json')
    assert r.status_code == 400
    link.refresh_from_db()
    assert link.family_user_id == fam.id


def test_gap3_error_does_not_reveal_the_account_type(patient_user, patient, doctor_a):
    r = auth_client(patient_user).post(LINKS, payload(patient, doctor_a), format='json')
    text = str(r.json()).lower()
    assert 'staff' not in text and 'hospital_staff' not in text and 'role' not in text


def test_gap3_legitimate_family_account_can_still_be_linked(patient_user, patient):
    fam = mk_user('goodfam', phone='9100000010')
    r = auth_client(patient_user).post(LINKS, payload(patient, fam, 'FULL_REPRESENTATIVE', 'Spouse'), format='json')
    assert r.status_code == 201
    assert FamilyRelationship.objects.filter(patient=patient, family_user=fam, is_active=True).exists()


# =========================================================================
# GAP 4 - FAMILY users cannot manage family links
# =========================================================================

def test_gap4_family_with_full_access_cannot_create_links(family_user, patient):
    other = mk_user('newfam', phone='9100000011')
    before = FamilyRelationship.objects.count()
    assert auth_client(family_user).post(LINKS, payload(patient, other, 'FULL_REPRESENTATIVE'), format='json').status_code == 403
    assert FamilyRelationship.objects.count() == before


def test_gap4_family_cannot_widen_edit_or_delete_their_own_link(patient):
    low = mk_user('lowfam2', phone='9100000012')
    link = FamilyRelationship.objects.create(patient=patient, family_user=low, relationship_type='Cousin', access_level='UPDATES_ONLY')
    c = auth_client(low)
    assert c.patch(f'{LINKS}{link.id}/', {'access_level': 'FULL_REPRESENTATIVE'}, format='json').status_code == 403
    assert c.patch(f'{LINKS}{link.id}/', {'is_active': True}, format='json').status_code == 403
    assert c.put(f'{LINKS}{link.id}/', payload(patient, low, 'FULL_REPRESENTATIVE'), format='json').status_code == 403
    assert c.delete(f'{LINKS}{link.id}/').status_code == 403
    link.refresh_from_db()
    assert (link.access_level, link.is_active) == ('UPDATES_ONLY', True)


def test_gap4_family_with_full_access_cannot_edit_or_delete_their_own_link(family_user, patient):
    """The real exposure: a full-representative family member WITH approved consent
    used to pass the 'can access this patient' check and could change or delete links."""
    link = FamilyRelationship.objects.get(patient=patient, family_user=family_user)
    assert auth_client(family_user).get(f'/api/patients/{patient.id}/').status_code == 200   # they do have access
    c = auth_client(family_user)
    assert c.patch(f'{LINKS}{link.id}/', {'is_active': False}, format='json').status_code == 403
    assert c.patch(f'{LINKS}{link.id}/', {'relationship_type': 'Owner'}, format='json').status_code == 403
    assert c.delete(f'{LINKS}{link.id}/').status_code == 403
    link.refresh_from_db()
    assert link.is_active is True and link.relationship_type == 'Spouse'


def test_gap4_family_cannot_touch_someone_elses_link(family_user, patient):
    other = mk_user('otherfam', phone='9100000013')
    link = FamilyRelationship.objects.create(patient=patient, family_user=other, relationship_type='Aunt', access_level='UPDATES_ONLY')
    c = auth_client(family_user)
    assert c.delete(f'{LINKS}{link.id}/').status_code in (403, 404)
    assert c.patch(f'{LINKS}{link.id}/', {'is_active': False}, format='json').status_code in (403, 404)
    assert FamilyRelationship.objects.filter(pk=link.pk, is_active=True).exists()


def test_gap4_family_can_still_read_their_own_links(family_user, patient):
    r = auth_client(family_user).get(LINKS)
    assert r.status_code == 200
    assert [row['relationship_type'] for row in r.json()['results']] == ['Spouse']


def test_gap4_patient_manages_own_links_but_not_other_patients(patient_user, patient, self_registered):
    c = auth_client(patient_user)
    fam = mk_user('fam4', phone='9100000014')
    assert c.post(LINKS, payload(patient, fam), format='json').status_code == 201
    assert c.post(LINKS, payload(self_registered, mk_user('fam5', phone='9100000015')), format='json').status_code == 403


def test_gap4_patient_pause_and_restore_still_works(patient_user, patient):
    """The Step 7 UI relies on this: PATCH is_active only."""
    fam = mk_user('fam6', phone='9100000016')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='FULL_REPRESENTATIVE')
    c = auth_client(patient_user)
    assert c.patch(f'{LINKS}{link.id}/', {'is_active': False}, format='json').status_code == 200
    link.refresh_from_db(); assert link.is_active is False
    assert c.patch(f'{LINKS}{link.id}/', {'is_active': True}, format='json').status_code == 200
    link.refresh_from_db(); assert link.is_active is True


def test_gap4_patient_can_still_change_access_level_and_delete(patient_user, patient):
    fam = mk_user('fam7', phone='9100000017')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='UPDATES_ONLY')
    c = auth_client(patient_user)
    assert c.patch(f'{LINKS}{link.id}/', {'access_level': 'FULL_REPRESENTATIVE'}, format='json').status_code == 200
    assert c.delete(f'{LINKS}{link.id}/').status_code == 204


# =========================================================================
# GAP 5 - the patient of a link is immutable
# =========================================================================

def test_gap5_patient_cannot_repoint_link_with_patch(patient_user, patient, self_registered):
    fam = mk_user('fam8', phone='9100000018')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='FULL_REPRESENTATIVE')
    r = auth_client(patient_user).patch(f'{LINKS}{link.id}/', {'patient': str(self_registered.id)}, format='json')
    assert r.status_code == 400
    link.refresh_from_db()
    assert link.patient_id == patient.id
    assert not FamilyRelationship.objects.filter(patient=self_registered).exists()


def test_gap5_patient_cannot_repoint_link_with_put(patient_user, patient, self_registered):
    fam = mk_user('fam9', phone='9100000019')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='FULL_REPRESENTATIVE')
    r = auth_client(patient_user).put(f'{LINKS}{link.id}/', payload(self_registered, fam, 'FULL_REPRESENTATIVE', 'Son'), format='json')
    assert r.status_code == 400
    link.refresh_from_db()
    assert link.patient_id == patient.id


def test_gap5_repointed_family_user_gets_no_access_to_victim(patient_user, patient, self_registered):
    fam = mk_user('fam10', phone='9100000020')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='FULL_REPRESENTATIVE')
    auth_client(patient_user).patch(f'{LINKS}{link.id}/', {'patient': str(self_registered.id)}, format='json')
    assert auth_client(fam).get(f'/api/patients/{self_registered.id}/').status_code == 403


def test_gap5_staff_cannot_repoint_a_link_either(management_a, patient, self_registered):
    fam = mk_user('fam11', phone='9100000021')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='UPDATES_ONLY')
    r = auth_client(management_a).patch(f'{LINKS}{link.id}/', {'patient': str(self_registered.id)}, format='json')
    assert r.status_code == 400
    link.refresh_from_db()
    assert link.patient_id == patient.id


def test_gap5_resending_the_same_patient_is_harmless(patient_user, patient):
    fam = mk_user('fam12', phone='9100000022')
    link = FamilyRelationship.objects.create(patient=patient, family_user=fam, relationship_type='Son', access_level='UPDATES_ONLY')
    r = auth_client(patient_user).patch(f'{LINKS}{link.id}/', {'patient': str(patient.id), 'access_level': 'FULL_REPRESENTATIVE'}, format='json')
    assert r.status_code == 200
    link.refresh_from_db()
    assert (link.patient_id, link.access_level) == (patient.id, 'FULL_REPRESENTATIVE')


# =========================================================================
# Existing behaviour that must NOT have changed
# =========================================================================

def test_hospital_staff_of_the_owning_hospital_keep_their_existing_ability(management_a, patient):
    """Unchanged on purpose (not one of the five gaps): staff of the hospital that
    owns the record can still manage links. Reported separately as a remaining item."""
    fam = mk_user('fam13', phone='9100000023')
    assert auth_client(management_a).post(LINKS, payload(patient, fam), format='json').status_code == 201


def test_view_access_rules_are_unchanged(management_a, doctor_a, management_b, patient, self_registered):
    assert auth_client(management_a).get(f'/api/patients/{patient.id}/').status_code == 200
    assert auth_client(doctor_a).get(f'/api/patients/{patient.id}/').status_code == 200
    assert auth_client(management_b).get(f'/api/patients/{patient.id}/').status_code == 403
    assert auth_client(management_a).get(f'/api/patients/{self_registered.id}/').status_code == 403
