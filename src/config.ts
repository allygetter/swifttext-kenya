import 'dotenv/config';
const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing env ${k}`); return v; };
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: need('DATABASE_URL'),
  jwtSecret: need('JWT_SECRET'),
  baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  prod: process.env.NODE_ENV === 'production',
  mpesa: {
    env: process.env.MPESA_ENV ?? 'sandbox',
    key: process.env.MPESA_CONSUMER_KEY ?? '',
    secret: process.env.MPESA_CONSUMER_SECRET ?? '',
    shortcode: process.env.MPESA_SHORTCODE ?? '',
    passkey: process.env.MPESA_PASSKEY ?? '',
    callbackUrl: process.env.MPESA_CALLBACK_URL ?? '',
    callbackToken: process.env.MPESA_CALLBACK_TOKEN ?? '',
  },
};
