import { environmentSchema, type Environment } from './environment.schema.js';

export interface AppConfig {
  readonly environment: Environment['NODE_ENV'];
  readonly port: number;
  readonly logLevel: Environment['LOG_LEVEL'];
  readonly databaseUrl: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export class InvalidEnvironmentError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(', ')}`);
    this.name = InvalidEnvironmentError.name;
  }
}

export function loadAppConfig(variables: Record<string, string | undefined>): AppConfig {
  const result = environmentSchema.safeParse(variables);
  if (!result.success) {
    const invalidVariables = new Set(result.error.issues.map((issue) => issue.path.join('.')));
    throw new InvalidEnvironmentError([...invalidVariables].sort());
  }
  return {
    environment: result.data.NODE_ENV,
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    databaseUrl: result.data.DATABASE_URL,
  };
}
