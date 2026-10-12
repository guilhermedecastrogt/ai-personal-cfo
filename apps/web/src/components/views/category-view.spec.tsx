import { render, screen, within } from '@testing-library/react';
import { EN, PT_BR } from '@/lib/i18n/dictionary';
import { CATEGORY } from '@/testing/fixtures';
import { CategoryView } from './category-view';

function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title, level: 2 });
  const section = heading.closest('section');
  if (section === null) {
    throw new Error(`No panel titled ${title}`);
  }
  return section;
}

const [ENTRY] = CATEGORY.currencies;

describe('category page', () => {
  it('names the category and links each of its subcategories and its transactions', () => {
    render(<CategoryView t={EN} data={CATEGORY} />);
    const subcategories = screen.getByRole('navigation', { name: 'Subcategories' });

    expect(screen.getByRole('heading', { name: 'Food', level: 1 })).toBeInTheDocument();
    expect(
      within(subcategories)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Coffee', 'Groceries', 'Restaurants']);
    expect(within(subcategories).getByRole('link', { name: 'Coffee' })).toHaveAttribute(
      'href',
      '/categories/category-key-coffee?month=2026-10',
    );
    expect(screen.getByRole('link', { name: 'See the transactions' })).toHaveAttribute(
      'href',
      '/transactions?month=2026-10&category=category-key-food',
    );
  });

  it('shows the total, its change, its share of the month and the last six months', () => {
    const { container } = render(<CategoryView t={EN} data={CATEGORY} />);
    const table = container.querySelector('table.sr-only-table');

    expect(screen.getByText('Total', { selector: 'p' }).nextElementSibling).toHaveTextContent(
      '€420.00',
    );
    expect(
      screen.getByText(/18\.92% of the month’s spending · 3 transactions/),
    ).toBeInTheDocument();
    expect(screen.getByText('up from', { exact: false })).toHaveTextContent('▲ up from €330.00');
    expect(table).toHaveTextContent('October 2026€420.00');
    expect(container.querySelectorAll('.evolution .bar')[5]).toHaveStyle({ height: '100%' });
  });

  it('lists subcategories with their share of the category, people and budgets', () => {
    render(<CategoryView t={EN} data={CATEGORY} />);

    expect(
      within(panel('Subcategories'))
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Groceries€240.00 57.14%', 'Restaurants€180.00 42.86%']);
    expect(within(panel('Subcategories')).getByRole('link', { name: 'Groceries' })).toHaveAttribute(
      'href',
      '/categories/category-key-groceries?month=2026-10',
    );
    expect(panel('By person')).toHaveTextContent('Member A57.14%€240.00');
    expect(panel('Budgets that cover it')).toHaveTextContent('Restaurants Exceeded');
    expect(
      within(panel('Budgets that cover it')).getByRole('link', { name: 'Edit Restaurants' }),
    ).toHaveAttribute('href', '/budgets/budget-key-restaurants?month=2026-10');
  });

  it('lists the latest transactions with a way to see them all', () => {
    render(<CategoryView t={EN} data={CATEGORY} />);
    const section = panel('Transactions');

    expect(within(section).getByRole('table')).toHaveTextContent('Bistro');
    expect(within(section).getByRole('link', { name: 'See all 3 transactions' })).toHaveAttribute(
      'href',
      '/transactions?month=2026-10&category=category-key-food',
    );
  });

  it('links a subcategory back to its parent', () => {
    render(
      <CategoryView
        t={EN}
        data={{
          ...CATEGORY,
          category: {
            ...CATEGORY.category,
            key: 'category-key-coffee',
            name: 'Coffee',
            path: 'Food › Coffee',
            parent: { key: 'category-key-food', name: 'Food' },
            children: [],
          },
          currencies: ENTRY === undefined ? [] : [{ ...ENTRY, subcategories: [] }],
        }}
      />,
    );

    expect(screen.getByText('Part of', { exact: false })).toHaveTextContent('Part of Food');
    expect(screen.getByRole('link', { name: 'Food' })).toHaveAttribute(
      'href',
      '/categories/category-key-food?month=2026-10',
    );
    expect(screen.queryByRole('heading', { name: 'Subcategories' })).not.toBeInTheDocument();
  });

  it('says when nothing was recorded in Portuguese', () => {
    render(
      <CategoryView
        t={PT_BR}
        data={{
          ...CATEGORY,
          category: { ...CATEGORY.category, name: 'Café', children: [] },
          currencies:
            ENTRY === undefined
              ? []
              : [{ ...ENTRY, transactionCount: 0, subcategories: [], byMember: [], budgets: [] }],
          transactions: { total: 0, rows: [] },
        }}
      />,
    );

    expect(screen.getByText('Nada registrado em Café em October 2026.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum movimento em October 2026.')).toBeInTheDocument();
    expect(screen.getByText('Despesas')).toBeInTheDocument();
  });
});
