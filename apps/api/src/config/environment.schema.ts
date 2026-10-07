import { z } from 'zod';
import { SECURITY_POLICY } from '../security/security-policy.js';

const POSTGRES_PROTOCOL = /^postgres(ql)?$/;
const LOWEST_PORT = 1;
const HIGHEST_PORT = 65535;
const DEFAULT_PORT = 3000;
const MAXIMUM_PROXY_HOPS = 5;
const PLACEHOLDER = /^(replace-with|changeme|change-me|unused|example|placeholder|test$)/i;
const DEVELOPMENT_DATABASE_CREDENTIALS = '://cfo:cfo@';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
const DEFAULT_KAPSO_API_BASE_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0';

export const REASONING_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high'] as const;

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const baseEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(LOWEST_PORT).max(HIGHEST_PORT).default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug']).default('log'),
  DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL }),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_REASONING_EFFORT: z.enum(REASONING_EFFORTS).default('low'),
  KAPSO_API_KEY: z.string().min(1),
  KAPSO_WEBHOOK_SECRET: z.string().min(1),
  KAPSO_PHONE_NUMBER_ID: z.string().regex(/^\d+$/),
  KAPSO_API_BASE_URL: z.url({ protocol: /^https$/ }).default(DEFAULT_KAPSO_API_BASE_URL),
  WHATSAPP_WELCOME_TEMPLATE: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{0,512}$/)
    .default('')
    .transform((value) => (value === '' ? null : value)),
  PROACTIVE_EVALUATION_ENABLED: flag,
  PROACTIVE_AI_MESSAGES: flag,
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(MAXIMUM_PROXY_HOPS).default(0),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(DEFAULT_CONFIDENCE_THRESHOLD),
});

const PRODUCTION_SECRETS = [
  'OPENAI_API_KEY',
  'KAPSO_API_KEY',
  'KAPSO_WEBHOOK_SECRET',
  'DATABASE_URL',
] as const;

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value) || value.includes(DEVELOPMENT_DATABASE_CREDENTIALS);
}

export const databaseEnvironmentSchema = baseEnvironmentSchema.pick({ DATABASE_URL: true });

export const environmentSchema = baseEnvironmentSchema.superRefine((environment, context) => {
  if (environment.NODE_ENV !== 'production') {
    return;
  }
  for (const name of PRODUCTION_SECRETS) {
    if (isPlaceholder(environment[name])) {
      context.addIssue({ code: 'custom', path: [name], message: 'placeholder' });
    }
  }
  if (environment.KAPSO_WEBHOOK_SECRET.length < SECURITY_POLICY.minimumWebhookSecretLength) {
    context.addIssue({ code: 'custom', path: ['KAPSO_WEBHOOK_SECRET'], message: 'too short' });
  }
  if (/^0+$/.test(environment.KAPSO_PHONE_NUMBER_ID)) {
    context.addIssue({ code: 'custom', path: ['KAPSO_PHONE_NUMBER_ID'], message: 'placeholder' });
  }
});

export type Environment = z.infer<typeof environmentSchema>;
