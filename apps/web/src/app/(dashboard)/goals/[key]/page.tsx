import type { ReactNode } from 'react';
import { GoalEditor } from '@/components/views/editor-views';
import { apiFind } from '@/lib/api';
import type { GoalEditView } from '@/lib/contracts';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { requestedMonth, type SearchParameters } from '@/lib/month';
import { currentSession } from '@/lib/session';

export default async function EditGoalPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly key: string }>;
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const { key } = await params;
  const month = await requestedMonth(searchParams);
  const [data, session] = await Promise.all([
    apiFind<GoalEditView>(`/dashboard/goals/${encodeURIComponent(key)}`),
    currentSession(),
  ]);
  return (
    <GoalEditor
      data={data}
      back={month === undefined ? '/goals' : `/goals?month=${month}`}
      locale={session.locale}
      t={dictionaryFor(session.locale)}
    />
  );
}
