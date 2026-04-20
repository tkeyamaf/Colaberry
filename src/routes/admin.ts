import { Router, Response } from 'express';
import pool from '../config/database';
import { requireAdmin, AuthenticatedRequest } from '../middleware/requireAdmin';

const router = Router();

// Caps matching allocationService.ts
const JOB_CAP          = 12;
const COMPANY_CAP      = 30;
const JOB_NEAR_CAP_AT  = 9;   // 75% of JOB_CAP
const COMPANY_OVER_AT  = 25;  // 83% of COMPANY_CAP

// GET /api/admin/overview
router.get('/admin/overview', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      totalUsersRes,
      activeStudentsRes,
      activeJobsRes,
      jobsNearCapRes,
      companiesOverLimitRes,
      appsThisWeekRes,
      newUsersThisWeekRes,
      recentDiscoveryRes,
      allocationActivityRes,
      companyExposureRes,
      staleJobsRes,
      recentActivityRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),

      pool.query('SELECT COUNT(*) FROM users WHERE profile_complete = true'),

      pool.query("SELECT COUNT(*) FROM jobs WHERE status = 'OPEN'"),

      pool.query(`
        SELECT COUNT(DISTINCT job_id) as count
        FROM (
          SELECT job_id, COUNT(*) as cnt
          FROM allocation_ledger
          WHERE allocated_at > now() - interval '7 days'
          GROUP BY job_id
          HAVING COUNT(*) >= $1
        ) sub
      `, [JOB_NEAR_CAP_AT]),

      pool.query(`
        SELECT COUNT(DISTINCT company_id) as count
        FROM (
          SELECT company_id, COUNT(*) as cnt
          FROM allocation_ledger
          WHERE allocated_at > now() - interval '7 days'
          GROUP BY company_id
          HAVING COUNT(*) >= $1
        ) sub
      `, [COMPANY_OVER_AT]),

      pool.query("SELECT COUNT(*) FROM job_applications WHERE applied_at > now() - interval '7 days'"),

      pool.query("SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7 days'"),

      pool.query(`
        SELECT run_date, jobs_found, jobs_normalized, jobs_rejected, duplicates, source_platform, status
        FROM discovery_runs
        ORDER BY created_at DESC
        LIMIT 5
      `),

      pool.query(`
        SELECT
          DATE(allocated_at)            AS run_date,
          COUNT(*)                      AS jobs_assigned,
          COUNT(DISTINCT student_id)    AS students_placed,
          SUM(CASE WHEN allocation_status = 'FAILED' THEN 1 ELSE 0 END) AS failures
        FROM allocation_ledger
        WHERE allocated_at > now() - interval '7 days'
        GROUP BY DATE(allocated_at)
        ORDER BY run_date DESC
        LIMIT 5
      `),

      pool.query(`
        SELECT
          c.name                              AS company_name,
          COUNT(al.id)                        AS weekly_count,
          LEAST(ROUND(COUNT(al.id)::numeric / $1 * 100), 100) AS exposure_pct
        FROM allocation_ledger al
        JOIN companies c ON c.id = al.company_id
        WHERE al.allocated_at > now() - interval '7 days'
        GROUP BY c.id, c.name
        ORDER BY weekly_count DESC
        LIMIT 5
      `, [COMPANY_CAP]),

      pool.query("SELECT COUNT(*) FROM jobs WHERE updated_at < now() - interval '30 days'"),

      pool.query(`
        SELECT ja.job_title, ja.company, ja.status, ja.applied_at, u.full_name, u.email
        FROM job_applications ja
        JOIN users u ON u.id = ja.user_id
        ORDER BY ja.applied_at DESC
        LIMIT 10
      `),
    ]);

    const jobsNearCap       = Number(jobsNearCapRes.rows[0].count);
    const companiesOverLimit = Number(companiesOverLimitRes.rows[0].count);
    const staleJobs         = Number(staleJobsRes.rows[0].count);

    // Build alerts server-side — never trust frontend for these
    const alerts: { type: string; level: string; message: string }[] = [];
    if (companiesOverLimit > 0) {
      alerts.push({ type: 'exposure', level: 'error',
        message: `${companiesOverLimit} company${companiesOverLimit > 1 ? 'ies' : ''} exceeded weekly exposure cap of ${COMPANY_CAP} applications.` });
    }
    if (jobsNearCap > 0) {
      alerts.push({ type: 'cap', level: 'warning',
        message: `${jobsNearCap} job${jobsNearCap > 1 ? 's are' : ' is'} at ${JOB_NEAR_CAP_AT}+ of ${JOB_CAP} weekly cap.` });
    }
    if (staleJobs > 0) {
      alerts.push({ type: 'stale', level: 'warning',
        message: `${staleJobs} job${staleJobs > 1 ? 's have' : ' has'} not been updated in over 30 days.` });
    }

    res.json({
      totalUsers:           Number(totalUsersRes.rows[0].count),
      activeStudents:       Number(activeStudentsRes.rows[0].count),
      activeJobs:           Number(activeJobsRes.rows[0].count),
      jobsNearCap,
      companiesOverLimit,
      pendingOverrides:     0,
      applicationsThisWeek: Number(appsThisWeekRes.rows[0].count),
      newUsersThisWeek:     Number(newUsersThisWeekRes.rows[0].count),
      recentDiscoveryRuns:  recentDiscoveryRes.rows,
      allocationActivity:   allocationActivityRes.rows,
      companyExposure:      companyExposureRes.rows,
      alerts,
      recentActivity:       recentActivityRes.rows,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

// GET /api/admin/students
router.get('/admin/students', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, full_name, email, student_number, profile_complete, fit_score,
             city, state, skills, target_job_titles, created_at
      FROM users
      WHERE role = 'user'
      ORDER BY created_at DESC
      LIMIT 500
    `);
    res.json({ students: result.rows });
  } catch (err) {
    console.error('Admin students error:', err);
    res.status(500).json({ error: 'Failed to load students' });
  }
});

// GET /api/admin/jobs
router.get('/admin/jobs', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT j.id, j.title, j.company, j.location, j.status, j.created_at, j.updated_at,
             COUNT(al.id) FILTER (WHERE al.allocated_at > now() - interval '7 days') AS weekly_allocations,
             COUNT(al.id) AS total_allocations
      FROM jobs j
      LEFT JOIN allocation_ledger al ON al.job_id = j.id
      GROUP BY j.id
      ORDER BY j.created_at DESC
      LIMIT 500
    `);
    res.json({ jobs: result.rows });
  } catch (err) {
    console.error('Admin jobs error:', err);
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

// GET /api/admin/applications
router.get('/admin/applications', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT ja.id, ja.job_title, ja.company, ja.status, ja.applied_at,
             u.full_name, u.email, u.student_number, u.fit_score
      FROM job_applications ja
      JOIN users u ON u.id = ja.user_id
      ORDER BY ja.applied_at DESC
      LIMIT 500
    `);
    res.json({ applications: result.rows });
  } catch (err) {
    console.error('Admin applications error:', err);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

// GET /api/admin/companies
router.get('/admin/companies', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.name,
        COUNT(DISTINCT al.job_id)                                                               AS total_jobs,
        COUNT(al.id) FILTER (WHERE al.allocated_at > now() - interval '7 days')                AS weekly_count,
        COUNT(al.id)                                                                            AS total_allocations,
        LEAST(ROUND(
          COUNT(al.id) FILTER (WHERE al.allocated_at > now() - interval '7 days')::numeric
          / $1 * 100
        ), 100)                                                                                 AS exposure_pct
      FROM companies c
      LEFT JOIN allocation_ledger al ON al.company_id = c.id
      GROUP BY c.id, c.name
      ORDER BY weekly_count DESC, c.name
    `, [COMPANY_CAP]);
    res.json({ companies: result.rows, companyCap: COMPANY_CAP });
  } catch (err) {
    console.error('Admin companies error:', err);
    res.status(500).json({ error: 'Failed to load companies' });
  }
});

// GET /api/admin/discovery
router.get('/admin/discovery', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT run_date, jobs_found, jobs_normalized, jobs_rejected, duplicates,
             source_platform, status, created_at
      FROM discovery_runs
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json({ runs: result.rows });
  } catch (err) {
    console.error('Admin discovery error:', err);
    res.status(500).json({ error: 'Failed to load discovery runs' });
  }
});

export default router;
