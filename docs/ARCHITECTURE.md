# Architecture

## The core split: PatientProfile vs Admission

- **PatientProfile** (`apps.patients`) is the permanent, cross-hospital
  record. Only clinically-important, *verified* facts live here.
- **Admission** (`apps.admissions`) is the hospital-specific case file for
  one stay. All operational noise (notes, requests, in-progress work)
  lives here and never automatically leaks into PatientProfile.

Promotion from Admission → PatientProfile happens only at defined points —
e.g. a completed surgery writes a `MedicalHistoryEntry` (see
`apps/workflow/services.py::_promote_surgery_to_history`). Nothing is
promoted just because it was *requested* or *approved*.

## The workflow engine (apps.workflow)

Every department request/task is a `ServiceRequest`. State transitions are
enforced through a single choke point, `transition_request()` in
`apps/workflow/services.py`:

- Only allow-listed transitions succeed (`ALLOWED_TRANSITIONS`) — approval
  is never completion, and terminal states (COMPLETED/CANCELLED/REJECTED)
  can never be left.
- Completion authority is checked server-side (`_can_complete()`) — only
  staff in the correct department (or management, for administrative task
  types only) can mark a request COMPLETED.
- Every transition writes an immutable `StatusTransition` row and an
  `AuditLog` entry.

Auto-routing (`ROUTING_RULES`) sends each request type to the correct
department without management manual intervention.

## RBAC

There is no "trust the client's chosen role" anywhere. `User.role` is a
coarse routing hint set only by a privileged flow (Hospital Admin
provisioning staff, or OTP/identity verification for patient/family).
Every view re-derives access from the database:

- `apps/patients/access.py::user_can_access_patient()` / `user_can_access_admission()`
  are the single source of truth for "can this user see this patient/admission",
  used consistently across patients, admissions, workflow, consents, documents.
- Hospital isolation is enforced at the queryset level wherever possible
  (so an out-of-scope object 404s, not just 403s).
- `apps/accounts/permissions.py` holds the reusable DRF permission classes.

## Referral & Transfer (apps.referrals)

- `Referral`: Hospital A → Hospital B, carries an AI-generated,
  source-linked summary (not the sending hospital's whole internal file).
- Response flow: `respond()` action supports ACCEPTED / REJECTED /
  CONDITIONAL, restricted to the *receiving* hospital only.
- `Transfer`: created on accept/conditional-accept. Its `checklist` is a
  dict of item → `{done, set_by_user_id, set_by_hospital_id, at}`, with
  ownership enforced server-side per item (`apps/referrals/checklist.py`)
  — a hospital can never mark the other side's checklist item complete,
  and a mixed authorized/unauthorized request is rejected atomically
  (nothing partially applies).
- `complete_transfer()`: only the receiving hospital can call this; it
  creates a **new** `Admission` at Hospital B, pointing at the **same**
  `PatientProfile`. Hospital A's own admission is untouched, and Hospital A
  staff cannot access or modify the new Hospital B admission afterward
  (ordinary hospital-scoped access control applies to it like any other
  admission).

## Hospital Admin staff provisioning (apps.hospitals)

- `StaffProfileViewSet` is gated by `IsHospitalAdmin` for *every* action,
  including list/retrieve — ordinary staff cannot view or edit staff
  records at all, which also means they cannot edit their own.
- `provision()` action creates the `User` + `StaffProfile` together. The
  admin's own hospital is always used server-side (`admin_staff.hospital`)
  — there is no field in the request that lets a client choose a different
  hospital.
- `department` is validated to belong to the admin's own hospital before
  provisioning succeeds.
- `activate()` / `deactivate()` actions flip both `StaffProfile.is_active`
  and `User.is_active`. Because `rest_framework_simplejwt` checks
  `user.is_active` on every request, a deactivated account's existing JWT
  stops working immediately — not just at next login.
- `hospital` is a read-only field on `StaffProfileSerializer`, and the view
  always overrides it server-side on create/update — so a hospital cannot
  be smuggled through the request body even for the admin's own account.

## AI layer (apps.ai_insights)

See `docs/AI.md`.

## Audit trail (apps.audit)

`AuditLog.save()`/`.delete()` raise `ValueError` on any attempted update or
delete — this is enforced at the model layer, not just via permissions, so
it holds even if a future admin script bypasses the API. The DRF viewset is
`ReadOnlyModelViewSet`, so there is no write route at all.
