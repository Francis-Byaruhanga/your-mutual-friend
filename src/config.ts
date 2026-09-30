import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  AT_USERNAME: z.string().min(1).default('sandbox'),
  AT_API_KEY: z.string().default(''),
  AT_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  AT_SHORTCODE: z.string().default(''),
  AT_CALLBACK_BASE_URL: z.string().url().default('http://localhost:3000'),

  NGROK_DOMAIN: z.string().default(''),
  NGROK_AUTHTOKEN: z.string().default(''),

  TERMS_URL: z.string().url().default('https://oldmutual.co.ug/your-mutual-friend/terms'),

  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = parsed.data;

export const isProduction = config.NODE_ENV === 'production';

/**
 * The public callback base URL with any trailing slash removed, so we can safely
 * append a route to it when telling the user what to paste into the AT sandbox.
 */
export const callbackBaseUrl = config.AT_CALLBACK_BASE_URL.replace(/\/+$/, '');

export const ussdCallbackUrl = `${callbackBaseUrl}/ussd`;
