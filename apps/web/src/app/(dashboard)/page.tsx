import type { ReactNode } from 'react';
import { OverviewView } from '@/components/views/overview-view';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { EvolutionView, OverviewView as View } from '@/lib/contracts';
import { requestedMonth, single, type SearchParameters } from '@/lib/month';

export default async function OverviewPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const months = single((await searchParams).months) === '12' ? '12' : '6';
  const [data, evolution] = await Promise.all([
    apiGet<View>('/dashboard/overview', { month }),
    apiGet<EvolutionView>('/dashboard/evolution', { months }),
  ]);
  const t = await currentDictionary();
  return <OverviewView data={data} evolution={evolution} t={t} />;
}
