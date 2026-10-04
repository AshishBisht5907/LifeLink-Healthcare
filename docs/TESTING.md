# Testing

Run from `apps/backend`:

```bash
./venv/bin/python -m pytest tests/ -v
```

## Current status (last full run, clean database)

**69 / 69 passing.**

Ran by dropping and recreating both the application database and the
pytest test database, then migrating from zero migrations, to confirm the
schema and test suite both work from a genuinely clean state — not just
against a database that had accumulated state from earlier runs.

## Coverage by file

- `test_rbac_isolation.py` — doctor cannot access unauthorized patients,
  Hospital A cannot view Hospital B's patients, family sees only their
  linked patient, family Live Status excludes internal-only requests, a
  user cannot change their own role via the API.
- `test_workflow_state_machine.py` — auto-routing, correct-department
  completion, wrong-department/management rejection, postponed requests
  can never become COMPLETED, COMPLETED is a true terminal state, only a
  genuinely completed surgery promotes to permanent history.
- `test_consent_and_audit.py` — consent approval moves a request to
  APPROVED (never COMPLETED), decline rejects the linked request, a
  resolved consent can't be re-decided, staff cannot decide consent on the
  patient's behalf, audit log immutability (model-layer, not just
  permission-layer), audit API has no write routes, Hospital Admin only
  sees their own hospital's audit trail.
- `test_referrals_and_transfer.py` — referral create (with an
  auto-attached AI summary), ACCEPT / REJECT / CONDITIONAL response, only
  the receiving hospital can respond, an unrelated third hospital can't
  even see the referral, can't respond twice, patient role can't respond;
  full transfer workflow creates a new Hospital B admission against the
  same PatientProfile while leaving Hospital A's admission untouched;
  checklist ownership is enforced per item (a hospital can't mark the
  other side's item, mixed authorized/unauthorized requests are rejected
  atomically, unknown item keys are rejected, each item records who set it
  and when); Hospital A cannot write notes on or retrieve Hospital B's new
  admission.
- `test_staff_provisioning.py` — Hospital Admin can provision staff in
  their own hospital (with the right coarse `User.role` derived from
  `staff_role`); non-admin/management cannot provision staff at all;
  cross-hospital department assignment is rejected; a Hospital-B admin
  can't see or deactivate Hospital-A staff; deactivate/activate works and
  a deactivated account's existing JWT is rejected on the very next
  request; ordinary staff cannot view or edit the staff endpoint at all
  (so they can't touch their own role/hospital/department); an admin
  cannot smuggle a different `hospital` value through an update payload;
  duplicate usernames are rejected.
- `test_ai_insights.py` — every fact has a source reference; fact text
  matches the actual stored record; missing information is flagged, not
  guessed; conflicting blood group reports are flagged and never silently
  resolved; only VERIFIED history entries are surfaced as fact; the number
  of fact-bullets can never exceed the number of reference rows (the
  concrete anti-fabrication check); there is no API path to store
  arbitrary free text as an AI insight.
- `test_uploads_and_auth.py` — file type/size validation, account lockout
  after 5 failed logins (and the correct password is still refused while
  locked), no username-enumeration in the login error message.

## Known gaps (not yet covered)

- No load/performance testing.
- No frontend tests (no frontend exists yet).
- The AI engine's `generate_referral_summary`-style reuse inside
  `ReferralViewSet.create()` is exercised indirectly (via the referral
  tests) but doesn't have a dedicated unit test for that call site.
- No test exercises `Notification` delivery beyond the in-app model layer.
