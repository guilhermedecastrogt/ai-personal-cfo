import { InvalidEnvironmentError, loadAppConfig, loadDatabaseUrl } from './app-config.js';

const DATABASE_URL = 'postgres://cfo:secret@localhost:5432/cfo';

const REQUIRED = {
  DATABASE_URL,
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'test-model',
  KAPSO_API_KEY: 'kapso-key',
  KAPSO_WEBHOOK_SECRET: 'kapso-secret',
  KAPSO_PHONE_NUMBER_ID: '123456789012345',
};

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the action to throw');
}

function invalidVariables(variables: Record<string, string | undefined>): readonly string[] {
  return (captureError(() => loadAppConfig(variables)) as InvalidEnvironmentError).variables;
}

describe('loadAppConfig', () => {
  it('applies defaults when only required variables are set', () => {
    expect(loadAppConfig(REQUIRED)).toEqual({
      environment: 'development',
      port: 3000,
      logLevel: 'log',
      databaseUrl: DATABASE_URL,
      openaiApiKey: 'test-key',
      openaiModel: 'test-model',
      aiConfidenceThreshold: 0.8,
      kapsoApiKey: 'kapso-key',
      kapsoWebhookSecret: 'kapso-secret',
      kapsoPhoneNumberId: '123456789012345',
      kapsoApiBaseUrl: 'https://api.kapso.ai/meta/whatsapp/v24.0',
      proactiveEvaluationEnabled: false,
      proactiveAiMessages: false,
    });
  });

  it('reads every supported variable', () => {
    const config = loadAppConfig({
      ...REQUIRED,
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      AI_CONFIDENCE_THRESHOLD: '0.9',
    });

    expect(config).toMatchObject({
      environment: 'production',
      port: 8080,
      logLevel: 'warn',
      aiConfidenceThreshold: 0.9,
    });
  });

  it('accepts the postgresql scheme', () => {
    const databaseUrl = 'postgresql://cfo:secret@localhost:5432/cfo';

    expect(loadAppConfig({ ...REQUIRED, DATABASE_URL: databaseUrl }).databaseUrl).toBe(databaseUrl);
  });

  it('rejects an empty environment naming every required variable', () => {
    const error = captureError(() => loadAppConfig({}));

    expect(error).toBeInstanceOf(InvalidEnvironmentError);
    expect((error as InvalidEnvironmentError).variables).toEqual([
      'DATABASE_URL',
      'KAPSO_API_KEY',
      'KAPSO_PHONE_NUMBER_ID',
      'KAPSO_WEBHOOK_SECRET',
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
    ]);
  });

  it('rejects a database url that is not a postgres url', () => {
    expect(invalidVariables({ ...REQUIRED, DATABASE_URL: 'https://example.com' })).toEqual([
      'DATABASE_URL',
    ]);
  });

  it.each(['0', '65536', '80.5', 'http'])('rejects port %s', (port) => {
    expect(invalidVariables({ ...REQUIRED, PORT: port })).toEqual(['PORT']);
  });

  it('rejects a blank api key or model', () => {
    expect(invalidVariables({ ...REQUIRED, OPENAI_API_KEY: '', OPENAI_MODEL: '' })).toEqual([
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
    ]);
  });

  it('rejects a Kapso phone number id that is not numeric and a base url that is not https', () => {
    expect(
      invalidVariables({
        ...REQUIRED,
        KAPSO_PHONE_NUMBER_ID: '+1 555 0100',
        KAPSO_API_BASE_URL: 'http://api.kapso.ai',
      }),
    ).toEqual(['KAPSO_API_BASE_URL', 'KAPSO_PHONE_NUMBER_ID']);
  });

  it.each(['-0.1', '1.1', 'high'])('rejects a confidence threshold of %s', (threshold) => {
    expect(invalidVariables({ ...REQUIRED, AI_CONFIDENCE_THRESHOLD: threshold })).toEqual([
      'AI_CONFIDENCE_THRESHOLD',
    ]);
  });

  it('lists every invalid variable in alphabetical order', () => {
    expect(invalidVariables({ ...REQUIRED, NODE_ENV: 'staging', LOG_LEVEL: 'loud' })).toEqual([
      'LOG_LEVEL',
      'NODE_ENV',
    ]);
  });

  it('never includes variable values in the error message', () => {
    const error = captureError(() =>
      loadAppConfig({
        DATABASE_URL: 'mysql://cfo:database-secret@localhost:3306/cfo',
        OPENAI_API_KEY: 'sk-secret-key',
        OPENAI_MODEL: '',
        KAPSO_API_KEY: '',
        KAPSO_WEBHOOK_SECRET: '',
      }),
    );

    expect((error as Error).message).not.toContain('database-secret');
    expect((error as Error).message).not.toContain('sk-secret-key');
  });
});

describe('loadDatabaseUrl', () => {
  it('needs only the database url', () => {
    expect(loadDatabaseUrl({ DATABASE_URL })).toBe(DATABASE_URL);
  });

  it('rejects a missing or malformed database url', () => {
    expect(() => loadDatabaseUrl({})).toThrow(InvalidEnvironmentError);
    expect(() => loadDatabaseUrl({ DATABASE_URL: 'https://example.com' })).toThrow(
      InvalidEnvironmentError,
    );
  });
});
