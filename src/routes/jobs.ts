import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { getSampleJobs, SampleJob } from '../services/jobImportService';
import {
  computeFitScore,
  computeGapAnalysis,
  FIT_SCORE_THRESHOLD,
  hasProfileData,
  splitField,
} from '../services/fitScoringService';

const JWT_SECRET = process.env.JWT_SECRET || 'careerbridge-secret-2026';

const router = Router();

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington D.C.',
};

// ---------------------------------------------------------------------------
// Server-side cache — at most 1 API call per query per hour
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry { jobs: SampleJob[]; timestamp: number; }
const queryCache = new Map<string, CacheEntry>();

async function getCachedQuery(query: string): Promise<SampleJob[]> {
  const entry = queryCache.get(query);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.jobs;
  }
  const jobs = await getSampleJobs(query);
  queryCache.set(query, { jobs, timestamp: Date.now() });
  console.log(`[Jobs] Fetched "${query}": ${jobs.length} jobs`);
  return jobs;
}

async function getCachedJobs(): Promise<SampleJob[]> {
  const [a, b] = await Promise.all([
    getCachedQuery('data analyst business analyst'),
    getCachedQuery('Salesforce Power BI SQL developer'),
  ]);
  return [...a, ...b];
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
    const searchTerm = typeof search === 'string' ? search.trim() : '';
    const locationTerm = typeof location === 'string' ? location.trim() : '';
    const stateName = locationTerm ? (STATE_NAMES[locationTerm.toUpperCase()] || locationTerm) : '';

    let realJobs;
    if (searchTerm && stateName) {
      realJobs = await getSampleJobs(`${searchTerm} in ${stateName}`);
    } else if (searchTerm) {
      realJobs = await getSampleJobs(searchTerm);
    } else if (stateName) {
      realJobs = await getSampleJobs(`data analyst business analyst in ${stateName}`);
    } else {
      realJobs = await getCachedJobs();
    }

    // Apply filters (search is already handled by JSearch query, only filter status/location)
    let filtered = realJobs;

    if (status && typeof status === 'string' && status.trim()) {
      filtered = filtered.filter(j => j.status === status.trim().toUpperCase());
    }
    if (location && typeof location === 'string' && location.trim()) {
      const loc = location.trim();
      filtered = filtered.filter(j => {
        const jobLoc = j.location || '';
        if (loc.toLowerCase() === 'remote') {
          return jobLoc.toLowerCase().includes('remote');
        }
        const fullName = STATE_NAMES[loc.toUpperCase()] || loc;
        return jobLoc.toLowerCase().includes(fullName.toLowerCase());
      });
    }

    res.json(filtered);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.json([]);
  }
});

// GET /api/jobs/recommended — deterministic fit-scored recommendations for the
// authenticated user.  Only jobs that score >= FIT_SCORE_THRESHOLD are returned.
router.get('/jobs/recommended', async (req: Request, res: Response) => {
  // ── Auth: extract user from JWT ──────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  let userId: string;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    // ── Load user profile from users table ──────────────────────────────────
    const userRes = await pool.query(
      'SELECT skills, target_job_titles, job_types FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const row = userRes.rows[0];
    const profile = {
      skills:           splitField(row.skills),
      targetJobTitles:  splitField(row.target_job_titles),
      jobTypes:         row.job_types || '',
    };

    // ── Guard: prompt profile completion when no scoreable data ─────────────
    if (!hasProfileData(profile)) {
      res.json({ noProfile: true, jobs: [] });
      return;
    }

    // ── Fetch live jobs from cache ───────────────────────────────────────────
    // Use target titles to build a relevant JSearch query when available;
    // fall back to the default two-query feed so the cache stays warm.
    let allJobs: SampleJob[];
    if (profile.targetJobTitles.length > 0) {
      const titleQuery = profile.targetJobTitles.join(' ');
      allJobs = await getCachedQuery(titleQuery);
      // Supplement with the default feed to widen the candidate pool
      const defaultJobs = await getCachedJobs();
      const seen = new Set(allJobs.map(j => j.id));
      allJobs = [...allJobs, ...defaultJobs.filter(j => !seen.has(j.id))];
    } else {
      allJobs = await getCachedJobs();
    }

    // ── Score every job, split into qualified and target-role gaps ───────────
    const qualified:      ReturnType<typeof Object.assign>[] = [];
    const targetRolesGap: ReturnType<typeof Object.assign>[] = [];

    for (const job of allJobs) {
      const jobData = { title: job.title, description: job.description, jobType: job.jobType };
      const result  = computeFitScore(profile, jobData);

      const scored = {
        ...job,
        fitScore:     result.score,
        fitBreakdown: result.breakdown,
        matchedSkills: result.matchedSkills,
        matchedTitle:  result.matchedTitle,
      };

      if (result.score >= FIT_SCORE_THRESHOLD) {
        qualified.push(scored);
      } else if (result.breakdown.titleScore > 0) {
        // Below threshold but title overlaps a user target title →
        // surface as a gap card so the user understands why it is hidden.
        // Cap at 5 gap cards to avoid overwhelming the UI.
        if (targetRolesGap.length < 5) {
          const gap = computeGapAnalysis(profile, jobData, result);
          targetRolesGap.push({ ...scored, gap });
        }
      }
    }

    qualified.sort((a, b) => b.fitScore - a.fitScore);
    targetRolesGap.sort((a, b) => b.fitScore - a.fitScore);

    res.json({
      noProfile:     false,
      threshold:     FIT_SCORE_THRESHOLD,
      jobs:          qualified,
      targetRolesGap,
    });
  } catch (err) {
    console.error('Error building recommendations:', err);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

// Diagnostic: GET /api/jobs/ping — check cache/JSearch status
router.get('/jobs/ping', async (_req: Request, res: Response) => {
  try {
    const jobs = await getCachedJobs();
    const entry = queryCache.get('data analyst business analyst');
    const ageMinutes = entry ? Math.floor((Date.now() - entry.timestamp) / 60000) : null;
    res.json({ ok: true, count: jobs.length, cacheAgeMinutes: ageMinutes, sample: jobs[0]?.title || null });
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

export default router;
