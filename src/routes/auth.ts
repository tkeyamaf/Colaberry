import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'careerbridge-secret-2026';

function generateStudentNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `CB-${digits}`;
}


// POST /api/auth/signup
router.post('/auth/signup', async (req: Request, res: Response) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    res.status(400).json({ error: 'Full name, email, and password are required' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let studentNumber = generateStudentNumber();

    // ensure uniqueness
    let attempts = 0;
    while (attempts < 10) {
      const check = await pool.query('SELECT id FROM users WHERE student_number = $1', [studentNumber]);
      if (check.rows.length === 0) break;
      studentNumber = generateStudentNumber();
      attempts++;
    }

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, student_number)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, student_number, profile_complete, fit_score, role, created_at`,
      [fullName, email.toLowerCase(), passwordHash, studentNumber]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        profileComplete: user.profile_complete,
        fitScore: user.fit_score,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, full_name, email, password_hash, student_number, profile_complete, fit_score, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        profileComplete: user.profile_complete,
        fitScore: user.fit_score,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me  (requires Authorization: Bearer <token>)
router.get('/auth/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const result = await pool.query(
      'SELECT id, full_name, email, student_number, profile_complete, fit_score, role, phone, city, state, skills, target_job_titles, job_types, summary, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      profileComplete: user.profile_complete,
      fitScore: user.fit_score,
      role: user.role,
      phone: user.phone,
      city: user.city,
      state: user.state,
      skills: user.skills,
      targetJobTitles: user.target_job_titles,
      jobTypes: user.job_types,
      summary: user.summary,
      memberSince: user.created_at,
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export default router;
