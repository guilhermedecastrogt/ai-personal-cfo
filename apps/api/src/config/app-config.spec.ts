import { InvalidEnvironmentError, loadAppConfig } from './app-config.js';

const DATABASE_URL = 'postgres://cfo:secret@localhost:5432/cfo';

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the action to throw');
}

describe('loadAppConfig', () => {
  it('applies defaults when only required variables are set', () => {
    expect(loadAppConfig({ DATABASE_URL })).toEqual({
      environment: 'development',
      port: 3000,
      logLevel: 'log',
      databaseUrl: DATABASE_URL,
    });
  });

  it('reads every supported variable', () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      DATABASE_URL,
    });

    expect(config).toEqual({
      environment: 'production',
      port: 8080,
      logLevel: 'warn',
      databaseUrl: DATABASE_URL,
    });
  });

  it('accepts the postgresql scheme', () => {
    const databaseUrl = 'postgresql://cfo:secret@localhost:5432/cfo';

    expect(loadAppConfig({ DATABASE_URL: databaseUrl }).databaseUrl).toBe(databaseUrl);
  });

  it('rejects a missing database url', () => {
    const error = captureError(() => loadAppConfig({}));

    expect(error).toBeInstanceOf(InvalidEnvironmentError);
    expect((error as InvalidEnvironmentError).variables).toEqual(['DATABASE_URL']);
  });

  it('rejects a database url that is not a postgres url', () => {
    expect(() => loadAppConfig({ DATABASE_URL: 'https://example.com' })).toThrow(
      InvalidEnvironmentError,
    );
  });

  it.each(['0', '65536', '80.5', 'http'])('rejects port %s', (port) => {
    const error = captureError(() => loadAppConfig({ DATABASE_URL, PORT: port }));

    expect((error as InvalidEnvironmentError).variables).toEqual(['PORT']);
  });

  it('lists every invalid variable in alphabetical order', () => {
    const error = captureError(() => loadAppConfig({ NODE_ENV: 'staging', LOG_LEVEL: 'loud' }));

    expect((error as InvalidEnvironmentError).variables).toEqual([
      'DATABASE_URL',
      'LOG_LEVEL',
      'NODE_ENV',
    ]);
  });

  it('never includes variable values in the error message', () => {
    const error = captureError(() =>
      loadAppConfig({ DATABASE_URL: 'mysql://cfo:secret@localhost:3306/cfo' }),
    );

    expect((error as Error).message).not.toContain('secret');
  });
});
