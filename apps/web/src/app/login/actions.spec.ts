import { setUpAccess, signIn, signOut } from './actions';

interface CookieOptions {
  readonly httpOnly: boolean;
  readonly sameSite: string;
  readonly secure: boolean;
  readonly path: string;
  readonly expires: Date;
}

const stored = new Map<string, string>();
const setCookie = jest.fn<undefined, [string, string, CookieOptions]>();
const redirect = jest.fn((path: string): never => {
  throw new Error(`redirected to ${path}`);
});
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

jest.mock('next/headers', () => ({
  cookies: (): Promise<unknown> =>
    Promise.resolve({
      get: (name: string) => {
        const value = stored.get(name);
        return value === undefined ? undefined : { value };
      },
      set: (name: string, value: string, options: CookieOptions) => {
        stored.set(name, value);
        setCookie(name, value, options);
      },
      delete: (name: string) => stored.delete(name),
    }),
}));

jest.mock('next/navigation', () => ({
  redirect: (path: string): never => redirect(path),
}));

function form(password: string, email = ' member@example.com '): FormData {
  const data = new FormData();
  data.set('email', email);
  data.set('password', password);
  return data;
}

function setUpForm(accessCode: string, password = 'a long passphrase'): FormData {
  const data = new FormData();
  data.set('accessCode', accessCode);
  data.set('email', 'member@example.com');
  data.set('password', password);
  return data;
}

function respond(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const ISSUED = { token: 'new-session-token', expiresAt: '2026-10-27T12:00:00.000Z' };

describe('sign-in action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stored.clear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('stores the session in an http-only, same-site cookie that expires with the session', async () => {
    fetchMock.mockResolvedValue(respond(201, ISSUED));

    await expect(signIn({ error: null }, form('  a-valid-code  '))).rejects.toThrow(
      'redirected to /',
    );

    expect(fetchMock.mock.calls[0]?.[1].body).toBe(
      JSON.stringify({ email: 'member@example.com', password: '  a-valid-code  ' }),
    );
    expect(setCookie).toHaveBeenCalledWith('cfo_session', 'new-session-token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: new Date(ISSUED.expiresAt),
    });
  });

  it('never accepts a session chosen by the browser and ends the one it replaces', async () => {
    stored.set('cfo_session', 'planted-by-an-attacker');
    fetchMock.mockResolvedValue(respond(201, ISSUED));

    await expect(signIn({ error: null }, form('a-valid-code'))).rejects.toThrow();

    expect(stored.get('cfo_session')).toBe('new-session-token');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/auth/sessions/current', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer planted-by-an-attacker' },
      cache: 'no-store',
    });
  });

  it('gives the same message for a wrong password and an empty one, and sets no cookie', async () => {
    fetchMock.mockResolvedValue(respond(401));

    const wrong = await signIn({ error: null }, form('wrong'));
    const empty = await signIn({ error: null }, form('   '));

    expect(wrong).toEqual(empty);
    expect(wrong.error).toBe('INVALID');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('tells the visitor to wait when attempts are being limited', async () => {
    fetchMock.mockResolvedValue(respond(429));

    expect((await signIn({ error: null }, form('guess'))).error).toBe('TOO_MANY');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('reports an unreachable service without detail', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:3000'));

    const state = await signIn({ error: null }, form('a-valid-code'));

    expect(state).toEqual({ error: 'UNAVAILABLE', email: 'member@example.com' });
  });

  it('puts the email and password in the request body, never in the address', async () => {
    fetchMock.mockResolvedValue(respond(401));

    await signIn({ error: null }, form('secret-code'));

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/auth/sessions');
  });
});

describe('first-access action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stored.clear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('exchanges the access code for a password and signs in', async () => {
    fetchMock.mockResolvedValue(respond(201, ISSUED));

    await expect(setUpAccess({ error: null }, setUpForm(' a-code '))).rejects.toThrow(
      'redirected to /',
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/auth/credentials');
    expect(fetchMock.mock.calls[0]?.[1].body).toBe(
      JSON.stringify({
        accessCode: 'a-code',
        email: 'member@example.com',
        password: 'a long passphrase',
      }),
    );
    expect(stored.get('cfo_session')).toBe('new-session-token');
  });

  it.each([
    [401, 'INVALID_SETUP'],
    [422, 'WEAK_PASSWORD'],
    [429, 'TOO_MANY'],
    [500, 'UNAVAILABLE'],
  ] as const)('reports status %d as %s and sets no cookie', async (status, error) => {
    fetchMock.mockResolvedValue(respond(status));

    expect(await setUpAccess({ error: null }, setUpForm('a-code'))).toEqual({
      error,
      email: 'member@example.com',
    });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('does not call the service without a code', async () => {
    expect(await setUpAccess({ error: null }, setUpForm('   '))).toEqual({
      error: 'INVALID_SETUP',
      email: 'member@example.com',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sign-out action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stored.clear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('ends the session on the server and removes the cookie even if the server fails', async () => {
    stored.set('cfo_session', 'current-token');
    fetchMock.mockRejectedValue(new Error('unreachable'));

    await expect(signOut()).rejects.toThrow('redirected to /login');

    expect(fetchMock.mock.calls[0]?.[1].headers).toEqual({ Authorization: 'Bearer current-token' });
    expect(stored.has('cfo_session')).toBe(false);
  });
});
