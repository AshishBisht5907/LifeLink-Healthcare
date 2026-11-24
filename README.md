# 🏥 LifeLink
### *Connected Care. Better Tomorrow.*

<p align="center">
  A Patient-Centric Emergency Health & Hospital Care Coordination Platform
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img src="https://img.shields.io/badge/React-TypeScript-blue?logo=react" />
  <img src="https://img.shields.io/badge/Python-Django-green?logo=django" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL-316192?logo=postgresql" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

---

## 🌐 About

**LifeLink** is a full-stack healthcare coordination platform that connects patients, families, hospital staff, management, and administrators through one secure system.

It aims to simplify hospital workflows, improve patient information access, and make healthcare coordination more transparent.

## ✨ Key Features

- 👨‍⚕️ **Role-Based Dashboards** — Separate portals for patients, families, staff, management, and admins.
- 🔐 **Secure Authentication** — JWT authentication with httpOnly cookies.
- 🏥 **Hospital Isolation** — Hospital and department-level access control.
- 📋 **Patient Records** — Secure patient information and access management.
- 🤝 **Consent Management** — Patient-controlled access approval.
- 🔄 **Referral & Transfer** — Hospital coordination workflows.
- 📊 **Audit Logs** — Immutable activity records.
- 🤖 **AI Insights** — Database-based summaries with source references.
- 👥 **Staff Management** — Hospital staff provisioning and activation.

## 🛠️ Tech Stack

| Frontend | Backend | Database & Tools |
|---|---|---|
| Next.js 16 | Python | PostgreSQL |
| React | Django REST Framework | SQLite |
| TypeScript | JWT Authentication | Git & GitHub |
| Tailwind CSS | Python | Pytest, Playwright |

## 🏗️ Project Structure

```text
LifeLink/
├── apps/
│   ├── backend/       # Django REST API
│   └── web/           # Next.js Frontend
├── docs/              # Project documentation
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Python 3.12+
- Node.js and npm
- Git
- SQLite or PostgreSQL

### 1. Clone Repository

```bash
git clone https://github.com/AshishBisht5907/LifeLink-Healthcare.git
cd LifeLink-Healthcare
```

### 2. Backend Setup

Run all commands from the project root:

```bash
cd apps/backend

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

python manage.py migrate
python manage.py seed_demo

python manage.py runserver 127.0.0.1:8000
```

Backend: `http://127.0.0.1:8000`

### 3. Frontend Setup

Open a **new terminal** from the project root:

```bash
cd apps/web

npm install

cp .env.example .env.local

npm run dev
```

For production:

```bash
npm run build
npm start
```

Frontend: `http://localhost:3000`

**Environment:** Set `DJANGO_API_URL=http://127.0.0.1:8000` in `apps/web/.env.local`.

## 🔒 Security

- JWT-based authentication.
- Secure httpOnly cookie sessions.
- Backend-enforced role permissions.
- Hospital and department-level data isolation.
- Patient consent and access validation.
- Immutable audit logs.

## 🧪 Testing

**Backend:**

```bash
cd apps/backend
python -m pytest tests/ -v
```

**Frontend:**

```bash
cd apps/web
npm install
npx next build
```

## ⚠️ Implementation Notes

- AI summaries use database retrieval and organization, not live LLM API calls.
- OTP supports mock mode and an implemented Twilio integration requiring credentials.
- Aadhaar verification is demo-only; no UIDAI integration.
- S3 storage, Celery/Redis, WebSockets, and React Native are not implemented.

## 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Security](docs/SECURITY.md)
- [AI Engine](docs/AI.md)
- [Workflows](docs/WORKFLOWS.md)
- [Demo Guide](docs/DEMO_GUIDE.md)
- [Testing](docs/TESTING.md)
- [Known Gaps](docs/GAPS.md)

---

<p align="center">
  **LifeLink — Connected Care. Better Tomorrow.**  
  <br/>
  *Making healthcare more secure, connected, and accessible.*
</p>
