import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { getSampleJobs, SampleJob } from '../services/jobImportService';

const router = Router();

// ---------------------------------------------------------------------------
// Server-side cache — fetch fresh jobs from JSearch at most once per hour
// ---------------------------------------------------------------------------
let cachedJobs: SampleJob[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getCachedJobs(): Promise<SampleJob[]> {
  if (cachedJobs.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    console.log(`[Jobs] Serving ${cachedJobs.length} cached jobs`);
    return cachedJobs;
  }
  console.log('[Jobs] Cache miss — fetching from JSearch...');
  const results = await Promise.all([
    getSampleJobs('data analyst business analyst'),
    getSampleJobs('Salesforce Power BI SQL developer'),
  ]);
  cachedJobs = results.flat();
  cacheTimestamp = Date.now();
  console.log(`[Jobs] Cache refreshed: ${cachedJobs.length} jobs fetched`);
  return cachedJobs;
}

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

    // No DB jobs — fetch real jobs from JSearch (cached to avoid rate limits)
    let realJobs;
    if (typeof search === 'string' && search.trim()) {
      realJobs = await getSampleJobs(search.trim());
    } else {
      realJobs = await getCachedJobs();
    }

    // Apply filters (search is already handled by JSearch query, only filter status/location)
    let filtered = realJobs;

    if (status && typeof status === 'string' && status.trim()) {
      filtered = filtered.filter(j => j.status === status.trim().toUpperCase());
    }
    if (location && typeof location === 'string' && location.trim()) {
      const loc = location.trim().toLowerCase();
      filtered = filtered.filter(j => (j.location || '').toLowerCase().includes(loc));
    }

    res.json(filtered);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.json([]);
  }
});

// Diagnostic: GET /api/jobs/ping — check cache/JSearch status
router.get('/jobs/ping', async (_req: Request, res: Response) => {
  try {
    const jobs = await getCachedJobs();
    const ageMinutes = cacheTimestamp ? Math.floor((Date.now() - cacheTimestamp) / 60000) : null;
    res.json({ ok: true, count: jobs.length, cacheAgeMinutes: ageMinutes, sample: jobs[0]?.title || null });
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

export default router;
