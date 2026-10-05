import type { ReactNode } from 'react';
import { BudgetEditor } from '@/components/views/editor-views';
import { apiFind } from '@/lib/api';
import type { BudgetEditView } from '@/lib/contracts';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { requestedMonth, type SearchParameters } from '@/lib/month';
import { currentSession } from '@/lib/session';

export default async function EditBudgetPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly key: string }>;
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const { key } = await params;
  const month = await requestedMonth(searchParams);
  const [data, session] = await Promise.all([
    apiFind<BudgetEditView>(`/dashboard/budgets/${encodeURIComponent(key)}`),
    currentSession(),
  ]);
  return (
    <BudgetEditor
      data={data}
      back={month === undefined ? '/budgets' : `/budgets?month=${month}`}
      locale={session.locale}
      t={dictionaryFor(session.locale)}
    />
  );
}
