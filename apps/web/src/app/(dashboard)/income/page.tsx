import type { ReactNode } from 'react';
import { IncomeView } from '@/components/views/flow-views';
import { apiGet } from '@/lib/api';
import type { IncomeView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function IncomePage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/income', { month });
  return <IncomeView data={data} />;
}
