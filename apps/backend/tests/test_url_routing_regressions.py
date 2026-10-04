import pytest

from tests.conftest import auth_client


@pytest.mark.django_db
def test_family_links_list_route_is_not_shadowed_by_patient_detail(family_user):
    """Regression test for a router-ordering bug: PatientProfileViewSet's
    empty-prefix detail route (^(?P<pk>...)/$) previously shadowed this
    exact URL, since 'family-links' was matched as if it were a patient pk.
    This must return a real list response, never a 404."""
    client = auth_client(family_user)
    resp = client.get('/api/patients/family-links/')
    assert resp.status_code == 200
    assert 'results' in resp.json()


@pytest.mark.django_db
def test_allergies_list_route_is_not_shadowed(management_a, patient):
    client = auth_client(management_a)
    resp = client.get(f'/api/patients/allergies/?patient={patient.id}')
    assert resp.status_code == 200
    assert 'results' in resp.json()


@pytest.mark.django_db
def test_history_list_route_is_not_shadowed(management_a, patient):
    client = auth_client(management_a)
    resp = client.get(f'/api/patients/history/?patient={patient.id}')
    assert resp.status_code == 200


@pytest.mark.django_db
def test_medications_list_route_is_not_shadowed(management_a, patient):
    client = auth_client(management_a)
    resp = client.get(f'/api/patients/medications/?patient={patient.id}')
    assert resp.status_code == 200


@pytest.mark.django_db
def test_emergency_contacts_list_route_is_not_shadowed(management_a, patient):
    client = auth_client(management_a)
    resp = client.get(f'/api/patients/emergency-contacts/?patient={patient.id}')
    assert resp.status_code == 200


@pytest.mark.django_db
def test_creating_a_family_link_via_the_real_url_works(management_a, patient, admission, family_user):
    """POST to the collection URL must reach FamilyRelationshipViewSet.create,
    not 405 against patient-detail (which doesn't support POST)."""
    from apps.patients.models import FamilyRelationship
    FamilyRelationship.objects.filter(patient=patient, family_user=family_user).delete()
    client = auth_client(management_a)
    resp = client.post('/api/patients/family-links/', {
        'patient': str(patient.id), 'family_user': str(family_user.id),
        'relationship_type': 'Sibling', 'access_level': 'UPDATES_ONLY',
    }, format='json')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_patient_detail_route_still_works_after_reordering(management_a, patient):
    """Confirm the fix didn't break the ordinary case — a real patient
    UUID must still resolve to patient-detail correctly."""
    client = auth_client(management_a)
    from apps.admissions.models import Admission
    Admission.objects.get_or_create(
        patient=patient, hospital=patient.created_by_hospital,
        defaults=dict(admission_number=Admission.generate_admission_number(patient.created_by_hospital),
                      created_by=management_a),
    )
    resp = client.get(f'/api/patients/{patient.id}/')
    assert resp.status_code == 200
    assert resp.json()['id'] == str(patient.id)


@pytest.mark.django_db
def test_patient_search_route_still_works_after_reordering(management_a, patient):
    client = auth_client(management_a)
    resp = client.get(f'/api/patients/search/?lifelink_patient_id={patient.lifelink_patient_id}')
    assert resp.status_code == 200
    assert len(resp.json()) == 1
