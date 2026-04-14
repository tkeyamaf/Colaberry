import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'careerbridge-secret-2026';

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; email: string; role: string };
}

/**
 * Middleware for future admin-only routes.
 * Verifies the Bearer JWT server-side and rejects requests where role !== 'admin'.
 * Never trust the frontend for this check.
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string };
    if (decoded.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
