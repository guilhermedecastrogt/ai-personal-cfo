import type { ReactNode } from 'react';
import { CategoryView } from '@/components/views/category-view';
import { apiFind } from '@/lib/api';
import { currentDictionary } from '@/lib/session';
import type { CategoryView as View } from '@/lib/contracts';
import { requestedMonth, type SearchParameters } from '@/lib/month';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly key: string }>;
  readonly searchParams: SearchParameters;
}): Promise<ReactNode> {
  const { key } = await params;
  const month = await requestedMonth(searchParams);
  const suffix = month === undefined ? '' : `?month=${month}`;
  const data = await apiFind<View>(`/dashboard/categories/${encodeURIComponent(key)}${suffix}`);
  const t = await currentDictionary();
  return <CategoryView data={data} t={t} />;
}
