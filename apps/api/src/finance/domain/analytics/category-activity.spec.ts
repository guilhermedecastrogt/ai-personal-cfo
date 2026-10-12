import { CATEGORIES, expense, income } from '../ledger/ledger-entry.fixture.js';
import { calendarMonth } from '../period/period.js';
import { describeCategoryActivity, type CategoryActivity } from './category-activity.js';

const AUGUST = calendarMonth(2026, 8);
const SEPTEMBER = calendarMonth(2026, 9);
const OCTOBER = calendarMonth(2026, 10);

const ENTRIES = [
  expense(3000, { categoryId: 'groceries', date: '2026-10-02', memberId: 'member-a' }),
  expense(1000, { categoryId: 'restaurants', date: '2026-10-03', memberId: 'member-b' }),
  expense(500, { categoryId: 'food', date: '2026-10-04', memberId: 'member-a' }),
  expense(4500, { categoryId: 'transport', date: '2026-10-04' }),
  expense(9900, { categoryId: 'groceries', date: '2026-10-05', currency: 'BRL' }),
  income(200000, { date: '2026-10-01' }),
  expense(2000, { categoryId: 'groceries', date: '2026-09-12' }),
  expense(1000, { categoryId: 'restaurants', date: '2026-08-20' }),
];

const activityOf = (categoryId: string): CategoryActivity =>
  describeCategoryActivity({
    entries: ENTRIES,
    currency: 'EUR',
    categoryId,
    type: 'EXPENSE',
    period: OCTOBER,
    previousPeriod: SEPTEMBER,
    months: [AUGUST, SEPTEMBER, OCTOBER],
    categories: CATEGORIES,
  });

describe('describeCategoryActivity', () => {
  it('rolls subcategories into the category and leaves other categories, flows and currencies out', () => {
    const food = activityOf('food');

    expect(food).toMatchObject({
      currency: 'EUR',
      totalMinor: 4500,
      transactionCount: 3,
      shareBasisPoints: 5000,
    });
  });

  it('compares the category with the previous period', () => {
    expect(activityOf('food').comparison).toMatchObject({
      currentMinor: 4500,
      previousMinor: 2000,
      differenceMinor: 2500,
      direction: 'INCREASE',
    });
  });

  it('lists the subcategories in tree order with their share of the category', () => {
    expect(activityOf('food').subcategories).toEqual([
      expect.objectContaining({
        categoryId: 'groceries',
        totalMinor: 3000,
        parentId: 'food',
        shareOfParentBasisPoints: 6667,
      }),
      expect.objectContaining({
        categoryId: 'restaurants',
        totalMinor: 1000,
        parentId: 'food',
        shareOfParentBasisPoints: 2222,
      }),
    ]);
  });

  it('gives a subcategory no subcategories and no ancestors', () => {
    const groceries = activityOf('groceries');

    expect(groceries.totalMinor).toBe(3000);
    expect(groceries.subcategories).toEqual([]);
  });

  it('shows who spent in the category', () => {
    expect(activityOf('food').byMember.map((member) => member.memberId)).toEqual([
      'member-a',
      'member-b',
    ]);
  });

  it('draws the months with bars scaled to the largest month', () => {
    expect(activityOf('food').months).toEqual([
      { period: AUGUST, totalMinor: 1000, barBasisPoints: 2222 },
      { period: SEPTEMBER, totalMinor: 2000, barBasisPoints: 4444 },
      { period: OCTOBER, totalMinor: 4500, barBasisPoints: 10000 },
    ]);
  });
});
