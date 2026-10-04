import pytest

from apps.accounts.models import Role, User
from apps.hospitals.models import Department, DepartmentType, StaffProfile, StaffRole
from tests.conftest import _make_staff, auth_client


@pytest.mark.django_db
def test_hospital_admin_can_provision_staff_in_own_hospital(hospital_admin_a, dept_radiology_a):
    client = auth_client(hospital_admin_a)
    resp = client.post('/api/staff/provision/', {
        'username': 'new_radiographer',
        'initial_password': 'StrongPass123!',
        'department': str(dept_radiology_a.id),
        'staff_role': StaffRole.TECHNICIAN,
        'employee_id': 'RAD-999',
        'job_title': 'CT Technician',
    }, format='json')
    assert resp.status_code == 201
    data = resp.json()
    assert data['username'] == 'new_radiographer'
    assert data['department_name'] == dept_radiology_a.name

    new_user = User.objects.get(username='new_radiographer')
    assert new_user.role == Role.HOSPITAL_STAFF
    assert new_user.must_change_password is True
    assert new_user.check_password('StrongPass123!')


@pytest.mark.django_db
def test_provisioned_management_role_gets_correct_coarse_role(hospital_admin_a, dept_general_a):
    client = auth_client(hospital_admin_a)
    resp = client.post('/api/staff/provision/', {
        'username': 'new_coordinator',
        'initial_password': 'StrongPass123!',
        'staff_role': StaffRole.COORDINATOR,
        'employee_id': 'MGT-999',
    }, format='json')
    assert resp.status_code == 201
    assert User.objects.get(username='new_coordinator').role == Role.HOSPITAL_MANAGEMENT


@pytest.mark.django_db
def test_non_admin_staff_cannot_provision_staff(doctor_a, dept_general_a):
    """Unauthorized users cannot provision staff (section 12)."""
    client = auth_client(doctor_a)
    resp = client.post('/api/staff/provision/', {
        'username': 'sneaky_new_user',
        'initial_password': 'StrongPass123!',
        'staff_role': StaffRole.TECHNICIAN,
        'employee_id': 'X-1',
    }, format='json')
    assert resp.status_code == 403
    assert not User.objects.filter(username='sneaky_new_user').exists()


@pytest.mark.django_db
def test_management_role_cannot_provision_staff(management_a):
    """Only Hospital Admin — not Hospital Management — can provision staff."""
    client = auth_client(management_a)
    resp = client.post('/api/staff/provision/', {
        'username': 'sneaky_new_user_2',
        'initial_password': 'StrongPass123!',
        'staff_role': StaffRole.TECHNICIAN,
        'employee_id': 'X-2',
    }, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_hospital_admin_cannot_provision_staff_into_another_hospitals_department(hospital_admin_a, hospital_b):
    """Cross-hospital provisioning must be rejected server-side."""
    other_dept = Department.objects.create(hospital=hospital_b, department_type=DepartmentType.RADIOLOGY, name='Radiology')
    client = auth_client(hospital_admin_a)
    resp = client.post('/api/staff/provision/', {
        'username': 'cross_hospital_attempt',
        'initial_password': 'StrongPass123!',
        'department': str(other_dept.id),
        'staff_role': StaffRole.TECHNICIAN,
        'employee_id': 'X-3',
    }, format='json')
    assert resp.status_code == 404  # department not found *in your hospital*
    assert not User.objects.filter(username='cross_hospital_attempt').exists()


@pytest.mark.django_db
def test_hospital_admin_from_hospital_b_cannot_manage_hospital_a_staff(hospital_admin_a, hospital_b, dept_general_b):
    admin_b = _make_staff(hospital_b, dept_general_b, StaffRole.ADMIN, 'admin_b_test', role=Role.HOSPITAL_ADMIN)
    target = StaffProfile.objects.get(user=hospital_admin_a)

    client_b = auth_client(admin_b)
    resp = client_b.get(f'/api/staff/{target.id}/')
    assert resp.status_code == 404  # not even visible outside its own hospital

    resp2 = client_b.post(f'/api/staff/{target.id}/deactivate/', {}, format='json')
    assert resp2.status_code == 404


@pytest.mark.django_db
def test_hospital_admin_can_deactivate_and_reactivate_staff_in_own_hospital(hospital_admin_a, radiology_staff_a):
    target = StaffProfile.objects.get(user=radiology_staff_a)
    client = auth_client(hospital_admin_a)

    resp = client.post(f'/api/staff/{target.id}/deactivate/', {}, format='json')
    assert resp.status_code == 200
    assert resp.json()['is_active'] is False

    radiology_staff_a.refresh_from_db()
    assert radiology_staff_a.is_active is False

    # A deactivated staff account's existing JWT is rejected immediately.
    deactivated_client = auth_client(radiology_staff_a)
    me_resp = deactivated_client.get('/api/auth/me/')
    assert me_resp.status_code == 401

    resp2 = client.post(f'/api/staff/{target.id}/activate/', {}, format='json')
    assert resp2.status_code == 200
    assert resp2.json()['is_active'] is True
    radiology_staff_a.refresh_from_db()
    assert radiology_staff_a.is_active is True


@pytest.mark.django_db
def test_non_admin_cannot_deactivate_staff(management_a, radiology_staff_a):
    target = StaffProfile.objects.get(user=radiology_staff_a)
    client = auth_client(management_a)
    resp = client.post(f'/api/staff/{target.id}/deactivate/', {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_staff_cannot_view_or_edit_staff_endpoint_at_all(doctor_a, radiology_staff_a):
    """StaffProfileViewSet is Hospital-Admin-only end to end — ordinary
    staff cannot even list/view it, let alone edit their own record."""
    own_profile = StaffProfile.objects.get(user=doctor_a)
    client = auth_client(doctor_a)

    resp_list = client.get('/api/staff/')
    assert resp_list.status_code == 403

    resp_patch = client.patch(f'/api/staff/{own_profile.id}/', {'staff_role': 'ADMIN'}, format='json')
    assert resp_patch.status_code == 403

    doctor_a.refresh_from_db()
    assert doctor_a.role == Role.HOSPITAL_STAFF


@pytest.mark.django_db
def test_admin_cannot_move_staff_to_another_hospital_via_direct_field_tamper(hospital_admin_a, radiology_staff_a, hospital_b):
    """Even a Hospital Admin cannot smuggle a 'hospital' value through the
    update payload — the field is read-only and the view always forces the
    admin's own hospital regardless of what's submitted."""
    target = StaffProfile.objects.get(user=radiology_staff_a)
    client = auth_client(hospital_admin_a)
    resp = client.patch(f'/api/staff/{target.id}/', {'hospital': str(hospital_b.id)}, format='json')
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.hospital_id != hospital_b.id


@pytest.mark.django_db
def test_provisioning_duplicate_username_is_rejected(hospital_admin_a, doctor_a):
    client = auth_client(hospital_admin_a)
    resp = client.post('/api/staff/provision/', {
        'username': 'doctor_a',  # already exists
        'initial_password': 'StrongPass123!',
        'staff_role': StaffRole.DOCTOR,
        'employee_id': 'DUP-1',
    }, format='json')
    assert resp.status_code == 409
