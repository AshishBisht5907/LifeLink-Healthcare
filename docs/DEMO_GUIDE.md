# Demo Guide

```bash
cd apps/backend
./venv/bin/python manage.py migrate
./venv/bin/python manage.py seed_demo
./venv/bin/python manage.py runserver
```

## Demo credentials (dev only)

| Role | Username | Password |
|---|---|---|
| Hospital Admin (ABC) | `admin_abc` | `DemoPass123!` |
| Management (ABC) | `management_abc` | `DemoPass123!` |
| Doctor (ABC) | `doctor_abc` | `DemoPass123!` |
| Radiology (ABC) | `radiology_abc` | `DemoPass123!` |
| Lab (ABC) | `lab_abc` | `DemoPass123!` |
| Ward (ABC) | `ward_abc` | `DemoPass123!` |
| OT (ABC) | `ot_abc` | `DemoPass123!` |
| Pharmacy (ABC) | `pharmacy_abc` | `DemoPass123!` |
| Billing (ABC) | `billing_abc` | `DemoPass123!` |
| Insurance (ABC) | `insurance_abc` | `DemoPass123!` |
| Hospital Admin (City) | `admin_city` | `DemoPass123!` |
| Management (City) | `management_city` | `DemoPass123!` |
| Doctor/Cardiologist (City) | `doctor_city` | `DemoPass123!` |

Patient login: phone `9876500001` via `/api/auth/otp/request/` + `/api/auth/otp/verify/` (dev mode echoes the OTP in the response).
Family login: phone `9876500002`, same flow.
Mock Aadhaar demo identity: number `999911112222`, demo OTP `111111`.

## What's pre-loaded

- Two hospitals: ABC General Hospital, City Care Hospital.
- Patient Rahul Sharma (`LL-P-100001`), with an allergy, an active
  medication, an emergency contact, and one active admission at ABC.
- A completed CT scan request (full REQUESTED → COMPLETED lifecycle).
- A surgery request that went through consent approval and was then
  POSTPONED — demonstrating "approved ≠ completed" concretely.
- A completed blood test.
- A pending referral from ABC to City Care Hospital, with an
  auto-generated AI summary attached.

## Suggested walkthrough

1. Log in as `doctor_abc`, `GET /api/patients/<id>/` — see the doctor's
   view of the patient (find the ID via `GET /api/patients/search/?lifelink_patient_id=LL-P-100001`).
2. `GET /api/ai/?patient=<id>` — see the AI emergency summary with its
   source references.
3. Log in as `family_rahul`'s account (phone `9876500002` via OTP) —
   `GET /api/patients/<id>/live_status/` and note the surgery request does
   NOT show up as "completed", only as postponed/pending.
4. Log in as `management_city`, `GET /api/referrals/` — see the incoming
   referral, then `POST /api/referrals/<id>/respond/` with
   `{"decision": "ACCEPTED"}`.
5. `POST /api/referrals/<id>/checklist/` as `management_abc` (sender-owned
   items) and `management_city` (receiver-owned items) — try swapping
   which hospital sets which item and see the 403.
6. `POST /api/referrals/<id>/complete_transfer/` as `management_city` —
   a brand-new Admission appears at City Care Hospital, same PatientProfile.
7. Log in as `admin_abc`, `POST /api/staff/provision/` to create a new
   staff account, then `POST /api/staff/<id>/deactivate/`.
