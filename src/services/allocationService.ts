import pool from '../config/database';

export async function canAllocateJobCap(jobId: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM allocation_ledger
     WHERE job_id = $1
       AND allocated_at >= NOW() - INTERVAL '7 days'`,
    [jobId]
  );

  return parseInt(result.rows[0].count, 10) < 12;
}

export async function canAllocateCompanyCap(companyId: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM allocation_ledger
     WHERE company_id = $1
       AND allocated_at >= NOW() - INTERVAL '7 days'`,
    [companyId]
  );

  return parseInt(result.rows[0].count, 10) < 30;
}

export async function canAllocateStudentWeeklyCap(studentId: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM allocation_ledger
     WHERE student_id = $1
       AND allocated_at >= NOW() - INTERVAL '7 days'`,
    [studentId]
  );

  return parseInt(result.rows[0].count, 10) < 5;
}

export async function canAllocateCooldown(
  studentId: string,
  jobId: string,
  currentJobStatus: string
): Promise<boolean> {
  if (currentJobStatus === 'REOPENED') return true;

  const result = await pool.query<{ cooldown_eligible_at: Date }>(
    `SELECT cooldown_eligible_at
     FROM allocation_ledger
     WHERE student_id = $1 AND job_id = $2
     ORDER BY allocated_at DESC
     LIMIT 1`,
    [studentId, jobId]
  );

  if (result.rows.length === 0) return true;

  return new Date() >= result.rows[0].cooldown_eligible_at;
}

export function canAllocateFitThreshold(fitScore: number): boolean {
  return fitScore >= 70;
}

async function hasDuplicateAllocation(studentId: string, jobId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
     FROM allocation_ledger
     WHERE student_id = $1 AND job_id = $2
     LIMIT 1`,
    [studentId, jobId]
  );

  return result.rows.length > 0;
}

export async function canAllocate(
  studentId: string,
  jobId: string,
  companyId: string,
  fitScore: number,
  currentJobStatus: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!canAllocateFitThreshold(fitScore)) {
    return { allowed: false, reason: 'FIT_THRESHOLD' };
  }

  if (await hasDuplicateAllocation(studentId, jobId)) {
    return { allowed: false, reason: 'DUPLICATE_APPLICATION' };
  }

  if (!await canAllocateJobCap(jobId)) {
    return { allowed: false, reason: 'JOB_CAP' };
  }

  if (!await canAllocateCompanyCap(companyId)) {
    return { allowed: false, reason: 'COMPANY_CAP' };
  }

  if (!await canAllocateStudentWeeklyCap(studentId)) {
    return { allowed: false, reason: 'STUDENT_WEEKLY_CAP' };
  }

  if (!await canAllocateCooldown(studentId, jobId, currentJobStatus)) {
    return { allowed: false, reason: 'COOLDOWN' };
  }

  return { allowed: true };
}
