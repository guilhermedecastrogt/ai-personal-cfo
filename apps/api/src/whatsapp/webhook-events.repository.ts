import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { webhookEvents } from './webhook-events.schema.js';

export type WebhookEventOutcome = 'PROCESSED' | 'IGNORED' | 'FAILED';

@Injectable()
export class WebhookEventsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async claim(provider: string, externalEventId: string): Promise<boolean> {
    const inserted = await this.database
      .insert(webhookEvents)
      .values({ provider, externalEventId })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    return inserted.length === 1;
  }

  async complete(
    provider: string,
    externalEventId: string,
    outcome: WebhookEventOutcome,
  ): Promise<void> {
    await this.database
      .update(webhookEvents)
      .set({ status: outcome, processedAt: new Date() })
      .where(
        and(
          eq(webhookEvents.provider, provider),
          eq(webhookEvents.externalEventId, externalEventId),
        ),
      );
  }
}
