import type { ReactNode } from 'react';
import { MemberView } from '@/components/views/analytics-views';
import { apiFind } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { MemberView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function MemberPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly key: string }>;
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const { key } = await params;
  const month = await requestedMonth(searchParams);
  const suffix = month === undefined ? '' : `?month=${month}`;
  const data = await apiFind<View>(`/dashboard/members/${encodeURIComponent(key)}${suffix}`);
  const t = await currentDictionary();
  return <MemberView data={data} t={t} />;
}
