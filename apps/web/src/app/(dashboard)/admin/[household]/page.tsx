import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminHouseholdView } from '@/components/views/admin-views';
import { apiFind } from '@/lib/api';
import type { HouseholdDetailView } from '@/lib/contracts';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { currentSession } from '@/lib/session';

export default async function AdminHouseholdPage({
  params,
}: {
  readonly params: Promise<{ readonly household: string }>;
}): Promise<ReactNode> {
  const session = await currentSession();
  if (!session.isPlatformAdmin) {
    notFound();
  }
  const { household } = await params;
  const data = await apiFind<HouseholdDetailView>(
    `/platform/households/${encodeURIComponent(household)}`,
  );
  return (
    <AdminHouseholdView data={data} locale={session.locale} t={dictionaryFor(session.locale)} />
  );
}
