import { ratioInBasisPoints, sumMinor } from '../../../money/money-math.js';
import type { CategoryTree } from '../categories/category-tree.js';
import { amountsOf, flowsOf, type FlowType, type LedgerEntry } from '../ledger/ledger-entry.js';

export interface MemberAmount {
  readonly memberId: string;
  readonly totalMinor: number;
  readonly shareBasisPoints: number | null;
}

export interface CategoryAmount {
  readonly categoryId: string | null;
  readonly totalMinor: number;
  readonly shareBasisPoints: number | null;
  readonly byMember: readonly MemberAmount[];
}

export interface AccountAmount {
  readonly accountId: string;
  readonly totalMinor: number;
  readonly shareBasisPoints: number | null;
}

export interface FlowBreakdown {
  readonly type: FlowType;
  readonly currency: string;
  readonly totalMinor: number;
  readonly transactionCount: number;
  readonly byMember: readonly MemberAmount[];
  readonly byCategory: readonly CategoryAmount[];
  readonly byAccount: readonly AccountAmount[];
}

export interface FlowBreakdownInput {
  readonly entries: readonly LedgerEntry[];
  readonly type: FlowType;
  readonly currency: string;
  readonly categories: CategoryTree;
  readonly memberIds?: readonly string[];
}

export function summarizeFlow(input: FlowBreakdownInput): FlowBreakdown {
  const flows = flowsOf(input.entries, input.type, input.currency);
  const totalMinor = sumMinor(amountsOf(flows));
  return {
    type: input.type,
    currency: input.currency,
    totalMinor,
    transactionCount: flows.length,
    byMember: breakDownByMember(flows, input.memberIds ?? []),
    byCategory: breakDownByCategory(flows, totalMinor, input.categories),
    byAccount: totalsBy(flows, (entry) => [entry.accountId]).map(([accountId, accountTotal]) => ({
      accountId,
      totalMinor: accountTotal,
      shareBasisPoints: ratioInBasisPoints(accountTotal, totalMinor),
    })),
  };
}

export function breakDownByMember(
  flows: readonly LedgerEntry[],
  memberIds: readonly string[],
): MemberAmount[] {
  const totalMinor = sumMinor(amountsOf(flows));
  const totals = new Map<string, number>(memberIds.map((memberId) => [memberId, 0]));
  for (const [memberId, memberTotal] of totalsBy(flows, (entry) => [entry.memberId])) {
    totals.set(memberId, memberTotal);
  }
  return sortByTotal([...totals]).map(([memberId, memberTotal]) => ({
    memberId,
    totalMinor: memberTotal,
    shareBasisPoints: ratioInBasisPoints(memberTotal, totalMinor),
  }));
}

function breakDownByCategory(
  flows: readonly LedgerEntry[],
  totalMinor: number,
  categories: CategoryTree,
): CategoryAmount[] {
  const flowsByCategory = new Map<string | null, LedgerEntry[]>();
  for (const flow of flows) {
    const keys = flow.categoryId === null ? [null] : categories.lineageOf(flow.categoryId);
    for (const key of keys) {
      flowsByCategory.set(key, [...(flowsByCategory.get(key) ?? []), flow]);
    }
  }
  return [...flowsByCategory]
    .map(([categoryId, categoryFlows]) => {
      const categoryTotal = sumMinor(amountsOf(categoryFlows));
      return {
        categoryId,
        totalMinor: categoryTotal,
        shareBasisPoints: ratioInBasisPoints(categoryTotal, totalMinor),
        byMember: breakDownByMember(categoryFlows, []),
      };
    })
    .sort(
      (left, right) =>
        right.totalMinor - left.totalMinor ||
        (left.categoryId ?? '').localeCompare(right.categoryId ?? ''),
    );
}

function totalsBy(
  flows: readonly LedgerEntry[],
  keysOf: (entry: LedgerEntry) => readonly string[],
): [string, number][] {
  const totals = new Map<string, number>();
  for (const flow of flows) {
    for (const key of keysOf(flow)) {
      totals.set(key, sumMinor([totals.get(key) ?? 0, flow.amountMinor]));
    }
  }
  return sortByTotal([...totals]);
}

function sortByTotal(totals: [string, number][]): [string, number][] {
  return totals.sort(
    ([leftKey, leftTotal], [rightKey, rightTotal]) =>
      rightTotal - leftTotal || leftKey.localeCompare(rightKey),
  );
}
