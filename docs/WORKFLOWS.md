# Workflows

## Request lifecycle (apps.workflow)

```
REQUESTED → PENDING → APPROVAL_REQUIRED → APPROVED → READY → IN_PROGRESS → COMPLETED
                                                      ↘ POSTPONED ↗
                (BLOCKED, CANCELLED, REJECTED reachable from most states)
```

COMPLETED, CANCELLED, REJECTED are terminal — no transition leaves them.
See `apps/workflow/models.py::ALLOWED_TRANSITIONS` for the exact graph and
`apps/workflow/services.py::transition_request()` for enforcement.

## Referral & transfer

```
Hospital A: create Referral (AI summary auto-attached)
Hospital B: respond → ACCEPTED | REJECTED | CONDITIONAL
  (ACCEPTED/CONDITIONAL → Transfer row created)
Either hospital: update their own side of the Transfer checklist
Hospital B: complete_transfer → new Admission at Hospital B, same PatientProfile
```

## Consent

```
Doctor creates ConsentRequest → linked ServiceRequest sits in APPROVAL_REQUIRED
Patient/authorised family: APPROVE → linked request(s) → APPROVED (not COMPLETED)
                            DECLINE → linked request(s) → REJECTED
                            ASK_DOCTOR → consent stays PENDING
```

## Staff provisioning

```
Hospital Admin: POST /api/staff/provision/ (own hospital only, department validated)
  → creates User + StaffProfile together
Hospital Admin: POST /api/staff/{id}/deactivate/ → is_active=False on both rows
  → existing JWTs for that user are rejected on their very next request
```
