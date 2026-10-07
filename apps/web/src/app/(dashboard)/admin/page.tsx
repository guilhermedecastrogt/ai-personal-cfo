import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminHouseholdsView } from '@/components/views/admin-views';
import { apiGet } from '@/lib/api';
import type { HouseholdsOverviewView } from '@/lib/contracts';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { currentSession } from '@/lib/session';

export default async function AdminPage(): Promise<ReactNode> {
  const session = await currentSession();
  if (!session.isPlatformAdmin) {
    notFound();
  }
  const data = await apiGet<HouseholdsOverviewView>('/platform/households');
  return (
    <AdminHouseholdsView data={data} locale={session.locale} t={dictionaryFor(session.locale)} />
  );
}
