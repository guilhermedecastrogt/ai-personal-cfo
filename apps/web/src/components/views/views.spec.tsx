import { render, screen, within } from '@testing-library/react';
import { EN, PT_BR } from '@/lib/i18n/dictionary';
import {
  ACCOUNTS,
  BRL_OVERVIEW,
  BUDGETS,
  EMPTY_OVERVIEW,
  EUR_OVERVIEW,
  GOALS,
  INCOME,
  OUTLOOK,
  REVIEW,
  SEPTEMBER,
  NOTIFICATIONS,
  RECURRING,
  SIGNALS,
  SPENDING,
  TRANSACTIONS,
  overview,
} from '@/testing/fixtures';
import { IncomeView, SpendingView } from './flow-views';
import { OverviewView } from './overview-view';
import {
  BudgetsView,
  GoalsView,
  NotificationsPanel,
  OutlookView,
  SignalsView,
} from './planning-views';
import { AccountsView, ReviewView, TransactionsView } from './record-views';
import { RecurringView } from './recurring-view';

function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title, level: 2 });
  const section = heading.closest('section');
  if (section === null) {
    throw new Error(`No panel titled ${title}`);
  }
  return section;
}

describe('overview', () => {
  it('opens with the month in one line, using the figures it was given', () => {
    render(<OverviewView t={EN} data={overview()} />);
    const line = screen.getByRole('region', { name: 'Month in one line' });

    expect(line).toHaveTextContent('October 2026 so far');
    expect(line).toHaveTextContent('€3,000.00 in, €2,220.00 out, €780.00 kept.');
    expect(within(line).getByRole('meter', { name: 'Share of income kept' })).toHaveAttribute(
      'aria-valuetext',
      '26%',
    );
  });

  it('shows a completed month without "so far" and says there is nothing to project', () => {
    render(
      <OverviewView
        t={EN}
        data={overview([{ ...EUR_OVERVIEW, forecast: null, balances: null }], SEPTEMBER)}
      />,
    );

    expect(screen.getByRole('region', { name: 'Month in one line' })).not.toHaveTextContent(
      'so far',
    );
    expect(
      screen.getByText('This month is complete, so there is nothing to project.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Balances are shown for the current month only.')).toBeInTheDocument();
  });

  it('compares with the previous period', () => {
    render(<OverviewView t={EN} data={overview()} />);
    const comparison = panel('Compared with the previous period');

    expect(comparison).toHaveTextContent('Spending▲ up from €2,130.00 (4.23%)');
    expect(comparison).toHaveTextContent('Incomeunchanged from €3,000.00');
    expect(comparison).toHaveTextContent('Kept▼ down from €870.00');
  });

  it('says so when there is no earlier period, instead of showing a change', () => {
    render(<OverviewView t={EN} data={overview([{ ...EUR_OVERVIEW, comparison: null }])} />);

    expect(panel('Compared with the previous period')).toHaveTextContent(
      'There is no earlier period to compare with yet.',
    );
  });

  it('shows findings, budgets, the projection and balances', () => {
    render(<OverviewView t={EN} data={overview()} />);

    expect(panel('What stands out')).toHaveTextContent('Income exceeded spending by €780.00.');
    expect(panel('What stands out')).toHaveTextContent(
      'The Restaurants budget of €150.00 is exceeded',
    );
    expect(panel('Budgets')).toHaveTextContent('Restaurants Exceeded€180.00 of €150.00 (120%)');
    expect(panel('End of month')).toHaveTextContent('Projection, not an actual figure');
    expect(panel('End of month')).toHaveTextContent('Projected spending11 days left€2,460.00');
    expect(panel('Balances')).toHaveTextContent('Joint accounts€2,610.00');
    expect(panel('By member')).toHaveTextContent('Member C8.11%€180.00 spent');
  });

  it('links to the review of the same month', () => {
    render(<OverviewView t={EN} data={overview()} />);

    expect(
      screen.getByRole('link', { name: 'Read the full review for October 2026' }),
    ).toHaveAttribute('href', '/review?month=2026-10');
  });

  it('keeps each currency in its own section and never shows a combined total', () => {
    render(<OverviewView t={EN} data={overview([EUR_OVERVIEW, BRL_OVERVIEW])} />);
    const euros = screen.getByRole('region', { name: 'Figures in EUR' });
    const reais = screen.getByRole('region', { name: 'Figures in BRL' });

    expect(screen.getByText(/amounts are never added across currencies/)).toBeInTheDocument();
    expect(euros).toHaveTextContent('€2,220.00 out');
    expect(euros).not.toHaveTextContent('R$');
    expect(reais).toHaveTextContent('R$500.00 out');
    expect(reais).toHaveTextContent('-R$500.00 short.');
    expect(reais).toHaveTextContent('No income recorded, so there is no savings rate.');
    expect(document.body).not.toHaveTextContent('2,720');
  });

  it('describes an empty household without any figure', () => {
    render(<OverviewView t={EN} data={overview([EMPTY_OVERVIEW])} />);

    expect(screen.getByText(/No transactions are recorded for October 2026/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('€');
  });
});

describe('spending and income', () => {
  it('shows spending by category, member and account with changes and the largest expenses', () => {
    render(<SpendingView t={EN} data={SPENDING} />);

    expect(panel('Total spending')).toHaveTextContent('€2,220.00');
    expect(panel('Total spending')).toHaveTextContent('up from €2,130.00');
    expect(panel('By category')).toHaveTextContent('Housing€1,800.00 81.08%');
    expect(panel('By member')).toHaveTextContent('Member A91.89%€2,040.00');
    expect(panel('By account')).toHaveTextContent('Joint Account100%€2,220.00');
    expect(panel('Rose most')).toHaveTextContent('Restaurants');
    expect(panel('Fell most')).toHaveTextContent('No category moved by a meaningful amount.');
    expect(panel('Largest expenses')).toHaveTextContent(
      'Landlord2026-10-01 · Rent · Member A€1,800.00',
    );
  });

  it('hides changes when there is no earlier period', () => {
    const [entry] = SPENDING.currencies;
    render(
      <SpendingView
        t={EN}
        data={{
          ...SPENDING,
          currencies: entry === undefined ? [] : [{ ...entry, comparison: null }],
        }}
      />,
    );

    expect(panel('Total spending')).toHaveTextContent(
      'There is no earlier period to compare with yet.',
    );
    expect(screen.queryByRole('heading', { name: 'Rose most' })).not.toBeInTheDocument();
  });

  it('says when no spending is recorded', () => {
    const [entry] = SPENDING.currencies;
    render(
      <SpendingView
        t={EN}
        data={{
          ...SPENDING,
          currencies: entry === undefined ? [] : [{ ...entry, transactionCount: 0 }],
        }}
      />,
    );

    expect(screen.getByText('No spending is recorded for October 2026.')).toBeInTheDocument();
  });

  it('shows income by source and member', () => {
    render(<IncomeView t={EN} data={INCOME} />);

    expect(panel('Total income')).toHaveTextContent('€3,000.00');
    expect(panel('Total income')).toHaveTextContent('unchanged from €3,000.00');
    expect(panel('By source')).toHaveTextContent('Salary');
    expect(panel('By member')).toHaveTextContent('Member A100%€3,000.00');
  });
});

describe('budgets and goals', () => {
  it('shows each budget with its status, remainder, projection and members', () => {
    render(<BudgetsView t={EN} data={BUDGETS} />);
    const budgets = panel('Household budgets');

    expect(budgets).toHaveTextContent('Restaurants Exceeded€180.00 of €150.00 (120%)');
    expect(budgets).toHaveTextContent('Remaining: -€30.00');
    expect(budgets).toHaveTextContent('Projected by the end of the period: €210.00');
    expect(budgets).toHaveTextContent('Member C: €180.00');
    expect(budgets).not.toHaveTextContent('Member A');
    expect(within(budgets).getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
  });

  it('offers to create a budget and to edit each one, keeping the month', () => {
    render(<BudgetsView t={EN} data={BUDGETS} />);

    expect(screen.getByRole('link', { name: 'New budget' })).toHaveAttribute(
      'href',
      '/budgets/new?month=2026-10',
    );
    expect(screen.getByRole('link', { name: 'Edit Restaurants' })).toHaveAttribute(
      'href',
      '/budgets/budget-key-restaurants?month=2026-10',
    );
  });

  it('offers to create a goal and to edit each one', () => {
    render(<GoalsView t={PT_BR} data={GOALS} />);

    expect(screen.getByRole('link', { name: 'Nova meta' })).toHaveAttribute(
      'href',
      '/goals/new?month=2026-10',
    );
    expect(screen.getByRole('link', { name: 'Editar Summer Trip' })).toHaveAttribute(
      'href',
      '/goals/goal-key-summer-trip?month=2026-10',
    );
  });

  it('says when no budgets are set', () => {
    render(
      <BudgetsView
        t={EN}
        data={{ ...BUDGETS, currencies: [{ currency: 'EUR', budgets: [], forecast: null }] }}
      />,
    );

    expect(screen.getByText('No budgets are set for this household.')).toBeInTheDocument();
  });

  it('shows each goal with progress and what it needs', () => {
    render(<GoalsView t={EN} data={GOALS} />);
    const goals = panel('Household goals');

    expect(goals).toHaveTextContent('Summer Trip In progress€620.00 of €1,000.00 (62%)');
    expect(goals).toHaveTextContent('€380.00 remaining by 2027-06-30, which needs €45.68 a month.');
  });

  it('says when no goals are set', () => {
    render(<GoalsView t={EN} data={{ ...GOALS, currencies: [{ currency: 'EUR', goals: [] }] }} />);

    expect(screen.getByText('No goals are set for this household.')).toBeInTheDocument();
  });
});

describe('outlook and signals', () => {
  it('separates actual figures from projected ones', () => {
    render(<OutlookView t={EN} data={OUTLOOK} />);

    expect(panel('Actual')).toHaveTextContent('Recorded so far');
    expect(panel('Actual')).toHaveTextContent('Spending€2,220.00');
    expect(panel('Projected')).toHaveTextContent('An estimate for the end of the month');
    expect(panel('Projected')).toHaveTextContent('Spending11 days left€2,460.00');
    expect(panel('Projected')).toHaveTextContent('Expected income€3,000.00');
    expect(panel('Projected')).toHaveTextContent('Based on what the rest of recent months cost');
    expect(panel('Budgets projected to run over')).toHaveTextContent('Groceries€300.00€340.00');
  });

  it('lists recurring commitments with the dates the backend supplied', () => {
    render(<OutlookView t={EN} data={OUTLOOK} />);

    expect(panel('Recurring commitments')).toHaveTextContent('About €1,817.99 a month in total.');
    expect(panel('Recurring commitments')).toHaveTextContent(
      'Landlordmonthly · last 2026-10-01 · next expected 2026-10-31€1,800.00',
    );
  });

  it('has no projection for a completed month and explains missing recurring data', () => {
    const [entry] = OUTLOOK.currencies;
    render(
      <OutlookView
        t={EN}
        data={{
          ...OUTLOOK,
          currencies:
            entry === undefined
              ? []
              : [
                  {
                    ...entry,
                    forecast: null,
                    outlook: null,
                    budgetsProjectedOverLimit: [],
                    recurring: {
                      monthlyEquivalent: entry.recurring.monthlyEquivalent,
                      commitments: [],
                    },
                  },
                ],
        }}
      />,
    );

    expect(panel('Projected')).toHaveTextContent(
      'This month is complete. The actual figures are final.',
    );
    expect(panel('Recurring commitments')).toHaveTextContent('It takes three regular charges.');
  });

  it('lists insights with their severity and anomalies with their date', () => {
    render(<SignalsView t={EN} data={SIGNALS} />);

    expect(panel('Insights')).toHaveTextContent('Restaurants budget exceeded high');
    expect(panel('Insights')).toHaveTextContent('€180.00 of €150.00 spent (120%).');
    expect(panel('Unusual spending')).toHaveTextContent(
      'Unusually large Restaurants expense medium',
    );
    expect(panel('Unusual spending')).toHaveTextContent('2026-10-14');
  });

  it('says when there is nothing to flag and that history is needed', () => {
    render(
      <SignalsView
        t={EN}
        data={{ ...SIGNALS, currencies: [{ currency: 'EUR', insights: [], anomalies: [] }] }}
      />,
    );

    expect(panel('Insights')).toHaveTextContent('Nothing needs attention.');
    expect(panel('Unusual spending')).toHaveTextContent('needs a few months of history');
  });
});

describe('notifications', () => {
  const markRead = (): Promise<void> => Promise.resolve();

  it('lists what was raised with its severity, delivery status and date', () => {
    render(<NotificationsPanel t={EN} data={NOTIFICATIONS} markRead={markRead} />);
    const items = within(panel('Notifications')).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Restaurants budget exceeded high Sent');
    expect(items[0]).toHaveTextContent('€180.00 of €150.00 spent (120%). · 2026-10-20');
    expect(items[1]).toHaveTextContent('Streaming is expected soon low Shown here only');
  });

  it('offers to mark only unread notifications as read, by their key', () => {
    render(<NotificationsPanel t={EN} data={NOTIFICATIONS} markRead={markRead} />);
    const items = within(panel('Notifications')).getAllByRole('listitem');
    const unread = items[0] ?? document.body;
    const read = items[1] ?? document.body;
    const button = within(unread).getByRole('button', { name: 'Mark as read' });

    expect(button.closest('form')?.querySelector('input[name="key"]')).toHaveValue(
      'notification-1',
    );
    expect(within(read).queryByRole('button')).toBeNull();
    expect(read).toHaveTextContent('Read');
  });

  it('says when nothing has been raised', () => {
    render(<NotificationsPanel t={EN} data={{ notifications: [] }} markRead={markRead} />);

    expect(panel('Notifications')).toHaveTextContent('Nothing has been raised yet.');
  });
});

describe('recurring', () => {
  it('shows the monthly and annual commitment and what is coming up, as given', () => {
    render(<RecurringView t={EN} data={RECURRING} />);

    expect(panel('Commitment')).toHaveTextContent('€1,826.98 a month, €21,923.76 a year.');
    expect(panel('Commitment')).toHaveTextContent(
      'Expected in the next 14 days: €1,802.99 (Cloud, Landlord).',
    );
  });

  it('lists each recurring expense with cadence, dates, payers and annual cost', () => {
    render(<RecurringView t={EN} data={RECURRING} />);
    const rows = within(panel('Recurring expenses')).getAllByRole('listitem');

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(
      'Landlord monthly · Rentlast 2026-10-01 · next expected 2026-10-31paid by Member A (6)',
    );
    expect(rows[0]).toHaveTextContent('€1,800.00€21,600.00 a year');
    expect(rows[1]).toHaveTextContent('paid by Member A (4), Member B (3)');
  });

  it('marks a price change with both amounts and its date, and a new commitment', () => {
    render(<RecurringView t={EN} data={RECURRING} />);
    const rows = within(panel('Recurring expenses')).getAllByRole('listitem');

    expect(rows[1]).toHaveTextContent('Price up');
    expect(rows[1]).toHaveTextContent('Was €15.99 until 2026-09-15, now €18.99 (18.76%)');
    expect(rows[2]).toHaveTextContent('Cloud New');
    expect(rows[0]).not.toHaveTextContent(/New|Price/);
  });

  it('lists what appears to have stopped without saying why', () => {
    render(<RecurringView t={EN} data={RECURRING} />);
    const stopped = panel('Appear to have stopped');

    expect(stopped).toHaveTextContent(
      'Old Gymmonthly · last charged 2026-07-05was expected 2026-08-04 · paid by Member A (5)',
    );
    expect(stopped).not.toHaveTextContent(/cancel/i);
  });

  it('offers sorting and marks the current order', () => {
    render(<RecurringView t={EN} data={{ ...RECURRING, sort: 'next' }} />);
    const sorting = screen.getByRole('navigation', { name: 'Sort recurring expenses' });

    expect(within(sorting).getByRole('link', { name: 'Next date' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(sorting).getByRole('link', { name: 'Name' })).toHaveAttribute(
      'href',
      '/recurring?sort=name',
    );
  });

  it('explains what is needed when nothing has been detected', () => {
    const [eur] = RECURRING.currencies;
    render(
      <RecurringView
        t={EN}
        data={{
          ...RECURRING,
          currencies: eur === undefined ? [] : [{ ...eur, commitments: [], stopped: [] }],
        }}
      />,
    );

    expect(screen.getByText(/It takes three regular charges/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Commitment' })).toBeNull();
  });

  it('keeps currencies in separate sections', () => {
    const [eur] = RECURRING.currencies;
    render(
      <RecurringView
        t={EN}
        data={{
          ...RECURRING,
          currencies:
            eur === undefined
              ? []
              : [eur, { ...eur, currency: 'USD', commitments: [], stopped: [] }],
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Figures in EUR' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Figures in USD' })).toHaveTextContent(
      'No recurring expense has been detected yet.',
    );
  });
});

describe('review', () => {
  it('shows the summary, strengths, concerns, suggestions and priorities', () => {
    render(<ReviewView t={EN} data={REVIEW} />);

    expect(screen.getByText(/income was €3,000.00 and spending was €2,220.00/)).toBeInTheDocument();
    expect(panel('Going well')).toHaveTextContent('Income exceeded spending by €780.00.');
    expect(panel('Needs attention')).toHaveTextContent(
      'The Restaurants budget of €150.00 is exceeded',
    );
    expect(panel('Suggestions')).toHaveTextContent('Hold back on Restaurants');
    expect(within(panel('What to do first')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('says which form of the review is shown', () => {
    const { rerender } = render(<ReviewView t={EN} data={REVIEW} />);
    expect(screen.getByText(/Shown in its plain form/)).toBeInTheDocument();

    rerender(<ReviewView t={EN} data={{ ...REVIEW, source: 'AI' }} />);
    expect(screen.getByText(/Every number was checked against them/)).toBeInTheDocument();
  });

  it('leaves out sections that have nothing in them', () => {
    render(
      <ReviewView
        t={EN}
        data={{ ...REVIEW, strengths: [], concerns: [], recommendations: [], priorities: [] }}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Going well' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What to do first' })).not.toBeInTheDocument();
  });
});

describe('transactions', () => {
  it('lists transactions with names, never with identifiers', () => {
    render(<TransactionsView t={EN} data={TRANSACTIONS} query={{}} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');

    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent(
      '2026-10-12BistroExpense · individualRestaurantsJoint AccountMember C€180.00',
    );
    expect(rows[2]).toHaveTextContent(
      '2026-10-02TransferTransfer—Joint Account → SavingsMember A€500.00',
    );
    expect(screen.getByRole('table')).not.toHaveTextContent(/key-/);
  });

  it('offers the filters the backend listed and keeps the month and the current selection', () => {
    render(
      <TransactionsView
        t={EN}
        data={TRANSACTIONS}
        query={{ type: 'EXPENSE', member: 'member-key-a' }}
      />,
    );

    expect(screen.getByLabelText('Type')).toHaveValue('EXPENSE');
    expect(screen.getByLabelText('Member')).toHaveValue('member-key-a');
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(
      within(screen.getByLabelText('Account')).getByRole('option', { name: 'Joint Account' }),
    ).toBeInTheDocument();
    expect(document.querySelector('input[name="month"]')).toHaveValue('2026-10');
  });

  it('pages through results keeping the filters', () => {
    render(<TransactionsView t={EN} data={TRANSACTIONS} query={{ type: 'EXPENSE' }} />);

    expect(screen.getByText('61 transactions · page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/transactions?month=2026-10&page=2&type=EXPENSE',
    );
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument();
  });

  it('opens each transaction for editing and comes back to the same page and filters', () => {
    render(<TransactionsView t={EN} data={TRANSACTIONS} query={{ type: 'EXPENSE' }} />);
    const back = encodeURIComponent('/transactions?month=2026-10&page=1&type=EXPENSE');

    expect(
      screen.getAllByRole('link', { name: 'Edit Bistro' }).map((link) => link.getAttribute('href')),
    ).toEqual([
      `/transactions/transaction-key-bistro?back=${back}`,
      `/transactions/transaction-key-bistro?back=${back}`,
    ]);
    expect(screen.getAllByRole('link', { name: 'Edit Transfer' })).toHaveLength(2);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Apply']);
  });

  it('says when nothing matches', () => {
    render(
      <TransactionsView
        t={EN}
        data={{ ...TRANSACTIONS, transactions: [], total: 0, pageCount: 1 }}
        query={{}}
      />,
    );

    expect(screen.getByText('No transactions match for October 2026.')).toBeInTheDocument();
  });
});

describe('accounts', () => {
  it('lists accounts with ownership, marks joint accounts and keeps currencies apart', () => {
    render(<AccountsView t={EN} data={ACCOUNTS} />);

    expect(panel('Accounts')).toHaveTextContent('Joint AccountBank account · EUR · Joint€2,610.00');
    expect(panel('Accounts')).toHaveTextContent('PersonalBank account · EUR · Member B€500.00');
    expect(panel('Totals in EUR')).toHaveTextContent('All accounts€3,110.00');
    expect(panel('Totals in BRL')).toHaveTextContent('All accounts-R$500.00');
    expect(
      screen.getByText('Totals are kept per currency and are never added together.'),
    ).toBeInTheDocument();
    expect(panel('Members')).toHaveTextContent('Member AMember BMember C');
  });

  it('says when a household has no accounts', () => {
    render(<AccountsView t={EN} data={{ ...ACCOUNTS, accounts: [], totals: [] }} />);

    expect(screen.getByText('This household has no accounts yet.')).toBeInTheDocument();
  });
});

describe('in Brazilian Portuguese', () => {
  it('writes the month in one line and the panels in Portuguese', () => {
    render(<OverviewView t={PT_BR} data={overview()} />);
    const line = screen.getByRole('region', { name: 'O mês em uma linha' });

    expect(line).toHaveTextContent('€3,000.00 entraram, €2,220.00 saíram, €780.00 ficaram.');
    expect(
      screen.getByRole('heading', { name: 'Em relação ao período anterior' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Início', level: 1 })).toBeInTheDocument();
  });

  it('names budget states in Portuguese', () => {
    render(<BudgetsView t={PT_BR} data={BUDGETS} />);

    expect(screen.getByRole('heading', { name: 'Orçamentos da casa' })).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/Ultrapassado|Perto do limite|Dentro do previsto/);
  });

  it('labels transaction kinds and filters in Portuguese', () => {
    render(<TransactionsView t={PT_BR} data={TRANSACTIONS} query={{}} />);

    expect(screen.getByText('Filtros')).toBeInTheDocument();
    expect(screen.getAllByText(/Gasto|Receita|Transferência/).length).toBeGreaterThan(0);
  });
});
