import { ratioInBasisPoints } from '../../../money/money-math.js';
import type { CategoryTree } from './category-tree.js';

export interface CategoryTotal {
  readonly categoryId: string | null;
  readonly totalMinor: number;
}

export type Arranged<Row extends CategoryTotal> = Row & {
  readonly parentId: string | null;
  readonly shareOfParentBasisPoints: number | null;
};

export function arrangeByHierarchy<Row extends CategoryTotal>(
  rows: readonly Row[],
  categories: CategoryTree,
): Arranged<Row>[] {
  const present = new Map(
    rows.flatMap((row) => (row.categoryId === null ? [] : [[row.categoryId, row] as const])),
  );
  const parentOf = (row: Row): string | null =>
    row.categoryId === null
      ? null
      : (categories
          .lineageOf(row.categoryId)
          .slice(1)
          .find((ancestor) => present.has(ancestor)) ?? null);
  const childrenOf = (parentId: string | null): Row[] =>
    rows.filter((row) => parentOf(row) === parentId).sort(byTotal);

  const arranged: Arranged<Row>[] = [];
  const visited = new Set<Row>();
  const visit = (row: Row, parent: Row | undefined): void => {
    if (visited.has(row)) {
      return;
    }
    visited.add(row);
    arranged.push({
      ...row,
      parentId: parent?.categoryId ?? null,
      shareOfParentBasisPoints:
        parent === undefined ? null : ratioInBasisPoints(row.totalMinor, parent.totalMinor),
    });
    if (row.categoryId !== null) {
      for (const child of childrenOf(row.categoryId)) {
        visit(child, row);
      }
    }
  };
  for (const row of childrenOf(null)) {
    visit(row, undefined);
  }
  for (const row of [...rows].sort(byTotal)) {
    visit(row, undefined);
  }
  return arranged;
}

function byTotal(left: CategoryTotal, right: CategoryTotal): number {
  return (
    right.totalMinor - left.totalMinor ||
    (left.categoryId ?? '').localeCompare(right.categoryId ?? '')
  );
}
