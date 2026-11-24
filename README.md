<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0284c7,100:0ea5e9&height=210&section=header&text=LifeLink&fontSize=64&fontColor=ffffff&fontAlignY=38&desc=Connected%20Care.%20Better%20Tomorrow.&descSize=20&descAlignY=60&animation=fadeIn" width="100%" alt="LifeLink Banner" />
</div>

<div align="center">

**A patient-centric emergency health & hospital care coordination platform.**  
**Full-stack implementation: Django REST backend + Next.js 16 (TypeScript) frontend. Current build/test status is tracked by GitHub Actions on pull requests.**

![Django REST](https://img.shields.io/badge/Backend-Django_REST-092E20?style=for-the-badge&logo=django&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Frontend-Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_%7C_SQLite-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Auth](https://img.shields.io/badge/Auth-httpOnly_Proxy-10B981?style=for-the-badge&logo=jsonwebtokens&logoColor=white)

</div>

---

## 🏗️ System Architecture & Proxy Security Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Patient / Staff / Admin)
    participant Next as Next.js 16 Frontend (/api/proxy/*)
    participant Django as Django REST Backend (127.0.0.1:8000)
    participant DB as PostgreSQL / SQLite

    User->>Next: Interacts with Role Dashboard
    Note over Next: Reads server-side httpOnly cookie<br/>(Browser never sees a JWT)
    Next->>Django: Attaches Bearer token & forwards request
    Django->>DB: Enforces RBAC, hospital/department isolation & audit log
    DB-->>Django: Verified record / workflow state
    Django-->>Next: JSON response (transparently refreshes on 401)
    Next-->>User: Renders live UI state
