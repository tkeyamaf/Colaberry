import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';
import mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// POST /api/ai/resume
router.post('/ai/resume', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI service is not configured. ANTHROPIC_API_KEY is missing.' });
    return;
  }

  const { candidateData } = req.body;

  if (!candidateData || typeof candidateData !== 'object') {
    res.status(400).json({ error: 'candidateData object is required' });
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are a professional resume writer. Create a clean, ATS-friendly resume in HTML format for the following candidate. Use proper resume sections: Summary, Skills, Experience, Education, Certifications. Make it professional and compelling. Return ONLY the HTML content inside a <div class='resume-output'> wrapper, no markdown, no explanation. Candidate data: ${JSON.stringify(candidateData)}`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    const html = content.type === 'text' ? content.text : '';

    res.json({ html });
  } catch (err: any) {
    console.error('AI resume generation error:', err);
    res.status(500).json({ error: 'Failed to generate resume. Please try again.' });
  }
});

// POST /api/ai/resume-extract — accept uploaded PDF/DOCX/TXT, return plain text
router.post('/ai/resume-extract', upload.single('file'), async (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }

  try {
    let text = '';
    const mime = file.mimetype;
    const name = (file.originalname || '').toLowerCase();

    if (mime === 'text/plain' || name.endsWith('.txt')) {
      text = file.buffer.toString('utf8');
    } else if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      const result = await pdfParse(file.buffer);
      text = result.text;
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else if (name.endsWith('.doc')) {
      // Older .doc format — attempt mammoth, may be partial
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else {
      res.status(400).json({ error: 'Unsupported file type. Please upload a PDF, DOCX, DOC, or TXT file.' });
      return;
    }

    if (!text || text.trim().length < 20) {
      res.status(422).json({ error: 'Could not extract readable text from the file. Try pasting the text instead.' });
      return;
    }

    res.json({ text: text.slice(0, 8000) });
  } catch (err: any) {
    console.error('Resume extract error:', err);
    res.status(500).json({ error: 'Failed to read the file. Try pasting the text instead.' });
  }
});

// POST /api/ai/resume-parse — extract structured fields from pasted resume text
router.post('/ai/resume-parse', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI service not configured' });
    return;
  }

  const { resumeText } = req.body;
  if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length < 20) {
    res.status(400).json({ error: 'resumeText is required (minimum 20 characters)' });
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Extract structured profile data from the resume text below. Return ONLY a valid JSON object with these exact keys:
- "skills": array of skill strings (technical tools, languages, and soft skills; max 20 items)
- "targetJobTitles": array of up to 3 job title strings the candidate is targeting based on their background (e.g. ["Data Analyst", "Business Analyst"])
- "jobTypes": string — one of "Full-time", "Part-time", "Contract", "Internship", or "Freelance"; infer from context, default to "Full-time"
- "summary": string — a 2–3 sentence professional summary derived from their experience
- "phone": string — phone number if present, otherwise ""
- "city": string — city of residence if present, otherwise ""
- "state": string — US state abbreviation (e.g. "TX") if present, otherwise ""

If a field cannot be determined, use [] for arrays or "" for strings. Return raw JSON only, no markdown.

Resume:
${resumeText.slice(0, 4000)}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    res.json({
      skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
      targetJobTitles: Array.isArray(parsed.targetJobTitles) ? parsed.targetJobTitles.map(String) : [],
      jobTypes: typeof parsed.jobTypes === 'string' ? parsed.jobTypes : 'Full-time',
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      city: typeof parsed.city === 'string' ? parsed.city : '',
      state: typeof parsed.state === 'string' ? parsed.state : '',
    });
  } catch (err: any) {
    console.error('Resume parse error:', err);
    res.status(500).json({ error: 'Failed to parse resume. Please try again.' });
  }
});

// POST /api/ai/resume-enhance — rewrite the user's existing resume for a target
// role using keyword alignment only.  No fabrication is allowed by the prompt.
router.post('/ai/resume-enhance', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI service not configured' });
    return;
  }

  const { resumeText, targetJobTitle, jobDescription, missingSkills } = req.body;

  if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length < 20) {
    res.status(400).json({ error: 'resumeText is required (minimum 20 characters)' });
    return;
  }
  if (!targetJobTitle || typeof targetJobTitle !== 'string') {
    res.status(400).json({ error: 'targetJobTitle is required' });
    return;
  }

  // Build the list of skills the user is missing so the prompt can
  // explicitly instruct Claude NOT to add them.
  const missingList = Array.isArray(missingSkills) && missingSkills.length > 0
    ? missingSkills.join(', ')
    : 'none identified';

  const prompt = `You are an expert resume writer helping a candidate optimize their existing resume for a specific target role.

TRUTHFULNESS RULES — follow these exactly. Violations make the resume fraudulent:
1. Use ONLY information present in the candidate's existing resume text below.
2. Do NOT add, imply, or claim any skill, tool, certification, job title, company name, project, achievement, or year of experience that does not already appear in the resume text.
3. The following skills are MISSING from the candidate's profile — do NOT add them to the resume, even if the job description asks for them: ${missingList}
4. You MAY improve: sentence clarity, action verbs, section order, formatting, and keyword phrasing — but only when the underlying fact already exists in the resume.
5. If the job description uses a synonym for something the candidate already has (e.g. "data visualisation" when resume says "Tableau"), you MAY adopt the job's phrasing since the skill is real.
6. Add a short honesty note at the very top of the output.

Target Role: ${targetJobTitle.slice(0, 200)}

Job Description (use its language to rephrase existing content only):
${(jobDescription || '').slice(0, 1500)}

Candidate's Existing Resume:
${resumeText.slice(0, 3000)}

Return ONLY an HTML document fragment inside <div class="enhanced-resume-output">. Start with:
<p class="resume-honesty-note" style="background:#e8f5ee;border-left:4px solid #2d8a4e;padding:10px 14px;font-size:0.85rem;color:#1a1a2e;margin-bottom:20px">
  ✅ <strong>Optimized for keyword alignment.</strong> All content reflects your existing experience — no new skills, titles, or achievements have been added.
</p>
Then the full resume in clean HTML with sections: Summary, Skills, Experience, Education. No markdown, no explanation outside the HTML.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw  = message.content[0].type === 'text' ? message.content[0].text : '';
    // Strip any markdown code fences Claude might add despite instructions
    const html = raw.replace(/^```html?\n?/i, '').replace(/\n?```$/, '').trim();

    res.json({ html });
  } catch (err: any) {
    console.error('Resume enhance error:', err);
    res.status(500).json({ error: 'Failed to generate enhanced resume. Please try again.' });
  }
});

// POST /api/ai/interview-prep
router.post('/ai/interview-prep', async (req: Request, res: Response) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI service is not configured. ANTHROPIC_API_KEY is missing.' });
    return;
  }

  const { jobTitle, jobDescription, candidateName } = req.body;

  if (!jobTitle || typeof jobTitle !== 'string' || jobTitle.trim() === '') {
    res.status(400).json({ error: 'jobTitle is required' });
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are a career coach. Generate interview preparation content for a candidate${candidateName ? ` named ${candidateName}` : ''} applying for a ${jobTitle} position${jobDescription ? `. Job description: ${jobDescription}` : ''}. Include: 1) 5 likely interview questions with suggested answers, 2) 3 key topics to study, 3) 2 questions the candidate should ask the interviewer. Format as clean HTML with sections. Return ONLY HTML inside a <div class='interview-prep-output'> wrapper.`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    const html = content.type === 'text' ? content.text : '';

    res.json({ html });
  } catch (err: any) {
    console.error('AI interview prep error:', err);
    res.status(500).json({ error: 'Failed to generate interview prep. Please try again.' });
  }
});

export default router;
