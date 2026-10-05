'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@/lib/api';

export async function markNotificationRead(form: FormData): Promise<void> {
  const key = form.get('key');
  if (typeof key !== 'string' || key === '') {
    return;
  }
  await apiPost(`/dashboard/notifications/${encodeURIComponent(key)}/read`);
  revalidatePath('/signals');
}
