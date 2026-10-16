# Demo Guide

```bash
cd apps/backend
./venv/bin/python manage.py migrate
./venv/bin/python manage.py seed_demo
./venv/bin/python manage.py runserver
```

## End-to-end workflow validation (college demo)

Run the backend tests from `apps/backend`:

```bash
./venv/bin/python -m pytest tests/test_workflow_state_machine.py tests/test_patient_me_summary.py tests/test_otp_providers.py -v
```

The workflow regression test `test_patient_request_waits_for_management_then_routes_to_department` exercises the actual Django API in this order:

1. Patient submits a CT scan request for their own active admission.
2. The backend auto-routes it to Radiology and notifies management.
3. Management sees the request and accepts it.
4. Radiology sees the request only after management acceptance.
5. Radiology starts and completes the work; management cannot falsely complete a clinical request.
6. The patient sees the final status and the full REQUESTED → APPROVED → IN_PROGRESS → COMPLETED transition history.

For a browser smoke test, run `npm run build`, `npm run start`, then in another terminal run `npm run test:e2e` from `apps/web`. The Playwright test covers the real Next.js home → patient login → family registration → OTP UI flow while stubbing auth HTTP responses. It does not send an SMS or replace the backend API integration tests.

## Optional real SMS setup

The default college-demo configuration uses `OTP_PROVIDER=mock` and `OTP_DEV_MODE=True`; no SMS is sent. To test actual delivery, use a Twilio account and a sender number enabled for your account. In `apps/backend/.env`, set:

```dotenv
OTP_PROVIDER=twilio
OTP_DEV_MODE=False
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
```

Use an E.164 destination number such as `+1xxxxxxxxxx`. Keep credentials out of GitHub. Real delivery cannot be validated until valid credentials, a permitted sender, and a reachable SMS API are supplied. Aadhaar remains a demo-only mock; do not use real Aadhaar data in this college project.

---

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
New family account: open `/login/family`, enter the patient's LifeLink ID, verify the phone using the development OTP, then have the patient open **Family access** and activate the pending link. The patient-activated Full representative link grants profile access; procedure consent is a separate workflow.
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
