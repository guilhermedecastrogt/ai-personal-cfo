import type { ReactNode } from 'react';
import { GoalsView } from '@/components/views/planning-views';
import { apiGet } from '@/lib/api';
import type { GoalsView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function GoalsPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/goals', { month });
  return <GoalsView data={data} />;
}
