import type { ReactNode } from 'react';
import { NotificationsPanel, SignalsView } from '@/components/views/planning-views';
import { apiGet } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { NotificationsView, SignalsView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';
import { markNotificationRead } from './actions';

export default async function SignalsPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const [data, notifications] = await Promise.all([
    apiGet<View>('/dashboard/signals', { month }),
    apiGet<NotificationsView>('/dashboard/notifications'),
  ]);
  const t = await currentDictionary();
  return (
    <>
      <SignalsView data={data} t={t} />
      <div className="mt-6">
        <NotificationsPanel data={notifications} markRead={markNotificationRead} t={t} />
      </div>
    </>
  );
}
