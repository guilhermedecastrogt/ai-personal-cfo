import type { ReactNode } from 'react';
import type {
  BudgetsView as Budgets,
  GoalView,
  GoalsView as Goals,
  NotificationView,
  NotificationsView as Notifications,
  OutlookView as Outlook,
  SignalView,
  SignalsView as Signals,
} from '@/lib/contracts';
import {
  Badge,
  CurrencySections,
  Empty,
  Figure,
  Meter,
  PageHeading,
  Panel,
  Row,
  Rows,
  type Tone,
} from '../ui';
import { BudgetList } from './budget-list';

const GOAL_STATE: Record<GoalView['state'], { readonly label: string; readonly tone: Tone }> = {
  COMPLETED: { label: 'Reached', tone: 'kept' },
  OVERDUE: { label: 'Past its date', tone: 'concern' },
  IN_PROGRESS: { label: 'In progress', tone: 'neutral' },
};

const SEVERITY: Record<SignalView['severity'], Tone> = {
  INFO: 'neutral',
  LOW: 'neutral',
  MEDIUM: 'caution',
  HIGH: 'concern',
  CRITICAL: 'concern',
};

const FORECAST_METHOD: Record<
  NonNullable<Outlook['currencies'][number]['forecast']>['method'],
  string
> = {
  ACTUAL: 'The period is over, so this is the actual total.',
  HISTORICAL_REMAINDER: 'Based on what the rest of recent months cost from this point.',
  LINEAR_PACE: 'Based on the pace so far, because there is no earlier month to learn from.',
};

export function BudgetsView({ data }: { readonly data: Budgets }): ReactNode {
  return (
    <>
      <PageHeading title="Budgets" month={data.month} />
      <CurrencySections entries={data.currencies}>
        {(entry) =>
          entry.budgets.length === 0 ? (
            <Empty>No budgets are set for this household.</Empty>
          ) : (
            <Panel title="Household budgets" note="Limits apply to the household as a whole">
              <BudgetList budgets={entry.budgets} detailed />
            </Panel>
          )
        }
      </CurrencySections>
    </>
  );
}

