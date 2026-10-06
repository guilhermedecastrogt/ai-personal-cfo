import type { NextRequest } from 'next/server';
import { apiDownload } from '@/lib/api';
import { readTransactionQuery } from '@/lib/transaction-query';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: NextRequest): Promise<Response> {
  const parameters = Object.fromEntries(request.nextUrl.searchParams);
  const month = parameters.month;
  const download = await apiDownload('/dashboard/transactions/export', {
    ...readTransactionQuery(parameters),
    month: month !== undefined && MONTH_KEY.test(month) ? month : undefined,
  });
  if (download.status !== 200) {
    return new Response(null, {
      status: download.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return new Response(download.body, {
    headers: {
      'Content-Type': download.contentType ?? 'text/csv; charset=utf-8',
      'Content-Disposition': download.disposition ?? 'attachment; filename="transactions.csv"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
