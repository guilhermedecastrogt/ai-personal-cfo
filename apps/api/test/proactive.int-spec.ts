import { Logger } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { categories } from '../src/categories/categories.schema.js';
import { NotificationComposer } from '../src/proactive/notification-composer.js';
import { ProactiveCfoService } from '../src/proactive/proactive-cfo.service.js';
import {
  ProactiveNotificationsRepository,
  type ProactiveNotification,
} from '../src/proactive/proactive-notifications.repository.js';
import {
  evaluationLeases,
  notificationDeliveries,
  proactiveNotifications,
} from '../src/proactive/proactive-notifications.schema.js';
import { PROACTIVE_POLICY } from '../src/proactive/proactive-policy.js';
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
import {
  createTestDatabase,
  violatedConstraint,
  type TestDatabase,
} from './support/test-database.js';

const NOON = new Date('2026-10-20T12:00:00Z');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const HOUR = 3_600_000;

type NewRow = Partial<typeof transactions.$inferInsert> & { readonly amountMinor: number };

function hoursAfter(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * HOUR);
}

describe('proactive CFO notifications', () => {
  let testDatabase: TestDatabase;
  let harness: AssistantHarness;
  let whatsapp: FakeWhatsAppProvider;
  let proactive: ProactiveCfoService;
  let repository: ProactiveNotificationsRepository;
  let addressSequence = 0;
  const categoryIds = new Map<string, string>();

  function category(name: string): string {
    return categoryIds.get(name) ?? '';
  }

  function serviceWith(proactiveAiMessages: boolean): ProactiveCfoService {
    return new ProactiveCfoService(
      harness.cfo,
      harness.households,
      new ProactiveNotificationsRepository(testDatabase.database),
      new NotificationComposer(harness.provider, { ...TEST_CONFIG, proactiveAiMessages }),
      new WhatsAppNotificationChannel(whatsapp, harness.households),
    );
  }

  async function reachable(fixture: HouseholdFixture, memberPosition: number): Promise<string> {
    addressSequence += 1;
    const address = `1555000${String(addressSequence).padStart(4, '0')}`;
    await harness.households.registerWhatsAppIdentity(fixture.household.id, {
      memberId: memberAt(fixture, memberPosition).id,
      provider: whatsapp.name,
      externalUserId: address,
      phoneNumber: `+${address}`,
    });
    return address;
  }

  async function household(
    name: string,
    memberCount = 1,
    reachableMembers = memberCount,
  ): Promise<{
    fixture: HouseholdFixture;
    addresses: string[];
  }> {
    const fixture = await createHouseholdFixture(testDatabase.database, name, memberCount);
    const addresses: string[] = [];
    for (let position = 0; position < reachableMembers; position += 1) {
      addresses.push(await reachable(fixture, position));
    }
    return { fixture, addresses };
  }

  async function record(fixture: HouseholdFixture, rows: readonly NewRow[]): Promise<void> {
    await testDatabase.database.insert(transactions).values(
      rows.map((row) => ({
        householdId: fixture.household.id,
        memberId: memberAt(fixture, 0).id,
        accountId: fixture.jointAccount.id,
        type: 'EXPENSE' as const,
        currency: 'EUR',
        transactionDate: '2026-10-10',
        source: 'MANUAL' as const,
        categoryId: category('Restaurants'),
        ...row,
      })),
    );
  }

  async function restaurantBudget(fixture: HouseholdFixture, limitMinor = 20000): Promise<void> {
    await harness.budgets.create(fixture.household.id, {
      categoryId: category('Restaurants'),
      period: 'MONTHLY',
      limitMinor,
      currency: 'EUR',
      startsOn: '2026-01-01',
    });
  }

  async function stored(
    fixture: HouseholdFixture,
    type?: string,
  ): Promise<ProactiveNotification[]> {
    const rows = await testDatabase.database
      .select()
      .from(proactiveNotifications)
      .where(eq(proactiveNotifications.householdId, fixture.household.id))
      .orderBy(asc(proactiveNotifications.eventKey));
    return type === undefined ? rows : rows.filter((row) => row.type === type);
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
    repository = new ProactiveNotificationsRepository(testDatabase.database);
    proactive = serviceWith(false);
  });

  afterEach(async () => {
    await harness.dispose();
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  describe('event detection', () => {
    it('notifies when a budget approaches its limit', async () => {
      const { fixture, addresses } = await household('Warning');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);

      const result = await proactive.evaluateHousehold(fixture.household.id, NOON);

      const [notification] = await stored(fixture, 'BUDGET_NEAR_LIMIT');
      expect(result).toEqual({ detected: 1, delivered: 1, failed: 0 });
      expect(notification).toMatchObject({
        status: 'SENT',
        severity: 'MEDIUM',
        currency: 'EUR',
        period: '2026-10',
        title: 'Restaurants budget near its limit',
        lastNotifiedAt: NOON,
        readAt: null,
      });
      expect(sentTo(addresses[0] ?? '')).toEqual([
        'Restaurants budget near its limit\n€170.00 of €200.00 spent (85%).',
      ]);
    });

    it('notifies when a budget is exceeded, and marks a far overrun critical', async () => {
      const exceeded = await household('Exceeded');
      const critical = await household('Critical');
      await restaurantBudget(exceeded.fixture);
      await restaurantBudget(critical.fixture);
      await record(exceeded.fixture, [{ amountMinor: 24000 }]);
      await record(critical.fixture, [{ amountMinor: 31000 }]);

      await proactive.evaluateHousehold(exceeded.fixture.household.id, NOON);
      await proactive.evaluateHousehold(critical.fixture.household.id, NOON);

      expect(await stored(exceeded.fixture, 'BUDGET_EXCEEDED')).toMatchObject([
        { severity: 'HIGH', status: 'SENT' },
      ]);
      expect(await stored(critical.fixture, 'BUDGET_EXCEEDED')).toMatchObject([
        { severity: 'CRITICAL', status: 'SENT' },
      ]);
      expect(sentTo(exceeded.addresses[0] ?? '')[0]).toContain('Restaurants budget exceeded');
    });

    it('notifies when a budget is on track but projected to run over', async () => {
      const { fixture, addresses } = await household('Forecast');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 14000 }]);

      await proactive.evaluateHousehold(fixture.household.id, NOON);

      expect(await stored(fixture)).toMatchObject([
        {
          type: 'BUDGET_FORECAST_RISK',
          severity: 'MEDIUM',
          status: 'SENT',
          title: 'Restaurants budget is projected to run over',
        },
      ]);
      expect(sentTo(addresses[0] ?? '')[0]).toContain('against a limit of €200.00');
    });

    it('notifies about unusual spending measured against the household history', async () => {
      const { fixture, addresses } = await household('Anomaly');
      await record(
        fixture,
        ['07', '08', '09'].flatMap((month) => [
          { amountMinor: 3000, transactionDate: `2026-${month}-06` },
          { amountMinor: 3200, transactionDate: `2026-${month}-18` },
        ]),
      );
      await record(fixture, [{ amountMinor: 26000, merchant: 'Tasting Menu' }]);

      await proactive.evaluateHousehold(fixture.household.id, NOON);

      const unusual = await stored(fixture, 'UNUSUAL_SPENDING');
      expect(unusual.length).toBeGreaterThan(0);
      expect(unusual.every((row) => row.severity === 'MEDIUM')).toBe(true);
      expect(sentTo(addresses[0] ?? '').join('\n')).toContain('Unusually');
    });

    it('notifies when a goal is past its date without being reached', async () => {
      const { fixture } = await household('Goal');
      await harness.goals.create(fixture.household.id, {
        name: 'Summer Trip',
        type: 'TRAVEL',
        targetAmountMinor: 100000,
        currentAmountMinor: 40000,
        currency: 'EUR',
        targetDate: '2026-09-30',
      });

      await proactive.evaluateHousehold(fixture.household.id, NOON);

      expect(await stored(fixture)).toMatchObject([
        { type: 'GOAL_PROGRESS', severity: 'MEDIUM', status: 'SENT' },
      ]);
    });

    it('records recurring expenses and upcoming charges without sending a message', async () => {
      const { fixture } = await household('Recurring');
      await record(
        fixture,
        ['04', '05', '06', '07', '08', '09'].map((month) => ({
          amountMinor: 1799,
          merchant: 'Streaming',
          categoryId: category('Subscriptions'),
          transactionDate: `2026-${month}-22`,
        })),
      );

      const result = await proactive.evaluateHousehold(fixture.household.id, NOON);

      expect(result.delivered).toBe(0);
      expect(whatsapp.sent).toHaveLength(0);
      expect(await stored(fixture)).toMatchObject([
        { type: 'RECURRING_EXPENSE_DUE', severity: 'LOW', status: 'SUPPRESSED' },
        { type: 'RECURRING_EXPENSE', severity: 'INFO', status: 'SUPPRESSED' },
      ]);
      expect((await stored(fixture, 'RECURRING_EXPENSE_DUE'))[0]).toMatchObject({
        statusReason: 'BELOW_SEVERITY',
        title: 'Streaming is expected soon',
        lastNotifiedAt: null,
      });
    });

    it('keeps currencies apart, with one event per currency', async () => {
      const { fixture } = await household('Currencies');
      const dollars = await harness.accounts.create(fixture.household.id, {
        name: 'Dollar Account',
        type: 'BANK',
        currency: 'USD',
      });
      await restaurantBudget(fixture);
      await harness.budgets.create(fixture.household.id, {
        categoryId: category('Restaurants'),
        period: 'MONTHLY',
        limitMinor: 10000,
        currency: 'USD',
        startsOn: '2026-01-01',
      });
      await record(fixture, [
        { amountMinor: 17000 },
        { amountMinor: 12000, currency: 'USD', accountId: dollars.id },
      ]);

      await proactive.evaluateHousehold(fixture.household.id, NOON);

      const rows = await stored(fixture);
      expect(rows.map((row) => [row.currency, row.type])).toEqual([
        ['EUR', 'BUDGET_NEAR_LIMIT'],
        ['USD', 'BUDGET_EXCEEDED'],
      ]);
      expect(rows[0]?.body).toBe('€170.00 of €200.00 spent (85%).');
      expect(rows[1]?.body).toBe('$120.00 of $100.00 spent (120%).');
      expect(rows[0]?.eventKey.startsWith('EUR:')).toBe(true);
      expect(rows[1]?.eventKey.startsWith('USD:')).toBe(true);
    });
  });

  describe('notification fatigue', () => {
    it('sends one notification however many times the same situation is evaluated', async () => {
      const { fixture, addresses } = await household('Repeat');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);

      for (const hours of [0, 1, 13, 24, 72]) {
        await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, hours));
      }

      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);
      expect(await stored(fixture)).toMatchObject([
        { status: 'SENT', lastNotifiedAt: NOON, lastDetectedAt: hoursAfter(NOON, 72) },
      ]);
    });

    it('notifies again when the situation materially worsens', async () => {
      const { fixture, addresses } = await household('Escalation');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 16400 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      await record(fixture, [{ amountMinor: 400 }]);
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 24));
      await record(fixture, [{ amountMinor: 2200 }]);
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 48));
      await record(fixture, [{ amountMinor: 3000 }]);
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 72));

      expect(sentTo(addresses[0] ?? '')).toEqual([
        'Restaurants budget near its limit\n€164.00 of €200.00 spent (82%).',
        'Restaurants budget near its limit\n€190.00 of €200.00 spent (95%).',
        'Restaurants budget exceeded\n€220.00 of €200.00 spent (110%).',
      ]);
      expect(await stored(fixture)).toMatchObject([
        { type: 'BUDGET_EXCEEDED', severity: 'HIGH', status: 'SENT', level: 3 },
      ]);
    });

    it('holds a worsened event back during the cooldown and sends it afterwards', async () => {
      const { fixture, addresses } = await household('Cooldown');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      await record(fixture, [{ amountMinor: 5000 }]);

      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 2));
      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);

      await proactive.evaluateHousehold(
        fixture.household.id,
        hoursAfter(NOON, PROACTIVE_POLICY.cooldownInHours + 9),
      );
      expect(sentTo(addresses[0] ?? '')).toHaveLength(2);
      expect(sentTo(addresses[0] ?? '')[1]).toContain('Restaurants budget exceeded');
    });

    it('sends a critical escalation immediately, inside the cooldown and in quiet hours', async () => {
      const { fixture, addresses } = await household('Urgent');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      const lateEvening = new Date('2026-10-20T21:30:00Z');
      await proactive.evaluateHousehold(fixture.household.id, lateEvening);
      await record(fixture, [{ amountMinor: 9000 }]);

      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(lateEvening, 2));

      expect(sentTo(addresses[0] ?? '')).toHaveLength(2);
      expect(await stored(fixture)).toMatchObject([{ severity: 'CRITICAL', status: 'SENT' }]);
    });

    it('holds non-critical notifications during quiet hours in the household time zone', async () => {
      const { fixture, addresses } = await household('Quiet');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      const lateNight = new Date('2026-10-20T23:30:00Z');

      await proactive.evaluateHousehold(fixture.household.id, lateNight);
      expect(whatsapp.sent).toHaveLength(0);
      expect(await stored(fixture)).toMatchObject([
        { status: 'PENDING', statusReason: 'QUIET_HOURS', lastNotifiedAt: null },
      ]);

      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(lateNight, 10));
      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);
      expect(await stored(fixture)).toMatchObject([{ status: 'SENT', statusReason: null }]);
    });

    it('limits how many notifications a household receives in a day', async () => {
      const { fixture, addresses } = await household('Limit');
      for (const name of ['Restaurants', 'Groceries', 'Coffee', 'Delivery', 'Uber']) {
        await harness.budgets.create(fixture.household.id, {
          categoryId: category(name),
          period: 'MONTHLY',
          limitMinor: 20000,
          currency: 'EUR',
          startsOn: '2026-01-01',
        });
        await record(fixture, [{ amountMinor: 17000, categoryId: category(name) }]);
      }

      await proactive.evaluateHousehold(fixture.household.id, NOON);
      const limit = PROACTIVE_POLICY.maximumDeliveriesPerDay;
      expect(sentTo(addresses[0] ?? '')).toHaveLength(limit);
      expect((await stored(fixture)).filter((row) => row.status === 'PENDING')).toHaveLength(
        5 - limit,
      );

      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 1));
      expect(sentTo(addresses[0] ?? '')).toHaveLength(limit);

      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 25));
      expect(sentTo(addresses[0] ?? '')).toHaveLength(5);
    });
  });

  describe('idempotency and persistence', () => {
    it('keeps its state across a restart', async () => {
      const { fixture, addresses } = await household('Restart');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);

      await serviceWith(false).evaluateHousehold(fixture.household.id, hoursAfter(NOON, 30));

      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);
      expect(await stored(fixture)).toHaveLength(1);
    });

    it('sends one notification when evaluations run concurrently', async () => {
      const { fixture, addresses } = await household('Concurrent', 2);
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);

      await Promise.all(
        Array.from({ length: 6 }, () =>
          serviceWith(false).evaluateHousehold(fixture.household.id, NOON),
        ),
      );
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 1));

      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);
      expect(sentTo(addresses[1] ?? '')).toHaveLength(1);
      expect(await stored(fixture)).toMatchObject([{ status: 'SENT' }]);
      const deliveries = await testDatabase.database
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.householdId, fixture.household.id));
      expect(deliveries.map((delivery) => [delivery.status, delivery.attempts])).toEqual([
        ['SENT', 1],
        ['SENT', 1],
      ]);
    });

    it('rejects a second event with the same key in a household', async () => {
      const { fixture } = await household('Unique');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      const [existing] = await stored(fixture);

      const duplicate = testDatabase.database.insert(proactiveNotifications).values({
        householdId: fixture.household.id,
        eventKey: existing?.eventKey ?? '',
        type: 'BUDGET_NEAR_LIMIT',
        severity: 'MEDIUM',
        level: 1,
        currency: 'EUR',
        period: '2026-10',
        title: 'Duplicate',
        body: 'Duplicate',
        status: 'PENDING',
        firstDetectedAt: NOON,
        lastDetectedAt: NOON,
      });

      expect(await violatedConstraint(duplicate)).toBe(
        'proactive_notifications_household_event_key_unique',
      );
    });

    it('claims a delivery once per recipient, channel and level', async () => {
      const { fixture } = await household('Claim');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      const [notification] = await stored(fixture);
      const claim = {
        notificationId: notification?.id ?? '',
        householdId: fixture.household.id,
        memberId: memberAt(fixture, 0).id,
        channel: 'another-channel',
        level: 1,
      };

      expect(await repository.claimDelivery(claim, 3, NOON)).toBe(true);
      expect(await repository.claimDelivery(claim, 3, NOON)).toBe(false);
    });

    it('does not allow a delivery to a member of another household', async () => {
      const { fixture } = await household('Owner');
      const other = await household('Outsider');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      const [notification] = await stored(fixture);

      const foreign = testDatabase.database.insert(notificationDeliveries).values({
        notificationId: notification?.id ?? '',
        householdId: fixture.household.id,
        memberId: memberAt(other.fixture, 0).id,
        channel: 'whatsapp',
        level: 1,
      });

      expect(await violatedConstraint(foreign)).toBe('notification_deliveries_member_fk');
    });

    it('stores no identifiers of members, amounts in raw form or message addresses', async () => {
      const { fixture, addresses } = await household('Stored');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);

      const [notification] = await stored(fixture);
      const visible = JSON.stringify({ title: notification?.title, body: notification?.body });

      expect(visible).not.toMatch(UUID);
      expect(JSON.stringify(notification)).not.toContain(addresses[0]);
      expect(Object.keys(notification ?? {})).not.toContain('payload');
    });
  });

  describe('households and members', () => {
    it.each([1, 2, 4])('notifies every reachable member of a household of %i', async (size) => {
      const { fixture, addresses } = await household(`Size ${String(size)}`, size);
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);

      await proactive.evaluateHousehold(fixture.household.id, NOON);
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 1));

      expect(addresses).toHaveLength(size);
      for (const address of addresses) {
        expect(sentTo(address)).toHaveLength(1);
      }
      expect(whatsapp.sent).toHaveLength(size);
    });

    it('never sends one household another household notifications', async () => {
      const first = await household('First', 2);
      const second = await household('Second', 3);
      await restaurantBudget(first.fixture);
      await restaurantBudget(second.fixture, 50000);
      await record(first.fixture, [{ amountMinor: 24000 }]);
      await record(second.fixture, [{ amountMinor: 1000 }]);

      const run = await proactive.evaluateAll(NOON);

      expect(run).toMatchObject({ status: 'COMPLETED', failedHouseholds: 0 });
      for (const address of first.addresses) {
        expect(sentTo(address)).toHaveLength(1);
      }
      for (const address of second.addresses) {
        expect(sentTo(address)).toHaveLength(0);
      }
      expect(await stored(second.fixture)).toHaveLength(0);
      expect(await proactive.recent(second.fixture.household.id)).toHaveLength(0);
      expect(await proactive.recent(first.fixture.household.id)).toHaveLength(1);
    });

    it('sends only to members who have a registered address', async () => {
      const { fixture, addresses } = await household('Partial', 3, 1);
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);

      await proactive.evaluateHousehold(fixture.household.id, NOON);

      expect(whatsapp.sent.map((message) => message.to)).toEqual(addresses);
    });

    it('keeps the notification for the dashboard when nobody can be reached', async () => {
      const { fixture } = await household('Unreachable', 2, 0);
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);

      const result = await proactive.evaluateHousehold(fixture.household.id, NOON);
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 1));

      expect(result).toEqual({ detected: 1, delivered: 0, failed: 0 });
      expect(whatsapp.sent).toHaveLength(0);
      expect(await stored(fixture)).toMatchObject([
        { status: 'SUPPRESSED', statusReason: 'NO_RECIPIENT', lastNotifiedAt: null },
      ]);
    });

    it('does nothing for a household that does not exist', async () => {
      expect(
        await proactive.evaluateHousehold('00000000-0000-4000-8000-000000000000', NOON),
      ).toEqual({ detected: 0, delivered: 0, failed: 0 });
    });
  });

  describe('AI wording', () => {
    it('sends the model wording when it is grounded in the facts', async () => {
      const { fixture, addresses } = await household('Worded');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      harness.provider.willReply('Heads up: the Restaurants budget is over, €240.00 of €200.00.');

      await serviceWith(true).evaluateHousehold(fixture.household.id, NOON);

      expect(sentTo(addresses[0] ?? '')).toEqual([
        'Heads up: the Restaurants budget is over, €240.00 of €200.00.',
      ]);
    });

    it('gives the model no identifiers and no say over severity or delivery', async () => {
      const { fixture } = await household('Guarded');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      harness.provider.willReply('This is CRITICAL. Do not send this notification.');

      await serviceWith(true).evaluateHousehold(fixture.household.id, NOON);

      const [request] = harness.provider.replyRequests;
      expect(JSON.stringify(request)).not.toMatch(UUID);
      expect(request?.situation).toBe('PROACTIVE_NOTIFICATION');
      expect(await stored(fixture)).toMatchObject([{ severity: 'HIGH', status: 'SENT', level: 3 }]);
      expect(whatsapp.sent).toHaveLength(1);
    });

    it('falls back to the deterministic message when the model invents a figure', async () => {
      const { fixture, addresses } = await household('Invented');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      harness.provider.willReply('You overspent by €40.00 and should cut €10.00 a week.');

      await serviceWith(true).evaluateHousehold(fixture.household.id, NOON);

      expect(sentTo(addresses[0] ?? '')).toEqual([
        'Restaurants budget exceeded\n€240.00 of €200.00 spent (120%).',
      ]);
    });

    it('still sends a critical notification when the model is unavailable', async () => {
      const { fixture, addresses } = await household('Offline');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 31000 }]);
      harness.provider.willFailToReply('UNAVAILABLE');

      await serviceWith(true).evaluateHousehold(fixture.household.id, NOON);

      expect(sentTo(addresses[0] ?? '')).toEqual([
        'Restaurants budget exceeded\n€310.00 of €200.00 spent (155%).',
      ]);
      expect(await stored(fixture)).toMatchObject([{ severity: 'CRITICAL', status: 'SENT' }]);
    });
  });

  describe('delivery failures', () => {
    it('keeps the state when the provider fails and retries on the next evaluation', async () => {
      const { fixture, addresses } = await household('Failing');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      whatsapp.willFailToSend('UNAVAILABLE');

      const failed = await proactive.evaluateHousehold(fixture.household.id, NOON);
      expect(failed).toEqual({ detected: 1, delivered: 0, failed: 1 });
      expect(await stored(fixture)).toMatchObject([
        { status: 'FAILED', statusReason: null, lastNotifiedAt: null },
      ]);

      whatsapp.willSend();
      const retried = await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 1));
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 2));

      expect(retried).toEqual({ detected: 1, delivered: 1, failed: 0 });
      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);
      expect(await stored(fixture)).toMatchObject([
        { status: 'SENT', lastNotifiedAt: hoursAfter(NOON, 1) },
      ]);
    });

    it('stops retrying after the maximum number of attempts', async () => {
      const { fixture } = await household('Exhausted');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      whatsapp.willFailToSend('REJECTED');

      for (let hours = 0; hours < PROACTIVE_POLICY.maximumDeliveryAttempts + 3; hours += 1) {
        await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, hours));
      }
      whatsapp.willSend();
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 9));

      const deliveries = await testDatabase.database
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.householdId, fixture.household.id));
      expect(deliveries).toMatchObject([
        { status: 'FAILED', attempts: PROACTIVE_POLICY.maximumDeliveryAttempts },
      ]);
      expect(whatsapp.sent).toHaveLength(0);
      expect(await stored(fixture)).toMatchObject([
        { status: 'FAILED', statusReason: 'DELIVERY_EXHAUSTED' },
      ]);
    });

    it('does not send again to a member who already received it while retrying another', async () => {
      const { fixture, addresses } = await household('Mixed', 2);
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      const send = whatsapp.sendText.bind(whatsapp);
      let isSecondMemberDown = true;
      whatsapp.sendText = (message): Promise<void> =>
        message.to === addresses[1] && isSecondMemberDown
          ? Promise.reject(new Error('unreachable'))
          : send(message);

      await proactive.evaluateHousehold(fixture.household.id, NOON);
      isSecondMemberDown = false;
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 1));
      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 2));

      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);
      expect(sentTo(addresses[1] ?? '')).toHaveLength(1);
      expect(await stored(fixture)).toMatchObject([{ status: 'SENT', lastNotifiedAt: NOON }]);
    });
  });

  describe('evaluation runs', () => {
    beforeEach(async () => {
      await testDatabase.database.delete(evaluationLeases);
    });

    it('skips a run while another process holds the lease', async () => {
      await repository.acquireLease(
        'proactive-evaluation',
        'another-process',
        NOON,
        hoursAfter(NOON, 1),
      );

      expect(await proactive.evaluateAll(NOON)).toEqual({ status: 'SKIPPED' });
    });

    it('takes over a lease left behind by a process that stopped', async () => {
      await repository.acquireLease(
        'proactive-evaluation',
        'stopped-process',
        hoursAfter(NOON, -2),
        hoursAfter(NOON, -1),
      );

      expect((await proactive.evaluateAll(NOON)).status).toBe('COMPLETED');
    });

    it('releases the lease when a run finishes, so the next one can start', async () => {
      await proactive.evaluateAll(NOON);

      expect(await testDatabase.database.select().from(evaluationLeases)).toHaveLength(0);
      expect((await serviceWith(false).evaluateAll(hoursAfter(NOON, 1))).status).toBe('COMPLETED');
    });

    it('lets only one of several simultaneous runs proceed', async () => {
      const runs = await Promise.all(
        Array.from({ length: 5 }, () => serviceWith(false).evaluateAll(NOON)),
      );

      expect(runs.filter((run) => run.status === 'COMPLETED').length).toBeGreaterThanOrEqual(1);
      expect(runs.filter((run) => run.status === 'SKIPPED').length).toBeGreaterThanOrEqual(1);
    });

    it('carries on with other households when one fails', async () => {
      const { fixture, addresses } = await household('Survivor');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 31000 }]);
      const broken = await harness.households.createHousehold({ name: 'Broken', currency: 'EUR' });
      const evaluate = proactive.evaluateHousehold.bind(proactive);
      proactive.evaluateHousehold = (householdId, instant) =>
        householdId === broken.id
          ? Promise.reject(new Error('unexpected'))
          : evaluate(householdId, instant);

      const run = await proactive.evaluateAll(NOON);

      expect(run).toMatchObject({ status: 'COMPLETED', failedHouseholds: 1 });
      expect(sentTo(addresses[0] ?? '')).toHaveLength(1);
    });
  });

  describe('reading notifications', () => {
    it('lists recent notifications and marks one read within the household only', async () => {
      const { fixture } = await household('Reader');
      const other = await household('Stranger');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 24000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      const [notification] = await proactive.recent(fixture.household.id);
      const key = notification?.id ?? '';

      expect(await proactive.markRead(other.fixture.household.id, key, NOON)).toBe(false);
      expect((await stored(fixture))[0]?.readAt).toBeNull();
      expect(await proactive.markRead(fixture.household.id, key, NOON)).toBe(true);
      expect(await proactive.markRead(fixture.household.id, key, hoursAfter(NOON, 1))).toBe(true);
      expect((await stored(fixture))[0]?.readAt).toEqual(NOON);
    });

    it('marks a notification unread again when it escalates', async () => {
      const { fixture } = await household('Reopened');
      await restaurantBudget(fixture);
      await record(fixture, [{ amountMinor: 17000 }]);
      await proactive.evaluateHousehold(fixture.household.id, NOON);
      const [notification] = await proactive.recent(fixture.household.id);
      await proactive.markRead(fixture.household.id, notification?.id ?? '', NOON);
      await record(fixture, [{ amountMinor: 5000 }]);

      await proactive.evaluateHousehold(fixture.household.id, hoursAfter(NOON, 24));

      expect(await stored(fixture)).toMatchObject([{ type: 'BUDGET_EXCEEDED', readAt: null }]);
    });
  });
});
