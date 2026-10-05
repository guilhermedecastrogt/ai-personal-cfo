import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { currentSession } from '@/lib/session';
import { signOut } from '../login/actions';

export default async function DashboardLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const session = await currentSession();
  return (
    <Shell session={session} signOut={signOut}>
      {children}
    </Shell>
  );
}
