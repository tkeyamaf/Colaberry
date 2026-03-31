// ---------------------------------------------------------------------------
// Deterministic Fit Scoring Service
//
// Scores a single job against a user's structured profile on three components:
//
//   1. Skills Match     (0–40 pts)
//      Fraction of the user's skills found (case-insensitive substring) in the
//      job title + description, multiplied by 40.
//      Formula: floor(matchedSkills / totalSkills * 40)
//      Rationale: skills are the strongest signal of suitability.
//
//   2. Title Alignment  (0–40 pts)
//      For each target job title the user saved, tokenise it into words and
//      count how many of those words appear in the job title (also tokenised).
//      Take the best-matching target title.
//      Formula: floor(bestWordOverlapFraction * 40)
//      Rationale: title match is equally important — a candidate targeting
//      "Data Analyst" shouldn't see "Software Engineer" at the top.
//
//   3. Job Type Match   (0–20 pts)
//      Full 20 if the user's preferred job type normalises to the same
//      canonical token as the job's employment type; 0 otherwise.
//      Normalisation collapses "Full-time" / "FULLTIME" → "fulltime",
//      "Contract" / "CONTRACTOR" → "contract", etc.
//      Rationale: a part-timer shouldn't see full-time-only roles first.
//
// TOTAL: 0–100
//
// THRESHOLD: 40 — a job must score at least 40 to appear in recommendations.
// This requires at least one strong signal (e.g. title match or several skills)
// rather than the weakest possible match.
//
// Fallback: if the user has no skills AND no target titles, hasProfileData
// returns false — the caller should prompt profile completion instead of
// showing 0 results.
// ---------------------------------------------------------------------------

export const FIT_SCORE_THRESHOLD = 40;

export interface ProfileData {
  skills: string[];          // e.g. ['SQL', 'Power BI', 'Excel']
  targetJobTitles: string[]; // e.g. ['Data Analyst', 'Business Analyst']
  jobTypes: string;          // e.g. 'Full-time'
}

export interface JobData {
  title: string;
  description: string;
  jobType: string;           // raw value from JSearch e.g. 'FULLTIME'
}

export interface FitScoreResult {
  score: number;             // 0–100 total
  breakdown: {
    skillsScore: number;     // 0–40
    titleScore: number;      // 0–40
    jobTypeScore: number;    // 0–20
  };
  matchedSkills: string[];   // which user skills were found in the job text
  matchedTitle: string;      // the target title with the best word overlap
}

/** True when the profile has enough data to produce meaningful scores. */
export function hasProfileData(profile: ProfileData): boolean {
  return profile.skills.length > 0 || profile.targetJobTitles.length > 0;
}

/** Parse a comma-separated text column into a trimmed, non-empty string array. */
export function splitField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function normalizeJobType(raw: string): string {
  const s = (raw || '').toLowerCase().replace(/[-_\s]/g, '');
  // "CONTRACTOR" / "CONTRACTING" → "contract"
  if (s.startsWith('contract')) return 'contract';
  // "INTERN" / "INTERNSHIP" → "intern"
  if (s.startsWith('intern')) return 'intern';
  return s; // "fulltime", "parttime", "freelance" pass through unchanged
}

function tokenise(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  );
}

// ---------------------------------------------------------------------------
// Gap Analysis
//
// Identifies which skills the job description requires that the user is missing.
// Uses a curated vocab list so no API call is needed — this is fully deterministic.
//
// Logic:
//   1. Scan the job title + description for any skill in SKILL_VOCAB (case-insensitive).
//   2. For each matched job skill, check whether the user's profile skills list contains
//      it (also case-insensitive, allowing partial matches so "Power BI" matches "power bi").
//   3. Skills found in the job but absent from the user's profile → missingSkills.
//   4. Build gapReasons from the score breakdown to explain in plain language.
//
// SKILL_VOCAB is intentionally broad (data / business / BI / SaaS / general tech) to
// cover the kinds of roles this platform targets.  Add terms here as the job inventory
// grows; no other code needs to change.
// ---------------------------------------------------------------------------

const SKILL_VOCAB: string[] = [
  // Query & data languages
  'sql', 'python', 'r programming', 'vba', 'dax', 'm language', 'power query', 'scala',
  // Spreadsheet & productivity
  'excel', 'google sheets', 'powerpoint', 'word', 'google slides',
  // BI & visualisation
  'tableau', 'power bi', 'looker', 'qlik', 'google analytics', 'data visualization',
  // CRM / ERP / SaaS
  'salesforce', 'sap', 'oracle', 'sharepoint', 'hubspot', 'servicenow', 'workday',
  // Cloud & infrastructure
  'azure', 'aws', 'gcp', 'docker', 'kubernetes',
  // Data engineering
  'spark', 'hadoop', 'kafka', 'dbt', 'airflow', 'etl', 'data warehousing',
  'snowflake', 'redshift', 'bigquery', 'data modeling',
  // Databases
  'postgresql', 'mysql', 'mongodb', 'nosql',
  // ML / AI
  'machine learning', 'deep learning', 'nlp', 'statistics', 'scikit-learn',
  'tensorflow', 'pytorch', 'pandas', 'numpy',
  // Dev tooling
  'git', 'jira', 'confluence', 'rest api', 'json', 'xml',
  // Web
  'javascript', 'html', 'css', 'java', 'c#',
  // Business & methodology
  'project management', 'agile', 'scrum', 'lean six sigma',
  'business intelligence', 'crm', 'erp',
];

