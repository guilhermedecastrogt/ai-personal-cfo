import { eq } from 'drizzle-orm';
import { aiConversations, aiMessages } from '../src/conversation/conversations.schema.js';
import { requireRow } from '../src/database/require-row.js';
import { insights } from '../src/insights/insights.schema.js';
import { recurringExpenses } from '../src/recurring-expenses/recurring-expenses.schema.js';
import { monthlyReports } from '../src/reports/monthly-reports.schema.js';
import { webhookEvents } from '../src/whatsapp/webhook-events.schema.js';
import { createHouseholdFixture, memberAt } from './support/household-fixture.js';
import {
  createTestDatabase,
  violatedConstraint,
  type TestDatabase,
} from './support/test-database.js';

describe('supporting records', () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  describe('webhook events', () => {
    it('accept a provider event identifier only once', async () => {
      const event = { provider: 'kapso', externalEventId: 'event-1' };
      await testDatabase.database.insert(webhookEvents).values(event);

      const constraint = await violatedConstraint(
        testDatabase.database.insert(webhookEvents).values(event),
      );

      expect(constraint).toBe('webhook_events_provider_external_event_id_unique');
    });

    it('report a redelivery as nothing inserted when conflicts are ignored', async () => {
      const event = { provider: 'kapso', externalEventId: 'event-2' };

      const first = await testDatabase.database
        .insert(webhookEvents)
        .values(event)
        .onConflictDoNothing()
        .returning();
      const redelivery = await testDatabase.database
        .insert(webhookEvents)
        .values(event)
        .onConflictDoNothing()
        .returning();

      expect(first).toHaveLength(1);
      expect(first[0]?.status).toBe('RECEIVED');
      expect(redelivery).toEqual([]);
    });

    it('treat the same identifier from another provider as a different event', async () => {
      await testDatabase.database
        .insert(webhookEvents)
        .values({ provider: 'kapso', externalEventId: 'event-3' });

      const constraint = await violatedConstraint(
        testDatabase.database
          .insert(webhookEvents)
          .values({ provider: 'another-provider', externalEventId: 'event-3' }),
      );

      expect(constraint).toBe('none');
    });
  });

  describe('insights', () => {
    it('belong to a household and may name one of its members', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Insight', 3);

      const [householdInsight, memberInsight] = await testDatabase.database
        .insert(insights)
        .values([
          {
            householdId: fixture.household.id,
            type: 'BUDGET_WARNING',
            severity: 'MEDIUM',
            title: 'Restaurant budget at 80%',
          },
          {
            householdId: fixture.household.id,
            memberId: memberAt(fixture, 2).id,
            type: 'SPENDING_TREND',
            severity: 'LOW',
            title: 'Transport spending increased',
            payload: { changePercent: 38 },
          },
        ])
        .returning();

      expect(householdInsight).toMatchObject({ memberId: null, status: 'PENDING', payload: {} });
      expect(memberInsight).toMatchObject({
        memberId: memberAt(fixture, 2).id,
        payload: { changePercent: 38 },
      });
    });

    it('cannot name a member of another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Insight First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Insight Second', 1);

      const constraint = await violatedConstraint(
        testDatabase.database.insert(insights).values({
          householdId: first.household.id,
          memberId: memberAt(second, 0).id,
          type: 'ANOMALY',
          severity: 'HIGH',
          title: 'Unusual purchase',
        }),
      );

      expect(constraint).toBe('insights_member_fk');
    });
  });

  describe('recurring expenses', () => {
    it('start as observed and cannot name a member of another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Recurring First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Recurring Second', 1);
      const subscription = {
        householdId: first.household.id,
        name: 'Streaming Service',
        amountMinor: 1799,
        currency: 'EUR',
        frequency: 'MONTHLY',
      } as const;

      const observed = requireRow(
        await testDatabase.database.insert(recurringExpenses).values(subscription).returning(),
      );
      const constraint = await violatedConstraint(
        testDatabase.database
          .insert(recurringExpenses)
          .values({ ...subscription, memberId: memberAt(second, 0).id }),
      );

      expect(observed.status).toBe('OBSERVED');
      expect(constraint).toBe('recurring_expenses_member_fk');
    });
  });

  describe('monthly reports', () => {
    it('exist once per household, month and currency', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Report First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Report Second', 1);
      const october = { year: 2026, month: 10, currency: 'EUR', content: { incomeMinor: 450000 } };
      await testDatabase.database
        .insert(monthlyReports)
        .values({ ...october, householdId: first.household.id });

      expect(
        await violatedConstraint(
          testDatabase.database
            .insert(monthlyReports)
            .values({ ...october, householdId: first.household.id }),
        ),
      ).toBe('monthly_reports_household_year_month_currency_unique');
      expect(
        await violatedConstraint(
          testDatabase.database
            .insert(monthlyReports)
            .values({ ...october, householdId: second.household.id }),
        ),
      ).toBe('none');
    });

    it('reject a month outside the calendar', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Report Month', 1);

      const constraint = await violatedConstraint(
        testDatabase.database.insert(monthlyReports).values({
          householdId: fixture.household.id,
          year: 2026,
          month: 13,
          currency: 'EUR',
          content: {},
        }),
      );

      expect(constraint).toBe('monthly_reports_month_range');
    });
  });

  describe('conversations', () => {
    it('belong to a member of the household and keep their messages in order', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Conversation', 2);
      const conversation = requireRow(
        await testDatabase.database
          .insert(aiConversations)
          .values({
            householdId: fixture.household.id,
            memberId: memberAt(fixture, 1).id,
            channel: 'WHATSAPP',
          })
          .returning(),
      );
      await testDatabase.database.insert(aiMessages).values([
        { conversationId: conversation.id, role: 'USER', content: 'I spent 23 at the shop' },
        { conversationId: conversation.id, role: 'ASSISTANT', content: 'Registered.' },
      ]);

      const messages = await testDatabase.database
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversation.id));

      expect(messages.map((message) => message.role).sort()).toEqual(['ASSISTANT', 'USER']);
    });

    it('cannot be opened for a member of another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Conversation First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Conversation Second', 1);

      const constraint = await violatedConstraint(
        testDatabase.database.insert(aiConversations).values({
          householdId: first.household.id,
          memberId: memberAt(second, 0).id,
          channel: 'WHATSAPP',
        }),
      );

      expect(constraint).toBe('ai_conversations_member_fk');
    });
  });
});
