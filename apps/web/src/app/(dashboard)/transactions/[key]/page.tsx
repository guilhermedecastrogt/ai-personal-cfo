import type { ReactNode } from 'react';
import { TransactionEditor } from '@/components/views/editor-views';
import { apiFind } from '@/lib/api';
import type { TransactionEditView } from '@/lib/contracts';
import { returnPath } from '@/lib/form-state';
import { dictionaryFor } from '@/lib/i18n/dictionary';
import { single, type SearchParameters } from '@/lib/month';
import { currentSession } from '@/lib/session';

export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly key: string }>;
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const { key } = await params;
  const back = returnPath(single((await searchParams).back), '/transactions');
  const [data, session] = await Promise.all([
    apiFind<TransactionEditView>(`/dashboard/transactions/${encodeURIComponent(key)}`),
    currentSession(),
  ]);
  return (
    <TransactionEditor
      data={data}
      back={back}
      locale={session.locale}
      t={dictionaryFor(session.locale)}
    />
  );
}
