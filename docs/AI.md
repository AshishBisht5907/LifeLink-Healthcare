# AI Layer — what's actually built

## Honest summary

`apps/ai_insights/engine.py` implements the **retrieval** and
**organization** parts of a RAG pipeline, but does **not** call a live LLM.

Why: this environment has no way to hold a real model-provider API key for
server-to-server calls, and the spec itself (section 29) forbids sending
private patient data to an external AI provider without a compliant
pathway. So instead of faking it, the engine does something more honest:
it walks real database rows and composes text deterministically, with a
mandatory `AIReference` row behind every sentence it writes.

To upgrade this to a real LLM call later: replace
`_compose_summary_text()` with a call to a compliant model, passing it
*only* the already-retrieved `facts` list as context. Nothing about the
retrieval, traceability, or safety scaffolding around it needs to change.

## What is enforced today (verified by `tests/test_ai_insights.py`)

- **Source references**: every fact in `AIInsight.content_text` has a
  corresponding `AIReference` row. The number of "fact" bullets in the
  generated text can never exceed the number of reference rows — this is
  checked directly in tests, not just asserted in docs.
- **Missing information**: if a field has no data (allergies, emergency
  contact, verified history), the summary says `MISSING / NOT VERIFIED`
  rather than omitting it silently or guessing.
- **Conflicting information**: if two `BloodGroupReport` rows disagree, the
  patient's `blood_group` field is cleared and `blood_group_verification`
  is set to `CONFLICT` — the AI summary reports the conflict and both
  values, and never silently picks one (see `apps/patients/services.py::add_blood_group_report`).
- **Verification gating**: `MedicalHistoryEntry` rows are only surfaced as
  confirmed facts if `verification_status == VERIFIED`. Pending/unverified
  history is excluded from the "facts" section and instead counted toward
  the missing-information list.
- **No free-text write path**: `AIInsightViewSet` is a
  `ReadOnlyModelViewSet` plus one `generate_emergency_summary` action that
  only ever calls the engine — there is no endpoint where a client can POST
  arbitrary text and have it stored as an "AI insight".

## Mock identity verification (Aadhaar) — separate from the AI layer

`apps/accounts/identity.py` implements `MockAadhaarProvider`: a small,
seeded, deterministic lookup table. It is not connected to any real UIDAI
API, never receives or stores a real Aadhaar number beyond what's needed to
check against the seeded demo table, and every API response that surfaces
it is labeled `"is_mock": true`. A real provider would be dropped in behind
the same `IdentityVerificationProvider` interface without touching calling
code.
