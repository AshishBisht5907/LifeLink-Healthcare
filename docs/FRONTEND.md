# Frontend — Implemented Pages & Connected APIs

Next.js 16 (App Router) + TypeScript + Tailwind v4. No mock data — every
page fetches from the real Django API via `/api/proxy/*`.

## Pages implemented

**Auth:** `/` (role selection), `/login`, `/login/staff` (username+password, MFA-aware), `/login/patient` (OTP login/register), `/redirect` (post-login role dispatch)

**Patient/Family Portal:** `/portal` (blood group, allergies, medicines, live status, referral status, AI summary), `/portal/consents`, `/portal/consents/[id]` (approve/decline/ask-doctor)

**Hospital Staff:** `/staff` (department queue + self-created requests), `/staff/patients` (search + register), `/staff/patients/[id]`, `/staff/patients/new`, `/staff/admissions`, `/staff/admissions/[id]` (full record: overview, patient summary, history, requests with actions, consents, notes), `/staff/consents` (read-only)

**Hospital Management:** `/management` (live operational overview: active admissions, pending requests, emergency-priority list, department workload, pending referrals), `/management/patients` + `/new` + `/[id]`, `/management/admissions` + `/[id]`, `/management/requests` (filterable), `/management/referrals` + `/[id]` (accept/reject/conditional, ownership-checked checklist, complete transfer) + `/new`, `/management/capacity`

**Hospital Admin:** `/admin` (staff/department/audit stats — no clinical data), `/admin/staff` (provision, activate, deactivate), `/admin/departments` (list/create), `/admin/audit` (filterable log)

**Shared:** `/notifications` (list + mark read)

## Connected APIs (all live-tested, not assumed)

`auth/*`, `patients/*` (search, create_unclaimed, claim, live_status, family-links, allergies, history, medications, emergency-contacts), `admissions/*` (incl. doctor/nursing notes), `requests/*` (all 6 transitions), `consents/*`, `referrals/*` (respond, checklist, transfer, complete_transfer), `hospitals/*`, `departments/*`, `staff/*` (provision, activate, deactivate), `capacity/*`, `ai/*`, `notifications/*`, `audit/*`

## Architecture notes

- **Session security:** JWTs live in httpOnly cookies minted by dedicated Next.js route handlers (`/api/auth/staff-login`, `/api/auth/otp-verify`); the browser never sees a token. All other calls go through a single catch-all proxy (`/api/proxy/[...path]`) that attaches `Authorization: Bearer` server-side and transparently retries once on 401 after a token refresh.
- **RBAC is never re-implemented client-side** — every "can this role do X" check that matters is enforced by the Django backend; the frontend's own checks (e.g. hiding a "Mark Completed" button for the wrong department) are UX conveniences only, verified not to be the actual security boundary.
- **Shared components stay role-safe on reuse:** `ServiceRequestList` defaults to display-only (`interactive` must be explicitly passed by a staff/management page); `PatientSummaryCard` is safe to reuse everywhere because the backend itself already returns a role-appropriate shape.
