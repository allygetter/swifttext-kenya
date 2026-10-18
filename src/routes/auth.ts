import { Router } from 'express';
import bcrypt from 'bcryptjs'; import crypto from 'crypto'; import { z } from 'zod';
import { pool, tx } from '../db'; import { sign, requireAuth, Authed } from '../auth'; import { config } from '../config';
import { normalizeKenyanPhone } from '../sms/units';
export const auth = Router();
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
auth.post('/register', async (req, res) => {
  const p = z.object({ name: z.string().min(2), email: z.string().email(), phone: z.string(), password: z.string().min(10) }).safeParse(req.body);
  const phone = p.success ? normalizeKenyanPhone(p.data.phone) : null;
  if (!p.success || !phone) return res.status(400).json({ error: 'INVALID_INPUT' });
  const raw = crypto.randomBytes(24).toString('hex');
  try {
    await tx(async c => {
      const u = await c.query('INSERT INTO users(email,password_hash,verify_token_hash) VALUES($1,$2,$3) RETURNING id',
        [p.data.email.toLowerCase(), await bcrypt.hash(p.data.password, 12), sha(raw)]);
      await c.query('INSERT INTO profiles(user_id,full_name,phone) VALUES($1,$2,$3)', [u.rows[0].id, p.data.name, phone]);
      await c.query('INSERT INTO customer_accounts(user_id) VALUES($1)', [u.rows[0].id]);
    });
  } catch { return res.status(409).json({ error: 'EMAIL_IN_USE' }); }
  // TODO: send via real email service. Dev only: log the link.
  if (!config.prod) console.log(`[dev] verify: ${config.baseUrl}/api/auth/verify?token=${raw}`);
  res.status(201).json({ ok: true });
});
auth.get('/verify', async (req, res) => {
  const r = await pool.query("UPDATE users SET status='active', verify_token_hash=NULL WHERE verify_token_hash=$1 AND status='pending_verification'", [sha(String(req.query.token ?? ''))]);
  res.status(r.rowCount ? 200 : 400).json({ ok: !!r.rowCount });
});
auth.post('/login', async (req, res) => {
  const r = await pool.query('SELECT id, password_hash, status FROM users WHERE email=$1', [String(req.body.email ?? '').toLowerCase()]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(String(req.body.password ?? ''), u.password_hash))) return res.status(401).json({ error: 'BAD_CREDENTIALS' });
  if (u.status !== 'active') return res.status(403).json({ error: 'ACCOUNT_NOT_ACTIVE' });
  res.cookie('st_session', sign(u.id), { httpOnly: true, sameSite: 'strict', secure: config.prod, maxAge: 7 * 864e5 }).json({ ok: true });
});
auth.post('/logout', (_q, res) => res.clearCookie('st_session').json({ ok: true }));
auth.get('/me', requireAuth, (req: Authed, res) => res.json(req.user));
