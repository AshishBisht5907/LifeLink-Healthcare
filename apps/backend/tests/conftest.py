import datetime

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.admissions.models import Admission
from apps.hospitals.models import Department, DepartmentType, Hospital, StaffProfile, StaffRole
from apps.patients.models import FamilyRelationship, PatientProfile
from apps.patients.services import generate_lifelink_patient_id
from apps.consents.models import ConsentRequest, ConsentStatus


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    # DRF's rate throttles use Django's cache, which is NOT rolled back by
    # pytest-django's DB transaction rollback between tests. Without this,
    # a login-lockout test can starve the next test's throttle budget.
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def hospital_a(db):
    return Hospital.objects.create(name='ABC General Hospital', code='ABC')


@pytest.fixture
def hospital_b(db):
    return Hospital.objects.create(name='City Care Hospital', code='CCH')


def _make_dept(hospital, dtype):
    return Department.objects.create(hospital=hospital, department_type=dtype, name=dtype.title())


@pytest.fixture
def dept_radiology_a(hospital_a):
    return _make_dept(hospital_a, DepartmentType.RADIOLOGY)


@pytest.fixture
def dept_billing_a(hospital_a):
    return _make_dept(hospital_a, DepartmentType.BILLING)


@pytest.fixture
def dept_general_a(hospital_a):
    return _make_dept(hospital_a, DepartmentType.GENERAL)


@pytest.fixture
def dept_general_b(hospital_b):
    return _make_dept(hospital_b, DepartmentType.GENERAL)


def _make_staff(hospital, department, staff_role, username, role=Role.HOSPITAL_STAFF):
    user = User.objects.create(username=username, role=role)
    user.set_password('TestPass123!')
    user.save()
    StaffProfile.objects.create(user=user, hospital=hospital, department=department,
                                 staff_role=staff_role, employee_id=f'EMP-{username}')
    return user


@pytest.fixture
def doctor_a(hospital_a, dept_general_a):
    return _make_staff(hospital_a, dept_general_a, StaffRole.DOCTOR, 'doctor_a')


@pytest.fixture
def radiology_staff_a(hospital_a, dept_radiology_a):
    return _make_staff(hospital_a, dept_radiology_a, StaffRole.TECHNICIAN, 'radiology_a')


@pytest.fixture
def billing_staff_a(hospital_a, dept_billing_a):
    return _make_staff(hospital_a, dept_billing_a, StaffRole.BILLING_CLERK, 'billing_a')


@pytest.fixture
def management_a(hospital_a, dept_general_a):
    return _make_staff(hospital_a, dept_general_a, StaffRole.COORDINATOR, 'management_a', role=Role.HOSPITAL_MANAGEMENT)


@pytest.fixture
def management_b(hospital_b, dept_general_b):
    return _make_staff(hospital_b, dept_general_b, StaffRole.COORDINATOR, 'management_b', role=Role.HOSPITAL_MANAGEMENT)


@pytest.fixture
def hospital_admin_a(hospital_a, dept_general_a):
    return _make_staff(hospital_a, dept_general_a, StaffRole.ADMIN, 'admin_a', role=Role.HOSPITAL_ADMIN)


@pytest.fixture
def patient(db, hospital_a, management_a):
    staff = StaffProfile.objects.get(user=management_a)
    return PatientProfile.objects.create(
        lifelink_patient_id=generate_lifelink_patient_id(),
        full_name='Test Patient', date_of_birth=datetime.date(1990, 1, 1), gender='M',
        is_unclaimed=True, created_by_staff=staff, created_by_hospital=hospital_a,
    )


@pytest.fixture
def admission(patient, hospital_a, doctor_a):
    return Admission.objects.create(
        patient=patient, hospital=hospital_a,
        admission_number=Admission.generate_admission_number(hospital_a),
        attending_doctor=doctor_a, reason='Test admission', created_by=doctor_a,
    )


@pytest.fixture
def family_user(db, patient, admission):
    from apps.consents.models import ConsentRequest, ConsentStatus
    user = User.objects.create(username='family_test', role=Role.FAMILY, phone='9990001111')
    user.set_unusable_password()
    user.save()
    FamilyRelationship.objects.create(patient=patient, family_user=user, relationship_type='Spouse',
                                       access_level='FULL_REPRESENTATIVE')

    # Create approved consent for this admission so that user_can_access_patient returns True
    ConsentRequest.objects.create(
        patient=patient, admission=admission,
        procedure_description="General patient data access consent",
        status=ConsentStatus.APPROVED,
        requested_by=user  # or any user
    )
    return user


@pytest.fixture
def patient_user(db, patient):
    user = User.objects.create(username='patient_test', role=Role.PATIENT, phone='9990002222')
    user.set_unusable_password()
    user.save()
    patient.user = user
    patient.is_unclaimed = False
    patient.save(update_fields=['user', 'is_unclaimed'])
    return user


def auth_client(user):
    from rest_framework_simplejwt.tokens import RefreshToken
    client = APIClient()
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client
