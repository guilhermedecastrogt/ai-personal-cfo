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
import type { Dictionary } from '@/lib/i18n/dictionary';
import {
  ActionLink,
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

const GOAL_TONE: Record<GoalView['state'], Tone> = {
  COMPLETED: 'kept',
  OVERDUE: 'concern',
  IN_PROGRESS: 'neutral',
};

const SEVERITY: Record<SignalView['severity'], Tone> = {
  INFO: 'neutral',
  LOW: 'neutral',
  MEDIUM: 'caution',
  HIGH: 'concern',
  CRITICAL: 'concern',
};

export function BudgetsView({
  data,
  t,
}: {
  readonly data: Budgets;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.budgets.title} month={data.month} t={t}>
        <div className="mt-5">
          <ActionLink href={`/budgets/new?month=${data.month.key}`} icon="plus">
            {t.editing.budget.add}
          </ActionLink>
        </div>
      </PageHeading>
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) =>
          entry.budgets.length === 0 ? (
            <Empty>{t.budgets.none}</Empty>
          ) : (
            <Panel title={t.budgets.householdBudgets} note={t.budgets.householdNote}>
              <BudgetList
                budgets={entry.budgets}
                detailed
                editHref={(key) => `/budgets/${key}?month=${data.month.key}`}
                t={t}
              />
            </Panel>
          )
        }
      </CurrencySections>
    </>
  );
}

