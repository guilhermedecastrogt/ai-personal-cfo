import { createBudget, deleteBudget } from './budgets/actions';
import { saveGoal } from './goals/actions';
import { deleteTransaction, saveTransaction } from './transactions/actions';
import { INITIAL_FORM_STATE } from '@/lib/form-state';

const redirect = jest.fn((path: string): never => {
  throw new Error(`redirected to ${path}`);
});
const revalidatePath = jest.fn();
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

jest.mock('next/headers', () => ({
  cookies: (): Promise<unknown> => Promise.resolve({ get: () => ({ value: 'session-token' }) }),
}));

jest.mock('next/navigation', () => ({
  redirect: (path: string): never => redirect(path),
  notFound: (): never => {
    throw new Error('not found');
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...parameters: unknown[]): unknown => revalidatePath(...parameters),
}));

function respond(status: number, body?: unknown): void {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  } as Response);
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

function sentBody(): unknown {
  const body = fetchMock.mock.calls[0]?.[1].body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

const TRANSACTION = {
  key: 'transaction-key',
  version: '2026-10-05T10:00:00.000Z',
  back: '/transactions?month=2026-10&page=2',
  type: 'INCOME',
  amount: '900',
  date: '2026-10-01',
  merchant: 'Salary',
  description: '',
  category: 'category-key-salary',
  member: 'member-key-b',
  account: 'account-key-b',
  expenseScope: 'HOUSEHOLD',
};

describe('editing actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('saves a transaction with its version and returns to the list it came from', async () => {
    respond(200, { key: 'transaction-key', version: 'next' });

    await expect(saveTransaction(INITIAL_FORM_STATE, form(TRANSACTION))).rejects.toThrow(
      'redirected to /transactions?month=2026-10&page=2',
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/dashboard/transactions/transaction-key',
    );
    expect(fetchMock.mock.calls[0]?.[1].method).toBe('PATCH');
    expect(sentBody()).toEqual({
      version: '2026-10-05T10:00:00.000Z',
      type: 'INCOME',
      amount: '900',
      date: '2026-10-01',
      merchant: 'Salary',
      description: '',
      category: 'category-key-salary',
      member: 'member-key-b',
      account: 'account-key-b',
      expenseScope: 'HOUSEHOLD',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('keeps the visitor on the form with the refused fields', async () => {
    respond(422, { errors: [{ field: 'amount', code: 'INVALID_AMOUNT' }] });

    const state = await saveTransaction(INITIAL_FORM_STATE, form({ ...TRANSACTION, amount: 'x' }));

    expect(state).toMatchObject({
      problem: 'INVALID',
      errors: { amount: 'INVALID_AMOUNT' },
      values: { amount: 'x', merchant: 'Salary' },
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('reports a copy that someone else changed first', async () => {
    respond(409, { code: 'STALE' });

    expect(await saveTransaction(INITIAL_FORM_STATE, form(TRANSACTION))).toMatchObject({
      problem: 'STALE',
    });
  });

  it('never redirects outside the dashboard', async () => {
    respond(200, { key: 'k', version: 'v' });

    await expect(
      saveTransaction(INITIAL_FORM_STATE, form({ ...TRANSACTION, back: '//evil.example' })),
    ).rejects.toThrow('redirected to /transactions');
  });

  it('deletes a transaction, even one already gone, and returns to the list', async () => {
    respond(404);

    await expect(
      deleteTransaction(form({ key: 'transaction-key', back: '/transactions?page=2' })),
    ).rejects.toThrow('redirected to /transactions?page=2');
    expect(fetchMock.mock.calls[0]?.[1].method).toBe('DELETE');
  });

  it('surfaces a failed deletion as an error rather than pretending it worked', async () => {
    respond(503);

    await expect(deleteTransaction(form({ key: 'transaction-key' }))).rejects.toThrow(
      'The API responded with status 503',
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it('creates a budget from the typed fields', async () => {
    respond(201, { key: 'budget-key', version: 'v' });
    const fields = {
      category: '',
      period: 'MONTHLY',
      limit: '150,00',
      currency: 'EUR',
      alertThresholdPercent: '80',
      startsOn: '2026-10-01',
      endsOn: '',
    };

    await expect(
      createBudget(INITIAL_FORM_STATE, form({ ...fields, back: '/budgets?month=2026-10' })),
    ).rejects.toThrow('redirected to /budgets?month=2026-10');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/dashboard/budgets');
    expect(fetchMock.mock.calls[0]?.[1].method).toBe('POST');
    expect(sentBody()).toEqual(fields);
  });

  it('deletes a budget', async () => {
    respond(204);

    await expect(deleteBudget(form({ key: 'budget-key' }))).rejects.toThrow(
      'redirected to /budgets',
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/dashboard/budgets/budget-key');
  });

  it('saves a goal with its version', async () => {
    respond(429);

    const state = await saveGoal(
      INITIAL_FORM_STATE,
      form({ key: 'goal-key', version: 'v1', name: 'Trip', target: '2000' }),
    );

    expect(state.problem).toBe('TOO_MANY');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/dashboard/goals/goal-key');
    expect(sentBody()).toMatchObject({ version: 'v1', name: 'Trip', target: '2000' });
  });
});
