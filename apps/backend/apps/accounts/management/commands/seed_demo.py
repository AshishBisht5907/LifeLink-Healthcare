import datetime

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.admissions.models import Admission
from apps.consents.models import ConsentActionType
from apps.consents.services import record_consent_action
from apps.hospitals.models import Department, DepartmentType, Hospital, HospitalCapacity, ResourceType, StaffProfile, StaffRole
from apps.patients.models import (
    Allergy, DataSource, EmergencyContact, FamilyRelationship, Medication, PatientProfile,
    VerificationStatus,
)
from apps.patients.services import generate_lifelink_patient_id
from apps.workflow.models import RequestStatus, RequestTypeCode, ServiceRequest
from apps.workflow.services import create_service_request, transition_request
from apps.consents.models import ConsentRequest
from apps.referrals.checklist import apply_checklist_updates
from apps.referrals.models import Referral, ReferralStatus, Transfer


def demo_request(*, patient, admission, request_type, created_by, reason, priority, transitions):
    request = ServiceRequest.objects.filter(
        patient=patient, admission=admission, request_type=request_type, reason=reason,
    ).first()
    if request:
        return request
    request = create_service_request(
        patient=patient, admission=admission, request_type=request_type,
        created_by=created_by, reason=reason, priority=priority,
    )
    for status, actor, note in transitions:
        transition_request(req=request, new_status=status, actor=actor, note=note)
    return request


def make_staff(hospital, dept, staff_role, username, employee_id, job_title, password='DemoPass123!'):
    user, created = User.objects.get_or_create(
        username=username, defaults={'role': Role.HOSPITAL_STAFF if staff_role != 'ADMIN'
                                      else Role.HOSPITAL_ADMIN}
    )
    if staff_role == StaffRole.COORDINATOR:
        user.role = Role.HOSPITAL_MANAGEMENT
    user.set_password(password)
    user.save()
    StaffProfile.objects.get_or_create(
        user=user, defaults=dict(hospital=hospital, department=dept, staff_role=staff_role,
                                  employee_id=employee_id, job_title=job_title)
    )
    return user


