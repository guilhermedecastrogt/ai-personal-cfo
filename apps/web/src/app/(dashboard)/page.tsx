import type { ReactNode } from 'react';
import { OverviewView } from '@/components/views/overview-view';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { OverviewView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function OverviewPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/overview', { month });
  const t = await currentDictionary();
  return <OverviewView data={data} t={t} />;
}
