import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { ConversationTurn } from '../ai/ai-provider.js';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import type { RequestContext } from '../households/request-context.js';
import { aiConversations, aiMessages } from './conversations.schema.js';

const RETAINED_MESSAGES = 20;

const CHANNELS = { whatsapp: 'WHATSAPP', web: 'WEB' } as const;

@Injectable()
export class ConversationsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async open(context: RequestContext): Promise<string> {
    const channel = CHANNELS[context.channel];
    const [existing] = await this.database
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.householdId, context.householdId),
          eq(aiConversations.memberId, context.memberId),
          eq(aiConversations.channel, channel),
        ),
      )
      .orderBy(desc(aiConversations.createdAt))
      .limit(1);
    if (existing !== undefined) {
      return existing.id;
    }
    const created = await this.database
      .insert(aiConversations)
      .values({ householdId: context.householdId, memberId: context.memberId, channel })
      .returning({ id: aiConversations.id });
    return requireRow(created).id;
  }

  async recentTurns(
    householdId: string,
    conversationId: string,
    limit: number,
  ): Promise<ConversationTurn[]> {
    const rows = await this.database
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(
        and(
          eq(aiConversations.householdId, householdId),
          eq(aiMessages.conversationId, conversationId),
        ),
      )
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(limit);
    return rows.reverse();
  }

  async append(
    conversationId: string,
    role: ConversationTurn['role'],
    content: string,
    sourceMessageId?: string,
  ): Promise<void> {
    await this.database
      .insert(aiMessages)
      .values({ conversationId, role, content, sourceMessageId: sourceMessageId ?? null });
    const retained = this.database
      .select({ id: aiMessages.id })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(RETAINED_MESSAGES);
    await this.database
      .delete(aiMessages)
      .where(
        and(eq(aiMessages.conversationId, conversationId), notInArray(aiMessages.id, retained)),
      );
  }
}
