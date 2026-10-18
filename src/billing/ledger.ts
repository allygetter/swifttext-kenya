import { PoolClient } from 'pg';
// All functions must run inside tx(); the account row is locked so balance_after is consistent.
async function lock(c: PoolClient, accountId: string) {
  const r = await c.query('SELECT balance, reserved FROM customer_accounts WHERE id=$1 FOR UPDATE', [accountId]);
  if (!r.rowCount) throw new Error('account not found');
  return { balance: Number(r.rows[0].balance), reserved: Number(r.rows[0].reserved) };
}
async function post(c: PoolClient, accountId: string, kind: string, amount: number, newBalance: number, newReserved: number,
  key: string, reference?: string, note?: string, by?: string): Promise<boolean> {
  const ins = await c.query(
    `INSERT INTO credit_transactions(account_id,kind,amount,balance_after,reference,idempotency_key,note,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING`,
    [accountId, kind, amount, newBalance, reference, key, note, by]);
  if (!ins.rowCount) return false; // duplicate: already applied
  await c.query('UPDATE customer_accounts SET balance=$2, reserved=$3 WHERE id=$1', [accountId, newBalance, newReserved]);
  return true;
}
export async function deposit(c: PoolClient, acc: string, amount: number, key: string, ref?: string) {
  const s = await lock(c, acc); return post(c, acc, 'deposit', amount, s.balance + amount, s.reserved, key, ref);
}
export async function reserve(c: PoolClient, acc: string, amount: number, key: string, campaignId?: string) {
  const s = await lock(c, acc);
  if (s.balance - s.reserved < amount) throw new Error('INSUFFICIENT_CREDIT');
  const ok = await post(c, acc, 'reservation', -0, s.balance, s.reserved + amount, key, campaignId);
  if (ok) await c.query('INSERT INTO credit_reservations(account_id,amount,campaign_id) VALUES($1,$2,$3)', [acc, amount, campaignId]);
  return ok;
}
// Finalize actual charge (<= reserved) and release the remainder.
export async function finalize(c: PoolClient, acc: string, reserved: number, actual: number, key: string, ref?: string) {
  const s = await lock(c, acc);
  return post(c, acc, 'charge', -actual, s.balance - actual, s.reserved - reserved, key, ref);
}
export async function refund(c: PoolClient, acc: string, amount: number, key: string, ref?: string) {
  const s = await lock(c, acc); return post(c, acc, 'refund', amount, s.balance + amount, s.reserved, key, ref);
}
