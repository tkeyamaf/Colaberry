// JOB IMPORT INTEGRATION POINT:
// This service fetches jobs from JSearch (RapidAPI) which aggregates listings from
// LinkedIn, Indeed, Glassdoor, and more. To swap providers, replace fetchJSearchJobs()
// with a different source and normalize to the SampleJob shape below.

import https from 'https';

export interface SampleJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  status: string;
  jobType: string;
  fitScoreMin: number;
  url: string;
  createdAt: string;
}

function fetchJSearchJobs(query: string): Promise<SampleJob[]> {
  return new Promise((resolve) => {
    if (!process.env.RAPIDAPI_KEY) {
      resolve([]);
      return;
    }

    const options = {
      method: 'GET',
      hostname: 'jsearch.p.rapidapi.com',
      path: `/search?query=${encodeURIComponent(query)}&page=1&num_pages=3`,
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const jobs: SampleJob[] = (parsed.data || []).map((job: any) => ({
            id: job.job_id || crypto.randomUUID(),
            title: job.job_title || 'Untitled',
            company: job.employer_name || 'Unknown Company',
            location: job.job_city
              ? `${job.job_city}${job.job_state ? ', ' + job.job_state : ''}${job.job_is_remote ? ' (Remote)' : ''}`
              : job.job_is_remote ? 'Remote' : 'Location not specified',
            description: job.job_description
              ? job.job_description.slice(0, 300) + '...'
              : 'No description available.',
            status: 'OPEN',
            jobType: job.job_employment_type || 'Full-time',
            fitScoreMin: 70,
            url: job.job_apply_link || '',
            createdAt: job.job_posted_at_datetime_utc || new Date().toISOString(),
          }));
          resolve(jobs);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.end();
  });
}

export async function getSampleJobs(query = 'software engineer'): Promise<SampleJob[]> {
  return fetchJSearchJobs(query);
}

