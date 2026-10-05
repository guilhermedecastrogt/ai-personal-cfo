import type { ReactNode } from 'react';
import { NewBudget } from '@/components/views/editor-views';
import { apiGet } from '@/lib/api';
import type { BudgetsView } from '@/lib/contracts';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { requestedMonth, type SearchParameters } from '@/lib/month';
import { currentSession } from '@/lib/session';

export default async function NewBudgetPage({
  searchParams,
}: {
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const month = await requestedMonth(searchParams);
  const [data, session] = await Promise.all([
    apiGet<BudgetsView>('/dashboard/budgets', { month }),
    currentSession(),
  ]);
  return (
    <NewBudget
      options={data.options}
      back={month === undefined ? '/budgets' : `/budgets?month=${month}`}
      locale={session.locale}
      t={dictionaryFor(session.locale)}
    />
  );
}
