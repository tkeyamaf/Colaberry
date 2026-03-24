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
        COALESCE(j.job_type, 'Full-time') AS "jobType",
        COALESCE(j.fit_score_min, 70)     AS "fitScoreMin",
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

    // If no jobs in DB, fall back to JSearch / sample jobs
    if (result.rows.length === 0) {
      const sampleJobs = await getSampleJobs(typeof search === 'string' && search.trim() ? search.trim() : 'software engineer');

      // Apply filters to sample jobs
      let filtered = sampleJobs;

      if (search && typeof search === 'string' && search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(
          j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
        );
      }

      if (status && typeof status === 'string' && status.trim()) {
        const s = status.trim().toUpperCase();
        filtered = filtered.filter(j => j.status === s);
      }

      if (location && typeof location === 'string' && location.trim()) {
        const l = location.trim().toLowerCase();
        filtered = filtered.filter(j => j.location.toLowerCase().includes(l));
      }

      res.json(filtered);
      return;
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    // Never crash — return sample jobs as fallback
    try {
      res.json(await getSampleJobs());
    } catch {
      res.json([]);
    }
  }
});

export default router;
