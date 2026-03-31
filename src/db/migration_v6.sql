-- Migration v6: add structured profile fields to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS skills TEXT,
  ADD COLUMN IF NOT EXISTS target_job_titles TEXT,
  ADD COLUMN IF NOT EXISTS job_types TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT;
