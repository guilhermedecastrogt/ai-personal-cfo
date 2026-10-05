import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { BUDGETS, BUDGET_EDIT, GOAL_EDIT, TRANSACTION_EDIT } from '@/testing/fixtures';
import EditBudgetPage from './(dashboard)/budgets/[key]/page';
import NewBudgetPage from './(dashboard)/budgets/new/page';
import EditGoalPage from './(dashboard)/goals/[key]/page';
import EditTransactionPage from './(dashboard)/transactions/[key]/page';

const apiFind = jest.fn<Promise<unknown>, [string]>();
const apiGet = jest.fn<Promise<unknown>, [string, Record<string, string | undefined>?]>();

jest.mock('@/lib/session', () => ({
  currentSession: (): Promise<unknown> => Promise.resolve({ locale: 'pt-BR' }),
}));

jest.mock('@/lib/api', () => ({
  apiFind: (path: string): Promise<unknown> => apiFind(path),
  apiGet: (path: string, parameters?: Record<string, string | undefined>): Promise<unknown> =>
    apiGet(path, parameters),
}));

jest.mock('./(dashboard)/transactions/actions', () => ({
  saveTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));
jest.mock('./(dashboard)/budgets/actions', () => ({
  createBudget: jest.fn(),
  saveBudget: jest.fn(),
  deleteBudget: jest.fn(),
}));
jest.mock('./(dashboard)/goals/actions', () => ({
  createGoal: jest.fn(),
  saveGoal: jest.fn(),
  deleteGoal: jest.fn(),
}));

function params(key: string): Promise<{ key: string }> {
  return Promise.resolve({ key });
}

function searchParams(
  values: Record<string, string | string[]> = {},
): Promise<Record<string, string | string[]>> {
  return Promise.resolve(values);
}

function hidden(name: string): string | null {
  return (
    document.querySelector(`input[type="hidden"][name="${name}"]`)?.getAttribute('value') ?? null
  );
}

describe('editing pages', () => {
  beforeEach(() => {
    apiFind.mockReset();
    apiGet.mockReset();
  });

  it('opens a transaction by its key and returns to the list it came from', async () => {
    apiFind.mockResolvedValue(TRANSACTION_EDIT);

    render(
      (await EditTransactionPage({
        params: params('transaction-key-bistro'),
        searchParams: searchParams({ back: '/transactions?month=2026-10&page=2' }),
      })) as ReactElement,
    );

    expect(apiFind).toHaveBeenCalledWith('/dashboard/transactions/transaction-key-bistro');
    expect(screen.getByRole('heading', { name: 'Editar movimento', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Registrado por mensagem no WhatsApp/)).toBeInTheDocument();
    expect(hidden('back')).toBe('/transactions?month=2026-10&page=2');
    expect(screen.getByRole('button', { name: 'Apagar' })).toBeInTheDocument();
  });

  it('keeps a crafted key inside the transactions path and a crafted way back inside the site', async () => {
    apiFind.mockResolvedValue(TRANSACTION_EDIT);

    render(
      (await EditTransactionPage({
        params: params('../budgets/x'),
        searchParams: searchParams({ back: '//evil.example' }),
      })) as ReactElement,
    );

    expect(apiFind).toHaveBeenCalledWith('/dashboard/transactions/..%2Fbudgets%2Fx');
    expect(hidden('back')).toBe('/transactions');
  });

  it('offers a new budget with the options of the selected month', async () => {
    apiGet.mockResolvedValue(BUDGETS);

    render(
      (await NewBudgetPage({ searchParams: searchParams({ month: '2026-10' }) })) as ReactElement,
    );

    expect(apiGet).toHaveBeenCalledWith('/dashboard/budgets', { month: '2026-10' });
    expect(screen.getByRole('heading', { name: 'Novo orçamento', level: 1 })).toBeInTheDocument();
    expect(hidden('back')).toBe('/budgets?month=2026-10');
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();
  });

  it('edits a budget and a goal, each with a way to delete it', async () => {
    apiFind.mockResolvedValueOnce(BUDGET_EDIT).mockResolvedValueOnce(GOAL_EDIT);

    render(
      (await EditBudgetPage({
        params: params('budget-key-restaurants'),
        searchParams: searchParams(),
      })) as ReactElement,
    );
    expect(apiFind).toHaveBeenLastCalledWith('/dashboard/budgets/budget-key-restaurants');
    expect(screen.getByRole('heading', { name: 'Editar orçamento', level: 1 })).toBeInTheDocument();
    expect(hidden('back')).toBe('/budgets');

    render(
      (await EditGoalPage({
        params: params('goal-key-summer-trip'),
        searchParams: searchParams({ month: '2026-09' }),
      })) as ReactElement,
    );
    expect(apiFind).toHaveBeenLastCalledWith('/dashboard/goals/goal-key-summer-trip');
    expect(screen.getByRole('heading', { name: 'Editar meta', level: 1 })).toBeInTheDocument();
  });
});
