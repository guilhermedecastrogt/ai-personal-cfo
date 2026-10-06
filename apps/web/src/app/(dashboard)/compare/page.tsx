import type { ReactNode } from 'react';
import { CompareView } from '@/components/views/analytics-views';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { CompareView as View } from '@/lib/contracts';
import { single, type SearchParameters } from '@/lib/month';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthOrNothing(value: string | undefined): string | undefined {
  return value !== undefined && MONTH_KEY.test(value) ? value : undefined;
}

export default async function ComparePage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const parameters = await searchParams;
  const data = await apiGet<View>('/dashboard/compare', {
    a: monthOrNothing(single(parameters.a)),
    b: monthOrNothing(single(parameters.b)),
  });
  const t = await currentDictionary();
  return <CompareView data={data} t={t} />;
}
