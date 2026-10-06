import type { ReactNode } from 'react';
import { MembersView } from '@/components/views/analytics-views';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { MembersView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function MembersPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/members');
  const t = await currentDictionary();
  return <MembersView data={data} month={month} t={t} />;
}
