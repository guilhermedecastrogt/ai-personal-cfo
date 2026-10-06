import type { ReactNode } from 'react';
import { TransactionsView } from '@/components/views/record-views';
import { ApiError, apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { TransactionsView as View } from '@/lib/contracts';
import { requestedMonth, single, type SearchParameters } from '@/lib/month';
import { readTransactionQuery, withoutRange, type TransactionQuery } from '@/lib/transaction-query';

const HTTP_BAD_REQUEST = 400;

async function transactions(
  query: TransactionQuery,
  month: string | undefined,
  page: string | undefined,
): Promise<{
  readonly data: View;
  readonly query: TransactionQuery;
  readonly invalidRange: boolean;
}> {
  try {
    return {
      data: await apiGet<View>('/dashboard/transactions', { ...query, month, page }),
      query,
      invalidRange: false,
    };
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== HTTP_BAD_REQUEST ||
      (query.from === undefined && query.to === undefined)
    ) {
      throw error;
    }
    const fallback = withoutRange(query);
    return {
      data: await apiGet<View>('/dashboard/transactions', { ...fallback, month }),
      query: fallback,
      invalidRange: true,
    };
  }
}

export default async function TransactionsPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const parameters = await searchParams;
  const result = await transactions(
    readTransactionQuery(parameters),
    await requestedMonth(searchParams),
    single(parameters.page),
  );
  const t = await currentDictionary();
  return (
    <TransactionsView
      data={result.data}
      query={result.query}
      invalidRange={result.invalidRange}
      t={t}
    />
  );
}
