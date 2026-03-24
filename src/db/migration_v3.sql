CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id),
  job_title VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  job_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'APPLIED',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  interview_date TIMESTAMPTZ,
  notes TEXT,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
