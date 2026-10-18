CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE roles(id serial PRIMARY KEY, name text UNIQUE NOT NULL);
INSERT INTO roles(name) VALUES('customer'),('support'),('admin'),('superadmin');
CREATE TABLE users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password_hash text NOT NULL,
  role_id int NOT NULL REFERENCES roles(id) DEFAULT 1,
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification','active','suspended','closed')),
  verify_token_hash text, mfa_secret text, created_at timestamptz DEFAULT now());
CREATE TABLE profiles(user_id uuid PRIMARY KEY REFERENCES users(id), full_name text NOT NULL, phone text NOT NULL,
  business_name text, business_verified boolean DEFAULT false);
CREATE TABLE customer_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL REFERENCES users(id),
  balance numeric(14,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),   -- cache; ledger is source of truth
  reserved numeric(14,4) NOT NULL DEFAULT 0 CHECK (reserved >= 0), created_at timestamptz DEFAULT now());
CREATE TABLE sms_packages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, price_ksh numeric(12,2) NOT NULL,
  credit_ksh numeric(12,2) NOT NULL, active boolean DEFAULT true);
CREATE TABLE credit_transactions(  -- append-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id),
  kind text NOT NULL CHECK (kind IN ('deposit','reservation','charge','release','refund','adjustment')),
  amount numeric(14,4) NOT NULL, balance_after numeric(14,4) NOT NULL, reference text,
  idempotency_key text UNIQUE NOT NULL, note text, created_by uuid REFERENCES users(id), created_at timestamptz DEFAULT now());
CREATE INDEX ON credit_transactions(account_id, created_at DESC);
CREATE TABLE credit_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id),
  amount numeric(14,4) NOT NULL, status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','finalized','released')),
  campaign_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE payment_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id),
  package_id uuid REFERENCES sms_packages(id), phone text NOT NULL, amount_ksh numeric(12,2) NOT NULL,
  merchant_request_id text, checkout_request_id text UNIQUE, mpesa_receipt text UNIQUE,
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','pending','success','failed','cancelled')),
  result_desc text, created_at timestamptz DEFAULT now(), completed_at timestamptz);
CREATE TABLE payment_callbacks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), checkout_request_id text, payload jsonb NOT NULL,
  received_at timestamptz DEFAULT now());
CREATE TABLE contact_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id), name text NOT NULL, UNIQUE(account_id,name));
CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id),
  name text, phone text NOT NULL, consent_basis text, created_at timestamptz DEFAULT now(), UNIQUE(account_id,phone));
CREATE TABLE group_members(group_id uuid REFERENCES contact_groups(id) ON DELETE CASCADE, contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE, PRIMARY KEY(group_id,contact_id));
CREATE TABLE suppression_lists(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id), phone text NOT NULL, reason text, UNIQUE(account_id,phone));
CREATE TABLE provider_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, adapter text NOT NULL, active boolean DEFAULT false, cost_per_unit_ksh numeric(10,4));
CREATE TABLE sender_ids(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id), name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','rejected','suspended')),
  documents jsonb, provider_feedback text, reviewed_by uuid REFERENCES users(id), UNIQUE(account_id,name));
CREATE TABLE campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id), name text NOT NULL,
  sender_id uuid REFERENCES sender_ids(id), body text NOT NULL, units_per_msg int NOT NULL, recipients int NOT NULL, total_cost numeric(14,4) NOT NULL,
  status text NOT NULL DEFAULT 'queued', scheduled_at timestamptz, submitted_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE campaign_recipients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id), phone text NOT NULL, valid boolean DEFAULT true);
CREATE TABLE sms_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id), campaign_id uuid REFERENCES campaigns(id),
  phone text NOT NULL, units int NOT NULL, provider_message_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','submitted','sent','delivered','failed','rejected','unknown')),
  error_code text, created_at timestamptz DEFAULT now());
CREATE INDEX ON sms_messages(account_id, created_at DESC); CREATE INDEX ON sms_messages(provider_message_id);
CREATE TABLE delivery_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid REFERENCES sms_messages(id), status text NOT NULL, raw jsonb, received_at timestamptz DEFAULT now());
CREATE TABLE provider_webhooks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payload jsonb, signature_valid boolean, received_at timestamptz DEFAULT now());
CREATE TABLE api_keys(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id), prefix text NOT NULL,
  key_hash text UNIQUE NOT NULL, mode text NOT NULL CHECK (mode IN ('test','live')), revoked_at timestamptz, daily_limit int, created_at timestamptz DEFAULT now());
CREATE TABLE api_usage_logs(id bigserial PRIMARY KEY, api_key_id uuid REFERENCES api_keys(id), endpoint text, status_code int, created_at timestamptz DEFAULT now());
CREATE TABLE otp_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES customer_accounts(id), phone text NOT NULL,
  code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts int DEFAULT 0, used_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE support_tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid REFERENCES customer_accounts(id), subject text, body text, status text DEFAULT 'open', created_at timestamptz DEFAULT now());
CREATE TABLE audit_logs(id bigserial PRIMARY KEY, actor uuid, action text NOT NULL, target text, detail jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE system_settings(key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz DEFAULT now());
-- Configuration DEFAULTS only; admin must set real prices before launch.
INSERT INTO system_settings VALUES('price_per_unit_ksh','0.50',now());
INSERT INTO sms_packages(name,price_ksh,credit_ksh) VALUES('Starter (default)',500,500),('Growth (default)',2000,2000);
