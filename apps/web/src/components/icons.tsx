import type { ReactNode } from 'react';

export type IconName =
  | 'overview'
  | 'transactions'
  | 'spending'
  | 'income'
  | 'budgets'
  | 'goals'
  | 'outlook'
  | 'recurring'
  | 'signals'
  | 'review'
  | 'accounts'
  | 'more'
  | 'chevron-left'
  | 'chevron-right'
  | 'refresh'
  | 'sign-out'
  | 'close';

const PATHS: Record<IconName, string> = {
  overview: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  transactions: 'M5 7h14M5 12h14M5 17h9',
  spending: 'M12 4v16M8 8l4-4 4 4M7 20h10',
  income: 'M12 20V4M8 16l4 4 4-4M7 4h10',
  budgets: 'M4 18h16M6 18V11M10 18V7M14 18v-5M18 18V9',
  goals: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  outlook: 'M3 17l5-5 4 3 8-8M15 7h5v5',
  recurring: 'M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5',
  signals: 'M12 4a5 5 0 0 0-5 5v3.5L5 16h14l-2-3.5V9a5 5 0 0 0-5-5zM10 19a2 2 0 0 0 4 0',
  review: 'M7 4h7l4 4v12H7zM14 4v4h4M10 12h5M10 16h5',
  accounts: 'M4 8h16v11H4zM4 8l2-3h12l2 3M8 13h3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  'sign-out': 'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 16l4-4-4-4M14 12H4',
  close: 'M6 6l12 12M18 6L6 18',
};

export function Icon({
  name,
  className = 'h-5 w-5',
}: {
  readonly name: IconName;
  readonly className?: string;
}): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
