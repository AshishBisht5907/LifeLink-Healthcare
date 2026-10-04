# Security — what's implemented, what's not

## Implemented and tested

- Password hashing via Django's default (PBKDF2).
- Real TOTP MFA (`pyotp`) for staff/management/admin accounts, verified on
  login when `mfa_enabled` is set.
- Account lockout after 5 failed logins (15 minutes), tested.
- JWT auth (`djangorestframework-simplejwt`), short-lived access tokens
  (15 min), rotating refresh tokens, blacklist-on-rotation.
- Deactivating a `StaffProfile`/`User` invalidates existing JWTs
  immediately (simplejwt checks `user.is_active` per request) — tested.
- CORS locked to an explicit allow-list, CSRF/session cookies HttpOnly,
  `X-Frame-Options: DENY`, HSTS/SSL-redirect/secure-cookies in
  non-DEBUG mode.
- Rate limiting: separate throttle scopes for anonymous, authenticated,
  OTP requests, and staff login, to stop one flow's rate limit from
  starving another's.
- File upload validation: allow-listed MIME types, max size, both
  enforced server-side regardless of client-reported content-type.
- Signed, short-lived (5 min) document download URLs
  (`django.core.signing.TimestampSigner`) instead of a permanently public
  media URL.
- Object-level and queryset-level hospital/department/patient scoping
  throughout — see `apps/patients/access.py`, `apps/accounts/permissions.py`.
- Immutable audit log, enforced at the model layer (`AuditLog.save()`/
  `.delete()` raise on any attempted mutation), not just via permissions.
- Centralized exception handling — no raw stack traces returned to clients
  (`apps/accounts/exceptions.py`).
- No client-supplied `role`/`hospital` field is ever trusted — every
  privileged write derives hospital/role from the authenticated user's own
  `StaffProfile`, not from request data.

## Explicitly NOT implemented in this build

- No antivirus/malware scanning of uploaded files (only type/size checks).
- No real SMS/OTP provider wired (mock only — see `apps/accounts/otp.py`).
- No real Aadhaar/UIDAI integration (mock only — see `apps/accounts/identity.py`).
- No S3/object storage — documents are on local disk (`MEDIA_ROOT`).
- No WAF, no dependency vulnerability scanning, no formal penetration
  test. What exists is a code-level security review against this
  checklist, not an adversarial security audit.
- No encryption-at-rest configuration for PostgreSQL (that's an
  infrastructure/deployment concern, not application code).
- `DEBUG=True` and a placeholder `SECRET_KEY` ship in `.env.example` —
  both **must** be changed before any non-local deployment.

## Digital consent — legal note

The consent workflow (`apps/consents`) records who approved what, when,
from what IP/device, and links the decision to a specific document
version. It does **not** itself certify legal validity of a signature —
that depends on hospital policy and a legally-recognised e-signature
mechanism sitting on top of this record, per the spec's own instruction
(section 20).
