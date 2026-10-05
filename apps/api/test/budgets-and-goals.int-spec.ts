import { eq } from 'drizzle-orm';
import { BudgetsRepository } from '../src/budgets/budgets.repository.js';
import { budgets } from '../src/budgets/budgets.schema.js';
import { categories } from '../src/categories/categories.schema.js';
import { requireRow } from '../src/database/require-row.js';
import { GoalsRepository } from '../src/goals/goals.repository.js';
import { goals } from '../src/goals/goals.schema.js';
import { createHouseholdFixture } from './support/household-fixture.js';
import {
  createTestDatabase,
  violatedConstraint,
  type TestDatabase,
} from './support/test-database.js';

describe('budgets and goals', () => {
  let testDatabase: TestDatabase;
  let budgetsRepository: BudgetsRepository;
  let goalsRepository: GoalsRepository;
  let restaurantsId: string;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    budgetsRepository = new BudgetsRepository(testDatabase.database);
    goalsRepository = new GoalsRepository(testDatabase.database);
    restaurantsId = requireRow(
      await testDatabase.database
        .select()
        .from(categories)
        .where(eq(categories.name, 'Restaurants')),
    ).id;
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  describe('budgets', () => {
    const restaurantBudget = {
      period: 'MONTHLY',
      limitMinor: 30000,
      currency: 'EUR',
      startsOn: '2026-10-01',
    } as const;

    it('belong to the household and not to any member', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Budget Owner', 4);

      const budget = await budgetsRepository.create(fixture.household.id, {
        ...restaurantBudget,
        categoryId: restaurantsId,
      });

      expect(budget).toMatchObject({
        householdId: fixture.household.id,
        categoryId: restaurantsId,
        limitMinor: 30000,
        alertThresholdPercent: 80,
      });
      expect(Object.keys(budget)).not.toContain('memberId');
    });

    it('can cover all spending when no category is given', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Overall Budget', 1);

      const budget = await budgetsRepository.create(fixture.household.id, restaurantBudget);

      expect(budget.categoryId).toBeNull();
    });

    it('are listed only for their own household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Budget First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Budget Second', 1);
      const own = await budgetsRepository.create(first.household.id, restaurantBudget);
      await budgetsRepository.create(second.household.id, restaurantBudget);

      const listed = await budgetsRepository.list(first.household.id);

      expect(listed.map((budget) => budget.id)).toEqual([own.id]);
    });

    it('cannot be duplicated for the same category, period and start', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Budget Duplicate', 1);
      await budgetsRepository.create(fixture.household.id, restaurantBudget);

      const constraint = await violatedConstraint(
        budgetsRepository.create(fixture.household.id, restaurantBudget),
      );

      expect(constraint).toBe('budgets_household_category_period_currency_start_unique');
    });

    it('reject a non-positive limit, an invalid threshold and an inverted period', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Budget Checks', 1);
      const insert = (values: Partial<typeof budgets.$inferInsert>): PromiseLike<unknown> =>
        testDatabase.database
          .insert(budgets)
          .values({ ...restaurantBudget, householdId: fixture.household.id, ...values });

      expect(await violatedConstraint(insert({ limitMinor: 0 }))).toBe('budgets_limit_positive');
      expect(await violatedConstraint(insert({ alertThresholdPercent: 101 }))).toBe(
        'budgets_alert_threshold_range',
      );
      expect(await violatedConstraint(insert({ endsOn: '2026-09-30' }))).toBe(
        'budgets_ends_after_start',
      );
    });
  });

  describe('goals', () => {
    const trip = {
      name: 'Summer Trip',
      type: 'TRAVEL',
      targetAmountMinor: 100000,
      currency: 'EUR',
    } as const;

    it('belong to the household and start active with nothing saved', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Goal Owner', 3);

      const goal = await goalsRepository.create(fixture.household.id, trip);

      expect(goal).toMatchObject({
        householdId: fixture.household.id,
        status: 'ACTIVE',
        currentAmountMinor: 0,
        targetDate: null,
      });
      expect(Object.keys(goal)).not.toContain('memberId');
    });

    it('are listed only for their own household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Goal First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Goal Second', 1);
      const own = await goalsRepository.create(first.household.id, trip);
      await goalsRepository.create(second.household.id, trip);

      const listed = await goalsRepository.list(first.household.id);

      expect(listed.map((goal) => goal.id)).toEqual([own.id]);
    });

    it('reject a non-positive target and a negative saved amount', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Goal Checks', 1);
      const insert = (values: Partial<typeof goals.$inferInsert>): PromiseLike<unknown> =>
        testDatabase.database
          .insert(goals)
          .values({ ...trip, householdId: fixture.household.id, ...values });

      expect(await violatedConstraint(insert({ targetAmountMinor: 0 }))).toBe(
        'goals_target_amount_positive',
      );
      expect(await violatedConstraint(insert({ currentAmountMinor: -1 }))).toBe(
        'goals_current_amount_not_negative',
      );
    });
  });
});
