# CareerBridge — Your Bridge to the Career You Deserve

## Overview

CareerBridge is a full-stack job matching platform that connects candidates with personalized job opportunities. It uses AI-powered resume parsing, deterministic fit scoring, and gap analysis to surface the right jobs for each user — and help them strengthen their profile for roles they're close to qualifying for.

## Live Site

**[https://job-allocation-system.onrender.com](https://job-allocation-system.onrender.com)**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express |
| Database | PostgreSQL (hosted on Render) |
| Authentication | JWT + bcryptjs |
| Email | Nodemailer + Gmail |
| AI Features | Anthropic Claude API (Haiku + Opus) |
| Job Listings | JSearch API (RapidAPI) |
| Frontend | Vanilla HTML, CSS, JavaScript (SPA) |
| Hosting | Render (backend + DB) |

---

## Features

### User Accounts
- Sign up with full name, email, and password
- Welcome email sent on signup
- JWT-based authentication (7-day tokens)
- Persistent login via localStorage

### Resume Upload & AI Profile Auto-Fill
- Upload a resume in **PDF, DOCX, DOC, or TXT** format — or paste the text directly
- Backend extracts plain text from uploaded files using `pdf-parse` and `mammoth`
- Claude Haiku parses the resume text and auto-fills:
  - Skills tags
  - Target job titles
  - Job type preference
  - Professional summary
- Resume upload is the first thing shown on the profile page to minimize manual typing

### Profile
- Full profile form: personal info, job preferences, skills, education, online presence
- Tag inputs for skills, target job titles, certifications, and industries
- Profile data saved to the `users` table and used for job matching

### Job Listings
- Real job listings pulled from JSearch API (LinkedIn, Indeed, Glassdoor)
- Server-side in-memory cache (1-hour TTL) to minimize API calls
- Search by keyword, filter by location
- Save jobs and apply directly from the listing

### Personalized Job Recommendations
- `GET /api/jobs/recommended` — fully server-side, auth-required
- Deterministic fit scoring (0–100) based on:
  - **Skills match** (0–40 pts) — profile skills vs. job text
  - **Title alignment** (0–40 pts) — target titles vs. job title
  - **Job type match** (0–20 pts)
- Jobs scoring **≥ 40** appear in the main recommendations list
- Jobs scoring **< 40** but matching a target title appear in the **Gap Analysis** section

### Gap Analysis & Enhanced Resume
- For near-miss target-role jobs, the app shows:
  - Your fit score with a color-coded badge
  - Why you didn't qualify (missing skills, title mismatch, etc.)
  - Missing skill badges (red) and present skill badges (green)
- **Enhance Resume** button opens a modal where Claude Opus rewrites your existing resume using the job's language — without fabricating any skills or experience
- Honesty banner baked into every enhanced resume output

### Dashboard
- Email-based identity display
- Saved jobs count and list
- Recent applications tracker
- Profile completion status

### AI Interview Prep
- Generate custom interview questions for any job
- Powered by Claude Opus
- Tailored to the specific job title and description

### Email Notifications
- Welcome email on account creation
- Interview readiness alerts sent to applicant email

---

## API Endpoints

### Auth
```
POST /api/auth/signup          — Create account, get JWT
POST /api/auth/login           — Login, get JWT
GET  /api/auth/me              — Get current user profile (auth required)
```

### Jobs
```
GET  /api/jobs                 — List jobs (supports ?search=&location=)
GET  /api/jobs/recommended     — Personalized recommendations with fit scores (auth required)
POST /api/jobs/save            — Save a job (auth required)
DELETE /api/jobs/save/:jobId   — Unsave a job (auth required)
GET  /api/jobs/saved           — Get saved jobs (auth required)
POST /api/jobs/apply           — Apply to a job (auth required)
GET  /api/jobs/applications    — Get applications (auth required)
```

### Profile
```
PUT  /api/profile              — Save profile fields: skills, target titles, job type, summary (auth required)
GET  /api/dashboard            — Get dashboard data (auth required)
```

### AI
```
POST /api/ai/resume-extract    — Extract plain text from uploaded PDF/DOCX/DOC/TXT
POST /api/ai/resume-parse      — Parse resume text → structured profile fields
POST /api/ai/resume-enhance    — Rewrite resume for a target role (no fabrication)
POST /api/ai/resume            — Generate a full AI resume from profile data
POST /api/ai/interview-prep    — Generate interview questions for a job
```

### Allocation
```
GET  /allocate/check           — Check eligibility without writing to DB
POST /allocate                 — Submit allocation (full transaction)
```

### Notifications
```
POST /api/notifications/interview — Send interview alert email
```

---

## Fit Scoring Logic

Scoring is fully deterministic — no AI involved in scoring decisions.

| Component | Max Points | How It's Calculated |
|---|---|---|
| Skills match | 40 | Profile skills matched against a 50-term curated vocabulary found in the job text |
| Title alignment | 40 | User's target job titles matched against the job title |
| Job type match | 20 | Profile job type preference vs. job's employment type |
| **Total** | **100** | **≥ 40 = qualified, < 40 = gap card shown if title match > 0** |

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | Accounts, JWT auth, and structured profile fields (skills, target titles, job type, summary) |
| `students` | Student records for allocation engine |
| `companies` | Company records |
| `jobs` | Job listings |
| `allocation_ledger` | All allocation records with rule enforcement |
| `candidates` | Extended candidate profiles |
| `saved_jobs` | Jobs saved by users |
| `job_applications` | Applications submitted by users |

---

## Environment Variables

```env
DATABASE_URL=postgresql://...
PORT=3000
RAPIDAPI_KEY=...           # JSearch API key from RapidAPI
ANTHROPIC_API_KEY=...      # Claude AI API key
EMAIL_FROM=...             # Gmail address for sending emails
EMAIL_APP_PASSWORD=...     # Gmail App Password
JWT_SECRET=...             # Secret key for signing JWT tokens
```

---

## Project Structure

```
src/
  config/
    database.ts
  db/
    schema.sql
    migration_v2.sql
    migration_v3.sql
    migration_v4.sql
    migration_v5.sql
    migration_v6.sql        — adds skills, target_job_titles, job_types, summary to users
    runSchema.ts
    runMigrationV2.ts – runMigrationV6.ts
    seed.sql
  routes/
    auth.ts                 — signup, login, /me
    jobs.ts                 — job listings + /recommended
    savedJobs.ts            — save/unsave, dashboard, PUT /profile
    ai.ts                   — resume extract, parse, enhance, interview prep
    candidates.ts
    notifications.ts
  services/
    fitScoringService.ts    — deterministic scoring + gap analysis
    allocationService.ts
    allocationTransactionService.ts
    recommendationService.ts
    jobImportService.ts
  index.ts

public/
  index.html                — single-page app shell
  styles.css
  app.js                    — all frontend logic (hash routing, API calls, UI)
```

---

## How to Run Locally

```bash
npm install
npm run dev
```

Server runs on: `http://localhost:3000`

### Database Setup

```bash
npm run db:schema       # Create core tables
npm run db:migrate      # Run migration v2
npm run db:migrate3     # Run migration v3
npm run db:migrate4     # Run migration v4
npm run db:migrate5     # Run migration v5
npm run db:migrate6     # Run migration v6 (profile fields)
```

---

## Deployment

Hosted on **Render** with a managed PostgreSQL database.

- Push to `main` branch triggers auto-deploy
- Build command: `npm install && npm run build`
- Start command: `npm start`
- After first deploy with migration v6, run: `npm run db:migrate6` pointed at the Render DB

---

**Last Updated**: 2026-03-31
