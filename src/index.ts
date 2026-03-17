import 'dotenv/config';
import express, { Request, Response } from 'express';
import { canAllocate } from './services/allocationService';
import { getRecommendedJobs } from './services/recommendationService';
import { allocateJobTransaction } from './services/allocationTransactionService';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

app.get('/allocate/check', async (req: Request, res: Response) => {
  const { studentId, jobId, companyId, fitScore, jobStatus } = req.query;

  if (!studentId || !jobId || !companyId || !fitScore) {
    res.status(400).json({ error: 'Missing required query params' });
    return;
  }

  const invalidFields = (['studentId', 'jobId', 'companyId'] as const).filter(
    (field) => !isUuid(req.query[field] as string)
  );

  if (invalidFields.length > 0) {
    res.status(400).json({ error: 'Invalid id format', fields: invalidFields });
    return;
  }

  const result = await canAllocate(
    studentId as string,
    jobId as string,
    companyId as string,
    Number(fitScore),
    (jobStatus as string) ?? 'OPEN'
  );
  res.json(result);
});

app.get('/jobs/recommend', async (req: Request, res: Response) => {
  const { studentId, fitScore } = req.query;

  if (!studentId || !fitScore) {
    res.status(400).json({ error: 'Missing required query params' });
    return;
  }

  if (!isUuid(studentId as string)) {
    res.status(400).json({ error: 'Invalid id format', fields: ['studentId'] });
    return;
  }

  const fitScoreNumber = Number(fitScore);
  if (isNaN(fitScoreNumber) || fitScoreNumber < 0 || fitScoreNumber > 100) {
    res.status(400).json({ error: 'fitScore must be a number between 0 and 100' });
    return;
  }

  const result = await getRecommendedJobs(studentId as string, fitScoreNumber);

  if (result === null) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  res.json(result);
});

const BUSINESS_FAILURE_REASONS = new Set([
  'JOB_NOT_FOUND',
  'COMPANY_MISMATCH',
  'FIT_THRESHOLD',
  'JOB_CAP',
  'COMPANY_CAP',
  'STUDENT_WEEKLY_CAP',
  'COOLDOWN',
]);

app.post('/allocate', async (req: Request, res: Response) => {
  const { studentId, jobId, companyId, fitScore, allocationReason, allocationStatus } = req.body;

  if (!studentId || !jobId || !companyId || fitScore === undefined || !allocationReason || !allocationStatus) {
    res.status(400).json({ error: 'Missing required body fields' });
    return;
  }

  const invalidFields = (['studentId', 'jobId', 'companyId'] as const).filter(
    (field) => !isUuid(req.body[field])
  );

  if (invalidFields.length > 0) {
    res.status(400).json({ error: 'Invalid id format', fields: invalidFields });
    return;
  }

  const fitScoreNumber = Number(fitScore);
  if (isNaN(fitScoreNumber) || fitScoreNumber < 0 || fitScoreNumber > 100) {
    res.status(400).json({ error: 'fitScore must be a number between 0 and 100' });
    return;
  }

  if (typeof allocationReason !== 'string' || allocationReason.trim() === '') {
    res.status(400).json({ error: 'allocationReason must be a non-empty string' });
    return;
  }

  if (typeof allocationStatus !== 'string' || allocationStatus.trim() === '') {
    res.status(400).json({ error: 'allocationStatus must be a non-empty string' });
    return;
  }

  try {
    const result = await allocateJobTransaction({
      studentId,
      jobId,
      companyId,
      fitScore: fitScoreNumber,
      allocationReason,
      allocationStatus,
    });

    if (!result.success) {
      const status = BUSINESS_FAILURE_REASONS.has(result.reason) ? 422 : 500;
      res.status(status).json({ allowed: false, reason: result.reason });
      return;
    }

    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
