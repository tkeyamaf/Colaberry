import { Router, Response } from 'express';
import pool from '../config/database';
import { requireAdmin, AuthenticatedRequest } from '../middleware/requireAdmin';

const router = Router();

// GET /api/admin/overview
router.get('/admin/overview', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      totalUsersRes,
      profileReadyRes,
      totalAppsRes,
      appsThisWeekRes,
      newUsersThisWeekRes,
      savedJobsTotalRes,
      recentActivityRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM users WHERE profile_complete = true'),
      pool.query('SELECT COUNT(*) FROM job_applications'),
      pool.query("SELECT COUNT(*) FROM job_applications WHERE applied_at > now() - interval '7 days'"),
      pool.query("SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7 days'"),
      pool.query('SELECT COUNT(*) FROM saved_jobs'),
      pool.query(`
        SELECT
          ja.job_title,
          ja.company,
          ja.status,
          ja.applied_at,
          u.full_name,
          u.email
        FROM job_applications ja
        JOIN users u ON u.id = ja.user_id
        ORDER BY ja.applied_at DESC
        LIMIT 10
      `),
    ]);

    res.json({
      totalUsers:        Number(totalUsersRes.rows[0].count),
      profileReadyUsers: Number(profileReadyRes.rows[0].count),
      totalApplications: Number(totalAppsRes.rows[0].count),
      applicationsThisWeek: Number(appsThisWeekRes.rows[0].count),
      newUsersThisWeek:  Number(newUsersThisWeekRes.rows[0].count),
      savedJobsTotal:    Number(savedJobsTotalRes.rows[0].count),
      recentActivity:    recentActivityRes.rows,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

export default router;
