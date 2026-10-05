import type { ReactNode } from 'react';
import { AccountsView } from '@/components/views/record-views';
import { apiGet } from '@/lib/api';
import type { AccountsView as View } from '@/lib/contracts';

export default async function AccountsPage(): Promise<ReactNode> {
  const data = await apiGet<View>('/dashboard/accounts');
  return <AccountsView data={data} />;
}
