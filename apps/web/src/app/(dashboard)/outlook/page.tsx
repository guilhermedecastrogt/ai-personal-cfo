import type { ReactNode } from 'react';
import { OutlookView } from '@/components/views/planning-views';
import { apiGet } from '@/lib/api';
import type { OutlookView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function OutlookPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/outlook', { month });
  return <OutlookView data={data} />;
}
