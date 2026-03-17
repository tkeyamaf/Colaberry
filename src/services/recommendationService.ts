import pool from '../config/database';
import {
  canAllocateFitThreshold,
  canAllocateJobCap,
  canAllocateCompanyCap,
} from './allocationService';

interface RecommendedJob {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  status: string;
  fitScore: number;
}

export async function getRecommendedJobs(
  studentId: string,
  fitScore: number
): Promise<RecommendedJob[] | null> {
  // Verify student exists
  const student = await pool.query(
    `SELECT id FROM students WHERE id = $1 LIMIT 1`,
    [studentId]
  );

  if (student.rows.length === 0) return null;

  // Fail fast: fit score is below threshold — no point querying jobs
  if (!canAllocateFitThreshold(fitScore)) return [];

  // Fetch open jobs not in active cooldown for this student
  const jobs = await pool.query<{
    job_id: string;
    title: string;
    company: string;
    location: string | null;
    url: string | null;
    status: string;
    company_id: string;
  }>(
    `SELECT j.id AS job_id, j.title, c.name AS company, j.location, j.url, j.status, j.company_id
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     WHERE j.status IN ('OPEN', 'REOPENED')
       AND j.id NOT IN (
         SELECT job_id FROM allocation_ledger
         WHERE student_id = $1
           AND cooldown_eligible_at > NOW()
       )
     ORDER BY j.created_at DESC`,
    [studentId]
  );

  // Apply job cap and company cap checks per job
  const results: RecommendedJob[] = [];

  for (const row of jobs.rows) {
    const jobOk = await canAllocateJobCap(row.job_id);
    if (!jobOk) continue;

    const companyOk = await canAllocateCompanyCap(row.company_id);
    if (!companyOk) continue;

    results.push({
      jobId: row.job_id,
      title: row.title,
      company: row.company,
      location: row.location,
      url: row.url,
      status: row.status,
      fitScore,
    });
  }

  return results;
}