class Command(BaseCommand):
    help = 'Seed demo data implementing the LifeLink demo workflow (spec section 64).'

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write('Seeding LifeLink demo data...')

        # --- Hospitals -----------------------------------------------------
        hospital_a, _ = Hospital.objects.get_or_create(code='ABC', defaults={
            'name': 'ABC General Hospital', 'city': 'Meerut', 'address': '12 MG Road, Meerut'})
        hospital_b, _ = Hospital.objects.get_or_create(code='CCH', defaults={
            'name': 'City Care Hospital', 'city': 'Delhi', 'address': '88 Connaught Place, Delhi'})

        dept_types = [DepartmentType.RADIOLOGY, DepartmentType.LABORATORY, DepartmentType.PHARMACY,
                      DepartmentType.OT, DepartmentType.WARD, DepartmentType.BILLING,
                      DepartmentType.INSURANCE, DepartmentType.GENERAL, DepartmentType.MANAGEMENT]
        depts_a, depts_b = {}, {}
        for dt in dept_types:
            depts_a[dt], _ = Department.objects.get_or_create(hospital=hospital_a, department_type=dt,
                                                                name=dt.title(), defaults={})
            depts_b[dt], _ = Department.objects.get_or_create(hospital=hospital_b, department_type=dt,
                                                                name=dt.title(), defaults={})

        # --- Capacity (section 18) ------------------------------------------
        HospitalCapacity.objects.get_or_create(hospital=hospital_b, resource_type=ResourceType.ICU_BED,
                                                defaults={'total': 10, 'available': 4})
        HospitalCapacity.objects.get_or_create(hospital=hospital_b, resource_type=ResourceType.CARDIOLOGIST,
                                                defaults={'total': 2, 'available': 1})
        HospitalCapacity.objects.get_or_create(hospital=hospital_a, resource_type=ResourceType.ICU_BED,
                                                defaults={'total': 6, 'available': 1})

        # --- Staff: Hospital A (full roster) ---------------------------------
        admin_a = make_staff(hospital_a, depts_a[DepartmentType.GENERAL], StaffRole.ADMIN,
                              'admin_abc', 'ADM-001', 'Hospital Admin')
        mgmt_a = make_staff(hospital_a, depts_a[DepartmentType.MANAGEMENT], StaffRole.COORDINATOR,
                             'management_abc', 'MGT-001', 'Care Coordinator')
        doctor_a = make_staff(hospital_a, depts_a[DepartmentType.GENERAL], StaffRole.DOCTOR,
                               'doctor_abc', 'DOC-001', 'Dr. Kavita Mehta, MD')
        radiology_a = make_staff(hospital_a, depts_a[DepartmentType.RADIOLOGY], StaffRole.TECHNICIAN,
                                  'radiology_abc', 'RAD-001', 'CT Technician')
        lab_a = make_staff(hospital_a, depts_a[DepartmentType.LABORATORY], StaffRole.TECHNICIAN,
                            'lab_abc', 'LAB-001', 'Lab Technician')
        ward_a = make_staff(hospital_a, depts_a[DepartmentType.WARD], StaffRole.NURSE,
                             'ward_abc', 'WRD-001', 'Ward Nurse')
        ot_a = make_staff(hospital_a, depts_a[DepartmentType.OT], StaffRole.NURSE,
                           'ot_abc', 'OT-001', 'OT Staff Nurse')
        pharmacy_a = make_staff(hospital_a, depts_a[DepartmentType.PHARMACY], StaffRole.PHARMACIST,
                                 'pharmacy_abc', 'PHM-001', 'Pharmacist')
        billing_a = make_staff(hospital_a, depts_a[DepartmentType.BILLING], StaffRole.BILLING_CLERK,
                                'billing_abc', 'BIL-001', 'Billing Clerk')
        insurance_a = make_staff(hospital_a, depts_a[DepartmentType.INSURANCE], StaffRole.INSURANCE_OFFICER,
                                  'insurance_abc', 'INS-001', 'Insurance Officer')

        # --- Staff: Hospital B (minimal roster for referral demo) -----------
        admin_b = make_staff(hospital_b, depts_b[DepartmentType.GENERAL], StaffRole.ADMIN,
                              'admin_city', 'ADM-101', 'Hospital Admin')
        mgmt_b = make_staff(hospital_b, depts_b[DepartmentType.MANAGEMENT], StaffRole.COORDINATOR,
                             'management_city', 'MGT-101', 'Care Coordinator')
        doctor_b = make_staff(hospital_b, depts_b[DepartmentType.GENERAL], StaffRole.DOCTOR,
                               'doctor_city', 'DOC-101', 'Dr. Arvind Rao, MD (Cardiologist)')

        # --- Patient (starts unclaimed — section 14) -------------------------
        # Re-running the seed command should reuse the existing demo patient rather
        # than crash if stale rows remain in the database. Using the demo phone
        # number is stable across reruns and avoids `get_or_create()` on a non-unique
        # name field, which can raise MultipleObjectsReturned when duplicates exist.
        patient = PatientProfile.objects.filter(phone='9876500001').order_by('-created_at').first()
        if patient is None:
            patient = PatientProfile.objects.create(
                full_name='Rahul Sharma',
                lifelink_patient_id=generate_lifelink_patient_id(),
                date_of_birth=datetime.date(1985, 6, 12), gender='M', phone='9876500001',
                is_unclaimed=True, created_by_staff=StaffProfile.objects.get(user=mgmt_a),
                created_by_hospital=hospital_a,
            )
        else:
            patient.full_name = 'Rahul Sharma'
            patient.is_unclaimed = True
            patient.created_by_staff = StaffProfile.objects.get(user=mgmt_a)
            patient.created_by_hospital = hospital_a
            patient.save(update_fields=['full_name', 'is_unclaimed', 'created_by_staff', 'created_by_hospital'])

        # --- Family account (claims the profile) ------------------------------
        family_user, _ = User.objects.get_or_create(
            username='family_rahul', defaults={'role': Role.FAMILY, 'phone': '9876500002'})
        family_user.set_unusable_password()
        family_user.save()
        FamilyRelationship.objects.get_or_create(
            patient=patient, family_user=family_user,
            defaults={'relationship_type': 'Spouse', 'access_level': 'FULL_REPRESENTATIVE'})

        # Patient account too (identity separately verifiable via mock Aadhaar
        # demo number 999911112222 / demo OTP 111111 — see identity.py)
        patient_user, _ = User.objects.get_or_create(
            username='patient_rahul', defaults={'role': Role.PATIENT, 'phone': '9876500001'})
        patient_user.set_unusable_password()
        patient_user.save()
        patient.user = patient_user
        patient.is_unclaimed = False
        patient.save(update_fields=['user', 'is_unclaimed'])

        # --- Baseline clinical data ------------------------------------------
        Allergy.objects.get_or_create(patient=patient, substance='Penicillin', defaults={
            'severity': 'SEVERE', 'source': DataSource.DOCTOR_ENTERED,
            'verification_status': VerificationStatus.VERIFIED})
        EmergencyContact.objects.get_or_create(patient=patient, name='Anita Sharma', defaults={
            'relationship': 'Spouse', 'phone': '9999900001111', 'is_primary': True})
        Medication.objects.get_or_create(patient=patient, name='Metformin', defaults={
            'dosage': '500mg', 'frequency': 'Twice daily', 'start_date': datetime.date(2024, 1, 10),
            'status': 'ACTIVE', 'source': DataSource.DOCTOR_ENTERED})

        # --- Admission at Hospital A -------------------------------------------
        admission, created = Admission.objects.get_or_create(
            patient=patient, hospital=hospital_a,
            defaults=dict(
                admission_number=Admission.generate_admission_number(hospital_a),
                attending_doctor=doctor_a, reason='Chest pain, suspected cardiac event',
                created_by=mgmt_a,
            )
        )

        # --- Demo workflow: CT scan request -> routed -> completed --------------
        demo_request(
            patient=patient, admission=admission, request_type=RequestTypeCode.CT_SCAN,
            created_by=doctor_a, reason='Rule out pulmonary embolism', priority='HIGH',
            transitions=[
                (RequestStatus.APPROVED, radiology_a, 'Radiology accepted the request.'),
                (RequestStatus.IN_PROGRESS, radiology_a, ''),
                (RequestStatus.COMPLETED, radiology_a, 'CT completed, report uploaded.'),
            ],
        )

        # --- Demo workflow: Surgery request requiring consent, then postponed --
        surgery_request = ServiceRequest.objects.filter(
            patient=patient, admission=admission, request_type=RequestTypeCode.SURGERY,
            reason='Emergency angioplasty',
        ).first()
        if not surgery_request:
            surgery_request = create_service_request(
                patient=patient, admission=admission, request_type=RequestTypeCode.SURGERY,
                created_by=doctor_a, reason='Emergency angioplasty', priority='EMERGENCY')
            consent, _ = ConsentRequest.objects.get_or_create(
                patient=patient, admission=admission, procedure_description='Emergency angioplasty',
                defaults={'risk_information': 'Standard cardiac procedure risks apply.', 'requested_by': doctor_a},
            )
            surgery_request.linked_consent = consent
            surgery_request.save(update_fields=['linked_consent'])
            record_consent_action(consent=consent, actor=family_user, action=ConsentActionType.APPROVE)
            surgery_request.refresh_from_db()
            transition_request(req=surgery_request, new_status=RequestStatus.POSTPONED, actor=ot_a,
                                note='Patient condition stabilised; procedure postponed pending re-evaluation.')

        # --- Demo workflow: Blood test, fully completed ------------------------
        demo_request(
            patient=patient, admission=admission, request_type=RequestTypeCode.BLOOD_TEST,
            created_by=doctor_a, reason='CBC and cardiac enzymes', priority='HIGH',
            transitions=[
                (RequestStatus.APPROVED, lab_a, ''),
                (RequestStatus.IN_PROGRESS, lab_a, ''),
                (RequestStatus.COMPLETED, lab_a, ''),
            ],
        )

        # --- Referral to Hospital B for ICU + Cardiologist ----------------------
        from apps.ai_insights.engine import generate_emergency_summary
        referral, created = Referral.objects.get_or_create(
            patient=patient, from_hospital=hospital_a, from_admission=admission, to_hospital=hospital_b,
            defaults=dict(
                required_department_type='ICU_CARDIOLOGY', priority='EMERGENCY',
                reason='Requires ICU + Cardiologist not available at ABC Hospital',
                current_condition_summary='Stable but requires specialist monitoring.',
                created_by=mgmt_a,
            )
        )
        if referral.ai_summary_id is None:
            referral.ai_summary = generate_emergency_summary(patient, requested_by=doctor_a)
        if referral.status == ReferralStatus.PENDING:
            referral.status = ReferralStatus.ACCEPTED
            referral.responded_by = mgmt_b
            referral.responded_at = timezone.now()
        referral.save(update_fields=['ai_summary', 'status', 'responded_by', 'responded_at'])

        target_reason = f'Transferred from {hospital_a.name}: {referral.reason}'
        target_admission, _ = Admission.objects.get_or_create(
            patient=patient, hospital=hospital_b, reason=target_reason,
            defaults=dict(
                admission_number=Admission.generate_admission_number(hospital_b),
                attending_doctor=doctor_b, created_by=mgmt_b,
            ),
        )
        transfer, _ = Transfer.objects.get_or_create(referral=referral)
        sender_checklist = {
            'patient_identity_confirmed': True,
            'reports_attached': True,
            'allergies_confirmed': True,
        }
        transfer.checklist = apply_checklist_updates(transfer, referral, sender_checklist, mgmt_a)
        transfer.checklist = apply_checklist_updates(
            transfer, referral, {'bed_ready': True, 'receiving_doctor_confirmed': True}, mgmt_b,
        )
        transfer.ambulance_arranged = True
        transfer.new_admission = target_admission
        transfer.completed_at = transfer.completed_at or timezone.now()
        transfer.save(update_fields=['checklist', 'ambulance_arranged', 'new_admission', 'completed_at'])

        self.stdout.write(self.style.SUCCESS('Demo data seeded successfully.'))
        self.stdout.write('')
        self.stdout.write('=== DEMO CREDENTIALS (dev only — never use in production) ===')
        self.stdout.write('Hospital Admin (ABC):      admin_abc / DemoPass123!')
        self.stdout.write('Management (ABC):          management_abc / DemoPass123!')
        self.stdout.write('Doctor (ABC):              doctor_abc / DemoPass123!')
        self.stdout.write('Radiology (ABC):           radiology_abc / DemoPass123!')
        self.stdout.write('Lab (ABC):                 lab_abc / DemoPass123!')
        self.stdout.write('Ward (ABC):                ward_abc / DemoPass123!')
        self.stdout.write('OT (ABC):                  ot_abc / DemoPass123!')
        self.stdout.write('Pharmacy (ABC):            pharmacy_abc / DemoPass123!')
        self.stdout.write('Billing (ABC):             billing_abc / DemoPass123!')
        self.stdout.write('Insurance (ABC):           insurance_abc / DemoPass123!')
        self.stdout.write('Hospital Admin (City):     admin_city / DemoPass123!')
        self.stdout.write('Management (City):         management_city / DemoPass123!')
        self.stdout.write('Doctor/Cardiologist(City): doctor_city / DemoPass123!')
        self.stdout.write('')
        self.stdout.write('Patient login: phone 9876500001 via OTP (dev mode returns the code)')
        self.stdout.write('Family login:  phone 9876500002 via OTP (dev mode returns the code)')
        self.stdout.write(f'Patient LifeLink ID: {patient.lifelink_patient_id}')
        self.stdout.write(f'Admission number:    {admission.admission_number}')
        self.stdout.write('Mock Aadhaar demo number: 999911112222, demo OTP: 111111 (see identity.py)')
