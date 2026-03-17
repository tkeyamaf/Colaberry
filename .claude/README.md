# Rule-Based Job Allocation Engine

## Overview
This project implements a backend service that determines whether a student can be allocated to a job while enforcing several business constraints.

The system evaluates multiple rules before allowing an allocation and returns the reason if the allocation is rejected.

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
A student cannot be reallocated to the same job until the cooldown period expires.

## API Endpoint

### Check Allocation

GET /allocate/check

Example request:

/allocate/check?studentId=UUID&jobId=UUID&companyId=UUID&fitScore=85

Example response:

```json
{
  "allowed": false,
  "reason": "COMPANY_CAP"
}


Project Stuctue:
src/
  config/
    database.ts

  db/
    schema.sql
    runSchema.ts

  services/
    allocationService.ts

index.ts


How to Run:  
npm install
npm run dev
Server runs on: http://localhost:3000