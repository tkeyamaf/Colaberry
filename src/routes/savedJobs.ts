import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'careerbridge-secret-2026';

function getUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

// POST /api/jobs/save
router.post('/jobs/save', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const { jobId, jobTitle, company, location, url, status } = req.body;
  if (!jobId || !jobTitle || !company) {
    res.status(400).json({ error: 'jobId, jobTitle, and company are required' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO saved_jobs (user_id, job_id, job_title, company, location, url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [userId, jobId, jobTitle, company, location || null, url || null, status || 'OPEN']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save job' });
  }
});

// DELETE /api/jobs/save/:jobId
router.delete('/jobs/save/:jobId', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  await pool.query('DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2', [userId, req.params.jobId]);
  res.json({ success: true });
});

// GET /api/jobs/saved
router.get('/jobs/saved', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const result = await pool.query(
    'SELECT * FROM saved_jobs WHERE user_id = $1 ORDER BY saved_at DESC',
    [userId]
  );
  res.json(result.rows);
});

// POST /api/jobs/apply
router.post('/jobs/apply', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const { jobId, jobTitle, company, location, url } = req.body;
  if (!jobId || !jobTitle || !company) {
    res.status(400).json({ error: 'jobId, jobTitle, and company are required' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO job_applications (user_id, job_id, job_title, company, location, url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [userId, jobId, jobTitle, company, location || null, url || null]
    );
    res.status(201).json(result.rows[0] || { message: 'Already applied' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply' });
  }
});

// GET /api/jobs/applications
router.get('/jobs/applications', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const result = await pool.query(
    'SELECT * FROM job_applications WHERE user_id = $1 ORDER BY applied_at DESC',
    [userId]
  );
  res.json(result.rows);
});

// GET /api/dashboard
router.get('/dashboard', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  try {
    const [userRes, savedRes, appsRes, savedCountRes, appsCountRes] = await Promise.all([
      pool.query('SELECT id, full_name, email, student_number, profile_complete, fit_score, created_at FROM users WHERE id = $1', [userId]),
      pool.query('SELECT * FROM saved_jobs WHERE user_id = $1 ORDER BY saved_at DESC LIMIT 5', [userId]),
      pool.query('SELECT * FROM job_applications WHERE user_id = $1 ORDER BY applied_at DESC LIMIT 5', [userId]),
      pool.query('SELECT COUNT(*) AS total FROM saved_jobs WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) AS total FROM job_applications WHERE user_id = $1', [userId]),
    ]);

    if (userRes.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    const user = userRes.rows[0];

    res.json({
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        studentNumber: user.student_number,
        profileComplete: user.profile_complete,
        fitScore: user.fit_score,
        memberSince: user.created_at,
      },
      savedJobs: savedRes.rows,
      savedJobsTotal: parseInt(savedCountRes.rows[0].total, 10),
      recentApplications: appsRes.rows,
      applicationsTotal: parseInt(appsCountRes.rows[0].total, 10),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
