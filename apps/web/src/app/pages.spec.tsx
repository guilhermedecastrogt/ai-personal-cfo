import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  ACCOUNTS,
  COMPARE,
  EVOLUTION,
  MEMBER,
  MEMBERS,
  NOTIFICATIONS,
  RECURRING,
  SEPTEMBER,
  SIGNALS,
  TRANSACTIONS,
  overview,
} from '@/testing/fixtures';
import AccountsPage from './(dashboard)/accounts/page';
import ComparePage from './(dashboard)/compare/page';
import MemberPage from './(dashboard)/members/[key]/page';
import MembersPage from './(dashboard)/members/page';
import OverviewPage from './(dashboard)/page';
import RecurringPage from './(dashboard)/recurring/page';
import SignalsPage from './(dashboard)/signals/page';
import TransactionsPage from './(dashboard)/transactions/page';

const apiGet = jest.fn<Promise<unknown>, [string, Record<string, string | undefined>?]>();
const apiFind = jest.fn<Promise<unknown>, [string]>();

jest.mock('next/cache', () => ({ revalidatePath: (): void => undefined }));

jest.mock('@/lib/session', () => ({
  currentDictionary: (): Promise<unknown> =>
    Promise.resolve(
      jest.requireActual<typeof import('@/lib/i18n/dictionary')>('@/lib/i18n/dictionary').EN,
    ),
}));

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual<typeof import('@/lib/api')>('@/lib/api').ApiError,
  apiFind: (path: string): Promise<unknown> => apiFind(path),
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
    apiFind.mockReset();
  });

  function respondWithOverview(data: unknown = overview()): void {
    apiGet.mockImplementation((path) =>
      Promise.resolve(path === '/dashboard/evolution' ? EVOLUTION : data),
    );
  }

  it('loads the overview of the current month when none is selected', async () => {
    respondWithOverview();

    render((await OverviewPage({ searchParams: searchParams() })) as ReactElement);

    expect(apiGet).toHaveBeenCalledWith('/dashboard/overview', { month: undefined });
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('October 2026, up to 2026-10-20')).toBeInTheDocument();
  });

  it.each(['2026-09', '2025-03'])('asks the backend for the selected month %s', async (month) => {
    respondWithOverview(overview(undefined, SEPTEMBER));

    render((await OverviewPage({ searchParams: searchParams({ month }) })) as ReactElement);

    expect(apiGet).toHaveBeenCalledWith('/dashboard/overview', { month });
    expect(screen.getAllByText('September 2026').length).toBeGreaterThan(0);
  });

  it.each(['next-month', '2026-13', '2026-9', "2026-09'; drop table"])(
    'does not pass on "%s" as a month',
    async (month) => {
      respondWithOverview();

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
      'from',
      'member',
      'month',
      'page',
      'q',
      'sort',
      'to',
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

  it.each([
    [undefined, '6'],
    ['12', '12'],
    ['24', '6'],
  ])('draws %s months of evolution as %s', async (requested, passed) => {
    respondWithOverview();

    await OverviewPage({
      searchParams: searchParams(requested === undefined ? {} : { months: requested }),
    });

    expect(apiGet).toHaveBeenCalledWith('/dashboard/evolution', { months: passed });
  });

  it('searches transactions with the text, period and order asked', async () => {
    apiGet.mockResolvedValue(TRANSACTIONS);

    await TransactionsPage({
      searchParams: searchParams({
        q: ' bistro ',
        from: '2026-09-01',
        to: '2026-10-31',
        sort: 'amount_asc',
      }),
    });

    expect(apiGet).toHaveBeenCalledWith(
      '/dashboard/transactions',
      expect.objectContaining({
        q: 'bistro',
        from: '2026-09-01',
        to: '2026-10-31',
        sort: 'amount_asc',
      }),
    );
  });

  it('falls back to the month when the API refuses the period', async () => {
    const { ApiError } = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
    apiGet.mockImplementation((_path, parameters) =>
      parameters?.from === undefined
        ? Promise.resolve(TRANSACTIONS)
        : Promise.reject(new ApiError(400)),
    );

    render(
      (await TransactionsPage({
        searchParams: searchParams({ q: 'bistro', from: '2026-10-31', to: '2026-09-01' }),
      })) as ReactElement,
    );

    expect(apiGet).toHaveBeenLastCalledWith(
      '/dashboard/transactions',
      expect.objectContaining({ q: 'bistro', from: undefined, to: undefined }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the month instead.');
  });

  it('lets other transaction failures surface', async () => {
    const { ApiError } = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
    apiGet.mockRejectedValue(new ApiError(500));

    await expect(
      TransactionsPage({ searchParams: searchParams({ from: '2026-09-01' }) }),
    ).rejects.toThrow('status 500');
  });

  it.each([
    [
      { a: '2026-08', b: '2026-10' },
      { a: '2026-08', b: '2026-10' },
    ],
    [
      { a: '2026-8', b: 'last' },
      { a: undefined, b: undefined },
    ],
  ])('compares only well-formed months (%j)', async (requested, passed) => {
    apiGet.mockResolvedValue(COMPARE);

    render((await ComparePage({ searchParams: searchParams(requested) })) as ReactElement);

    expect(apiGet).toHaveBeenCalledWith('/dashboard/compare', passed);
    expect(screen.getByRole('heading', { name: 'Compare months', level: 1 })).toBeInTheDocument();
  });

  it('lists the people of the household', async () => {
    apiGet.mockResolvedValue(MEMBERS);

    render(
      (await MembersPage({ searchParams: searchParams({ month: '2026-10' }) })) as ReactElement,
    );

    expect(apiGet).toHaveBeenCalledWith('/dashboard/members', undefined);
    expect(screen.getByRole('link', { name: 'Open Member A' })).toBeInTheDocument();
  });

  it('opens one person through the not-found aware client, with the month', async () => {
    apiFind.mockResolvedValue(MEMBER);

    render(
      (await MemberPage({
        params: Promise.resolve({ key: 'member key/b' }),
        searchParams: searchParams({ month: '2026-10' }),
      })) as ReactElement,
    );

    expect(apiFind).toHaveBeenCalledWith('/dashboard/members/member%20key%2Fb?month=2026-10');
    expect(screen.getByRole('heading', { name: 'Member B', level: 1 })).toBeInTheDocument();
  });
});
