import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { apiGet } from '@/lib/api';
import type { SessionView } from '@/lib/contracts';
import { signOut } from '../login/actions';

export default async function DashboardLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const session = await apiGet<SessionView>('/dashboard/session');
  return (
    <Shell session={session} signOut={signOut}>
      {children}
    </Shell>
  );
}
