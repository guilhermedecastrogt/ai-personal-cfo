import { comparableName } from '../extraction/member-resolution.js';

const MINIMUM_WORD_LENGTH = 3;

export interface GoalOption {
  readonly id: string;
  readonly name: string;
}

export type GoalResolution<Goal extends GoalOption> =
  | { readonly status: 'RESOLVED'; readonly goal: Goal }
  | { readonly status: 'AMBIGUOUS'; readonly goals: readonly Goal[] }
  | { readonly status: 'UNKNOWN' };

export function resolveMentionedGoal<Goal extends GoalOption>(
  mention: string,
  goals: readonly Goal[],
): GoalResolution<Goal> {
  const wanted = comparableName(mention).replace(/^meta (d[aeo]s? )?/, '');
  if (wanted === '') {
    return { status: 'UNKNOWN' };
  }
  const named = goals.map((goal) => ({ goal, name: comparableName(goal.name) }));
  const words = wanted.split(' ').filter((word) => word.length >= MINIMUM_WORD_LENGTH);
  const rules: ((entry: { name: string }) => boolean)[] = [
    (entry) => entry.name === wanted,
    (entry) => entry.name.startsWith(wanted),
    (entry) => entry.name.includes(wanted),
    (entry) => words.length > 0 && words.every((word) => entry.name.split(' ').includes(word)),
  ];
  for (const rule of rules) {
    const matches = named.filter(rule).map((entry) => entry.goal);
    const [only, ...others] = matches;
    if (only !== undefined && others.length === 0) {
      return { status: 'RESOLVED', goal: only };
    }
    if (matches.length > 1) {
      return { status: 'AMBIGUOUS', goals: matches };
    }
  }
  return { status: 'UNKNOWN' };
}
