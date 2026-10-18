import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../db'; import { requireAuth, Authed } from '../auth';
import { smsInfo, normalizeKenyanPhone } from '../sms/units';
import { reserve } from '../billing/ledger'; import { stkPush, handleCallback } from '../mpesa/daraja'; import { config } from '../config';
export const api = Router();
const price = async () => Number((await pool.query("SELECT value FROM system_settings WHERE key='price_per_unit_ksh'")).rows[0].value);
api.post('/mpesa/callback/:token', async (req, res) => {           // no session: Safaricom calls this
  if (req.params.token !== config.mpesa.callbackToken) return res.sendStatus(404);
  await handleCallback(req.body).catch(e => console.error('callback', e)); res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});
api.use(requireAuth);
api.get('/balance', async (req: Authed, res) => {
  const r = await pool.query('SELECT balance, reserved FROM customer_accounts WHERE id=$1', [req.user!.accountId]);
  res.json(r.rows[0]);
});
api.get('/transactions', async (req: Authed, res) => {
  const r = await pool.query('SELECT kind, amount, balance_after, reference, created_at FROM credit_transactions WHERE account_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user!.accountId]);
  res.json(r.rows);
});
const sendSchema = z.object({ name: z.string().min(1), body: z.string().min(1), recipients: z.array(z.string()).min(1).max(10000), idempotencyKey: z.string().min(8) });
api.post('/sms/estimate', async (req, res) => {
  const p = sendSchema.omit({ idempotencyKey: true, name: true }).safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'INVALID_INPUT' });
  const valid = [...new Set(p.data.recipients.map(normalizeKenyanPhone).filter((x): x is string => !!x))];
  const info = smsInfo(p.data.body);
  res.json({ ...info, validRecipients: valid.length, invalidOrDuplicate: p.data.recipients.length - valid.length, cost: valid.length * info.units * await price() });
});
api.post('/sms/send', async (req: Authed, res) => {
  const p = sendSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'INVALID_INPUT' });
  const acc = req.user!.accountId;
  const valid = [...new Set(p.data.recipients.map(normalizeKenyanPhone).filter((x): x is string => !!x))];
  const sup = await pool.query('SELECT phone FROM suppression_lists WHERE account_id=$1', [acc]);
  const blocked = new Set(sup.rows.map(r => r.phone)); const targets = valid.filter(n => !blocked.has(n));
  if (!targets.length) return res.status(400).json({ error: 'NO_VALID_RECIPIENTS' });
  const info = smsInfo(p.data.body); const cost = targets.length * info.units * await price();
  try {
    const id = await tx(async c => {
      const camp = await c.query(`INSERT INTO campaigns(account_id,name,body,units_per_msg,recipients,total_cost) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [acc, p.data.name, p.data.body, info.units, targets.length, cost]);
      const ok = await reserve(c, acc, cost, 'reserve:' + acc + ':' + p.data.idempotencyKey, camp.rows[0].id);
      if (!ok) throw new Error('DUPLICATE');
      for (const n of targets) await c.query('INSERT INTO sms_messages(account_id,campaign_id,phone,units) VALUES($1,$2,$3,$4)', [acc, camp.rows[0].id, n, info.units]);
      return camp.rows[0].id as string;
    });
    res.status(202).json({ campaignId: id, recipients: targets.length, reservedCost: cost }); // worker dispatches queued rows
  } catch (e: any) {
    if (e.message === 'INSUFFICIENT_CREDIT') return res.status(402).json({ error: e.message });
    if (e.message === 'DUPLICATE') return res.status(409).json({ error: 'DUPLICATE_REQUEST' });
    throw e;
  }
});
api.post('/payments/stk', async (req: Authed, res) => {
  const p = z.object({ phone: z.string(), amount: z.number().min(10).max(150000) }).safeParse(req.body);
  const phone = p.success ? normalizeKenyanPhone(p.data.phone) : null; if (!p.success || !phone) return res.status(400).json({ error: 'INVALID_INPUT' });
  res.status(202).json(await stkPush(req.user!.accountId, phone, p.data.amount));
});
