import type { ReactNode } from 'react';
import type { BudgetView } from '@/lib/contracts';
import { Badge, Figure, Meter, type Tone } from '../ui';

const STATUS: Record<BudgetView['status'], { readonly label: string; readonly tone: Tone }> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  ON_TRACK: { label: 'On track', tone: 'kept' },
  NEAR_LIMIT: { label: 'Near limit', tone: 'caution' },
  EXCEEDED: { label: 'Exceeded', tone: 'concern' },
};

export function BudgetList({
  budgets,
  detailed = false,
}: {
  readonly budgets: readonly BudgetView[];
  readonly detailed?: boolean;
}): ReactNode {
  return (
    <ul className="space-y-5">
      {budgets.map((budget) => {
        const status = STATUS[budget.status];
        return (
          <li key={budget.category}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-medium">
                {budget.category} <Badge tone={status.tone}>{status.label}</Badge>
              </span>
              <span>
                <Figure value={budget.spent} /> <span className="text-muted">of</span>{' '}
                <Figure value={budget.limit} />{' '}
                <span className="figure text-muted">({budget.usage.text})</span>
              </span>
            </div>
            <Meter
              value={budget.usage}
              tone={status.tone}
              label={`${budget.category} budget used`}
            />
            {detailed ? (
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
                <div>
                  <dt className="inline">Remaining: </dt>
                  <dd className="inline">
                    <Figure
                      value={budget.remaining}
                      tone={budget.remaining.minor < 0 ? 'concern' : 'neutral'}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="inline">Projected by the end of the period: </dt>
                  <dd className="inline">
                    <Figure
                      value={budget.projectedTotal}
                      tone={budget.isProjectedOverLimit ? 'caution' : 'neutral'}
                    />
                  </dd>
                </div>
                {budget.byMember
                  .filter((member) => member.total.minor !== 0)
                  .map((member) => (
                    <div key={member.member}>
                      <dt className="inline">{member.member}: </dt>
                      <dd className="inline">
                        <Figure value={member.total} />
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
