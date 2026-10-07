import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminHouseholdView } from '@/components/views/admin-views';
import { apiFind } from '@/lib/api';
import type { HouseholdDetailView } from '@/lib/contracts';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { single, type SearchParameters } from '@/lib/month';
import { currentSession } from '@/lib/session';

const WELCOME_RESULTS = ['SENT', 'FAILED', 'DISABLED', 'NO_NUMBER'] as const;

export default async function AdminHouseholdPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly household: string }>;
  readonly searchParams?: SearchParameters;
}): Promise<ReactNode> {
  const session = await currentSession();
  if (!session.isPlatformAdmin) {
    notFound();
  }
  const { household } = await params;
  const data = await apiFind<HouseholdDetailView>(
    `/platform/households/${encodeURIComponent(household)}`,
  );
  const requested = single((await searchParams)?.welcome);
  const welcome = WELCOME_RESULTS.find((result) => result === requested);
  return (
    <AdminHouseholdView
      data={data}
      welcome={welcome}
      locale={session.locale}
      t={dictionaryFor(session.locale)}
    />
  );
}
