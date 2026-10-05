import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { questionInterpretation } from '../src/ai/testing/fake-ai-provider.fixture.js';
import { categories } from '../src/categories/categories.schema.js';
import type { AssistantResponse } from '../src/conversation/financial-assistant.service.js';
import type { RequestContext } from '../src/households/request-context.js';
import { NotificationComposer } from '../src/proactive/notification-composer.js';
import { ProactiveCfoService } from '../src/proactive/proactive-cfo.service.js';
import { ProactiveNotificationsRepository } from '../src/proactive/proactive-notifications.repository.js';
import { proactiveNotifications } from '../src/proactive/proactive-notifications.schema.js';
import { recurringExpenses } from '../src/recurring-expenses/recurring-expenses.schema.js';
import { transactions } from '../src/transactions/transactions.schema.js';
import { FakeWhatsAppProvider } from '../src/whatsapp/testing/fake-whatsapp-provider.fixture.js';
import { WhatsAppNotificationChannel } from '../src/whatsapp/whatsapp-notification-channel.js';
import {
  createAssistantHarness,
  TEST_CONFIG,
  type AssistantHarness,
} from './support/assistant-harness.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const TODAY = '2026-10-20';
const NOON = new Date('2026-10-20T12:00:00Z');
const HOUR = 3_600_000;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

interface Charge {
  readonly merchant: string;
  readonly amountMinor: number;
  readonly dates: readonly string[];
  readonly member?: number;
  readonly currency?: string;
  readonly accountId?: string;
  readonly category?: string;
}

function monthly(day: string, months: readonly string[]): string[] {
  return months.map((month) => `2026-${month}-${day}`);
}

