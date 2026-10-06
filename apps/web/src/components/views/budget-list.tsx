import type { ReactNode } from 'react';
import type { BudgetRowView, BudgetView } from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { percentOf } from '../charts';
import { ActionLink, Badge, Figure, Meter, type Tone } from '../ui';

type Pace = NonNullable<BudgetRowView['pace']>;

const STATUS_TONE: Record<BudgetView['status'], Tone> = {
  NOT_STARTED: 'neutral',
  ON_TRACK: 'kept',
  NEAR_LIMIT: 'caution',
  EXCEEDED: 'concern',
};

const PACE_TONE: Record<Pace['status'], string> = {
  NOT_STARTED: 'text-muted',
  FASTER: 'text-caution',
  ON_PACE: 'text-kept',
  SLOWER: 'text-kept',
};

export function BudgetList({
  budgets,
  detailed = false,
  editHref,
  t,
}: {
  readonly budgets: readonly (BudgetView & {
    readonly key?: string;
    readonly pace?: BudgetRowView['pace'];
  })[];
  readonly detailed?: boolean;
  readonly editHref?: (key: string) => string;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <ul className="space-y-6">
      {budgets.map((budget) => {
        const status = { label: t.budgets.status[budget.status], tone: STATUS_TONE[budget.status] };
        return (
          <li key={budget.key ?? budget.category}>
            <div className="mb-2 flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium">
                  {budget.category} <Badge tone={status.tone}>{status.label}</Badge>
                </span>
                <span className="text-sm">
                  <Figure value={budget.spent} /> <span className="text-muted">{t.common.of}</span>{' '}
                  <Figure value={budget.limit} />{' '}
                  <span className="figure text-muted">({budget.usage.text})</span>
                </span>
              </div>
              {editHref === undefined || budget.key === undefined ? null : (
                <span className="-my-2 -mr-2">
                  <ActionLink
                    href={editHref(budget.key)}
                    icon="edit"
                    label={t.editing.editItem(budget.category)}
                  />
                </span>
              )}
            </div>
            <div className="relative">
              <Meter
                value={budget.usage}
                tone={status.tone}
                label={t.budgets.used(budget.category)}
                t={t}
              />
              {budget.pace === undefined || budget.pace === null ? null : (
                <span
                  aria-hidden="true"
                  title={t.charts.elapsed(budget.pace.elapsed.text)}
                  className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink/60"
                  style={{ left: percentOf(budget.pace.elapsed) }}
                />
              )}
            </div>
            {detailed && budget.pace !== undefined && budget.pace !== null ? (
              <p className="mt-2 text-xs">
                <span className={`font-medium ${PACE_TONE[budget.pace.status]}`}>
                  {t.charts.pace[budget.pace.status]}
                </span>
                <span className="text-muted"> · {t.charts.elapsed(budget.pace.elapsed.text)}</span>
              </p>
            ) : null}
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
