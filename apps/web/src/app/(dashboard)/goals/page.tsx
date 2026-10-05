import type { ReactNode } from 'react';
import { GoalsView } from '@/components/views/planning-views';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { GoalsView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function GoalsPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/goals', { month });
  const t = await currentDictionary();
  return <GoalsView data={data} t={t} />;
}
