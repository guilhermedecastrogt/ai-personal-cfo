import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AccountsRepository, type Account } from '../src/accounts/accounts.repository.js';
import { BudgetsRepository } from '../src/budgets/budgets.repository.js';
import { CategoriesRepository } from '../src/categories/categories.repository.js';
import { categories } from '../src/categories/categories.schema.js';
import { requireRow } from '../src/database/require-row.js';
import {
  FinanceService,
  HouseholdNotFoundError,
} from '../src/finance/application/finance.service.js';
import { calendarMonth, monthToDate } from '../src/finance/domain/period/period.js';
import { LedgerRepository } from '../src/finance/infrastructure/ledger.repository.js';
import { GoalsRepository } from '../src/goals/goals.repository.js';
import { goals } from '../src/goals/goals.schema.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import type { NewTransactionInput } from '../src/transactions/new-transaction.schema.js';
import { TransactionsRepository } from '../src/transactions/transactions.repository.js';
import { TransactionsService } from '../src/transactions/transactions.service.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const OCTOBER = calendarMonth(2026, 10);
const AS_OF = '2026-10-20';

describe('finance engine against PostgreSQL', () => {
  let testDatabase: TestDatabase;
  let households: HouseholdsRepository;
  let accounts: AccountsRepository;
  let budgets: BudgetsRepository;
  let goalsRepository: GoalsRepository;
  let transactions: TransactionsService;
  let finance: FinanceService;
  const categoryIds = new Map<string, string>();

  function category(name: string): string {
    const id = categoryIds.get(name);
    if (id === undefined) {
      throw new Error(`Unknown category ${name}`);
    }
    return id;
  }

  async function record(
    fixture: HouseholdFixture,
    memberPosition: number,
    amountMinor: number,
    overrides: Partial<NewTransactionInput> = {},
  ): Promise<string> {
    const recorded = await transactions.record(fixture.household.id, {
      memberId: memberAt(fixture, memberPosition).id,
      accountId: fixture.jointAccount.id,
      type: 'EXPENSE',
      amountMinor,
      currency: 'EUR',
      transactionDate: '2026-10-10',
      source: 'MANUAL',
      ...overrides,
    });
    return recorded.id;
  }

  async function createAccount(
    fixture: HouseholdFixture,
    name: string,
    overrides: Partial<Parameters<AccountsRepository['create']>[1]> = {},
  ): Promise<Account> {
    return accounts.create(fixture.household.id, {
      name,
      type: 'BANK',
      currency: 'EUR',
      ...overrides,
    });
  }

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    const { database } = testDatabase;
    households = new HouseholdsRepository(database);
    accounts = new AccountsRepository(database);
    budgets = new BudgetsRepository(database);
    goalsRepository = new GoalsRepository(database);
    const categoriesRepository = new CategoriesRepository(database);
    transactions = new TransactionsService(
      new TransactionsRepository(database),
      households,
      accounts,
      categoriesRepository,
    );
    finance = new FinanceService(
      new LedgerRepository(database),
      households,
      categoriesRepository,
      budgets,
      goalsRepository,
      accounts,
    );
    for (const row of await database.select().from(categories)) {
      categoryIds.set(row.name, row.id);
    }
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  describe('spending and income', () => {
    let fixture: HouseholdFixture;
    let savings: Account;

    beforeAll(async () => {
      fixture = await createHouseholdFixture(testDatabase.database, 'Spending', 3);
      savings = await createAccount(fixture, 'Savings', { type: 'SAVINGS' });
      const personal = await createAccount(fixture, 'Personal', {
        ownerMemberId: memberAt(fixture, 0).id,
      });
      await record(fixture, 0, 18000, { categoryId: category('Restaurants') });
      await record(fixture, 1, 12000, { categoryId: category('Restaurants') });
      await record(fixture, 1, 24000, { categoryId: category('Groceries') });
      await record(fixture, 2, 8500, { categoryId: category('Uber'), accountId: personal.id });
      await record(fixture, 0, 9900, { transactionDate: '2026-09-30' });
      await record(fixture, 0, 50000, { type: 'TRANSFER', transferAccountId: savings.id });
      await record(fixture, 0, 210000, { type: 'INCOME', categoryId: category('Salary') });
      await record(fixture, 1, 240000, { type: 'INCOME', categoryId: category('Salary') });
      await record(fixture, 1, 30000, { type: 'INCOME', categoryId: category('Freelance') });
    });

    it('totals household spending for the period without transfers or income', async () => {
      const spending = await finance.spending(fixture.household.id, OCTOBER);

      expect(spending).toMatchObject({
        period: OCTOBER,
        currency: 'EUR',
        totalMinor: 62500,
        transactionCount: 4,
      });
    });

    it('attributes spending to each of the three members', async () => {
      const spending = await finance.spending(fixture.household.id, OCTOBER);

      expect(spending.byMember).toEqual([
        { memberId: memberAt(fixture, 1).id, totalMinor: 36000, shareBasisPoints: 5760 },
        { memberId: memberAt(fixture, 0).id, totalMinor: 18000, shareBasisPoints: 2880 },
        { memberId: memberAt(fixture, 2).id, totalMinor: 8500, shareBasisPoints: 1360 },
      ]);
    });

    it('rolls categories up and shows each member within a category', async () => {
      const spending = await finance.spending(fixture.household.id, OCTOBER);
      const byCategory = new Map(spending.byCategory.map((row) => [row.categoryId, row]));

      expect(byCategory.get(category('Food'))?.totalMinor).toBe(54000);
      expect(byCategory.get(category('Transport'))?.totalMinor).toBe(8500);
      expect(byCategory.get(category('Restaurants'))).toMatchObject({
        totalMinor: 30000,
        byMember: [
          { memberId: memberAt(fixture, 0).id, totalMinor: 18000, shareBasisPoints: 6000 },
          { memberId: memberAt(fixture, 1).id, totalMinor: 12000, shareBasisPoints: 4000 },
        ],
      });
    });

    it('splits spending between joint and individual accounts', async () => {
      const spending = await finance.spending(fixture.household.id, OCTOBER);

      expect(spending.byAccount.map((row) => row.totalMinor)).toEqual([54000, 8500]);
      expect(spending.byAccount[0]?.accountId).toBe(fixture.jointAccount.id);
    });

    it('totals income by member and category without transfers', async () => {
      const income = await finance.income(fixture.household.id, OCTOBER);
      const byCategory = new Map(income.byCategory.map((row) => [row.categoryId, row.totalMinor]));

      expect(income.totalMinor).toBe(480000);
      expect(income.byMember).toEqual([
        { memberId: memberAt(fixture, 1).id, totalMinor: 270000, shareBasisPoints: 5625 },
        { memberId: memberAt(fixture, 0).id, totalMinor: 210000, shareBasisPoints: 4375 },
        { memberId: memberAt(fixture, 2).id, totalMinor: 0, shareBasisPoints: 0 },
      ]);
      expect(byCategory.get(category('Salary'))).toBe(450000);
      expect(byCategory.get(category('Freelance'))).toBe(30000);
    });

    it('reports cash flow and savings for the period', async () => {
      const summary = await finance.cashFlow(fixture.household.id, OCTOBER);

      expect(summary).toEqual({
        period: OCTOBER,
        cashFlow: { currency: 'EUR', incomeMinor: 480000, expensesMinor: 62500, netMinor: 417500 },
        savings: { currency: 'EUR', savingsMinor: 417500, savingsRateBasisPoints: 8698 },
      });
    });

    it('honours an arbitrary date range', async () => {
      const spending = await finance.spending(fixture.household.id, {
        start: '2026-09-25',
        end: '2026-09-30',
      });

      expect(spending.totalMinor).toBe(9900);
    });

    it('moves a transfer between balances without changing the household total', async () => {
      const balances = await finance.accountBalances(fixture.household.id);
      const balanceOf = (accountId: string): number | undefined =>
        balances.accounts.find((account) => account.accountId === accountId)?.balanceMinor;

      expect(balanceOf(savings.id)).toBe(50000);
      expect(balanceOf(fixture.jointAccount.id)).toBe(366100);
      expect(balances.totals).toEqual([
        {
          currency: 'EUR',
          totalMinor: 407600,
          jointMinor: 416100,
          byMember: expect.arrayContaining([
            { memberId: memberAt(fixture, 0).id, totalMinor: -8500 },
          ]) as unknown,
        },
      ]);
    });
  });

  describe('household isolation', () => {
    it('never includes another household in any calculation', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Engine First', 2);
      const second = await createHouseholdFixture(testDatabase.database, 'Engine Second', 4);
      await record(first, 0, 11100, { categoryId: category('Restaurants'), merchant: 'Bistro' });
      await record(first, 0, 100000, { type: 'INCOME' });
      await record(second, 0, 99900, { categoryId: category('Restaurants'), merchant: 'Bistro' });
      await record(second, 1, 500000, { type: 'INCOME' });
      await budgets.create(second.household.id, {
        categoryId: category('Restaurants'),
        period: 'MONTHLY',
        limitMinor: 10000,
        currency: 'EUR',
        startsOn: '2026-01-01',
      });
      await goalsRepository.create(second.household.id, {
        name: 'Theirs',
        type: 'SAVINGS',
        targetAmountMinor: 1000,
        currency: 'EUR',
      });
      const firstId = first.household.id;

      const spending = await finance.spending(firstId, OCTOBER);
      const summary = await finance.cashFlow(firstId, OCTOBER);
      const balances = await finance.accountBalances(firstId);

      expect(spending.totalMinor).toBe(11100);
      expect(spending.byMember.map((row) => row.memberId).sort()).toEqual(
        first.members.map((member) => member.id).sort(),
      );
      expect(summary.cashFlow).toMatchObject({ incomeMinor: 100000, expensesMinor: 11100 });
      expect(balances.accounts.map((account) => account.accountId)).toEqual([
        first.jointAccount.id,
      ]);
      expect(await finance.budgets(firstId, AS_OF)).toEqual([]);
      expect(await finance.goals(firstId, AS_OF)).toEqual([]);
      expect((await finance.spendingTrends(firstId, OCTOBER)).total.currentMinor).toBe(11100);
      expect((await finance.monthEndForecast(firstId, AS_OF)).spentMinor).toBe(11100);
      expect(
        (await finance.insights(firstId, AS_OF)).filter((insight) =>
          insight.type.startsWith('BUDGET'),
        ),
      ).toEqual([]);
    });

    it('refuses to calculate for a household that does not exist', async () => {
      await expect(finance.spending(randomUUID(), OCTOBER)).rejects.toThrow(HouseholdNotFoundError);
      await expect(finance.insights(randomUUID(), AS_OF)).rejects.toThrow(HouseholdNotFoundError);
    });
  });

  describe('currencies', () => {
    it('keeps each currency in its own totals', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Currencies', 1);
      const reais = await createAccount(fixture, 'Reais', { currency: 'BRL' });
      await record(fixture, 0, 2300);
      await record(fixture, 0, 50000, { accountId: reais.id, currency: 'BRL' });
      const householdId = fixture.household.id;

      expect((await finance.spending(householdId, OCTOBER)).totalMinor).toBe(2300);
      expect((await finance.spending(householdId, OCTOBER, 'BRL')).totalMinor).toBe(50000);
      expect(
        (await finance.accountBalances(householdId)).totals.map((totals) => totals.currency),
      ).toEqual(['BRL', 'EUR']);
    });
  });

  describe('edge cases', () => {
    it('produces zeros and no rates for a household without transactions', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Empty', 2);
      const householdId = fixture.household.id;

      expect((await finance.spending(householdId, OCTOBER)).totalMinor).toBe(0);
      expect(await finance.cashFlow(householdId, OCTOBER)).toMatchObject({
        cashFlow: { incomeMinor: 0, expensesMinor: 0, netMinor: 0 },
        savings: { savingsMinor: 0, savingsRateBasisPoints: null },
      });
      expect(await finance.monthEndForecast(householdId, AS_OF)).toMatchObject({
        projectedTotalMinor: 0,
      });
      expect(await finance.recurringExpenses(householdId, AS_OF)).toEqual([]);
      expect(await finance.anomalies(householdId, AS_OF)).toEqual([]);
      expect(await finance.insights(householdId, AS_OF)).toEqual([]);
    });

    it('reports negative savings without a rate when a household only spends', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Only Spending', 1);
      await record(fixture, 0, 12000);

      expect((await finance.cashFlow(fixture.household.id, OCTOBER)).savings).toEqual({
        currency: 'EUR',
        savingsMinor: -12000,
        savingsRateBasisPoints: null,
      });
    });

    it('uses the time zone of the household to decide what today is', async () => {
      const tokyo = await households.createHousehold({
        name: 'Tokyo',
        currency: 'JPY',
        timezone: 'Asia/Tokyo',
      });
      const saoPaulo = await households.createHousehold({
        name: 'Sao Paulo',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
      });
      const instant = new Date('2026-10-31T23:30:00Z');

      expect(await finance.currentDate(tokyo.id, instant)).toBe('2026-11-01');
      expect(await finance.currentDate(saoPaulo.id, instant)).toBe('2026-10-31');
    });
  });

  describe('budgets', () => {
    it('reports usage, status and each member for active budgets', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Budgets', 3);
      const householdId = fixture.household.id;
      const restaurants = await budgets.create(householdId, {
        categoryId: category('Restaurants'),
        period: 'MONTHLY',
        limitMinor: 30000,
        currency: 'EUR',
        startsOn: '2026-01-01',
      });
      const food = await budgets.create(householdId, {
        categoryId: category('Food'),
        period: 'MONTHLY',
        limitMinor: 40000,
        currency: 'EUR',
        startsOn: '2026-01-01',
      });
      await budgets.create(householdId, {
        categoryId: category('Travel'),
        period: 'MONTHLY',
        limitMinor: 50000,
        currency: 'EUR',
        startsOn: '2026-01-01',
        endsOn: '2026-06-30',
      });
      await record(fixture, 0, 16000, { categoryId: category('Restaurants') });
      await record(fixture, 1, 8600, { categoryId: category('Restaurants') });
      await record(fixture, 2, 20000, { categoryId: category('Groceries') });
      await record(fixture, 0, 9000, {
        categoryId: category('Restaurants'),
        transactionDate: '2026-09-15',
      });

      const usages = await finance.budgets(householdId, AS_OF);
      const byId = new Map(usages.map((usage) => [usage.budgetId, usage]));

      expect(usages).toHaveLength(2);
      expect(byId.get(restaurants.id)).toMatchObject({
        period: OCTOBER,
        limitMinor: 30000,
        spentMinor: 24600,
        remainingMinor: 5400,
        usageBasisPoints: 8200,
        status: 'NEAR_LIMIT',
        byMember: [
          { memberId: memberAt(fixture, 0).id, totalMinor: 16000, shareBasisPoints: 6504 },
          { memberId: memberAt(fixture, 1).id, totalMinor: 8600, shareBasisPoints: 3496 },
          { memberId: memberAt(fixture, 2).id, totalMinor: 0, shareBasisPoints: 0 },
        ],
      });
      expect(byId.get(food.id)).toMatchObject({
        spentMinor: 44600,
        remainingMinor: -4600,
        status: 'EXCEEDED',
      });
    });
  });

  describe('goals', () => {
    it('reports progress for goals that are not cancelled', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Goals', 2);
      const householdId = fixture.household.id;
      await goalsRepository.create(householdId, {
        name: 'Trip',
        type: 'TRAVEL',
        targetAmountMinor: 100000,
        currentAmountMinor: 62000,
        currency: 'EUR',
        targetDate: '2027-06-30',
      });
      const cancelled = await goalsRepository.create(householdId, {
        name: 'Abandoned',
        type: 'PURCHASE',
        targetAmountMinor: 50000,
        currency: 'EUR',
      });
      await testDatabase.database
        .update(goals)
        .set({ status: 'CANCELLED' })
        .where(eq(goals.id, cancelled.id));

      const progress = await finance.goals(householdId, AS_OF);

      expect(progress).toHaveLength(1);
      expect(requireRow(progress)).toMatchObject({
        remainingMinor: 38000,
        progressBasisPoints: 6200,
        state: 'IN_PROGRESS',
        daysRemaining: 253,
      });
    });
  });

  describe('trends, forecast, recurring expenses and anomalies', () => {
    let fixture: HouseholdFixture;

    beforeAll(async () => {
      fixture = await createHouseholdFixture(testDatabase.database, 'History', 2);
      const restaurants = category('Restaurants');
      for (const month of ['07', '08', '09']) {
        await record(fixture, 0, 180000, {
          categoryId: category('Rent'),
          merchant: 'Landlord',
          transactionDate: `2026-${month}-01`,
        });
        await record(fixture, 1, 1799, {
          categoryId: category('Subscriptions'),
          merchant: 'Streaming Service',
          transactionDate: `2026-${month}-03`,
        });
        await record(fixture, 0, 3000, {
          categoryId: restaurants,
          transactionDate: `2026-${month}-06`,
        });
        await record(fixture, 1, 3500, {
          categoryId: restaurants,
          transactionDate: `2026-${month}-14`,
        });
        await record(fixture, 0, 25000, {
          categoryId: category('Groceries'),
          transactionDate: `2026-${month}-25`,
        });
        await record(fixture, 0, 300000, { type: 'INCOME', transactionDate: `2026-${month}-01` });
      }
      await record(fixture, 0, 180000, {
        categoryId: category('Rent'),
        merchant: 'Landlord',
        transactionDate: '2026-10-01',
      });
      await record(fixture, 1, 1799, {
        categoryId: category('Subscriptions'),
        merchant: 'Streaming Service',
        transactionDate: '2026-10-03',
      });
      await record(fixture, 0, 3200, { categoryId: restaurants, transactionDate: '2026-10-06' });
      await record(fixture, 1, 24000, {
        categoryId: restaurants,
        merchant: 'Tasting Menu',
        transactionDate: '2026-10-14',
      });
      await record(fixture, 0, 300000, { type: 'INCOME', transactionDate: '2026-10-01' });
    });

    it('compares month to date with the same days of the previous month', async () => {
      const trends = await finance.spendingTrends(fixture.household.id, monthToDate(AS_OF));
      const restaurants = trends.byCategory.find(
        (trend) => trend.categoryId === category('Restaurants'),
      );

      expect(trends.previousPeriod).toEqual({ start: '2026-09-01', end: '2026-09-20' });
      expect(trends.total).toMatchObject({ currentMinor: 208999, previousMinor: 188299 });
      expect(restaurants).toMatchObject({
        currentMinor: 27200,
        previousMinor: 6500,
        differenceMinor: 20700,
        changeBasisPoints: 31846,
        direction: 'INCREASE',
      });
    });

    it('projects the month from what the rest of previous months cost', async () => {
      const forecast = await finance.monthEndForecast(fixture.household.id, AS_OF);

      expect(forecast).toMatchObject({
        period: OCTOBER,
        method: 'HISTORICAL_REMAINDER',
        historyPeriodsUsed: 3,
        daysElapsed: 20,
        daysRemaining: 11,
        spentMinor: 208999,
        projectedRemainingMinor: 25000,
        projectedTotalMinor: 233999,
      });
    });

    it('detects the fixed monthly charges and nothing else', async () => {
      const patterns = await finance.recurringExpenses(fixture.household.id, AS_OF);

      expect(
        patterns.map(({ merchant, frequency, typicalAmountMinor, occurrences }) => ({
          merchant,
          frequency,
          typicalAmountMinor,
          occurrences,
        })),
      ).toEqual([
        { merchant: 'Landlord', frequency: 'MONTHLY', typicalAmountMinor: 180000, occurrences: 4 },
        {
          merchant: 'Streaming Service',
          frequency: 'MONTHLY',
          typicalAmountMinor: 1799,
          occurrences: 4,
        },
      ]);
    });

    it('flags the unusually large restaurant bill and the category it inflated', async () => {
      const anomalies = await finance.anomalies(fixture.household.id, AS_OF);

      expect(anomalies).toEqual([
        expect.objectContaining({
          type: 'UNUSUALLY_LARGE_TRANSACTION',
          merchant: 'Tasting Menu',
          amountMinor: 24000,
          baselineAmountMinor: 3200,
          sampleSize: 7,
          memberId: memberAt(fixture, 1).id,
        }),
        expect.objectContaining({
          type: 'UNUSUAL_CATEGORY_SPENDING',
          categoryId: category('Restaurants'),
          currentAmountMinor: 27200,
          baselineAmountMinor: 6500,
          baselinePeriods: 3,
        }),
      ]);
    });

    it('turns the findings into structured insights ordered by severity', async () => {
      await budgets.create(fixture.household.id, {
        categoryId: category('Restaurants'),
        period: 'MONTHLY',
        limitMinor: 20000,
        currency: 'EUR',
        startsOn: '2026-01-01',
      });

      const insights = await finance.insights(fixture.household.id, AS_OF);
      const summary = insights.map((insight) => `${insight.severity} ${insight.type}`);

      expect(summary).toEqual([
        'HIGH BUDGET_EXCEEDED',
        'MEDIUM SPENDING_INCREASE',
        'MEDIUM SPENDING_INCREASE',
        'MEDIUM UNUSUAL_SPENDING',
        'MEDIUM UNUSUAL_SPENDING',
        'MEDIUM NEW_RECURRING_EXPENSE',
        'MEDIUM NEW_RECURRING_EXPENSE',
      ]);
      expect(insights.every((insight) => !('message' in insight))).toBe(true);
    });
  });
});
