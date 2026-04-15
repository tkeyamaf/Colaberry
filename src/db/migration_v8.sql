-- Migration v8: add discovery_runs table for admin discovery control panel
CREATE TABLE IF NOT EXISTS discovery_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  jobs_found      INT NOT NULL DEFAULT 0,
  jobs_normalized INT NOT NULL DEFAULT 0,
  jobs_rejected   INT NOT NULL DEFAULT 0,
  duplicates      INT NOT NULL DEFAULT 0,
  source_platform TEXT NOT NULL DEFAULT 'JSearch',
  status          TEXT NOT NULL DEFAULT 'success',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
