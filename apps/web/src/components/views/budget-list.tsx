import type { ReactNode } from 'react';
import type { BudgetView } from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { Badge, Figure, Meter, type Tone } from '../ui';

const STATUS_TONE: Record<BudgetView['status'], Tone> = {
  NOT_STARTED: 'neutral',
  ON_TRACK: 'kept',
  NEAR_LIMIT: 'caution',
  EXCEEDED: 'concern',
};

export function BudgetList({
  budgets,
  detailed = false,
  t,
}: {
  readonly budgets: readonly BudgetView[];
  readonly detailed?: boolean;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <ul className="space-y-6">
      {budgets.map((budget) => {
        const status = { label: t.budgets.status[budget.status], tone: STATUS_TONE[budget.status] };
        return (
          <li key={budget.category}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-medium">
                {budget.category} <Badge tone={status.tone}>{status.label}</Badge>
              </span>
              <span className="text-sm">
                <Figure value={budget.spent} /> <span className="text-muted">{t.common.of}</span>{' '}
                <Figure value={budget.limit} />{' '}
                <span className="figure text-muted">({budget.usage.text})</span>
              </span>
            </div>
            <Meter
              value={budget.usage}
              tone={status.tone}
              label={t.budgets.used(budget.category)}
              t={t}
            />
            {detailed ? (
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
                <div>
                  <dt className="inline">{t.budgets.remaining}</dt>
                  <dd className="inline">
                    <Figure
                      value={budget.remaining}
                      tone={budget.remaining.minor < 0 ? 'concern' : 'neutral'}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="inline">{t.budgets.projected}</dt>
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
