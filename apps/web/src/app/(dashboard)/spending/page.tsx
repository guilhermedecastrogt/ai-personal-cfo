import type { ReactNode } from 'react';
import { SpendingView } from '@/components/views/flow-views';
import { apiGet } from '@/lib/api';
import type { SpendingView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function SpendingPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/spending', { month });
  return <SpendingView data={data} />;
}
