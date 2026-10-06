import { fireEvent, render, screen, within } from '@testing-library/react';
import { SESSION } from '@/testing/fixtures';
import { Shell } from './shell';

let pathname = '/compare';

jest.mock('next/navigation', () => ({
  usePathname: (): string => pathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams('month=2026-09'),
}));

function rail(): HTMLElement {
  const aside = document.querySelector('aside');
  if (aside === null) {
    throw new Error('No rail');
  }
  return aside;
}

function tip(): HTMLElement {
  const element = rail().querySelector('div[aria-hidden="true"]');
  if (!(element instanceof HTMLElement)) {
    throw new Error('No tip');
  }
  return element;
}

function renderShell(): void {
  render(
    <Shell session={SESSION} signOut={() => Promise.resolve()}>
      <p>Page</p>
    </Shell>,
  );
}

describe('floating rail', () => {
  beforeEach(() => {
    pathname = '/compare';
  });

  it('shows only icons, each link named for screen readers, including compare and people', () => {
    renderShell();
    const links = within(rail()).getAllByRole('link');

    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Household ledger',
      'Overview',
      'Transactions',
      'Spending',
      'Income',
      'Compare',
      'Budgets',
      'Goals',
      'Outlook',
      'Recurring',
      'Signals',
      'Review',
      'People',
      'Accounts',
    ]);
    expect(links.every((link) => link.textContent === '')).toBe(true);
  });

  it('marks the current section and carries the month only where it matters', () => {
    renderShell();
    const navigation = within(rail());

    expect(navigation.getByRole('link', { name: 'Compare' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(navigation.getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare');
    expect(navigation.getByRole('link', { name: 'People' })).toHaveAttribute(
      'href',
      '/members?month=2026-09',
    );
    expect(navigation.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('treats a person’s page as part of People', () => {
    pathname = '/members/member-key-b';
    renderShell();

    expect(within(rail()).getByRole('link', { name: 'People' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('names the icon under the pointer or the keyboard focus, and hides the name again', () => {
    renderShell();
    const navigation = within(rail());

    expect(tip()).toHaveClass('opacity-0');

    fireEvent.mouseEnter(navigation.getByRole('link', { name: 'Budgets' }));
    expect(tip()).toHaveTextContent('Budgets');
    expect(tip()).toHaveClass('opacity-100');

    fireEvent.focus(navigation.getByRole('button', { name: 'Sign out' }));
    expect(tip()).toHaveTextContent('Sign out');

    fireEvent.blur(navigation.getByRole('button', { name: 'Sign out' }));
    expect(tip()).toHaveClass('opacity-0');
  });

  it('shows the household name in the header and offers the new sections on phones too', () => {
    renderShell();

    expect(screen.getAllByText('Demo Household').length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('Compare');
    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('People');
  });
});
