import type { ReactNode } from 'react';
import { BudgetsView } from '@/components/views/planning-views';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { BudgetsView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function BudgetsPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/budgets', { month });
  const t = await currentDictionary();
  return <BudgetsView data={data} t={t} />;
}
