import { eq } from 'drizzle-orm';
import { AccountsRepository } from '../src/accounts/accounts.repository.js';
import { CategoriesRepository } from '../src/categories/categories.repository.js';
import { categories } from '../src/categories/categories.schema.js';
import { requireRow } from '../src/database/require-row.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import type { NewTransactionInput } from '../src/transactions/new-transaction.schema.js';
import { TransactionsRepository } from '../src/transactions/transactions.repository.js';
import { transactions } from '../src/transactions/transactions.schema.js';
import {
  TransactionRejectedError,
  TransactionsService,
} from '../src/transactions/transactions.service.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import {
  createTestDatabase,
  violatedConstraint,
  type TestDatabase,
} from './support/test-database.js';

describe('transactions', () => {
  let testDatabase: TestDatabase;
  let accounts: AccountsRepository;
  let repository: TransactionsRepository;
  let service: TransactionsService;
  let restaurantsId: string;
  let salaryId: string;

  async function categoryId(name: string): Promise<string> {
    const rows = await testDatabase.database
      .select()
      .from(categories)
      .where(eq(categories.name, name));
    return requireRow(rows).id;
  }

  function expense(
    fixture: HouseholdFixture,
    memberPosition: number,
    overrides: Partial<NewTransactionInput> = {},
  ): NewTransactionInput {
    return {
      memberId: memberAt(fixture, memberPosition).id,
      accountId: fixture.jointAccount.id,
      type: 'EXPENSE',
      amountMinor: 2300,
      currency: 'EUR',
      merchant: 'Corner Shop',
      transactionDate: '2026-10-05',
      source: 'MANUAL',
      ...overrides,
    };
  }

  async function rejectionReasons(action: Promise<unknown>): Promise<readonly string[]> {
    try {
      await action;
    } catch (error) {
      if (error instanceof TransactionRejectedError) {
        return error.reasons;
      }
      throw error;
    }
    return [];
  }

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    accounts = new AccountsRepository(testDatabase.database);
    repository = new TransactionsRepository(testDatabase.database);
    service = new TransactionsService(
      repository,
      new HouseholdsRepository(testDatabase.database),
      accounts,
      new CategoriesRepository(testDatabase.database),
    );
    restaurantsId = await categoryId('Restaurants');
    salaryId = await categoryId('Salary');
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  describe('attribution', () => {
    it('attributes transactions to any member of a household of any size', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Attribution', 5);
      for (const position of fixture.members.keys()) {
        await service.record(fixture.household.id, expense(fixture, position));
      }

      const listed = await repository.list(fixture.household.id);

      expect(new Set(listed.map((transaction) => transaction.memberId))).toEqual(
        new Set(fixture.members.map((member) => member.id)),
      );
    });

    it('filters by member without changing what the household can see', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Member Filter', 3);
      await service.record(fixture.household.id, expense(fixture, 0));
      await service.record(fixture.household.id, expense(fixture, 1));
      await service.record(fixture.household.id, expense(fixture, 1));

      const second = memberAt(fixture, 1);

      expect(await repository.list(fixture.household.id, { memberId: second.id })).toHaveLength(2);
      expect(await repository.list(fixture.household.id)).toHaveLength(3);
    });

    it('defaults the expense scope to the household', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Default Scope', 1);

      const recorded = await service.record(fixture.household.id, expense(fixture, 0));

      expect(recorded.expenseScope).toBe('HOUSEHOLD');
    });

    it('shows individual expenses to the whole household', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Scope Visibility', 3);
      const individual = await service.record(
        fixture.household.id,
        expense(fixture, 0, { expenseScope: 'INDIVIDUAL' }),
      );

      const visibleToHousehold = await repository.list(fixture.household.id);

      expect(visibleToHousehold.map((transaction) => transaction.id)).toEqual([individual.id]);
      expect(visibleToHousehold[0]?.expenseScope).toBe('INDIVIDUAL');
    });

    it('rejects a member who belongs to another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Member First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Member Second', 1);

      const reasons = await rejectionReasons(
        service.record(first.household.id, expense(first, 0, { memberId: memberAt(second, 0).id })),
      );

      expect(reasons).toEqual(['UNKNOWN_MEMBER']);
    });
  });

  describe('household isolation', () => {
    it('never lists the transactions of another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'List First', 2);
      const second = await createHouseholdFixture(testDatabase.database, 'List Second', 2);
      const own = await service.record(first.household.id, expense(first, 0));
      await service.record(second.household.id, expense(second, 0));

      const listed = await repository.list(first.household.id);

      expect(listed.map((transaction) => transaction.id)).toEqual([own.id]);
    });

    it('rejects an account that belongs to another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Account First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Account Second', 1);

      const reasons = await rejectionReasons(
        service.record(
          first.household.id,
          expense(first, 0, { accountId: second.jointAccount.id }),
        ),
      );

      expect(reasons).toEqual(['UNKNOWN_ACCOUNT']);
    });

    it('is protected by the database even when application checks are bypassed', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Bypass First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Bypass Second', 1);
      const row = {
        householdId: first.household.id,
        memberId: memberAt(first, 0).id,
        accountId: first.jointAccount.id,
        type: 'EXPENSE' as const,
        amountMinor: 100,
        currency: 'EUR',
        transactionDate: '2026-10-05',
        source: 'MANUAL' as const,
      };

      expect(
        await violatedConstraint(
          testDatabase.database
            .insert(transactions)
            .values({ ...row, memberId: memberAt(second, 0).id }),
        ),
      ).toBe('transactions_member_fk');
      expect(
        await violatedConstraint(
          testDatabase.database
            .insert(transactions)
            .values({ ...row, accountId: second.jointAccount.id }),
        ),
      ).toBe('transactions_account_fk');
    });
  });

  describe('money', () => {
    it('stores the amount as exact minor units with its currency', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Exact Amount', 1);

      const recorded = await service.record(
        fixture.household.id,
        expense(fixture, 0, { amountMinor: 4327 }),
      );

      expect(recorded).toMatchObject({ amountMinor: 4327, currency: 'EUR' });
    });

    it.each([0, -100, 43.27])('rejects an amount of %d minor units', async (amountMinor) => {
      const fixture = await createHouseholdFixture(
        testDatabase.database,
        `Bad Amount ${String(amountMinor)}`,
        1,
      );

      const reasons = await rejectionReasons(
        service.record(fixture.household.id, expense(fixture, 0, { amountMinor })),
      );

      expect(reasons).toEqual(['INVALID_INPUT']);
    });

    it('refuses to record a currency different from the account currency', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Currency Mismatch', 1);

      const reasons = await rejectionReasons(
        service.record(fixture.household.id, expense(fixture, 0, { currency: 'BRL' })),
      );

      expect(reasons).toEqual(['ACCOUNT_CURRENCY_MISMATCH']);
    });

    it('keeps amounts in different currencies in their own accounts', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Two Currencies', 1);
      const brazilianAccount = await accounts.create(fixture.household.id, {
        name: 'Brazilian Account',
        type: 'BANK',
        currency: 'BRL',
      });
      await service.record(fixture.household.id, expense(fixture, 0));
      await service.record(
        fixture.household.id,
        expense(fixture, 0, { accountId: brazilianAccount.id, currency: 'BRL', amountMinor: 5000 }),
      );

      const listed = await repository.list(fixture.household.id);

      expect(listed.map(({ amountMinor, currency }) => ({ amountMinor, currency }))).toEqual(
        expect.arrayContaining([
          { amountMinor: 2300, currency: 'EUR' },
          { amountMinor: 5000, currency: 'BRL' },
        ]),
      );
    });

    it('has a database check against non-positive amounts', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Amount Check', 1);

      const constraint = await violatedConstraint(
        testDatabase.database.insert(transactions).values({
          householdId: fixture.household.id,
          memberId: memberAt(fixture, 0).id,
          accountId: fixture.jointAccount.id,
          type: 'EXPENSE',
          amountMinor: 0,
          currency: 'EUR',
          transactionDate: '2026-10-05',
          source: 'MANUAL',
        }),
      );

      expect(constraint).toBe('transactions_amount_positive');
    });
  });

  describe('categories', () => {
    it('records an expense under an existing expense category', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Categorised', 1);

      const recorded = await service.record(
        fixture.household.id,
        expense(fixture, 0, { categoryId: restaurantsId }),
      );

      expect(recorded.categoryId).toBe(restaurantsId);
    });

    it('rejects a category that does not exist', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Invented Category', 1);

      const reasons = await rejectionReasons(
        service.record(
          fixture.household.id,
          expense(fixture, 0, { categoryId: '00000000-0000-4000-8000-000000000000' }),
        ),
      );

      expect(reasons).toEqual(['UNKNOWN_CATEGORY']);
    });

    it('rejects an expense under an income category', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Wrong Kind', 1);

      const reasons = await rejectionReasons(
        service.record(fixture.household.id, expense(fixture, 0, { categoryId: salaryId })),
      );

      expect(reasons).toEqual(['CATEGORY_KIND_MISMATCH']);
    });
  });

  describe('transfers', () => {
    async function createSavings(fixture: HouseholdFixture): Promise<string> {
      const savings = await accounts.create(fixture.household.id, {
        name: 'Savings',
        type: 'SAVINGS',
        currency: 'EUR',
      });
      return savings.id;
    }

    it('are one movement from a source account to a destination account', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Transfer', 1);
      const savingsId = await createSavings(fixture);

      const transfer = await service.record(
        fixture.household.id,
        expense(fixture, 0, { type: 'TRANSFER', transferAccountId: savingsId, amountMinor: 50000 }),
      );

      expect(transfer).toMatchObject({
        type: 'TRANSFER',
        accountId: fixture.jointAccount.id,
        transferAccountId: savingsId,
        amountMinor: 50000,
        categoryId: null,
      });
    });

    it('do not appear among the expenses or income of the household', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Not Spending', 1);
      const savingsId = await createSavings(fixture);
      const purchase = await service.record(fixture.household.id, expense(fixture, 0));
      await service.record(
        fixture.household.id,
        expense(fixture, 0, { type: 'TRANSFER', transferAccountId: savingsId, amountMinor: 50000 }),
      );

      const expenses = await repository.list(fixture.household.id, { type: 'EXPENSE' });
      const income = await repository.list(fixture.household.id, { type: 'INCOME' });

      expect(expenses.map((transaction) => transaction.id)).toEqual([purchase.id]);
      expect(income).toEqual([]);
    });

    it('cannot carry a category', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Transfer Category', 1);
      const savingsId = await createSavings(fixture);

      const reasons = await rejectionReasons(
        service.record(
          fixture.household.id,
          expense(fixture, 0, {
            type: 'TRANSFER',
            transferAccountId: savingsId,
            categoryId: restaurantsId,
          }),
        ),
      );

      expect(reasons).toEqual(['TRANSFER_WITH_CATEGORY']);
    });

    it('cannot reach an account of another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Transfer First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Transfer Second', 1);

      const reasons = await rejectionReasons(
        service.record(
          first.household.id,
          expense(first, 0, { type: 'TRANSFER', transferAccountId: second.jointAccount.id }),
        ),
      );

      expect(reasons).toEqual(['UNKNOWN_TRANSFER_ACCOUNT']);
    });

    it('cannot cross currencies', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Transfer Currency', 1);
      const brazilianAccount = await accounts.create(fixture.household.id, {
        name: 'Brazilian Account',
        type: 'BANK',
        currency: 'BRL',
      });

      const reasons = await rejectionReasons(
        service.record(
          fixture.household.id,
          expense(fixture, 0, { type: 'TRANSFER', transferAccountId: brazilianAccount.id }),
        ),
      );

      expect(reasons).toEqual(['TRANSFER_CURRENCY_MISMATCH']);
    });

    it('are held to the same rules by the database', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Transfer Checks', 1);
      const savingsId = await createSavings(fixture);
      const row = {
        householdId: fixture.household.id,
        memberId: memberAt(fixture, 0).id,
        accountId: fixture.jointAccount.id,
        amountMinor: 100,
        currency: 'EUR',
        transactionDate: '2026-10-05',
        source: 'MANUAL' as const,
      };
      const insert = (
        values: Partial<typeof transactions.$inferInsert> & {
          type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
        },
      ): PromiseLike<unknown> =>
        testDatabase.database.insert(transactions).values({ ...row, ...values });

      expect(await violatedConstraint(insert({ type: 'TRANSFER' }))).toBe(
        'transactions_transfer_has_destination',
      );
      expect(
        await violatedConstraint(insert({ type: 'EXPENSE', transferAccountId: savingsId })),
      ).toBe('transactions_transfer_has_destination');
      expect(
        await violatedConstraint(
          insert({ type: 'TRANSFER', transferAccountId: fixture.jointAccount.id }),
        ),
      ).toBe('transactions_transfer_between_distinct_accounts');
      expect(
        await violatedConstraint(
          insert({ type: 'TRANSFER', transferAccountId: savingsId, categoryId: restaurantsId }),
        ),
      ).toBe('transactions_transfer_has_no_category');
    });
  });

  describe('provenance', () => {
    it('keeps the source, the provider message identifier and the confidence', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Provenance', 1);

      const recorded = await service.record(
        fixture.household.id,
        expense(fixture, 0, {
          source: 'WHATSAPP_IMAGE',
          sourceMessageId: 'wamid.example',
          aiConfidence: 0.5,
        }),
      );

      expect(recorded).toMatchObject({
        source: 'WHATSAPP_IMAGE',
        sourceMessageId: 'wamid.example',
        aiConfidence: 0.5,
      });
    });

    it.each([-0.1, 1.1])('rejects a confidence of %d', async (aiConfidence) => {
      const fixture = await createHouseholdFixture(
        testDatabase.database,
        `Confidence ${String(aiConfidence)}`,
        1,
      );

      const reasons = await rejectionReasons(
        service.record(fixture.household.id, expense(fixture, 0, { aiConfidence })),
      );

      expect(reasons).toEqual(['INVALID_INPUT']);
    });
  });
});
