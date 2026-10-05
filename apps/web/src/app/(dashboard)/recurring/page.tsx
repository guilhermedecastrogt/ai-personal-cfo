import type { ReactNode } from 'react';
import { RecurringView } from '@/components/views/recurring-view';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { RecurringView as View } from '@/lib/contracts';
import type { SearchParameters } from '@/lib/month';

const SORTS: readonly string[] = ['cost', 'next', 'name'];

export default async function RecurringPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const { sort } = await searchParams;
  const data = await apiGet<View>('/dashboard/recurring', {
    sort: typeof sort === 'string' && SORTS.includes(sort) ? sort : undefined,
  });
  const t = await currentDictionary();
  return <RecurringView data={data} t={t} />;
}
