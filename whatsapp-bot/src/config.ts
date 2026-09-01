import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // WhatsApp Cloud API
  WHATSAPP_TOKEN: z.string().min(1, 'WHATSAPP_TOKEN is required'),
  PHONE_NUMBER_ID: z.string().min(1, 'PHONE_NUMBER_ID is required'),
  WEBHOOK_VERIFY_TOKEN: z.string().min(1, 'WEBHOOK_VERIFY_TOKEN is required'),
  WHATSAPP_API_VERSION: z.string().default('v20.0'),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),

  // Backend API
  BACKEND_API_URL: z.string().url().default('http://backend:8000/api/v1'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),

  // Session
  SESSION_TTL_HOURS: z.coerce.number().default(24),
  SESSION_CLEANUP_INTERVAL_MS: z.coerce.number().default(3_600_000),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function validateEnv(): void {
  getEnv(); // throws if invalid
}