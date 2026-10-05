import type { ReplyFacts } from '../../ai/ai-provider.js';
import type { ReviewNarrative } from '../../ai/review/review-narrative.schema.js';

const MAXIMUM_PRIORITIES = 3;

type Facts = Readonly<Record<string, unknown>>;

function field(facts: Facts, key: string): string {
  const value = facts[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : 'an unknown value';
}

function child(facts: Facts, key: string): Facts {
  const value = facts[key];
  return typeof value === 'object' && value !== null ? (value as Facts) : {};
}

function findingsOf(review: Facts): Facts[] {
  const findings = review.findings;
  return Array.isArray(findings) ? (findings as Facts[]) : [];
}

const STATEMENTS: Record<string, (facts: Facts) => string> = {
  POSITIVE_CASH_FLOW: (facts) => `Income exceeded spending by ${field(facts, 'net')}.`,
  HEALTHY_SAVINGS_RATE: (facts) => `The savings rate is ${field(facts, 'savingsRate')}.`,
  SPENDING_DECREASED: (facts) =>
    `Spending is down ${field(facts, 'change')} (${field(facts, 'difference')}) on the previous period.`,
  BUDGETS_ON_TRACK: () => 'Every budget is within its limit.',
  GOAL_COMPLETED: (facts) =>
    `The goal ${field(facts, 'goal')} has reached its target of ${field(facts, 'target')}.`,
  NEGATIVE_CASH_FLOW: (facts) =>
    `Spending exceeded income. Net cash flow is ${field(facts, 'net')}.`,
  LOW_SAVINGS_RATE: (facts) => `The savings rate is ${field(facts, 'savingsRate')}.`,
  SPENDING_INCREASED: (facts) =>
    `Spending is up ${field(facts, 'change')} (${field(facts, 'difference')}) on the previous period.`,
  CATEGORY_SPENDING_INCREASED: (facts) =>
    `${field(facts, 'category')} spending rose from ${field(facts, 'previous')} to ${field(facts, 'current')} (${field(facts, 'change')}).`,
  BUDGET_EXCEEDED: (facts) =>
    `The ${field(facts, 'category')} budget of ${field(facts, 'limit')} is exceeded, with ${field(facts, 'spent')} spent (${field(facts, 'usage')}).`,
  BUDGET_NEAR_LIMIT: (facts) =>
    `The ${field(facts, 'category')} budget is at ${field(facts, 'usage')}, with ${field(facts, 'spent')} of ${field(facts, 'limit')} spent.`,
  BUDGET_PROJECTED_OVER_LIMIT: (facts) =>
    `The ${field(facts, 'category')} budget of ${field(facts, 'limit')} is projected to reach ${field(facts, 'projectedTotal')}.`,
  UNUSUAL_SPENDING: (facts) =>
    `${field(facts, 'category')} had unusual spending of ${field(facts, 'amount')}, against a usual ${field(facts, 'usual')}.`,
  GOAL_OVERDUE: (facts) =>
    `The goal ${field(facts, 'goal')} is past its date with ${field(facts, 'remaining')} still to save.`,
  PROJECTED_SHORTFALL: (facts) =>
    `Projected spending of ${field(facts, 'projectedExpenses')} exceeds expected income of ${field(facts, 'expectedIncome')} by ${field(facts, 'shortfall')}.`,
};

const SUGGESTIONS: Record<string, (facts: Facts) => string> = {
  NEGATIVE_CASH_FLOW: () => 'Look for spending that can wait until more income arrives.',
  LOW_SAVINGS_RATE: () => 'Set an amount aside for savings at the start of the month.',
  SPENDING_INCREASED: () => 'Check which categories drove the increase in spending.',
  CATEGORY_SPENDING_INCREASED: (facts) =>
    `Check what drove the increase in ${field(facts, 'category')}.`,
  BUDGET_EXCEEDED: (facts) =>
    `Hold back on ${field(facts, 'category')} for the rest of the period, or adjust the budget.`,
  BUDGET_NEAR_LIMIT: (facts) =>
    `Keep an eye on ${field(facts, 'category')} for the rest of the period.`,
  BUDGET_PROJECTED_OVER_LIMIT: (facts) =>
    `Slow ${field(facts, 'category')} spending to stay within the budget.`,
  UNUSUAL_SPENDING: (facts) =>
    `Confirm the unusual ${field(facts, 'category')} spending was expected.`,
  GOAL_OVERDUE: (facts) => `Set a new date or amount for the goal ${field(facts, 'goal')}.`,
  PROJECTED_SHORTFALL: () => 'Plan how the projected shortfall will be covered.',
};

function summarize(review: Facts): string {
  const month = child(review, 'month');
  const totals = child(review, 'totals');
  const period = `${field(month, 'start')} to ${field(month, 'end')}`;
  if (review.transactionsRecorded === 0) {
    return `No transactions are recorded in ${field(review, 'currency')} for ${period}.`;
  }
  const sentences = [
    `For ${period}, income was ${field(totals, 'income')} and spending was ${field(totals, 'expenses')}, leaving ${field(totals, 'netCashFlow')}.`,
  ];
  if (typeof totals.savingsRate === 'string') {
    sentences.push(`The savings rate is ${totals.savingsRate}.`);
  }
  if (review.monthIsComplete === false) {
    sentences.push(`These figures run through ${field(review, 'dataThrough')}.`);
  }
  if (review.comparisonAvailable === false) {
    sentences.push('There is no earlier period to compare with yet.');
  }
  return sentences.join(' ');
}

function statementsOf(review: Facts, kind: 'STRENGTH' | 'CONCERN'): string[] {
  return findingsOf(review)
    .filter((finding) => finding.kind === kind)
    .map((finding) => STATEMENTS[field(finding, 'code')]?.(finding))
    .filter((statement) => statement !== undefined);
}

function suggestionsOf(review: Facts): string[] {
  const suggestions = findingsOf(review)
    .map((finding) => SUGGESTIONS[field(finding, 'code')]?.(finding))
    .filter((suggestion) => suggestion !== undefined);
  return [...new Set(suggestions)];
}

export interface FindingStatement {
  readonly kind: 'STRENGTH' | 'CONCERN';
  readonly code: string;
  readonly statement: string;
}

export function describeFindings(review: ReplyFacts): FindingStatement[] {
  return findingsOf(review).flatMap((finding) => {
    const code = field(finding, 'code');
    const statement = STATEMENTS[code]?.(finding);
    const kind = finding.kind === 'STRENGTH' ? 'STRENGTH' : 'CONCERN';
    return statement === undefined ? [] : [{ kind, code, statement }];
  });
}

export function renderDeterministicNarrative(reviews: readonly ReplyFacts[]): ReviewNarrative {
  const recommendations = reviews.flatMap(suggestionsOf);
  return {
    summary: reviews.map(summarize).join(' '),
    strengths: reviews.flatMap((review) => statementsOf(review, 'STRENGTH')),
    concerns: reviews.flatMap((review) => statementsOf(review, 'CONCERN')),
    recommendations,
    priorities: recommendations.slice(0, MAXIMUM_PRIORITIES),
  };
}
