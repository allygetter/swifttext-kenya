import { config } from '../config';
import { pool, tx } from '../db';
import { deposit } from '../billing/ledger';
const base = () => config.mpesa.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
async function token() {
  const auth = Buffer.from(`${config.mpesa.key}:${config.mpesa.secret}`).toString('base64');
  const r = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) throw new Error('Daraja auth failed'); return (await r.json() as any).access_token as string;
}
export async function stkPush(accountId: string, phone: string, amount: number, packageId?: string) {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const password = Buffer.from(config.mpesa.shortcode + config.mpesa.passkey + ts).toString('base64');
  const pay = await pool.query('INSERT INTO payment_transactions(account_id,package_id,phone,amount_ksh) VALUES($1,$2,$3,$4) RETURNING id',
    [accountId, packageId, phone, amount]);
  const r = await fetch(`${base()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: config.mpesa.shortcode, Password: password, Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline', Amount: Math.round(amount), PartyA: phone, PartyB: config.mpesa.shortcode,
      PhoneNumber: phone, CallBackURL: `${config.mpesa.callbackUrl}/${config.mpesa.callbackToken}`,
      AccountReference: 'SwiftText', TransactionDesc: 'SMS credits' }) });
  const j: any = await r.json();
  if (j.ResponseCode !== '0') {
    await pool.query("UPDATE payment_transactions SET status='failed', result_desc=$2 WHERE id=$1", [pay.rows[0].id, j.errorMessage ?? j.ResponseDescription]);
    throw new Error('STK push rejected');
  }
  await pool.query("UPDATE payment_transactions SET status='pending', merchant_request_id=$2, checkout_request_id=$3 WHERE id=$1",
    [pay.rows[0].id, j.MerchantRequestID, j.CheckoutRequestID]);
  return { paymentId: pay.rows[0].id as string };
}
// Idempotent: a repeated callback never credits twice (row lock + receipt unique + ledger idempotency key).
export async function handleCallback(body: any) {
  const cb = body?.Body?.stkCallback; if (!cb) return;
  await pool.query('INSERT INTO payment_callbacks(checkout_request_id,payload) VALUES($1,$2)', [cb.CheckoutRequestID, body]);
  await tx(async c => {
    const p = await c.query('SELECT * FROM payment_transactions WHERE checkout_request_id=$1 FOR UPDATE', [cb.CheckoutRequestID]);
    if (!p.rowCount || p.rows[0].status === 'success') return;
    const row = p.rows[0];
    if (cb.ResultCode !== 0) {
      await c.query("UPDATE payment_transactions SET status=$2, result_desc=$3, completed_at=now() WHERE id=$1",
        [row.id, cb.ResultCode === 1032 ? 'cancelled' : 'failed', cb.ResultDesc]); return;
    }
    const items: any[] = cb.CallbackMetadata?.Item ?? [];
    const get = (n: string) => items.find(i => i.Name === n)?.Value;
    // Amount cross-check against what we requested; mismatch => leave for manual reconciliation.
    if (Number(get('Amount')) !== Number(row.amount_ksh)) {
      await c.query("UPDATE payment_transactions SET status='failed', result_desc='amount mismatch' WHERE id=$1", [row.id]); return;
    }
    let credit = Number(row.amount_ksh);
    if (row.package_id) { const k = await c.query('SELECT credit_ksh FROM sms_packages WHERE id=$1', [row.package_id]); credit = Number(k.rows[0].credit_ksh); }
    const receipt = String(get('MpesaReceiptNumber'));
    await c.query("UPDATE payment_transactions SET status='success', mpesa_receipt=$2, completed_at=now() WHERE id=$1", [row.id, receipt]);
    await deposit(c, row.account_id, credit, 'mpesa:' + receipt, receipt);
  });
  // TODO(production): also query Daraja Transaction Status API to verify before crediting, and add IP allow-listing.
}
