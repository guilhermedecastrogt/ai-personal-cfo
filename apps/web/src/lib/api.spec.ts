import { ApiError, apiGet, apiUrl } from './api';

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
