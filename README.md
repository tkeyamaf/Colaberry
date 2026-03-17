# Rule-Based Job Allocation Engine

## Overview
This project implements a backend service that determines whether a student can be allocated to a job while enforcing several business constraints.

The system evaluates multiple rules before allowing an allocation and returns the reason if the allocation is rejected. It also supports job recommendations filtered by the same allocation rules.

## Tech Stack
- Node.js
- TypeScript
- Express
- PostgreSQL
- UUID-based relational schema

## Allocation Rules

### FIT_THRESHOLD
Reject allocation if `fitScore < 70`.

### JOB_CAP
A job can receive at most **12 allocations within 7 days**.

### COMPANY_CAP
A company can receive at most **30 allocations within 7 days**.

### STUDENT_WEEKLY_CAP
A student can receive at most **5 allocations within 7 days**.

### COOLDOWN
A student cannot be reallocated to the same job until 14 days after their last allocation to that job. Bypassed if job status is `REOPENED`.

## API Endpoints

### Check Allocation Eligibility

```
GET /allocate/check?studentId=UUID&jobId=UUID&companyId=UUID&fitScore=NUMBER&jobStatus=OPEN
```

Returns whether an allocation is allowed without writing to the database.

Example response:
```json
{ "allowed": false, "reason": "COMPANY_CAP" }
```

---

### Submit Allocation

```
POST /allocate
Content-Type: application/json
```

Request body:
```json
{
  "studentId": "UUID",
  "jobId": "UUID",
  "companyId": "UUID",
  "fitScore": 85,
  "allocationReason": "MANUAL",
  "allocationStatus": "ACTIVE"
}
```

Runs all allocation rules inside a database transaction with `SELECT ... FOR UPDATE` to prevent race conditions. Inserts into `allocation_ledger` on success.

Responses:
- `201` — allocation created
- `400` — missing or invalid input
- `422` — business rule failure (e.g. `JOB_CAP`, `COOLDOWN`)
- `500` — unexpected error

---

### Get Job Recommendations

```
GET /jobs/recommend?studentId=UUID&fitScore=NUMBER
```

Returns a list of eligible jobs for a student, filtered by allocation rules and ordered by most recently posted.

Example response:
```json
[
  {
    "jobId": "UUID",
    "title": "Software Engineer",
    "company": "Acme Corp",
    "location": "Austin, TX",
    "url": "https://example.com/job",
    "status": "OPEN",
    "fitScore": 85
  }
]
```

---

## Project Structure

```
src/
  config/
    database.ts
  db/
    schema.sql
    runSchema.ts
  services/
    allocationService.ts
    allocationTransactionService.ts
    recommendationService.ts
  index.ts
```

## How to Run

```bash
npm install
npm run dev
```

Server runs on: http://localhost:3000
