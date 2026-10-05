import type { ReactNode } from 'react';
import { SignalsView } from '@/components/views/planning-views';
import { apiGet } from '@/lib/api';
import type { SignalsView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function SignalsPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const data = await apiGet<View>('/dashboard/signals', { month });
  return <SignalsView data={data} />;
}