export function GoalsView({
  data,
  t,
}: {
  readonly data: Goals;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.goals.title} month={data.month} t={t}>
        <div className="mt-5">
          <ActionLink href={`/goals/new?month=${data.month.key}`} icon="plus">
            {t.editing.goal.add}
          </ActionLink>
        </div>
      </PageHeading>
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) =>
          entry.goals.length === 0 ? (
            <Empty>{t.goals.none}</Empty>
          ) : (
            <Panel title={t.goals.householdGoals}>
              <ul className="space-y-7">
                {entry.goals.map((goal) => {
                  const state = { label: t.goals.state[goal.state], tone: GOAL_TONE[goal.state] };
                  return (
                    <li key={goal.key}>
                      <div className="mb-1.5 flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="font-medium">
                            {goal.goal} <Badge tone={state.tone}>{state.label}</Badge>
                          </span>
                          <span>
                            <Figure value={goal.saved} />{' '}
                            <span className="text-muted">{t.common.of}</span>{' '}
                            <Figure value={goal.target} />{' '}
                            <span className="figure text-muted">({goal.progress.text})</span>
                          </span>
                        </div>
                        <span className="-my-2 -mr-2">
                          <ActionLink
                            href={`/goals/${goal.key}?month=${data.month.key}`}
                            icon="edit"
                            label={t.editing.editItem(goal.goal)}
                          />
                        </span>
                      </div>
                      <Meter
                        value={goal.progress}
                        tone={state.tone}
                        label={t.goals.progress(goal.goal)}
                        t={t}
                      />
                      <p className="mt-2 text-sm text-muted">
                        <Figure value={goal.remaining} />
                        {t.goals.toGo}
                        {goal.targetDate === null ? '' : t.goals.by(t.date(goal.targetDate))}
                        {goal.requiredMonthly === null ? null : (
                          <>
                            {t.goals.needs}
                            <Figure value={goal.requiredMonthly} /> {t.common.aMonth}
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

export function OutlookView({
  data,
  t,
}: {
  readonly data: Outlook;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.outlook.title} month={data.month} t={t} />
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) => (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title={t.outlook.actual} note={t.outlook.actualNote}>
                <Rows>
                  <Row label={t.outlook.income}>
                    <Figure value={entry.actual.income} />
                  </Row>
                  <Row label={t.outlook.spending}>
                    <Figure value={entry.actual.expenses} />
                  </Row>
                  <Row label={t.outlook.kept}>
                    <Figure value={entry.actual.net} />
                  </Row>
                </Rows>
              </Panel>
              <Panel title={t.outlook.projected} note={t.outlook.projectedNote}>
                {entry.forecast === null ? (
                  <Empty>{t.outlook.complete}</Empty>
                ) : (
                  <>
                    <Rows>
                      <Row
                        label={t.outlook.spending}
                        detail={t.common.daysLeft(entry.forecast.daysRemaining)}
                      >
                        <Figure value={entry.forecast.projectedTotal} tone="caution" />
                      </Row>
                      {entry.outlook === null ? null : (
                        <>
                          <Row label={t.outlook.expectedIncome}>
                            <Figure value={entry.outlook.expectedIncome} tone="caution" />
                          </Row>
                          <Row label={t.outlook.kept}>
                            <Figure
                              value={entry.outlook.projectedNet}
                              tone={entry.outlook.projectedNet.minor < 0 ? 'concern' : 'caution'}
                            />
                          </Row>
                        </>
                      )}
                    </Rows>
                    <p className="mt-3 text-sm text-muted">
                      {t.outlook.method[entry.forecast.method]}
                    </p>
                  </>
                )}
              </Panel>
            </div>
            {entry.budgetsProjectedOverLimit.length === 0 ? null : (
              <Panel title={t.outlook.overLimit}>
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
            <Panel title={t.outlook.recurring} note={t.outlook.recurringNote}>
              {entry.recurring.commitments.length === 0 ? (
                <Empty>{t.outlook.noRecurring}</Empty>
              ) : (
                <>
                  <p className="mb-3">
                    {t.outlook.about} <Figure value={entry.recurring.monthlyEquivalent} />{' '}
                    {t.outlook.aMonthInTotal}
                  </p>
                  <Rows>
                    {entry.recurring.commitments.map((commitment) => (
                      <Row
                        key={`${commitment.merchant}-${commitment.frequency}`}
                        label={commitment.merchant}
                        detail={`${t.common.frequency[commitment.frequency]} · ${t.outlook.last} ${t.date(commitment.lastDate)} · ${t.outlook.nextExpected} ${t.date(commitment.nextExpectedDate)}`}
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

const NOTIFICATION_TONE: Record<NotificationView['status'], Tone> = {
  SENT: 'kept',
  PENDING: 'neutral',
  FAILED: 'concern',
  SUPPRESSED: 'neutral',
};

const DATE_LENGTH = 10;

export function NotificationsPanel({
  data,
  markRead,
  t,
}: {
  readonly data: Notifications;
  readonly markRead: (form: FormData) => Promise<void>;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <Panel title={t.signals.notifications} note={t.signals.notificationsNote}>
      {data.notifications.length === 0 ? (
        <Empty>{t.signals.noNotifications}</Empty>
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
                    {t.common.severity[notification.severity]}
                  </Badge>{' '}
                  <Badge tone={NOTIFICATION_TONE[notification.status]}>
                    {t.signals.status[notification.status]}
                  </Badge>
                </p>
                <p className="mt-1 text-sm text-muted">
                  <span className="figure">{notification.detail}</span>
                  {` · ${t.date(notification.detectedAt.slice(0, DATE_LENGTH))}`}
                </p>
              </div>
              {notification.isRead ? (
                <span className="text-sm text-muted">{t.signals.read}</span>
              ) : (
                <form action={markRead}>
                  <input type="hidden" name="key" value={notification.key} />
                  <button
                    type="submit"
                    className="min-h-9 rounded-full border border-line px-3.5 py-1.5 text-sm hover:bg-raised"
                  >
                    {t.signals.markRead}
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
  t,
}: {
  readonly signals: readonly SignalView[];
  readonly empty: string;
  readonly t: Dictionary;
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
            <Badge tone={SEVERITY[signal.severity]}>{t.common.severity[signal.severity]}</Badge>
          </p>
          <p className="mt-1 text-sm text-muted">
            <span className="figure">{signal.detail}</span>
            {signal.date === null ? '' : ` · ${t.date(signal.date)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function SignalsView({
  data,
  t,
}: {
  readonly data: Signals;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.signals.title} month={data.month} t={t} />
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) => (
          <>
            <Panel title={t.signals.insights} note={t.signals.insightsNote}>
              <SignalList signals={entry.insights} empty={t.signals.nothingNeedsAttention} t={t} />
            </Panel>
            <Panel title={t.signals.unusual} note={t.signals.unusualNote}>
              <SignalList signals={entry.anomalies} empty={t.signals.nothingUnusual} t={t} />
            </Panel>
          </>
        )}
      </CurrencySections>
    </>
  );
}
