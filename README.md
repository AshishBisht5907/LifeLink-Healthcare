# LifeLink — Connected Care. Better Tomorrow.

A patient-centric emergency health & hospital care coordination platform.
**Full stack is now implemented and live-tested: Django REST backend +
Next.js 16 (TypeScript) frontend.**

## What's real vs. what's mocked

| Area | Status |
|---|---|
| Django models / migrations / PostgreSQL schema | Real |
| JWT auth, RBAC, hospital/department isolation | Real, tested (backend + re-verified through the frontend proxy) |
| Workflow state machine (approval ≠ completion) | Real, tested, and live-demonstrated in the UI |
| Consent workflow | Real, tested, full UI (create → approve/decline/ask-doctor) |
| Referral & transfer coordination, incl. ownership-checked checklist | Real, tested, full UI |
| Hospital Admin staff provisioning/activation | Real, tested, full UI |
| Audit log (immutable) | Real, tested, full UI viewer |
| AI summary engine | Real retrieval-and-organize logic over actual DB records with mandatory source references — no live LLM call (see `docs/AI.md`) |
| Next.js frontend | **Built.** Role-based dashboards for Patient/Family, Hospital Staff, Hospital Management, Hospital Admin — see `apps/web` |
| Session security | httpOnly cookies minted server-side by Next.js route handlers; the browser never sees a JWT. All API calls proxy through `/api/proxy/*`, which attaches the Bearer token and transparently refreshes on 401 |
| OTP delivery | Provider abstraction is real; only a mock/dev provider is wired (no real SMS sent) |
| Aadhaar identity verification | **Mock/demo only** — no real UIDAI integration |
| S3 storage, Celery/Redis, WebSockets | Not implemented — documents use local disk storage |
| React Native mobile app | Not built (out of scope for this pass — see `docs/DEMO_GUIDE.md`) |

## Project structure

```
lifelink/
  apps/
    backend/              # Django project
      config/
      apps/                # accounts, hospitals, patients, admissions, workflow,
                            # consents, referrals, documents, notifications, audit, ai_insights
      tests/               # 93 automated tests
    web/                   # Next.js 16 + TypeScript frontend
      src/
        app/                # role-based route groups: portal, staff, management, admin
        components/         # ui/ (design system), layout/ (shell, nav, guards),
                             # records/ (shared patient/admission/request views)
        lib/                # api.ts (typed client), types.ts, session.ts, useApi.ts
        context/            # AuthContext
  docs/
    ARCHITECTURE.md, API.md, SECURITY.md, AI.md, WORKFLOWS.md,
    DEMO_GUIDE.md, TESTING.md, FRONTEND.md, GAPS.md
```

## Running LifeLink

**1. Backend:**
```bash
cd apps/backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env
# Postgres must be running and the database in .env must already exist
./venv/bin/python manage.py migrate
./venv/bin/python manage.py seed_demo
./venv/bin/python manage.py runserver
```

**2. Frontend** (in a second terminal):
```bash
cd apps/web
npm install
cp .env.example .env.local
npm run build && npm start
# or for development: npm run dev
```

Open http://localhost:3000 — role selection screen. See `docs/DEMO_GUIDE.md` for demo credentials.

Run backend tests: `cd apps/backend && ./venv/bin/python -m pytest tests/ -v` (93 tests).
Run frontend build check: `cd apps/web && npx next build`.
