import { ApiError, apiFind, apiGet, apiPost, apiSend, apiUrl } from './api';

const cookieValue = jest.fn<string | undefined, []>();
const redirect = jest.fn((path: string): never => {
  throw new Error(`redirected to ${path}`);
});
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

jest.mock('next/headers', () => ({
  cookies: (): Promise<{ get: () => { value: string } | undefined }> =>
    Promise.resolve({
      get: () => {
        const value = cookieValue();
        return value === undefined ? undefined : { value };
      },
    }),
}));

jest.mock('next/navigation', () => ({
  redirect: (path: string): never => redirect(path),
  notFound: (): never => {
    throw new Error('not found');
  },
}));

function respondWith(status: number, body: unknown = {}): void {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

describe('apiGet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    cookieValue.mockReturnValue('session-token');
  });

  it('sends the session as a bearer token and never caches the response', async () => {
    respondWith(200, { total: 1 });

    const view = await apiGet('/dashboard/overview', { month: '2026-09' });

    expect(view).toEqual({ total: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/dashboard/overview?month=2026-09',
      {
        headers: { Authorization: 'Bearer session-token' },
        cache: 'no-store',
      },
    );
  });

  it('leaves out parameters that have no value', () => {
    expect(apiUrl('/dashboard/transactions', { month: undefined, type: '', page: '2' })).toBe(
      'http://localhost:3000/dashboard/transactions?page=2',
    );
  });

  it('sends the visitor to sign in when there is no session', async () => {
    cookieValue.mockReturnValue(undefined);

    await expect(apiGet('/dashboard/overview')).rejects.toThrow('redirected to /login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the visitor to sign in when the session is refused', async () => {
    respondWith(401);

    await expect(apiGet('/dashboard/overview')).rejects.toThrow('redirected to /login');
  });

  it.each([400, 404, 500, 503])(
    'reports status %d as an error and shows no data',
    async (status) => {
      respondWith(status, { message: 'internal detail' });

      await expect(apiGet('/dashboard/overview')).rejects.toEqual(new ApiError(status));
    },
  );
});

describe('apiPost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    cookieValue.mockReturnValue('session-token');
  });

  it('posts with the session as a bearer token and no body', async () => {
    respondWith(204);

    await apiPost('/dashboard/notifications/notification-1/read');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/dashboard/notifications/notification-1/read',
      { method: 'POST', headers: { Authorization: 'Bearer session-token' }, cache: 'no-store' },
    );
  });

  it('sends the visitor to sign in when there is no session or it is refused', async () => {
    respondWith(401);
    await expect(apiPost('/dashboard/notifications/x/read')).rejects.toThrow(
      'redirected to /login',
    );

    cookieValue.mockReturnValue(undefined);
    fetchMock.mockClear();
    await expect(apiPost('/dashboard/notifications/x/read')).rejects.toThrow(
      'redirected to /login',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a notification that does not belong to the household as an error', async () => {
    respondWith(404);

    await expect(apiPost('/dashboard/notifications/x/read')).rejects.toEqual(new ApiError(404));
  });
});

describe('apiSend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    cookieValue.mockReturnValue('session-token');
  });

  it('sends a change as JSON with the session as a bearer token', async () => {
    respondWith(200, { key: 'k', version: 'v' });

    const outcome = await apiSend('PATCH', '/dashboard/transactions/k', { amount: '12,50' });

    expect(outcome).toEqual({ ok: true, data: { key: 'k', version: 'v' } });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/dashboard/transactions/k', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '12,50' }),
      cache: 'no-store',
    });
  });

  it('accepts an empty answer to a deletion', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    } as Response);

    expect(await apiSend('DELETE', '/dashboard/goals/k')).toEqual({ ok: true, data: undefined });
  });

  it('hands back a refusal with its body so the form can show which field is wrong', async () => {
    const errors = { errors: [{ field: 'amount', code: 'INVALID_AMOUNT' }] };
    respondWith(422, errors);

    expect(await apiSend('POST', '/dashboard/budgets', {})).toEqual({
      ok: false,
      status: 422,
      body: errors,
    });
  });

  it('sends the visitor to sign in when the session is refused', async () => {
    respondWith(401);

    await expect(apiSend('DELETE', '/dashboard/goals/k')).rejects.toThrow('redirected to /login');
  });
});

describe('apiFind', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    cookieValue.mockReturnValue('session-token');
  });

  it('shows the not-found page for a record that does not exist or is not the household’s', async () => {
    respondWith(404);

    await expect(apiFind('/dashboard/transactions/k')).rejects.toThrow('not found');
  });

  it('reports other failures as errors', async () => {
    respondWith(503);

    await expect(apiFind('/dashboard/transactions/k')).rejects.toEqual(new ApiError(503));
  });
});
