import type { ReactNode } from 'react';
import { TransactionsView } from '@/components/views/record-views';
import { apiGet } from '@/lib/api';
import type { TransactionsView as View } from '@/lib/contracts';
import { requestedMonth, single, type SearchParameters } from '@/lib/month';

export default async function TransactionsPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const parameters = await searchParams;
  const query = {
    type: single(parameters.type),
    category: single(parameters.category),
    account: single(parameters.account),
    member: single(parameters.member),
  };
  const data = await apiGet<View>('/dashboard/transactions', {
    ...query,
    month: await requestedMonth(searchParams),
    page: single(parameters.page),
  });
  return <TransactionsView data={data} query={query} />;
}
