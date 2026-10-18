import os
from datetime import date, timedelta

from django.utils import timezone

from apps.accounts.models import Role, User
from apps.admissions.models import Admission
from apps.hospitals.models import Department, DepartmentType, Hospital, StaffProfile, StaffRole
from apps.patients.models import (
    Allergy, DataSource, MedicalHistoryEntry, MedicalHistoryEventType,
    Medication, MedicationStatus, PatientProfile, VerificationStatus,
)
from apps.referrals.models import Referral, ReferralStatus, Transfer
from apps.workflow.models import RequestStatus, RequestTypeCode, ServiceRequest, StatusTransition

e2e_password = os.environ['E2E_STAFF_PASSWORD']
hospital_a = Hospital.objects.create(name='LifeLink E2E General Hospital', code='E2EA', city='E2E City')
hospital_b = Hospital.objects.create(name='LifeLink E2E Partner Hospital', code='E2EB', city='E2E City')
department_a = Department.objects.create(hospital=hospital_a, department_type=DepartmentType.GENERAL, name='General')
department_b = Department.objects.create(hospital=hospital_b, department_type=DepartmentType.RADIOLOGY, name='Radiology')

management = User.objects.create_user(
    username='management_e2e', password=e2e_password, phone='+919876500001',
    role=Role.HOSPITAL_MANAGEMENT,
)
StaffProfile.objects.create(
    user=management, hospital=hospital_a, department=department_a,
    staff_role=StaffRole.COORDINATOR, employee_id='E2E-MGMT', job_title='Management',
)
doctor = User.objects.create_user(
    username='doctor_e2e', password=e2e_password, phone='+919876500003',
    role=Role.HOSPITAL_STAFF,
)
StaffProfile.objects.create(
    user=doctor, hospital=hospital_a, department=department_a,
    staff_role=StaffRole.DOCTOR, employee_id='E2E-DOCTOR', job_title='Doctor',
)

patient_user = User.objects.create_user(
    username='patient_e2e', phone='+919876500002', role=Role.PATIENT,
)
patient = PatientProfile.objects.create(
    lifelink_patient_id='LL-P-E2E-1001', user=patient_user,
    full_name='LifeLink E2E Patient', date_of_birth=date(1990, 1, 1),
    gender='F', phone=patient_user.phone, address='E2E patient address',
    is_unclaimed=False,
)
Allergy.objects.create(
    patient=patient, substance='Penicillin', severity='MILD',
    source=DataSource.DOCTOR_ENTERED, verification_status=VerificationStatus.VERIFIED,
)
MedicalHistoryEntry.objects.create(
    patient=patient, event_type=MedicalHistoryEventType.DIAGNOSIS,
    description='Verified E2E asthma history', event_date=date(2024, 2, 1),
    source=DataSource.DOCTOR_ENTERED, verification_status=VerificationStatus.VERIFIED,
    originating_hospital=hospital_b, created_by=doctor,
)
Medication.objects.create(
    patient=patient, name='Salbutamol', dosage='2 puffs', frequency='As needed',
    start_date=date(2024, 2, 1), status=MedicationStatus.ACTIVE,
    source=DataSource.DOCTOR_ENTERED, prescribing_doctor=doctor,
)

admission = Admission.objects.create(
    patient=patient, hospital=hospital_b,
    admission_number=Admission.generate_admission_number(hospital_b),
    reason='Private E2E admission note', created_by=doctor,
)
request = ServiceRequest.objects.create(
    patient=patient, admission=admission, request_type=RequestTypeCode.CT_SCAN,
    created_by=doctor, target_department=department_b, priority='HIGH',
    reason='Private E2E request narrative', status=RequestStatus.IN_PROGRESS,
    due_at=timezone.now() + timedelta(days=3),
)
StatusTransition.objects.create(
    service_request=request, from_status=RequestStatus.APPROVED,
    to_status=RequestStatus.IN_PROGRESS, changed_by=doctor,
    note='Private E2E staff note',
)
referral = Referral.objects.create(
    patient=patient, from_hospital=hospital_b, from_admission=admission,
    to_hospital=hospital_a, required_department_type='GENERAL', priority='HIGH',
    reason='Private E2E referral narrative', current_condition_summary='Private condition',
    status=ReferralStatus.ACCEPTED, created_by=doctor, responded_by=management,
    response_note='Private referral response',
)
Transfer.objects.create(
    referral=referral, ambulance_arranged=True,
    checklist={'private_e2e_checklist': {'done': True}},
)
print('Seeded E2E accounts and patient LL-P-E2E-1001')
