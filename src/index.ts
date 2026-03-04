import 'dotenv/config';
import express, { Request, Response } from 'express';
import { canAllocate } from './services/allocationService';

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
