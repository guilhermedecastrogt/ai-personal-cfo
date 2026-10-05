import type { ReactNode } from 'react';
import { ReviewView } from '@/components/views/record-views';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { ReviewView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function ReviewPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/review', { month });
  const t = await currentDictionary();
  return <ReviewView data={data} t={t} />;
}
