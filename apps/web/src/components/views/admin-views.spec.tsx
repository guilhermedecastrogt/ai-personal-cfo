import { render, screen, within } from '@testing-library/react';
import { EN, PT_BR } from '@/lib/i18n/dictionary';
import { ADMIN_HOUSEHOLD, ADMIN_HOUSEHOLDS } from '@/testing/fixtures';
import { AdminHouseholdView, AdminHouseholdsView } from './admin-views';

jest.mock('@/app/(dashboard)/admin/actions', () => {
  const pending = (): Promise<never> => new Promise(() => undefined);
  return {
    addMember: pending,
    addWhatsApp: pending,
    changeAdmin: pending,
    createHousehold: pending,
    issueInvitation: pending,
    registerEmail: pending,
    removeWhatsApp: pending,
    revokeAccess: pending,
    saveHousehold: pending,
  };
});

function panel(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title, level: 2 }).closest('section');
  if (section === null) {
    throw new Error(`No panel titled ${title}`);
  }
  return section;
}

describe('administration', () => {
  it('lists households by name, size and settings, with no amount anywhere', () => {
    render(<AdminHouseholdsView data={ADMIN_HOUSEHOLDS} locale="en" t={EN} />);

    expect(screen.getByRole('link', { name: 'Open Other Household' })).toHaveAttribute(
      'href',
      '/admin/household-key-other',
    );
    expect(screen.getByRole('link', { name: 'Open Demo Household' })).toHaveTextContent(
      'Demo HouseholdEUR · English · Europe/Dublin3 people1 adminYour householdCreated 2026-05-01',
    );
    expect(document.body).not.toHaveTextContent(/€|R\$/);
  });

  it('offers a new household with the currencies, languages and time zone the API listed', () => {
    render(<AdminHouseholdsView data={ADMIN_HOUSEHOLDS} locale="en" t={EN} />);
    const form = panel('New household');

    expect(
      within(form)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(expect.arrayContaining(['BRL', 'EUR', 'USD', 'English', 'Português (Brasil)']));
    expect(within(form).getByLabelText('Time zone')).toHaveValue('America/Sao_Paulo');
    expect(within(form).getByRole('button', { name: 'Create household' })).toBeInTheDocument();
  });

  it('shows each person’s access, email and WhatsApp numbers, with the actions on them', () => {
    render(<AdminHouseholdView data={ADMIN_HOUSEHOLD} locale="en" t={EN} />);
    const people = panel('People');
    const cards = within(people)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement?.classList.contains('divide-y') === true);
    const card = (position: number): HTMLElement => {
      const found = cards[position];
      if (found === undefined) {
        throw new Error(`No card at ${String(position)}`);
      }
      return found;
    };
    const first = card(0);
    const second = card(1);

    expect(first).toHaveTextContent('Person OneAdminone@example.com · Signs in with a password');
    expect(
      within(first).getByRole('button', { name: 'Remove +5511999990001' }),
    ).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Remove admin' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Revoke access' })).toBeInTheDocument();
    expect(second).toHaveTextContent('Person TwoNo email · No dashboard access');
    expect(within(second).getByRole('button', { name: 'Make admin' })).toBeInTheDocument();
    expect(within(second).queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument();
    expect(people.querySelectorAll('input[name="household"]')).not.toHaveLength(0);
    expect(
      [...people.querySelectorAll('input[name="household"]')].every(
        (input) => (input as HTMLInputElement).value === 'household-key-other',
      ),
    ).toBe(true);
  });

  it('keeps the currency fixed and lets name, language and time zone change', () => {
    render(<AdminHouseholdView data={ADMIN_HOUSEHOLD} locale="pt-BR" t={PT_BR} />);
    const settings = panel('Configurações');

    expect(settings).toHaveTextContent('Moeda: BRL. Ela não muda');
    expect(within(settings).getByLabelText('Nome da família')).toHaveValue('Other Household');
    expect(within(settings).getByLabelText('Idioma')).toHaveValue('pt-BR');
    expect(within(settings).queryByLabelText('Moeda')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Todas as famílias' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});
