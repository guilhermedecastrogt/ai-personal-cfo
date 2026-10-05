import { fireEvent, render, screen, within } from '@testing-library/react';
import { BUDGET_EDIT, GOAL_EDIT, TRANSACTION_EDIT } from '@/testing/fixtures';
import { BudgetForm } from './budget-form';
import { ConfirmDelete } from './confirm-delete';
import { Field, Problem } from './fields';
import { GoalForm } from './goal-form';
import { TransactionForm } from './transaction-form';
import { EN, PT_BR } from '@/lib/i18n/dictionary';
import { INITIAL_FORM_STATE } from '@/lib/form-state';

jest.mock('@/app/(dashboard)/transactions/actions', () => ({
  saveTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));
jest.mock('@/app/(dashboard)/budgets/actions', () => ({
  createBudget: jest.fn(),
  saveBudget: jest.fn(),
  deleteBudget: jest.fn(),
}));
jest.mock('@/app/(dashboard)/goals/actions', () => ({
  createGoal: jest.fn(),
  saveGoal: jest.fn(),
  deleteGoal: jest.fn(),
}));

function hidden(name: string): string | null {
  return (
    document.querySelector(`input[type="hidden"][name="${name}"]`)?.getAttribute('value') ?? null
  );
}

describe('transaction form', () => {
  it('opens with what was recorded, in Portuguese, carrying the key, version and way back', () => {
    render(<TransactionForm data={TRANSACTION_EDIT} back="/transactions?page=2" locale="pt-BR" />);

    expect(screen.getByLabelText('Tipo')).toHaveValue('EXPENSE');
    expect(screen.getByLabelText('Valor')).toHaveValue('180.00');
    expect(screen.getByLabelText('Valor')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('Em EUR, a moeda da conta.')).toBeInTheDocument();
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText(/Estabelecimento/)).toHaveValue('Bistro');
    expect(screen.getByLabelText(/Categoria/)).toHaveValue('category-key-restaurants');
    expect(screen.getByLabelText('Quem')).toHaveValue('member-key-c');
    expect(screen.getByLabelText('Dividido com')).toHaveValue('INDIVIDUAL');
    expect(hidden('key')).toBe('transaction-key-bistro');
    expect(hidden('version')).toBe('2026-10-12T19:30:00.000Z');
    expect(hidden('back')).toBe('/transactions?page=2');
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute(
      'href',
      '/transactions?page=2',
    );
  });

  it('offers only categories of the chosen type, which is how income is put right', () => {
    render(<TransactionForm data={TRANSACTION_EDIT} back="/transactions" locale="en" />);
    const options = (): string[] =>
      within(screen.getByLabelText(/Category/))
        .getAllByRole('option')
        .map((option) => option.textContent);

    expect(options()).toEqual(['None', 'Restaurants']);

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'INCOME' } });

    expect(options()).toEqual(['None', 'Salary']);
    expect(screen.getByLabelText(/Category/)).toHaveValue('');
    expect(screen.queryByLabelText('Shared by')).not.toBeInTheDocument();
    expect(hidden('expenseScope')).toBe('INDIVIDUAL');
  });

  it('names the currency of the account the amount will be read in', () => {
    render(<TransactionForm data={TRANSACTION_EDIT} back="/transactions" locale="en" />);

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-key-real' } });

    expect(screen.getByText('In BRL, the currency of the account.')).toBeInTheDocument();
  });

  it('keeps a transfer a transfer', () => {
    render(
      <TransactionForm
        data={{
          ...TRANSACTION_EDIT,
          type: 'TRANSFER',
          categoryKey: null,
          transferAccount: 'Savings',
        }}
        back="/transactions"
        locale="en"
      />,
    );

    expect(screen.queryByRole('combobox', { name: 'Type' })).not.toBeInTheDocument();
    expect(screen.getByText(/A transfer stays a transfer/)).toBeInTheDocument();
    expect(screen.getByText('Savings')).toBeInTheDocument();
    expect(hidden('type')).toBe('TRANSFER');
    expect(hidden('category')).toBe('');
  });
});

describe('budget and goal forms', () => {
  it('starts a new budget from the defaults the backend gave', () => {
    render(
      <BudgetForm
        draft={{
          categoryKey: null,
          period: 'MONTHLY',
          limit: '',
          currency: 'EUR',
          alertThresholdPercent: 80,
          startsOn: '2026-10-01',
          endsOn: null,
        }}
        options={BUDGET_EDIT.options}
        back="/budgets?month=2026-10"
        locale="pt-BR"
      />,
    );

    expect(screen.getByLabelText('Categoria')).toHaveValue('');
    expect(
      within(screen.getByLabelText('Categoria')).getByRole('option', { name: 'Todos os gastos' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Período')).toHaveValue('MONTHLY');
    expect(screen.getByLabelText('Avisar em')).toHaveValue(80);
    expect(screen.getByLabelText('Começa em')).toHaveValue('2026-10-01');
    expect(screen.getByRole('button', { name: 'Criar orçamento' })).toBeInTheDocument();
    expect(hidden('key')).toBeNull();
    expect(hidden('version')).toBeNull();
  });

  it('edits a budget with its key and version', () => {
    const { options, ...draft } = BUDGET_EDIT;
    render(<BudgetForm draft={draft} options={options} back="/budgets" locale="en" />);

    expect(screen.getByLabelText('Limit')).toHaveValue('150.00');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(hidden('key')).toBe('budget-key-restaurants');
    expect(hidden('version')).toBe('2026-10-01T08:00:00.000Z');
  });

  it('edits a goal', () => {
    const { options, ...draft } = GOAL_EDIT;
    render(<GoalForm draft={draft} options={options} back="/goals" locale="pt-BR" />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Summer Trip');
    expect(screen.getByLabelText('Tipo')).toHaveValue('TRAVEL');
    expect(screen.getByLabelText('Objetivo')).toHaveValue('1000.00');
    expect(screen.getByLabelText(/Guardado até agora/)).toHaveValue('620.00');
    expect(screen.getByLabelText(/Data alvo/)).toHaveValue('2027-06-30');
  });
});

describe('form messages', () => {
  it('ties a refused field to its explanation', () => {
    render(
      <Field name="amount" label="Valor" error="INVALID_AMOUNT" t={PT_BR}>
        <input id="amount" aria-describedby="amount-error" />
      </Field>,
    );

    expect(screen.getByLabelText('Valor')).toHaveAccessibleDescription(
      'Informe um valor acima de zero, como 12,50.',
    );
  });

  it('explains a copy that changed meanwhile and offers to reload', () => {
    render(<Problem state={{ ...INITIAL_FORM_STATE, problem: 'STALE' }} t={EN} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Someone changed this in the meantime.');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('says nothing before the first attempt', () => {
    render(<Problem state={INITIAL_FORM_STATE} t={EN} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('confirm delete', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  it('asks before deleting, naming the item and saying it cannot be undone', () => {
    const action = jest.fn(() => Promise.resolve());
    render(
      <ConfirmDelete
        action={action}
        fields={{ key: 'transaction-key-bistro', back: '/transactions' }}
        name="Bistro"
        locale="pt-BR"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    const dialog = screen.getByRole('dialog', { name: 'Apagar Bistro?' });

    expect(dialog).toHaveAccessibleDescription(/Não dá para desfazer/);
    expect(hidden('key')).toBe('transaction-key-bistro');
    expect(within(dialog).getByRole('button', { name: 'Manter' })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Manter' }));

    expect(dialog).not.toHaveAttribute('open');
    expect(action).not.toHaveBeenCalled();
  });
});