export interface GapAnalysis {
  missingSkills: string[];  // vocab skills in job text that user does not have
  presentSkills: string[];  // vocab skills in job text that user already has
  gapReasons:   string[];   // plain-language explanations derived from score breakdown
}

export function computeGapAnalysis(
  profile: ProfileData,
  job: JobData,
  scoreResult: FitScoreResult
): GapAnalysis {
  const jobText        = `${job.title} ${job.description}`.toLowerCase();
  const userSkillsLow  = profile.skills.map(s => s.toLowerCase());

  // Which vocab skills appear in the job description at all?
  const jobSkills = SKILL_VOCAB.filter(s => jobText.includes(s));

  // Split into present vs missing based on user's profile
  const presentSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of jobSkills) {
    // Allow partial containment both ways: "power bi" matches "power bi developer"
    const userHasIt = userSkillsLow.some(
      us => us.includes(skill) || skill.includes(us)
    );
    (userHasIt ? presentSkills : missingSkills).push(skill);
  }

  // Plain-language gap reasons derived from the score breakdown
  const gapReasons: string[] = [];
  const { skillsScore, titleScore, jobTypeScore } = scoreResult.breakdown;

  if (profile.skills.length === 0) {
    gapReasons.push('No skills on your profile yet — add skills so the scoring engine can evaluate you.');
  } else if (skillsScore < 14) {
    const matched = scoreResult.matchedSkills.length;
    const total   = profile.skills.length;
    const pct     = Math.round((matched / total) * 100);
    gapReasons.push(
      `Only ${pct}% of your listed skills were found in this posting (${matched} of ${total}).`
    );
  }

  if (titleScore < 20) {
    gapReasons.push(
      `Your target titles don't closely match "${job.title}" — the title word overlap is below 50%.`
    );
  }

  if (jobTypeScore === 0 && profile.jobTypes) {
    gapReasons.push(
      `Job-type mismatch: you prefer "${profile.jobTypes}" but this listing is "${job.jobType || 'unspecified'}".`
    );
  }

  return {
    missingSkills: missingSkills.slice(0, 8), // cap display list
    presentSkills,
    gapReasons,
  };
}

export function computeFitScore(profile: ProfileData, job: JobData): FitScoreResult {
  const jobText = `${job.title} ${job.description}`.toLowerCase();

  // ── Component 1: Skills Match (max 40) ─────────────────────────────────────
  const matchedSkills: string[] = [];
  for (const skill of profile.skills) {
    if (skill && jobText.includes(skill.toLowerCase())) {
      matchedSkills.push(skill);
    }
  }
  const skillsScore = profile.skills.length > 0
    ? Math.floor((matchedSkills.length / profile.skills.length) * 40)
    : 0;

  // ── Component 2: Title Alignment (max 40) ──────────────────────────────────
  const jobTitleTokens = tokenise(job.title);
  let bestTitleFraction = 0;
  let matchedTitle = '';

  for (const targetTitle of profile.targetJobTitles) {
    if (!targetTitle) continue;
    const targetTokens = [...tokenise(targetTitle)];
    if (targetTokens.length === 0) continue;
    const overlap = targetTokens.filter(w => jobTitleTokens.has(w)).length;
    const fraction = overlap / targetTokens.length;
    if (fraction > bestTitleFraction) {
      bestTitleFraction = fraction;
      matchedTitle = targetTitle;
    }
  }
  const titleScore = profile.targetJobTitles.length > 0
    ? Math.floor(bestTitleFraction * 40)
    : 0;

  // ── Component 3: Job Type Preference (max 20) ──────────────────────────────
  const userType = normalizeJobType(profile.jobTypes);
  const jobType  = normalizeJobType(job.jobType);
  const jobTypeScore = (userType && jobType && userType === jobType) ? 20 : 0;

  // ── Total ──────────────────────────────────────────────────────────────────
  const score = skillsScore + titleScore + jobTypeScore;

  return {
    score,
    breakdown: { skillsScore, titleScore, jobTypeScore },
    matchedSkills,
    matchedTitle: bestTitleFraction > 0 ? matchedTitle : '',
  };
}
