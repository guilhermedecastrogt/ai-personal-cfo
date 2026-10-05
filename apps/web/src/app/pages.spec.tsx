import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  ACCOUNTS,
  NOTIFICATIONS,
  RECURRING,
  SEPTEMBER,
  SIGNALS,
  TRANSACTIONS,
  overview,
} from '@/testing/fixtures';
import AccountsPage from './(dashboard)/accounts/page';
import OverviewPage from './(dashboard)/page';
import RecurringPage from './(dashboard)/recurring/page';
import SignalsPage from './(dashboard)/signals/page';
import TransactionsPage from './(dashboard)/transactions/page';

const apiGet = jest.fn<Promise<unknown>, [string, Record<string, string | undefined>?]>();

jest.mock('next/cache', () => ({ revalidatePath: (): void => undefined }));

jest.mock('@/lib/session', () => ({
  currentDictionary: (): Promise<unknown> =>
    Promise.resolve(
      jest.requireActual<typeof import('@/lib/i18n/dictionary')>('@/lib/i18n/dictionary').EN,
    ),
}));

jest.mock('@/lib/api', () => ({
  apiPost: (): Promise<void> => Promise.resolve(),
  apiGet: (path: string, parameters?: Record<string, string | undefined>): Promise<unknown> =>
    apiGet(path, parameters),
}));

function searchParams(
  values: Record<string, string | string[]> = {},
): Promise<Record<string, string | string[]>> {
  return Promise.resolve(values);
}

describe('dashboard pages', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('loads the overview of the current month when none is selected', async () => {
    apiGet.mockResolvedValue(overview());

    render((await OverviewPage({ searchParams: searchParams() })) as ReactElement);

    expect(apiGet).toHaveBeenCalledWith('/dashboard/overview', { month: undefined });
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('October 2026, up to 2026-10-20')).toBeInTheDocument();
  });

  it.each(['2026-09', '2025-03'])('asks the backend for the selected month %s', async (month) => {
    apiGet.mockResolvedValue(overview(undefined, SEPTEMBER));

    render((await OverviewPage({ searchParams: searchParams({ month }) })) as ReactElement);

    expect(apiGet).toHaveBeenCalledWith('/dashboard/overview', { month });
    expect(screen.getAllByText('September 2026').length).toBeGreaterThan(0);
  });

  it.each(['next-month', '2026-13', '2026-9', "2026-09'; drop table"])(
    'does not pass on "%s" as a month',
    async (month) => {
      apiGet.mockResolvedValue(overview());

      await OverviewPage({ searchParams: searchParams({ month }) });

      expect(apiGet).toHaveBeenCalledWith('/dashboard/overview', { month: undefined });
    },
  );

  it('never sends a household or member chosen by the browser', async () => {
    apiGet.mockResolvedValue(TRANSACTIONS);

    await TransactionsPage({
      searchParams: searchParams({
        householdId: 'another-household',
        household_id: 'another-household',
        memberId: 'another-member',
        type: 'EXPENSE',
        page: '2',
      }),
    });
    const [, parameters] = apiGet.mock.calls[0] ?? [];

    expect(Object.keys(parameters ?? {}).sort()).toEqual([
      'account',
      'category',
      'member',
      'month',
      'page',
      'type',
    ]);
    expect(JSON.stringify(parameters)).not.toContain('another');
  });

  it('lets an API failure surface instead of rendering figures', async () => {
    apiGet.mockRejectedValue(new Error('The API responded with status 500'));

    await expect(OverviewPage({ searchParams: searchParams() })).rejects.toThrow('status 500');
  });

  it('loads accounts without a month', async () => {
    apiGet.mockResolvedValue(ACCOUNTS);

    render((await AccountsPage()) as ReactElement);

    expect(apiGet).toHaveBeenCalledWith('/dashboard/accounts', undefined);
    expect(screen.getByRole('heading', { name: 'Accounts', level: 1 })).toBeInTheDocument();
  });

  it('shows the notifications of the household under the signals of the month', async () => {
    apiGet.mockImplementation((path) =>
      Promise.resolve(path === '/dashboard/notifications' ? NOTIFICATIONS : SIGNALS),
    );

    render(
      (await SignalsPage({ searchParams: searchParams({ month: '2026-10' }) })) as ReactElement,
    );

    expect(apiGet).toHaveBeenCalledWith('/dashboard/signals', { month: '2026-10' });
    expect(apiGet).toHaveBeenCalledWith('/dashboard/notifications', undefined);
    expect(screen.getByRole('heading', { name: 'Notifications', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(1);
  });

  it.each([
    ['name', 'name'],
    ['next', 'next'],
    ['amount; drop table', undefined],
    [undefined, undefined],
  ])('passes only a known sort order for recurring expenses (%s)', async (requested, passed) => {
    apiGet.mockResolvedValue(RECURRING);

    render(
      (await RecurringPage({
        searchParams: searchParams(requested === undefined ? {} : { sort: requested }),
      })) as ReactElement,
    );

    expect(apiGet).toHaveBeenCalledWith('/dashboard/recurring', { sort: passed });
    expect(screen.getByRole('heading', { name: 'Recurring', level: 1 })).toBeInTheDocument();
  });
});
