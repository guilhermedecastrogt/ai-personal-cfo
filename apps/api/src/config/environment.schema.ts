import { z } from 'zod';

const POSTGRES_PROTOCOL = /^postgres(ql)?$/;
const LOWEST_PORT = 1;
const HIGHEST_PORT = 65535;
const DEFAULT_PORT = 3000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
const DEFAULT_KAPSO_API_BASE_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0';

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(LOWEST_PORT).max(HIGHEST_PORT).default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug']).default('log'),
  DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL }),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  KAPSO_API_KEY: z.string().min(1),
  KAPSO_WEBHOOK_SECRET: z.string().min(1),
  KAPSO_PHONE_NUMBER_ID: z.string().regex(/^\d+$/),
  KAPSO_API_BASE_URL: z.url({ protocol: /^https$/ }).default(DEFAULT_KAPSO_API_BASE_URL),
  PROACTIVE_EVALUATION_ENABLED: flag,
  PROACTIVE_AI_MESSAGES: flag,
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(DEFAULT_CONFIDENCE_THRESHOLD),
});

export type Environment = z.infer<typeof environmentSchema>;
