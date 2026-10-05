import { ApiError, apiGet, apiPost, apiUrl } from './api';

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
}));

function respondWith(status: number, body: unknown = {}): void {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
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
