import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  contributionInterpretation,
  correctionInterpretation,
  transactionInterpretation,
} from '../src/ai/testing/fake-ai-provider.fixture.js';
import type { AssistantResponse } from '../src/conversation/financial-assistant.service.js';
import { goalContributions } from '../src/goals/goal-contributions.schema.js';
import { goals } from '../src/goals/goals.schema.js';
import { GoalRejectedError, GoalsService } from '../src/goals/goals.service.js';
import { GoalContributionsRepository } from '../src/goals/goal-contributions.repository.js';
import { GoalsRepository } from '../src/goals/goals.repository.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { AccountsRepository } from '../src/accounts/accounts.repository.js';
import type { RequestContext } from '../src/households/request-context.js';
import { transactions } from '../src/transactions/transactions.schema.js';
import { TransactionRejectedError } from '../src/transactions/transactions.service.js';
import { createAssistantHarness, type AssistantHarness } from './support/assistant-harness.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const START = new Date('2026-10-20T12:00:00Z');

describe('goal contributions', () => {
  let testDatabase: TestDatabase;
  let harness: AssistantHarness;
  let goalsService: GoalsService;
  let clock = 0;

  function contextOf(fixture: HouseholdFixture, position = 0): RequestContext {
    const member = memberAt(fixture, position);
    return {
      householdId: fixture.household.id,
      memberId: member.id,
      memberName: member.name,
      channel: 'whatsapp',
    };
  }

  async function say(
    fixture: HouseholdFixture,
    text: string,
    interpretation?: unknown,
  ): Promise<AssistantResponse> {
    clock += 1;
    if (interpretation !== undefined) {
      harness.provider.willInterpretAs(interpretation);
    }
    return harness.assistant.handle(
      contextOf(fixture),
      { text, sourceMessageId: `wamid.goal-${String(clock)}` },
      new Date(START.getTime() + clock * 1000),
    );
  }

  async function goal(fixture: HouseholdFixture, name: string, currency = 'EUR'): Promise<string> {
    const created = await harness.goals.create(fixture.household.id, {
      name,
      type: 'TRAVEL',
      targetAmountMinor: 100000,
      currency,
    });
    return created.id;
  }

  async function savedIn(goalId: string): Promise<number | undefined> {
    const [row] = await testDatabase.database.select().from(goals).where(eq(goals.id, goalId));
    return row?.currentAmountMinor;
  }

  async function contributionsTo(
    goalId: string,
  ): Promise<(typeof goalContributions.$inferSelect)[]> {
    return testDatabase.database
      .select()
      .from(goalContributions)
      .where(eq(goalContributions.goalId, goalId));
  }

  async function recordTrip(fixture: HouseholdFixture): Promise<void> {
    await harness.accounts.setDefaultAccount(
      fixture.household.id,
      memberAt(fixture, 0).id,
      fixture.jointAccount.id,
    );
    await say(
      fixture,
      '392,94 loveholidays, viagem de malta',
      transactionInterpretation({
        amount: '392.94',
        merchant: 'loveholidays',
        category: 'Travel',
      }),
    );
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    testDatabase = await createTestDatabase();
    harness = await createAssistantHarness(testDatabase.database);
    goalsService = new GoalsService(
      new GoalsRepository(testDatabase.database),
      new HouseholdsRepository(testDatabase.database),
      new AccountsRepository(testDatabase.database),
      new GoalContributionsRepository(testDatabase.database),
    );
  });

  beforeEach(() => {
    harness.provider.willReply((request) => `[${request.situation}]`);
  });

  afterAll(async () => {
    await harness.dispose();
    await testDatabase.destroy();
  });

  it('counts a transaction just recorded toward the goal the member names', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Malta Trip', 1);
    const malta = await goal(fixture, 'Viagem Malta');
    await recordTrip(fixture);

    const response = await say(
      fixture,
      'contabilize esse valor na meta viagem malta',
      contributionInterpretation('viagem malta', { fromRecorded: true }),
    );
    const again = await say(
      fixture,
      'contabilize esse valor na meta viagem malta',
      contributionInterpretation('viagem malta', { fromRecorded: true }),
    );

    expect(response.reply).toBe(
      'Added €392.94 to the goal Viagem Malta. Progress: €392.94 of €1,000.00 (39.29%).',
    );
    expect(again.reply).toBe('That transaction already counts toward the goal Viagem Malta.');
    expect(await savedIn(malta)).toBe(39294);
    expect(await contributionsTo(malta)).toEqual([
      expect.objectContaining({
        amountMinor: 39294,
        memberId: memberAt(fixture, 0).id,
        transactionId: expect.any(String) as unknown,
      }),
    ]);
  });

  it('adds an amount the member states, and says when the goal is reached', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Reserve', 1);
    const reserve = await goal(fixture, 'Reserva de emergência');

    const first = await say(
      fixture,
      'coloquei 200 na reserva',
      contributionInterpretation('reserva', { amount: '200' }),
    );
    const last = await say(
      fixture,
      'coloquei 800 na reserva',
      contributionInterpretation('reserva', { amount: '800' }),
    );

    expect(first.reply).toBe(
      'Added €200.00 to the goal Reserva de emergência. Progress: €200.00 of €1,000.00 (20%).',
    );
    expect(last.reply).toMatch(/Progress: €1,000\.00 of €1,000\.00 \(100%\)\. Goal reached\.$/);
    expect(await savedIn(reserve)).toBe(100000);
  });

  it('takes the contribution back when the transaction is deleted in the chat', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Undo Trip', 1);
    const malta = await goal(fixture, 'Viagem Malta');
    await recordTrip(fixture);
    await say(
      fixture,
      'contabilize esse valor na meta viagem malta',
      contributionInterpretation('viagem malta', {
        fromRecorded: true,
        target: { merchant: 'loveholidays' },
      }),
    );

    await say(
      fixture,
      'apaga o da loveholidays',
      correctionInterpretation('DELETE', { merchant: 'loveholidays' }),
    );
    const deleted = await say(fixture, 'sim');

    expect(deleted.reply).toMatch(/^Deleted: €392\.94 at Loveholidays/);
    expect(await savedIn(malta)).toBe(0);
    expect(await contributionsTo(malta)).toEqual([]);
  });

  it('follows a corrected amount and refuses moving it to another currency', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Fix Trip', 1);
    await harness.accounts.create(fixture.household.id, {
      name: 'Inter',
      type: 'BANK',
      currency: 'BRL',
    });
    const malta = await goal(fixture, 'Viagem Malta');
    await recordTrip(fixture);
    await say(
      fixture,
      'contabilize esse valor na meta viagem malta',
      contributionInterpretation('viagem malta', { fromRecorded: true }),
    );

    const corrected = await say(
      fixture,
      'foram 400',
      correctionInterpretation('EDIT', {}, { amount: '400' }),
    );
    const moved = await say(
      fixture,
      'foi no inter',
      correctionInterpretation('EDIT', {}, { account: 'Inter' }),
    );

    expect(corrected.reply).toMatch(/^Corrected: €400\.00 at Loveholidays/);
    expect(await savedIn(malta)).toBe(40000);
    expect(await contributionsTo(malta)).toEqual([expect.objectContaining({ amountMinor: 40000 })]);
    expect(moved.reply).toMatch(/^Nothing was changed: I need/);
  });

  it('reverts when the dashboard deletes the transaction, and protects against a raw delete', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Dashboard Undo', 1);
    const malta = await goal(fixture, 'Viagem Malta');
    await recordTrip(fixture);
    await say(
      fixture,
      'contabilize esse valor na meta viagem malta',
      contributionInterpretation('viagem malta', { fromRecorded: true }),
    );
    const [row] = await testDatabase.database
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, fixture.household.id));
    if (row === undefined) {
      throw new Error('expected the trip to be recorded');
    }

    await expect(
      testDatabase.database.delete(transactions).where(eq(transactions.id, row.id)),
    ).rejects.toThrow();
    expect(await harness.transactionsService.remove(fixture.household.id, row.id)).toBe(true);

    expect(await savedIn(malta)).toBe(0);
    expect(await contributionsTo(malta)).toEqual([]);
  });

  it('locks the currency of a goal with contributions and removes them with the goal', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Locked Goal', 1);
    await harness.accounts.create(fixture.household.id, {
      name: 'Inter',
      type: 'BANK',
      currency: 'BRL',
    });
    const malta = await goal(fixture, 'Viagem Malta');
    await say(fixture, 'coloquei 200', contributionInterpretation('malta', { amount: '200' }));
    const current = await goalsService.find(fixture.household.id, malta);
    if (current === undefined) {
      throw new Error('expected the goal');
    }

    await expect(
      goalsService.edit(fixture.household.id, malta, current.updatedAt.toISOString(), {
        name: current.name,
        type: current.type,
        targetAmountMinor: current.targetAmountMinor,
        currentAmountMinor: current.currentAmountMinor,
        currency: 'BRL',
        targetDate: null,
      }),
    ).rejects.toEqual(new GoalRejectedError(['CURRENCY_LOCKED']));
    expect(await goalsService.remove(fixture.household.id, malta)).toBe(true);
    expect(await contributionsTo(malta)).toEqual([]);
  });

  it('does not add an amount in another currency, nor to a goal that is not there', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Wrong Goal', 1);
    await harness.accounts.create(fixture.household.id, {
      name: 'Inter',
      type: 'BANK',
      currency: 'BRL',
    });
    const reais = await goal(fixture, 'Carro', 'BRL');
    await goal(fixture, 'Viagem Malta');
    await recordTrip(fixture);

    const mismatch = await say(
      fixture,
      'soma esse no carro',
      contributionInterpretation('carro', { fromRecorded: true }),
    );
    const unknown = await say(
      fixture,
      'soma 50 na meta da casa',
      contributionInterpretation('casa', { amount: '50' }),
    );

    expect(mismatch.reply).toBe(
      'The goal Carro is in BRL and this amount is in EUR, so I did not add it.',
    );
    expect(unknown.reply).toBe('Which goal? Carro and Viagem Malta.');
    expect(await savedIn(reais)).toBe(0);
  });

  it('keeps edits of linked transactions that change currency out, at the service', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Service Guard', 1);
    const inter = await harness.accounts.create(fixture.household.id, {
      name: 'Inter',
      type: 'BANK',
      currency: 'BRL',
    });
    await goal(fixture, 'Viagem Malta');
    await recordTrip(fixture);
    await say(
      fixture,
      'contabilize esse valor na meta viagem malta',
      contributionInterpretation('viagem malta', { fromRecorded: true }),
    );
    const [row] = await testDatabase.database
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, fixture.household.id));
    if (row === undefined) {
      throw new Error('expected the trip to be recorded');
    }

    await expect(
      harness.transactionsService.edit(fixture.household.id, row.id, row.updatedAt.toISOString(), {
        type: row.type,
        amountMinor: row.amountMinor,
        memberId: row.memberId,
        accountId: inter.id,
        categoryId: row.categoryId,
        merchant: row.merchant,
        description: row.description,
        expenseScope: row.expenseScope,
        transactionDate: row.transactionDate,
      }),
    ).rejects.toEqual(new TransactionRejectedError(['GOAL_CURRENCY_MISMATCH']));
  });
});
