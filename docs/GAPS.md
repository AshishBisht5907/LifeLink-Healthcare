# Backend Gaps Found During Frontend Integration — Classification & Resolution

Every gap below was found by actually testing the real API (not by reading
code alone), classified as **A** (frontend workaround), **B** (backend
change required), or **C** (not required for this demo) before any backend
code was touched, per the project's own rule: never silently modify the
backend.

| # | Gap | Class | Resolution |
|---|---|---|---|
| 1 | `ServiceRequestViewSet` — staff only saw their own department's requests, not ones they personally created elsewhere; no query-param filtering | **B** | Extended queryset to include `created_by=user` alongside department match; added `filterset_fields=['admission','patient','status','request_type']`. Completion authority unchanged. 5 new tests. |
| 2 | `AdmissionListSerializer` omits `attending_doctor` | **C** | Staff already see all hospital-wide admissions (a real, authorized dataset); not worth a schema change for this pass. |
| 3 | Refresh-token rotation configured without `token_blacklist` installed — old tokens not actually invalidated | **B** | Added `rest_framework_simplejwt.token_blacklist` to `INSTALLED_APPS` + migration. 1 new test confirms reuse of a rotated-out token now fails. |
| 4 | OTP self-registration always creates `PATIENT` role; no self-service `FAMILY` registration | **C** | Working as designed — family accounts are hospital-provisioned or patient-linked, not self-registered. Documented, not changed. |
| 5 | No direct "my own PatientProfile" endpoint for patient/family (`list()` always `[]`, `search` is staff-only) | **A** | Frontend discovers the patient ID via `family-links/` (FAMILY) or `admissions/` (PATIENT). A patient with zero admissions and no family link has no way to see their own profile — documented as an honest limitation, surfaced as an empty state in the UI. |
| 6 | `ReferralViewSet` returned nothing at all for PATIENT/FAMILY, blocking the required "referral/transfer status" family view | **B** | Added read-only queryset scoping to the patient's own referrals. **Also closed a pre-existing hole** found while fixing this: `update`/`partial_update`/`destroy` had no explicit permission check for anyone. 5 new tests. |
| 7 | Router-ordering bug: `patients/urls.py` registered the empty-prefix `PatientProfileViewSet` before named routes (`family-links`, `allergies`, `history`, `medications`, `emergency-contacts`), so Django matched e.g. `GET /patients/family-links/` as `patient-detail` with `pk="family-links"`, returning a bogus 404. Invisible to all 79 prior tests since none exercised these exact URLs over real HTTP. | **B** | Reordered router registrations (named routes before the empty-prefix catch-all). 8 regression tests added that hit the real URLs directly. |
| 8 | No read-only endpoint for `Transfer`/checklist state — only two mutating POST actions returned it, so viewing the checklist without changing anything meant either faking a `{}` update (which would pollute the audit log with no-op entries) or nothing at all | **B** | Added `GET /api/referrals/{id}/transfer/`, scoped identically to the checklist actions (referral participants + patient/family read-only). Confirmed via test that reading never writes an audit entry. 4 new tests. |
| 9 | Receiving hospital could not view the AI summary attached to a *pending* referral, because before acceptance they have no admission-based access to the patient at all — defeating the entire purpose of an "AI referral summary" | **B** | `AIInsightViewSet.get_object()` now also grants access when the insight is referenced by a `Referral` where the requester's hospital is sender or receiver — additive only, normal patient-based access unchanged. 2 new tests. |

**Total backend test count grew from 69 → 93 across all of the above, all passing from a clean database.**
