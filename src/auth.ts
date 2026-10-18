import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { pool } from './db';
export interface Authed extends Request { user?: { id: string; role: string; accountId: string } }
export const sign = (id: string) => jwt.sign({ sub: id }, config.jwtSecret, { expiresIn: '7d' });
export async function requireAuth(req: Authed, res: Response, next: NextFunction) {
  try {
    const t = req.cookies?.st_session; if (!t) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const { sub } = jwt.verify(t, config.jwtSecret) as { sub: string };
    const r = await pool.query(`SELECT u.id, u.status, r.name role, a.id account_id FROM users u JOIN roles r ON r.id=u.role_id
      LEFT JOIN customer_accounts a ON a.user_id=u.id WHERE u.id=$1`, [sub]);
    const u = r.rows[0];
    if (!u || u.status !== 'active') return res.status(403).json({ error: 'ACCOUNT_NOT_ACTIVE' });
    req.user = { id: u.id, role: u.role, accountId: u.account_id }; next();
  } catch { res.status(401).json({ error: 'UNAUTHENTICATED' }); }
}
export const requireRole = (...roles: string[]) => (req: Authed, res: Response, next: NextFunction) =>
  roles.includes(req.user!.role) ? next() : res.status(403).json({ error: 'FORBIDDEN' });
