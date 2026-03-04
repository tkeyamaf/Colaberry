CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Students
CREATE TABLE students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Companies
CREATE TABLE companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jobs
CREATE TABLE jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  location    TEXT NULL,
  url         TEXT NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allocation Ledger
CREATE TABLE allocation_ledger (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id               UUID NOT NULL REFERENCES students(id),
  job_id                   UUID NOT NULL REFERENCES jobs(id),
  company_id               UUID NOT NULL REFERENCES companies(id),
  allocated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  fit_score_at_allocation  INT NOT NULL CHECK (fit_score_at_allocation BETWEEN 0 AND 100),
  allocation_reason        TEXT NOT NULL,
  allocation_status        TEXT NOT NULL,
  job_status_at_allocation TEXT NOT NULL,
  cooldown_eligible_at     TIMESTAMPTZ NOT NULL,
  batch_id                 UUID NULL,
  allocation_version       INT NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
