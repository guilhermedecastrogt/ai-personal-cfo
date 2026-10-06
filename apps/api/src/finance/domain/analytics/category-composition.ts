import { ratioInBasisPoints, sumMinor } from '../../../money/money-math.js';
import type { CategoryTree } from '../categories/category-tree.js';
import type { FlowBreakdown } from '../flow/flow-breakdown.js';

export const COMPOSITION_SLICES = 6;

export interface CompositionSlice {
  readonly categoryId: string | null;
  readonly isOther: boolean;
  readonly totalMinor: number;
  readonly shareBasisPoints: number;
  readonly offsetBasisPoints: number;
}

export function composeByTopLevelCategory(
  flow: Pick<FlowBreakdown, 'totalMinor' | 'byCategory'>,
  categories: CategoryTree,
  slices: number = COMPOSITION_SLICES,
): CompositionSlice[] {
  const topLevel = flow.byCategory.filter((entry) => categories.isTopLevel(entry.categoryId));
  const shown = topLevel.length > slices ? topLevel.slice(0, slices - 1) : topLevel;
  const rest = topLevel.slice(shown.length);
  const parts = [
    ...shown.map((entry) => ({
      categoryId: entry.categoryId,
      isOther: false,
      totalMinor: entry.totalMinor,
    })),
    ...(rest.length === 0
      ? []
      : [
          {
            categoryId: null,
            isOther: true,
            totalMinor: sumMinor(rest.map((entry) => entry.totalMinor)),
          },
        ]),
  ];
  const slicesWithShare = parts.map((part) => ({
    ...part,
    shareBasisPoints: ratioInBasisPoints(part.totalMinor, flow.totalMinor) ?? 0,
  }));
  return slicesWithShare.map((slice, position) => ({
    ...slice,
    offsetBasisPoints: sumMinor(
      slicesWithShare.slice(0, position).map((earlier) => earlier.shareBasisPoints),
    ),
  }));
}