export function GoalsView({ data }: { readonly data: Goals }): ReactNode {
  return (
    <>
      <PageHeading title="Goals" month={data.month} />
      <CurrencySections entries={data.currencies}>
        {(entry) =>
          entry.goals.length === 0 ? (
            <Empty>No goals are set for this household.</Empty>
          ) : (
            <Panel title="Household goals">
              <ul className="space-y-6">
                {entry.goals.map((goal) => {
                  const state = GOAL_STATE[goal.state];
                  return (
                    <li key={goal.goal}>
                      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-medium">
                          {goal.goal} <Badge tone={state.tone}>{state.label}</Badge>
                        </span>
                        <span>
                          <Figure value={goal.saved} /> <span className="text-muted">of</span>{' '}
                          <Figure value={goal.target} />{' '}
                          <span className="figure text-muted">({goal.progress.text})</span>
                        </span>
                      </div>
                      <Meter
                        value={goal.progress}
                        tone={state.tone}
                        label={`${goal.goal} progress`}
                      />
                      <p className="mt-2 text-sm text-muted">
                        <Figure value={goal.remaining} /> to go
                        {goal.targetDate === null ? '' : ` by ${goal.targetDate}`}
                        {goal.requiredMonthly === null ? null : (
                          <>
                            , which needs <Figure value={goal.requiredMonthly} /> a month
                          </>
                        )}
                        .
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )
        }
      </CurrencySections>
    </>
  );
}

export function OutlookView({ data }: { readonly data: Outlook }): ReactNode {
  return (
    <>
      <PageHeading title="Outlook" month={data.month} />
      <CurrencySections entries={data.currencies}>
        {(entry) => (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Actual" note="Recorded so far">
                <Rows>
                  <Row label="Income">
                    <Figure value={entry.actual.income} />
                  </Row>
                  <Row label="Spending">
                    <Figure value={entry.actual.expenses} />
                  </Row>
                  <Row label="Kept">
                    <Figure value={entry.actual.net} />
                  </Row>
                </Rows>
              </Panel>
              <Panel title="Projected" note="An estimate for the end of the month">
                {entry.forecast === null ? (
                  <Empty>This month is complete. The actual figures are final.</Empty>
                ) : (
                  <>
                    <Rows>
                      <Row
                        label="Spending"
                        detail={`${String(entry.forecast.daysRemaining)} days left`}
                      >
                        <Figure value={entry.forecast.projectedTotal} tone="caution" />
                      </Row>
                      {entry.outlook === null ? null : (
                        <>
                          <Row label="Expected income">
                            <Figure value={entry.outlook.expectedIncome} tone="caution" />
                          </Row>
                          <Row label="Kept">
                            <Figure
                              value={entry.outlook.projectedNet}
                              tone={entry.outlook.projectedNet.minor < 0 ? 'concern' : 'caution'}
                            />
                          </Row>
                        </>
                      )}
                    </Rows>
                    <p className="mt-3 text-sm text-muted">
                      {FORECAST_METHOD[entry.forecast.method]}
                    </p>
                  </>
                )}
              </Panel>
            </div>
            {entry.budgetsProjectedOverLimit.length === 0 ? null : (
              <Panel title="Budgets projected to run over">
                <Rows>
                  {entry.budgetsProjectedOverLimit.map((budget) => (
                    <Row
                      key={budget.category}
                      label={budget.category}
                      detail={<Figure value={budget.limit} />}
                    >
                      <Figure value={budget.projectedTotal} tone="caution" />
                    </Row>
                  ))}
                </Rows>
              </Panel>
            )}
            <Panel title="Recurring commitments" note="Detected from repeated charges">
              {entry.recurring.commitments.length === 0 ? (
                <Empty>
                  No recurring expense has been detected yet. It takes three regular charges.
                </Empty>
              ) : (
                <>
                  <p className="mb-3">
                    About <Figure value={entry.recurring.monthlyEquivalent} /> a month in total.
                  </p>
                  <Rows>
                    {entry.recurring.commitments.map((commitment) => (
                      <Row
                        key={`${commitment.merchant}-${commitment.frequency}`}
                        label={commitment.merchant}
                        detail={`${commitment.frequency.toLowerCase()} · last ${commitment.lastDate} · next expected ${commitment.nextExpectedDate}`}
                      >
                        <Figure value={commitment.typicalAmount} />
                      </Row>
                    ))}
                  </Rows>
                </>
              )}
            </Panel>
          </>
        )}
      </CurrencySections>
    </>
  );
}

const NOTIFICATION_STATUS: Record<
  NotificationView['status'],
  { readonly label: string; readonly tone: Tone }
> = {
  SENT: { label: 'Sent', tone: 'kept' },
  PENDING: { label: 'Waiting to send', tone: 'neutral' },
  FAILED: { label: 'Not delivered', tone: 'concern' },
  SUPPRESSED: { label: 'Shown here only', tone: 'neutral' },
};

const DATE_LENGTH = 10;

export function NotificationsPanel({
  data,
  markRead,
}: {
  readonly data: Notifications;
  readonly markRead: (form: FormData) => Promise<void>;
}): ReactNode {
  return (
    <Panel title="Notifications" note="What the CFO raised on its own, newest first">
      {data.notifications.length === 0 ? (
        <Empty>Nothing has been raised yet. Notable changes will appear here.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {data.notifications.map((notification) => (
            <li
              key={notification.key}
              className={`flex flex-wrap items-start justify-between gap-3 py-3 ${notification.isRead ? 'opacity-70' : ''}`}
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {notification.title}{' '}
                  <Badge tone={SEVERITY[notification.severity]}>
                    {notification.severity.toLowerCase()}
                  </Badge>{' '}
                  <Badge tone={NOTIFICATION_STATUS[notification.status].tone}>
                    {NOTIFICATION_STATUS[notification.status].label}
                  </Badge>
                </p>
                <p className="mt-1 text-sm text-muted">
                  <span className="figure">{notification.detail}</span>
                  {` · ${notification.detectedAt.slice(0, DATE_LENGTH)}`}
                </p>
              </div>
              {notification.isRead ? (
                <span className="text-sm text-muted">Read</span>
              ) : (
                <form action={markRead}>
                  <input type="hidden" name="key" value={notification.key} />
                  <button
                    type="submit"
                    className="rounded-lg border border-line px-3 py-1 text-sm hover:bg-mist focus-visible:outline-2"
                  >
                    Mark as read
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SignalList({
  signals,
  empty,
}: {
  readonly signals: readonly SignalView[];
  readonly empty: string;
}): ReactNode {
  if (signals.length === 0) {
    return <Empty>{empty}</Empty>;
  }
  return (
    <ul className="divide-y divide-line">
      {signals.map((signal) => (
        <li key={`${signal.type}-${signal.title}-${signal.detail}`} className="py-3">
          <p className="font-medium">
            {signal.title}{' '}
            <Badge tone={SEVERITY[signal.severity]}>{signal.severity.toLowerCase()}</Badge>
          </p>
          <p className="mt-1 text-sm text-muted">
            <span className="figure">{signal.detail}</span>
            {signal.date === null ? '' : ` · ${signal.date}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function SignalsView({ data }: { readonly data: Signals }): ReactNode {
  return (
    <>
      <PageHeading title="Signals" month={data.month} />
      <CurrencySections entries={data.currencies}>
        {(entry) => (
          <>
            <Panel title="Insights" note="Most urgent first">
              <SignalList signals={entry.insights} empty="Nothing needs attention." />
            </Panel>
            <Panel title="Unusual spending" note="Compared with this household's own history">
              <SignalList
                signals={entry.anomalies}
                empty="Nothing unusual was found. This needs a few months of history to judge."
              />
            </Panel>
          </>
        )}
      </CurrencySections>
    </>
  );
}
