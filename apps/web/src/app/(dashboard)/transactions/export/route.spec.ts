/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server';
import type { ApiDownload } from '@/lib/api';
import { GET } from './route';

const apiDownload = jest.fn<Promise<ApiDownload>, [string, Record<string, string | undefined>]>();

jest.mock('@/lib/api', () => ({
  apiDownload: (path: string, parameters: Record<string, string | undefined>) =>
    apiDownload(path, parameters),
}));

function request(query: string): NextRequest {
  return { nextUrl: new URL(`http://localhost/transactions/export?${query}`) } as NextRequest;
}

function download(status: number, text = ''): ApiDownload {
  return {
    status,
    body: new TextEncoder().encode(text).buffer,
    contentType: status === 200 ? 'text/csv; charset=utf-8' : 'application/json',
    disposition: status === 200 ? 'attachment; filename="movimentos-2026-10.csv"' : null,
  };
}

describe('transactions export', () => {
  beforeEach(() => {
    apiDownload.mockReset();
  });

  it('hands the spreadsheet of the filtered transactions to the browser as a download', async () => {
    apiDownload.mockResolvedValue(download(200, 'Data;Tipo;Valor\r\n'));

    const response = await GET(request('month=2026-10&q=lidl&sort=amount_desc&type=EXPENSE'));

    expect(apiDownload).toHaveBeenCalledWith(
      '/dashboard/transactions/export',
      expect.objectContaining({
        month: '2026-10',
        q: 'lidl',
        sort: 'amount_desc',
        type: 'EXPENSE',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="movimentos-2026-10.csv"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('Data;Tipo;Valor\r\n');
  });

  it('never forwards a household, a member id or a malformed month', async () => {
    apiDownload.mockResolvedValue(download(200));

    await GET(request('householdId=another&memberId=another&month=2026-13&from=yesterday'));
    const [, parameters] = apiDownload.mock.calls[0] ?? [];

    expect(JSON.stringify(parameters)).not.toContain('another');
    expect(parameters).toMatchObject({ month: undefined, from: undefined });
  });

  it('passes a refusal on without a body', async () => {
    apiDownload.mockResolvedValue(download(400, '{"message":"Bad Request"}'));

    const response = await GET(request('from=2026-10-31&to=2026-09-01'));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('');
  });
});
