-- Test Students
INSERT INTO students (id, name, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice Johnson', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Bob Smith', 'bob@example.com');

-- Test Companies
INSERT INTO companies (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Corp'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tech Solutions');

-- Test Jobs
INSERT INTO jobs (id, company_id, title, description, location, url, status) VALUES
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Software Engineer', 'Backend development role', 'Austin, TX', 'https://example.com/job1', 'OPEN'),
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Data Analyst', 'Data analysis role', 'Remote', 'https://example.com/job2', 'OPEN');
