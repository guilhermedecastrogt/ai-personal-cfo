import type { ReactNode } from 'react';
import { NewGoal } from '@/components/views/editor-views';
import { apiGet } from '@/lib/api';
import type { GoalsView } from '@/lib/contracts';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { requestedMonth, type SearchParameters } from '@/lib/month';
import { currentSession } from '@/lib/session';

export default async function NewGoalPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const [data, session] = await Promise.all([
    apiGet<GoalsView>('/dashboard/goals', { month }),
    currentSession(),
  ]);
  return (
    <NewGoal
      options={data.options}
      back={month === undefined ? '/goals' : `/goals?month=${month}`}
      locale={session.locale}
      t={dictionaryFor(session.locale)}
    />
  );
}
