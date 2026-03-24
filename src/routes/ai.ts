import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

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
