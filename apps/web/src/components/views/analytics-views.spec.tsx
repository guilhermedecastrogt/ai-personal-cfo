import { render, screen, within } from '@testing-library/react';
import { EN, PT_BR } from '@/lib/i18n/dictionary';
import { COMPARE, MEMBER, MEMBERS } from '@/testing/fixtures';
import { CompareView, MemberView, MembersView } from './analytics-views';

function panel(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title, level: 2 }).closest('section');
  if (section === null) {
    throw new Error(`No panel titled ${title}`);
  }
  return section;
}

describe('compare', () => {
  it('offers the months and keeps the two being compared selected', () => {
    render(<CompareView t={EN} data={COMPARE} />);

    expect(screen.getByLabelText('From')).toHaveValue('2026-09');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10');
    expect(
      within(screen.getByLabelText('From'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['October 2026', 'September 2026']);
  });

  it('shows the totals of the second month against the first', () => {
    render(<CompareView t={EN} data={COMPARE} />);
    const totals = panel('In total');

    expect(totals).toHaveTextContent('October 2026 compared with September 2026');
    expect(totals).toHaveTextContent('Spending€2,220.00▲ up from €2,130.00');
    expect(totals).toHaveTextContent('Income€3,000.00unchanged from €3,000.00');
    expect(totals).toHaveTextContent('Kept€780.00▼ down from €870.00');
  });

  it('puts each category of the two months side by side, scaled by the backend', () => {
    render(<CompareView t={EN} data={COMPARE} />);
    const categories = panel('By category');
    const bars = categories.querySelectorAll('li span[aria-hidden="true"] > span');

    expect(categories).toHaveTextContent('Food▲ up from €330.00');
    expect(categories).toHaveTextContent('€330.00€420.00');
    expect(bars[0]).toHaveStyle({ width: '78.57%' });
    expect(bars[1]).toHaveStyle({ width: '100%' });
  });

  it('says when neither month has spending', () => {
    render(<CompareView t={EN} data={{ ...COMPARE, currencies: [] }} />);

    expect(screen.getByText('Nothing was spent in either month.')).toBeInTheDocument();
  });
});

describe('people', () => {
  it('lists the household members and keeps the month', () => {
    render(<MembersView t={EN} data={MEMBERS} month="2026-09" />);

    expect(screen.getByRole('link', { name: 'Open Member B' })).toHaveAttribute(
      'href',
      '/members/member-key-b?month=2026-09',
    );
  });

  it('shows one person’s month, share of the household and what it went on', () => {
    render(<MemberView t={EN} data={MEMBER} />);

    expect(screen.getByRole('heading', { name: 'Member B', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Member B' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Member A' })).toHaveAttribute(
      'href',
      '/members/member-key-a?month=2026-10',
    );
    expect(
      screen.getByRole('meter', { name: 'Share of the household’s spending' }),
    ).toHaveAttribute('aria-valuetext', '8.11%');
    expect(screen.getByText('of €2,220.00 spent by the household')).toBeInTheDocument();
    expect(panel('Largest expenses')).toHaveTextContent(
      'Bistro2026-10-12 · Restaurants · Joint Account€180.00',
    );
    expect(panel('Where it went')).toHaveTextContent('Food100%€180.00');
  });

  it('says when a person has nothing in the month, in Portuguese too', () => {
    render(
      <MemberView
        t={PT_BR}
        data={{ ...MEMBER, currencies: [], month: { ...MEMBER.month, label: 'outubro de 2026' } }}
      />,
    );

    expect(
      screen.getByText('Member B não tem nada registrado em outubro de 2026.'),
    ).toBeInTheDocument();
  });
});
