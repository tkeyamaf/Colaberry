import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { getSampleJobs } from '../services/jobImportService';

const router = Router();

// GET /api/jobs — return all jobs joined with company name
// Supports query params: ?search=keyword&status=OPEN&location=text
router.get('/jobs', async (req: Request, res: Response) => {
  const { search, status, location } = req.query;

  try {
    let query = `
      SELECT
        j.id,
        j.title,
        c.name AS company,
        j.company_id AS "companyId",
        j.location,
        j.url,
        j.status,
        j.description,
        'Full-time' AS "jobType",
        70          AS "fitScoreMin",
        j.created_at AS "createdAt"
      FROM jobs j
      LEFT JOIN companies c ON c.id = j.company_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (search && typeof search === 'string' && search.trim()) {
      query += ` AND (j.title ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx})`;
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    if (status && typeof status === 'string' && status.trim()) {
      query += ` AND j.status = $${paramIdx}`;
      params.push(status.trim().toUpperCase());
      paramIdx++;
    }

    if (location && typeof location === 'string' && location.trim()) {
      query += ` AND j.location ILIKE $${paramIdx}`;
      params.push(`%${location.trim()}%`);
      paramIdx++;
    }

    query += ' ORDER BY j.created_at DESC';

    const result = await pool.query(query, params);

    // If DB has jobs, return them — otherwise call JSearch for real jobs only
    if (result.rows.length > 0) {
      res.json(result.rows);
      return;
    }

    // No DB jobs — fetch real jobs from JSearch only (no sample fallback)
    const query2 = typeof search === 'string' && search.trim() ? search.trim() : 'software engineer';
    const realJobs = await getSampleJobs(query2);

    // Apply filters
    let filtered = realJobs;

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q));
    }
    if (status && typeof status === 'string' && status.trim()) {
      filtered = filtered.filter(j => j.status === status.trim().toUpperCase());
    }
    if (location && typeof location === 'string' && location.trim()) {
      filtered = filtered.filter(j => j.location.toLowerCase().includes(location.trim().toLowerCase()));
    }

    res.json(filtered);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.json([]);
  }
});

export default router;