describe('recurring expense intelligence', () => {
  let testDatabase: TestDatabase;
  let harness: AssistantHarness;
  let whatsapp: FakeWhatsAppProvider;
  let addressSequence = 0;
  let clock = 0;
  const categoryIds = new Map<string, string>();

  function contextOf(fixture: HouseholdFixture, memberPosition = 0): RequestContext {
    const member = memberAt(fixture, memberPosition);
    return {
      householdId: fixture.household.id,
      memberId: member.id,
      memberName: member.name,
      channel: 'whatsapp',
    };
  }

  async function charge(fixture: HouseholdFixture, charges: readonly Charge[]): Promise<void> {
    await testDatabase.database.insert(transactions).values(
      charges.flatMap((entry) =>
        entry.dates.map((transactionDate) => ({
          householdId: fixture.household.id,
          memberId: memberAt(fixture, entry.member ?? 0).id,
          accountId: entry.accountId ?? fixture.jointAccount.id,
          type: 'EXPENSE' as const,
          currency: entry.currency ?? 'EUR',
          amountMinor: entry.amountMinor,
          merchant: entry.merchant,
          categoryId: categoryIds.get(entry.category ?? 'Subscriptions') ?? null,
          transactionDate,
          source: 'MANUAL' as const,
        })),
      ),
    );
  }

  async function subscribedHousehold(name: string, memberCount = 2): Promise<HouseholdFixture> {
    const fixture = await createHouseholdFixture(testDatabase.database, name, memberCount);
    const second = memberCount > 1 ? 1 : 0;
    await charge(fixture, [
      {
        merchant: 'Landlord',
        category: 'Rent',
        amountMinor: 180000,
        dates: monthly('01', ['05', '06', '07', '08', '09', '10']),
      },
      { merchant: 'Streaming', amountMinor: 1599, dates: monthly('15', ['04', '05', '06', '07']) },
      { merchant: 'Streaming', amountMinor: 1599, dates: monthly('15', ['08']), member: second },
      {
        merchant: 'Streaming',
        amountMinor: 1899,
        dates: monthly('15', ['09', '10']),
        member: second,
      },
      {
        merchant: 'Old Gym',
        amountMinor: 3500,
        dates: monthly('05', ['03', '04', '05', '06', '07']),
      },
      { merchant: 'Cloud', amountMinor: 299, dates: monthly('22', ['07', '08', '09']) },
      { merchant: 'Licence', amountMinor: 6000, dates: ['2024-06-10', '2025-06-10', '2026-06-10'] },
    ]);
    return fixture;
  }

  async function ask(
    fixture: HouseholdFixture,
    text: string,
    interpretation: unknown,
  ): Promise<AssistantResponse> {
    clock += 1;
    harness.provider.willInterpretAs(interpretation);
    return harness.assistant.handle(
      contextOf(fixture),
      { text },
      new Date(NOON.getTime() + clock * 1000),
    );
  }

  function resultOf(response: AssistantResponse): unknown {
    return (response.outcome as { query?: { result?: unknown } }).query?.result;
  }

  function lastFacts(): Record<string, unknown> {
    return harness.provider.replyRequests.at(-1)?.facts ?? {};
  }

  async function reachable(fixture: HouseholdFixture): Promise<string> {
    addressSequence += 1;
    const address = `1555111${String(addressSequence).padStart(4, '0')}`;
    await harness.households.registerWhatsAppIdentity(fixture.household.id, {
      memberId: memberAt(fixture, 0).id,
      provider: whatsapp.name,
      externalUserId: address,
      phoneNumber: `+${address}`,
    });
    return address;
  }

  function proactiveWith(proactiveAiMessages = false): ProactiveCfoService {
    return new ProactiveCfoService(
      harness.cfo,
      harness.households,
      new ProactiveNotificationsRepository(testDatabase.database),
      new NotificationComposer(harness.provider, { ...TEST_CONFIG, proactiveAiMessages }),
      new WhatsAppNotificationChannel(whatsapp, harness.households),
    );
  }

  async function notified(fixture: HouseholdFixture): Promise<Record<string, string>> {
    const rows = await testDatabase.database
      .select()
      .from(proactiveNotifications)
      .where(eq(proactiveNotifications.householdId, fixture.household.id));
    return Object.fromEntries(rows.map((row) => [`${row.type} ${row.title}`, row.status]));
  }

  function sentTo(address: string): string[] {
    return whatsapp.sent.filter((message) => message.to === address).map((message) => message.text);
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    testDatabase = await createTestDatabase();
    for (const row of await testDatabase.database.select().from(categories)) {
      categoryIds.set(row.name, row.id);
    }
  });

  beforeEach(async () => {
    harness = await createAssistantHarness(testDatabase.database);
    whatsapp = new FakeWhatsAppProvider();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  describe('commitments from the ledger', () => {
    let fixture: HouseholdFixture;

    beforeAll(async () => {
      fixture = await subscribedHousehold('Subscribed');
    });

    it('lists active commitments by cost with monthly and annual equivalents', async () => {
      const [eur, ...others] = await harness.finance.recurringCommitments(
        fixture.household.id,
        TODAY,
      );

      expect(others).toEqual([]);
      expect(
        eur?.commitments.map((item) => [
          item.merchant,
          item.frequency,
          item.typicalAmountMinor,
          item.monthlyEquivalentMinor,
          item.annualEquivalentMinor,
          item.nextExpectedDate,
        ]),
      ).toEqual([
        ['Landlord', 'MONTHLY', 180000, 180000, 2160000, '2026-10-31'],
        ['Streaming', 'MONTHLY', 1899, 1899, 22788, '2026-11-14'],
        ['Licence', 'YEARLY', 6000, 500, 6000, '2027-06-10'],
        ['Cloud', 'MONTHLY', 299, 299, 3588, '2026-10-22'],
      ]);
      expect(eur).toMatchObject({
        currency: 'EUR',
        monthlyEquivalentMinor: 182698,
        annualEquivalentMinor: 2192376,
      });
    });

    it('reports the price increase with both amounts and the date it took effect', async () => {
      const [eur] = await harness.finance.recurringChanges(fixture.household.id, TODAY);

      expect(eur?.priceChanges).toMatchObject([
        {
          merchant: 'Streaming',
          occurrences: 7,
          priceChange: {
            direction: 'INCREASE',
            previousAmountMinor: 1599,
            currentAmountMinor: 1899,
            differenceMinor: 300,
            changeBasisPoints: 1876,
            effectiveDate: '2026-09-15',
          },
        },
      ]);
    });

    it('reports the newly established commitment and the one that appears to have stopped', async () => {
      const [eur] = await harness.finance.recurringChanges(fixture.household.id, TODAY);

      expect(eur?.newCommitments).toMatchObject([
        { merchant: 'Cloud', isNew: true, firstDate: '2026-07-22', occurrences: 3 },
      ]);
      expect(eur?.stopped).toMatchObject([
        {
          merchant: 'Old Gym',
          typicalAmountMinor: 3500,
          lastDate: '2026-07-05',
          missedDate: '2026-08-04',
        },
      ]);
      expect(eur?.stopped[0]).not.toHaveProperty('nextExpectedDate');
    });

    it('lists what is coming up in the next two weeks with its total', async () => {
      const [eur] = await harness.finance.upcomingRecurring(fixture.household.id, TODAY);

      expect(eur).toMatchObject({ from: TODAY, withinDays: 14, totalMinor: 180299 });
      expect(eur?.upcoming.map((item) => [item.merchant, item.nextExpectedDate])).toEqual([
        ['Cloud', '2026-10-22'],
        ['Landlord', '2026-10-31'],
      ]);
    });

    it('shows who has paid each commitment', async () => {
      const [eur] = await harness.finance.recurringCommitments(fixture.household.id, TODAY);
      const streaming = eur?.commitments.find((item) => item.merchant === 'Streaming');

      expect(streaming?.payers).toEqual([
        { memberId: memberAt(fixture, 0).id, occurrences: 4 },
        { memberId: memberAt(fixture, 1).id, occurrences: 3 },
      ]);
    });

    it('answers the same for a past date from the ledger as it stood then', async () => {
      const [eur] = await harness.finance.recurringCommitments(fixture.household.id, '2026-08-10');

      expect(eur?.commitments.map((item) => item.merchant)).toEqual([
        'Landlord',
        'Old Gym',
        'Streaming',
        'Licence',
      ]);
      expect(eur?.stopped).toEqual([]);
      expect(eur?.commitments.find((item) => item.merchant === 'Streaming')).toMatchObject({
        typicalAmountMinor: 1599,
        priceChange: null,
      });
    });

    it('reads transactions without writing anything back', async () => {
      const before = await testDatabase.database
        .select()
        .from(transactions)
        .where(eq(transactions.householdId, fixture.household.id));

      await harness.finance.recurringCommitments(fixture.household.id, TODAY);
      await harness.finance.recurringChanges(fixture.household.id, TODAY);

      expect(
        await testDatabase.database
          .select()
          .from(transactions)
          .where(eq(transactions.householdId, fixture.household.id)),
      ).toEqual(before);
      expect(await testDatabase.database.select().from(recurringExpenses)).toEqual([]);
    });
  });

  describe('evidence', () => {
    it.each([
      ['WEEKLY', ['2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13'], 62400],
      ['QUARTERLY', ['2026-01-10', '2026-04-11', '2026-07-11', '2026-10-10'], 4800],
      ['YEARLY', ['2024-09-01', '2025-09-01', '2026-09-01'], 1200],
    ] as const)('detects a %s commitment from the ledger', async (frequency, dates, annual) => {
      const fixture = await createHouseholdFixture(
        testDatabase.database,
        `Cadence ${frequency}`,
        1,
      );
      await charge(fixture, [{ merchant: 'Service', amountMinor: 1200, dates }]);

      const [eur] = await harness.finance.recurringCommitments(fixture.household.id, TODAY);

      expect(eur?.commitments).toMatchObject([{ frequency, annualEquivalentMinor: annual }]);
    });

    it('claims nothing from one or two charges, and invents no dates', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Thin History', 1);
      await charge(fixture, [
        { merchant: 'Twice', amountMinor: 1500, dates: monthly('10', ['09', '10']) },
        { merchant: 'Once', amountMinor: 900, dates: ['2026-10-02'] },
      ]);

      expect(await harness.finance.recurringCommitments(fixture.household.id, TODAY)).toEqual([
        {
          currency: 'EUR',
          monthlyEquivalentMinor: 0,
          annualEquivalentMinor: 0,
          commitments: [],
          stopped: [],
        },
      ]);
      expect(await harness.finance.upcomingRecurring(fixture.household.id, TODAY)).toMatchObject([
        { totalMinor: 0, upcoming: [] },
      ]);
    });
  });

  describe('currencies, households and members', () => {
    it('keeps each currency in its own summary and never adds them', async () => {
      const fixture = await subscribedHousehold('Two Currencies');
      const dollars = await harness.accounts.create(fixture.household.id, {
        name: 'Dollar Account',
        type: 'BANK',
        currency: 'USD',
      });
      await charge(fixture, [
        {
          merchant: 'Dollar Tool',
          amountMinor: 10000,
          currency: 'USD',
          accountId: dollars.id,
          dates: monthly('10', ['05', '06', '07', '08', '09', '10']),
        },
      ]);

      const summaries = await harness.finance.recurringCommitments(fixture.household.id, TODAY);

      expect(
        summaries.map((summary) => [
          summary.currency,
          summary.monthlyEquivalentMinor,
          summary.annualEquivalentMinor,
        ]),
      ).toEqual([
        ['EUR', 182698, 2192376],
        ['USD', 10000, 120000],
      ]);
      expect(summaries[1]?.commitments.map((item) => item.merchant)).toEqual(['Dollar Tool']);
      expect(JSON.stringify(summaries)).not.toContain('192698');
    });

    it('never shows one household the commitments of another', async () => {
      const first = await subscribedHousehold('Isolated First');
      const second = await createHouseholdFixture(testDatabase.database, 'Isolated Second', 2);
      await charge(second, [
        {
          merchant: 'Streaming',
          amountMinor: 999,
          dates: monthly('15', ['05', '06', '07', '08', '09', '10']),
        },
      ]);

      const [mine] = await harness.finance.recurringCommitments(second.household.id, TODAY);
      const [theirs] = await harness.finance.recurringCommitments(first.household.id, TODAY);

      expect(mine?.commitments).toMatchObject([
        { merchant: 'Streaming', typicalAmountMinor: 999, occurrences: 6, priceChange: null },
      ]);
      expect(mine?.stopped).toEqual([]);
      expect(theirs?.commitments.find((item) => item.merchant === 'Streaming')).toMatchObject({
        typicalAmountMinor: 1899,
        occurrences: 7,
      });
    });

    it.each([1, 2, 4])('attributes payments in a household of %i', async (memberCount) => {
      const fixture = await createHouseholdFixture(
        testDatabase.database,
        `Payers ${String(memberCount)}`,
        memberCount,
      );
      const months = ['05', '06', '07', '08', '09', '10'];
      await charge(
        fixture,
        months.map((month, position) => ({
          merchant: 'Internet',
          amountMinor: 4500,
          dates: monthly('12', [month]),
          member: position % memberCount,
        })),
      );

      const [eur] = await harness.finance.recurringCommitments(fixture.household.id, TODAY);
      const payers = eur?.commitments[0]?.payers ?? [];

      expect(eur?.commitments).toHaveLength(1);
      expect(payers).toHaveLength(memberCount);
      expect(payers.map((payer) => payer.occurrences)).toEqual(
        { 1: [6], 2: [3, 3], 4: [2, 2, 1, 1] }[memberCount],
      );
      expect(new Set(payers.map((payer) => payer.memberId))).toEqual(
        new Set(fixture.members.map((member) => member.id)),
      );
    });
  });

  describe('questions', () => {
    let fixture: HouseholdFixture;

    beforeAll(async () => {
      fixture = await subscribedHousehold('Asking');
    });

    it('answers "what subscriptions do we have?" from the engine, with names and no identifiers', async () => {
      const response = await ask(
        fixture,
        'What subscriptions do we have?',
        questionInterpretation({ intent: 'RECURRING_EXPENSES' }),
      );

      expect(response.outcome).toMatchObject({
        kind: 'QUESTION',
        query: { status: 'ANSWERED', intent: 'RECURRING_EXPENSES' },
      });
      expect(resultOf(response)).toMatchObject([
        { currency: 'EUR', monthlyEquivalentMinor: 182698, annualEquivalentMinor: 2192376 },
      ]);
      expect(lastFacts()).toMatchObject({
        intent: 'RECURRING_EXPENSES',
        result: [
          {
            monthlyEquivalent: '€1,826.98',
            annualEquivalent: '€21,923.76',
            commitments: expect.arrayContaining([
              expect.objectContaining({
                merchant: 'Streaming',
                category: 'Subscriptions',
                typicalAmount: '€18.99',
                annualEquivalent: '€227.88',
                payers: [
                  { member: 'Asking Member 1', occurrences: 4 },
                  { member: 'Asking Member 2', occurrences: 3 },
                ],
              }),
            ]) as unknown,
            stopped: [expect.objectContaining({ merchant: 'Old Gym', missedDate: '2026-08-04' })],
          },
        ],
      });
      expect(JSON.stringify(lastFacts())).not.toMatch(UUID);
      expect(JSON.stringify(lastFacts())).not.toContain('merchantKey');
    });

    it('answers a follow-up about what is coming up', async () => {
      const response = await ask(
        fixture,
        'Which of those are coming up?',
        questionInterpretation({ intent: 'RECURRING_UPCOMING' }),
      );

      expect(resultOf(response)).toMatchObject([{ totalMinor: 180299, withinDays: 14 }]);
      expect(lastFacts()).toMatchObject({
        intent: 'RECURRING_UPCOMING',
        result: [
          {
            total: '€1,802.99',
            upcoming: [
              expect.objectContaining({ merchant: 'Cloud', nextExpectedDate: '2026-10-22' }),
              expect.objectContaining({ merchant: 'Landlord', nextExpectedDate: '2026-10-31' }),
            ],
          },
        ],
      });
    });

    it('answers "did anything change?" with increases, new and stopped commitments', async () => {
      await ask(
        fixture,
        'Did any subscription change or stop?',
        questionInterpretation({ intent: 'RECURRING_CHANGES' }),
      );

      expect(lastFacts()).toMatchObject({
        result: [
          {
            newCommitments: [expect.objectContaining({ merchant: 'Cloud' })],
            priceChanges: [
              expect.objectContaining({
                merchant: 'Streaming',
                priceChange: {
                  direction: 'INCREASE',
                  previousAmount: '€15.99',
                  currentAmount: '€18.99',
                  difference: '€3.00',
                  change: '18.76%',
                  effectiveDate: '2026-09-15',
                },
              }),
            ],
            stopped: [expect.objectContaining({ merchant: 'Old Gym', lastDate: '2026-07-05' })],
          },
        ],
      });
    });

    it('carries the recurring question into a follow-up that names nothing new', async () => {
      await ask(
        fixture,
        'How much do our recurring expenses cost?',
        questionInterpretation({ intent: 'RECURRING_EXPENSES' }),
      );
      const response = await ask(
        fixture,
        'And per year?',
        questionInterpretation({ inheritFromPrevious: ['INTENT', 'PERIOD'] }),
      );

      expect(response.outcome).toMatchObject({
        query: { status: 'ANSWERED', intent: 'RECURRING_EXPENSES' },
      });
      expect(lastFacts()).toMatchObject({ result: [{ annualEquivalent: '€21,923.76' }] });
    });

    it('answers from the engine when the model cannot write the reply', async () => {
      harness.provider.willFailToReply('UNAVAILABLE');

      const response = await ask(
        fixture,
        'How much are we committed to every month?',
        questionInterpretation({ intent: 'RECURRING_EXPENSES' }),
      );

      expect(response.reply).toContain('Here is what I found.');
      expect(response.reply).toContain('monthlyEquivalent: €1,826.98');
      expect(response.reply).toContain('annualEquivalent: €21,923.76');
    });

    it('discards a reply that states a recurring total the engine did not produce', async () => {
      harness.provider.willReply(
        'Your subscriptions cost €1,950.00 a month, about €23,400 a year.',
      );

      const response = await ask(
        fixture,
        'How much do subscriptions cost per month?',
        questionInterpretation({ intent: 'RECURRING_EXPENSES' }),
      );

      expect(response.reply).not.toContain('1,950');
      expect(response.reply).toContain('monthlyEquivalent: €1,826.98');
    });

    it('tells a household with no history that nothing recurs, without figures of its own', async () => {
      const empty = await createHouseholdFixture(testDatabase.database, 'Nothing Recurs', 1);

      const response = await ask(
        empty,
        'What subscriptions do we have?',
        questionInterpretation({ intent: 'RECURRING_EXPENSES' }),
      );

      expect(resultOf(response)).toEqual([
        {
          currency: 'EUR',
          monthlyEquivalentMinor: 0,
          annualEquivalentMinor: 0,
          commitments: [],
          stopped: [],
        },
      ]);
    });
  });

  describe('proactive events', () => {
    it('raises the new commitment, the price increase and the stopped one, once each', async () => {
      const fixture = await subscribedHousehold('Proactive Recurring');
      const address = await reachable(fixture);
      const proactive = proactiveWith();

      await proactive.evaluateHousehold(fixture.household.id, NOON);

      expect(sentTo(address).sort()).toEqual([
        'New recurring expense: Cloud\n€2.99 monthly, charged 3 times since 2026-07-22.',
        'Old Gym appears to have stopped\nUsually €35.00 monthly. Last charged on 2026-07-05, and nothing since it was expected on 2026-08-04.',
        'Streaming costs more\nNow €18.99, previously €15.99 (18.76% more), since 2026-09-15.',
      ]);
      expect(await notified(fixture)).toEqual({
        'NEW_RECURRING_EXPENSE New recurring expense: Cloud': 'SENT',
        'RECURRING_EXPENSE_STOPPED Old Gym appears to have stopped': 'SENT',
        'RECURRING_PRICE_INCREASE Streaming costs more': 'SENT',
        'RECURRING_EXPENSE_DUE Cloud is expected soon': 'SUPPRESSED',
        'RECURRING_EXPENSE Landlord recurs monthly': 'SUPPRESSED',
        'RECURRING_EXPENSE Licence recurs yearly': 'SUPPRESSED',
        'RECURRING_EXPENSE Streaming recurs monthly': 'SUPPRESSED',
      });
    });

    it('does not repeat them, inside the cooldown or long after it', async () => {
      const fixture = await subscribedHousehold('Proactive Repeat');
      const address = await reachable(fixture);
      const proactive = proactiveWith();

      for (const hours of [0, 1, 6, 13, 30, 24 * 6]) {
        await proactive.evaluateHousehold(
          fixture.household.id,
          new Date(NOON.getTime() + hours * HOUR),
        );
      }

      expect(sentTo(address)).toHaveLength(3);
    });

    it('does not announce every long-standing commitment', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Long Standing', 1);
      const address = await reachable(fixture);
      await charge(fixture, [
        {
          merchant: 'Landlord',
          category: 'Rent',
          amountMinor: 180000,
          dates: monthly('01', ['04', '05', '06', '07', '08', '09', '10']),
        },
        {
          merchant: 'Streaming',
          amountMinor: 1799,
          dates: monthly('03', ['04', '05', '06', '07', '08', '09', '10']),
        },
      ]);

      await proactiveWith().evaluateHousehold(fixture.household.id, NOON);

      expect(sentTo(address)).toEqual([]);
      expect(Object.values(await notified(fixture))).toEqual(['SUPPRESSED', 'SUPPRESSED']);
    });

    it('holds recurring events during quiet hours like any other notification', async () => {
      const fixture = await subscribedHousehold('Proactive Quiet');
      const address = await reachable(fixture);
      const proactive = proactiveWith();
      const lateNight = new Date('2026-10-20T23:30:00Z');

      await proactive.evaluateHousehold(fixture.household.id, lateNight);
      expect(sentTo(address)).toEqual([]);

      await proactive.evaluateHousehold(
        fixture.household.id,
        new Date(lateNight.getTime() + 10 * HOUR),
      );
      expect(sentTo(address)).toHaveLength(3);
    });

    it('notifies a later price increase as a new event', async () => {
      const fixture = await subscribedHousehold('Proactive Second Increase');
      const address = await reachable(fixture);
      const proactive = proactiveWith();
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      await charge(fixture, [
        { merchant: 'Streaming', amountMinor: 2299, dates: ['2026-11-15', '2026-12-15'] },
        {
          merchant: 'Landlord',
          category: 'Rent',
          amountMinor: 180000,
          dates: monthly('01', ['11', '12']),
        },
        { merchant: 'Cloud', amountMinor: 299, dates: monthly('22', ['10', '11']) },
      ]);

      await proactive.evaluateHousehold(fixture.household.id, new Date('2026-12-16T12:00:00Z'));

      expect(sentTo(address)).toContain(
        'Streaming costs more\nNow €22.99, previously €18.99 (21.06% more), since 2026-11-15.',
      );
    });

    it('sends the deterministic text when the model fails or invents a figure', async () => {
      const failing = await subscribedHousehold('Proactive Offline');
      const inventing = await subscribedHousehold('Proactive Inventing');
      const failingAddress = await reachable(failing);
      const inventingAddress = await reachable(inventing);

      harness.provider.willFailToReply('UNAVAILABLE');
      await proactiveWith(true).evaluateHousehold(failing.household.id, NOON);
      harness.provider.willReply('Your subscription went up by €5.00 to €20.99 a month.');
      await proactiveWith(true).evaluateHousehold(inventing.household.id, NOON);

      for (const address of [failingAddress, inventingAddress]) {
        expect(sentTo(address)).toContain(
          'Streaming costs more\nNow €18.99, previously €15.99 (18.76% more), since 2026-09-15.',
        );
        expect(sentTo(address).join('\n')).not.toContain('20.99');
      }
      expect(
        JSON.stringify(harness.provider.replyRequests.map((request) => request.facts)),
      ).not.toMatch(UUID);
    });

    it('sends recurring events only to the household they belong to', async () => {
      const first = await subscribedHousehold('Proactive Mine');
      const second = await createHouseholdFixture(testDatabase.database, 'Proactive Other', 3);
      const firstAddress = await reachable(first);
      const secondAddress = await reachable(second);
      const proactive = proactiveWith();

      await proactive.evaluateHousehold(first.household.id, NOON);
      await proactive.evaluateHousehold(second.household.id, NOON);

      expect(sentTo(firstAddress)).toHaveLength(3);
      expect(sentTo(secondAddress)).toEqual([]);
      expect(await notified(second)).toEqual({});
    });
  });
});
