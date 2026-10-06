import type { z } from 'zod';
import {
  databaseEnvironmentSchema,
  environmentSchema,
  type Environment,
} from './environment.schema.js';

export interface AppConfig {
  readonly environment: Environment['NODE_ENV'];
  readonly port: number;
  readonly logLevel: Environment['LOG_LEVEL'];
  readonly databaseUrl: string;
  readonly openaiApiKey: string;
  readonly openaiModel: string;
  readonly openaiReasoningEffort: Environment['OPENAI_REASONING_EFFORT'];
  readonly aiConfidenceThreshold: number;
  readonly kapsoApiKey: string;
  readonly kapsoWebhookSecret: string;
  readonly kapsoPhoneNumberId: string;
  readonly kapsoApiBaseUrl: string;
  readonly proactiveEvaluationEnabled: boolean;
  readonly proactiveAiMessages: boolean;
  readonly trustedProxyHops: number;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export class InvalidEnvironmentError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(', ')}`);
    this.name = InvalidEnvironmentError.name;
  }
}

type Variables = Record<string, string | undefined>;

function parse<Shape extends z.ZodType>(schema: Shape, variables: Variables): z.output<Shape> {
  const result = schema.safeParse(variables);
  if (!result.success) {
    const invalidVariables = new Set(result.error.issues.map((issue) => issue.path.join('.')));
    throw new InvalidEnvironmentError([...invalidVariables].sort());
  }
  return result.data;
}

export function loadAppConfig(variables: Variables): AppConfig {
  const environment = parse(environmentSchema, variables);
  return {
    environment: environment.NODE_ENV,
    port: environment.PORT,
    logLevel: environment.LOG_LEVEL,
    databaseUrl: environment.DATABASE_URL,
    openaiApiKey: environment.OPENAI_API_KEY,
    openaiModel: environment.OPENAI_MODEL,
    openaiReasoningEffort: environment.OPENAI_REASONING_EFFORT,
    aiConfidenceThreshold: environment.AI_CONFIDENCE_THRESHOLD,
    kapsoApiKey: environment.KAPSO_API_KEY,
    kapsoWebhookSecret: environment.KAPSO_WEBHOOK_SECRET,
    kapsoPhoneNumberId: environment.KAPSO_PHONE_NUMBER_ID,
    kapsoApiBaseUrl: environment.KAPSO_API_BASE_URL,
    proactiveEvaluationEnabled: environment.PROACTIVE_EVALUATION_ENABLED,
    proactiveAiMessages: environment.PROACTIVE_AI_MESSAGES,
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
  };
}

export function loadDatabaseUrl(variables: Variables): string {
  return parse(databaseEnvironmentSchema, variables).DATABASE_URL;
}
