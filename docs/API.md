# API Reference (summary)

Base path: `/api/`. All endpoints except `/api/auth/otp/*`,
`/api/auth/staff/login/`, `/api/auth/token/refresh/`, and
`/api/documents/secure-download/` require `Authorization: Bearer <JWT>`.

## Auth (`/api/auth/`)
- `POST staff/login/` — username+password (+`mfa_code` if MFA enabled)
- `POST otp/request/` — `{phone, purpose}` → sends OTP (dev mode echoes it)
- `POST otp/verify/` — `{phone, purpose, code, full_name?}` → JWT
- `POST identity/aadhaar/verify/` — mock demo identity check
- `POST token/refresh/`
- `GET me/`

## Patients (`/api/patients/`)
- `GET search/?lifelink_patient_id=|phone=` — staff only, exact match only
- `POST create_unclaimed/` — staff only, section 14 flow
- `POST claim/` — `{lifelink_patient_id}`, patient/family only
- `GET {id}/` — access-controlled retrieve (no unrestricted `list`)
- `GET {id}/live_status/` — family-visible active requests only
- `allergies/`, `history/`, `medications/`, `emergency-contacts/`,
  `family-links/` — nested, patient-scoped

## Admissions (`/api/admissions/`)
- `POST /` — staff only, auto-generates admission number
- `POST {id}/discharge/`
- `doctor-notes/`, `nursing-notes/` — hospital-scoped

## Requests (`/api/requests/`) — the workflow engine
- `POST /` — auto-routes to the correct department
- `POST {id}/accept|start|complete|postpone|cancel|reject/` — all
  transitions go through the same server-side state machine

## Consents (`/api/consents/`)
- `POST /` — staff creates a consent request
- `POST {id}/decide/` — `{action: APPROVE|DECLINE|ASK_DOCTOR}`, patient/
  authorised-family only

## Referrals (`/api/referrals/`)
- `POST /` — sending hospital, auto-attaches an AI summary
- `POST {id}/respond/` — `{decision: ACCEPTED|REJECTED|CONDITIONAL, response_note?}`, receiving hospital only
- `POST {id}/checklist/` — `{checklist_updates: {item: bool, ...}}`, ownership-checked per item
- `POST {id}/complete_transfer/` — receiving hospital only, creates new Admission

## Documents (`/api/documents/`)
- `POST /` — multipart upload, type/size validated
- `GET {id}/signed_url/` — short-lived download token
- `GET secure-download/?token=...` — unauthenticated but token-gated

## Staff / Hospitals (`/api/staff/`, `/api/hospitals/`, `/api/departments/`, `/api/capacity/`)
- `POST staff/provision/` — Hospital Admin only, own hospital only
- `POST staff/{id}/activate|deactivate/`

## AI (`/api/ai/`)
- `GET /?patient=<id>` — list generated insights
- `POST generate_emergency_summary/` — `{patient}`
- `GET missing_information/?patient=<id>`

## Audit (`/api/audit/`)
- `GET /` — read-only, hospital-scoped

Full request/response shapes are in each app's `serializers.py` — this
document is a map, not a full OpenAPI spec (no `drf-spectacular`/swagger
wired in this build).
