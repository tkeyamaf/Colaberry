import { PoolClient } from 'pg';
import pool from '../config/database';

export interface AllocationInput {
  studentId: string;
  jobId: string;
  companyId: string;
  fitScore: number;
  allocationReason: string;
  allocationStatus: string;
}

export interface AllocationResult {
  success: true;
  id: string;
  studentId: string;
  jobId: string;
  companyId: string;
  fitScoreAtAllocation: number;
  allocationReason: string;
  allocationStatus: string;
  jobStatusAtAllocation: string;
  cooldownEligibleAt: Date;
  allocatedAt: Date;
}

export interface AllocationFailure {
  success: false;
  reason: string;
}

// --- Transaction-safe rule helpers (use the open client, not pool.query) ---

function checkFitThreshold(fitScore: number): boolean {
  return fitScore >= 70;
}

async function checkJobCap(client: PoolClient, jobId: string): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM allocation_ledger
     WHERE job_id = $1
       AND allocated_at >= NOW() - INTERVAL '7 days'`,
    [jobId]
  );
  return parseInt(result.rows[0].count, 10) < 12;
}

async function checkCompanyCap(client: PoolClient, companyId: string): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM allocation_ledger
     WHERE company_id = $1
       AND allocated_at >= NOW() - INTERVAL '7 days'`,
    [companyId]
  );
  return parseInt(result.rows[0].count, 10) < 30;
}

async function checkStudentWeeklyCap(client: PoolClient, studentId: string): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM allocation_ledger
     WHERE student_id = $1
       AND allocated_at >= NOW() - INTERVAL '7 days'`,
    [studentId]
  );
  return parseInt(result.rows[0].count, 10) < 5;
}

async function checkCooldown(
  client: PoolClient,
  studentId: string,
  jobId: string,
  jobStatus: string
): Promise<boolean> {
  if (jobStatus === 'REOPENED') return true;

  const result = await client.query<{ cooldown_eligible_at: Date }>(
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

// --- Main transaction function ---

export async function allocateJobTransaction(
  input: AllocationInput
): Promise<AllocationResult | AllocationFailure> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the job row to prevent concurrent cap overruns
    const jobResult = await client.query<{
      id: string;
      company_id: string;
      status: string;
    }>(
      `SELECT id, company_id, status
       FROM jobs
       WHERE id = $1
       FOR UPDATE`,
      [input.jobId]
    );

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'JOB_NOT_FOUND' };
    }

    const job = jobResult.rows[0];

    if (job.company_id !== input.companyId) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'COMPANY_MISMATCH' };
    }

    // Transaction-safe rule checks (all run on the same client/transaction)
    if (!checkFitThreshold(input.fitScore)) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'FIT_THRESHOLD' };
    }

    if (!await checkJobCap(client, input.jobId)) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'JOB_CAP' };
    }

    if (!await checkCompanyCap(client, input.companyId)) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'COMPANY_CAP' };
    }

    if (!await checkStudentWeeklyCap(client, input.studentId)) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'STUDENT_WEEKLY_CAP' };
    }

    if (!await checkCooldown(client, input.studentId, input.jobId, job.status)) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'COOLDOWN' };
    }

    // All checks passed — insert into allocation_ledger
    const insertResult = await client.query<{
      id: string;
      student_id: string;
      job_id: string;
      company_id: string;
      fit_score_at_allocation: number;
      allocation_reason: string;
      allocation_status: string;
      job_status_at_allocation: string;
      cooldown_eligible_at: Date;
      allocated_at: Date;
    }>(
      `INSERT INTO allocation_ledger (
         student_id,
         job_id,
         company_id,
         fit_score_at_allocation,
         allocation_reason,
         allocation_status,
         job_status_at_allocation,
         cooldown_eligible_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '14 days')
       RETURNING
         id,
         student_id,
         job_id,
         company_id,
         fit_score_at_allocation,
         allocation_reason,
         allocation_status,
         job_status_at_allocation,
         cooldown_eligible_at,
         allocated_at`,
      [
        input.studentId,
        input.jobId,
        input.companyId,
        input.fitScore,
        input.allocationReason,
        input.allocationStatus,
        job.status,
      ]
    );

    await client.query('COMMIT');

    const row = insertResult.rows[0];

    return {
      success: true,
      id: row.id,
      studentId: row.student_id,
      jobId: row.job_id,
      companyId: row.company_id,
      fitScoreAtAllocation: row.fit_score_at_allocation,
      allocationReason: row.allocation_reason,
      allocationStatus: row.allocation_status,
      jobStatusAtAllocation: row.job_status_at_allocation,
      cooldownEligibleAt: row.cooldown_eligible_at,
      allocatedAt: row.allocated_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
