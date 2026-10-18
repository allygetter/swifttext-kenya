# SwiftText — Bulk SMS & OTP platform (Kenya)

Status: **Phase 1–2 foundation + early Phase 3/4 pieces.** Not production-ready.

## Implemented
- Postgres schema for all 26 required tables (`migrations/001_init.sql`), append-only credit ledger
- Registration (bcrypt), email-verify token (dev: logged to console), login via httpOnly cookie, role lookup
- SMS unit calculator (GSM-7/extension/UCS-2/multipart) + Kenyan phone normalizer — **unit-tested**
- Ledger: deposit / reserve / finalize / refund with row locks and idempotency keys
- M-Pesa STK Push + idempotent callback (Daraja sandbox config)
- Provider adapter interface + **mock** adapter only
- `/api/sms/estimate`, `/api/sms/send` (validates, dedupes, suppression check, reserves credit, queues rows)
- Basic public landing page

## NOT yet implemented (outstanding)
Real provider adapter, queue worker/dispatch & finalize/refund flow, delivery webhooks, scheduling, contacts/CSV import,
sender ID workflow, API keys + OTP API, admin dashboard & financial reports, MFA, password reset, React dashboard,
legal pages, integration/tenant-isolation tests, Daraja Transaction Status verification.

## Setup
1. `cp .env.example .env` and fill values (Postgres required)
2. `npm install && npm run migrate && npm run dev`
3. `npm test`
Daraja: create a sandbox app at developer.safaricom.co.ke, set keys + passkey; callback URL must be public HTTPS (e.g. ngrok).
Prices in the schema are placeholders; change `system_settings` / `sms_packages` before launch.
Compliance (CA Kenya, Data Protection Act 2019, Daraja terms) must be reviewed before launch.
