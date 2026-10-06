import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, notInArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import type { RequestContext } from '../households/request-context.js';
import { CONVERSATION_POLICY } from './conversation-policy.js';
import { readConversationState, type ConversationState } from './conversation-state.js';
import { aiConversations, aiMessages } from './conversations.schema.js';

const CHANNELS = { whatsapp: 'WHATSAPP', web: 'WEB' } as const;

export type MessageRole = 'USER' | 'ASSISTANT';

export interface OpenConversation {
  readonly id: string;
  readonly state: ConversationState;
  readonly recentUserMessages: readonly string[];
}

@Injectable()
export class ConversationsRepository {
  private readonly policy = CONVERSATION_POLICY;

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async open(context: RequestContext, instant: Date): Promise<OpenConversation> {
    const scope = {
      householdId: context.householdId,
      memberId: context.memberId,
      channel: CHANNELS[context.channel],
    };
    const conversation = requireRow(
      await this.database
        .insert(aiConversations)
        .values(scope)
        .onConflictDoUpdate({
          target: [aiConversations.householdId, aiConversations.memberId, aiConversations.channel],
          set: { updatedAt: new Date() },
        })
        .returning(),
    );
    return {
      id: conversation.id,
      state: readConversationState(
        conversation.state,
        conversation.stateUpdatedAt,
        instant,
        this.policy.stateLifetimeInMinutes,
      ),
      recentUserMessages: await this.recentUserMessages(context.householdId, conversation.id),
    };
  }

  async append(
    conversationId: string,
    role: MessageRole,
    content: string,
    sourceMessageId?: string,
  ): Promise<void> {
    await this.database.insert(aiMessages).values({
      conversationId,
      role,
      content: content.slice(0, this.policy.maximumMessageLength),
      sourceMessageId: sourceMessageId ?? null,
    });
    const retained = this.database
      .select({ id: aiMessages.id })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(this.policy.retainedMessages);
    await this.database
      .delete(aiMessages)
      .where(
        and(eq(aiMessages.conversationId, conversationId), notInArray(aiMessages.id, retained)),
      );
  }

  async saveState(
    context: RequestContext,
    conversationId: string,
    state: ConversationState,
    instant: Date,
  ): Promise<void> {
    await this.database
      .update(aiConversations)
      .set({ state, stateUpdatedAt: instant })
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.householdId, context.householdId),
          eq(aiConversations.memberId, context.memberId),
        ),
      );
  }

  async recentSourceMessageIds(householdId: string, conversationId: string): Promise<string[]> {
    const rows = await this.database
      .select({ sourceMessageId: aiMessages.sourceMessageId })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(
        and(
          eq(aiConversations.householdId, householdId),
          eq(aiMessages.conversationId, conversationId),
          eq(aiMessages.role, 'USER'),
          isNotNull(aiMessages.sourceMessageId),
        ),
      )
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id));
    return rows.flatMap((row) => (row.sourceMessageId === null ? [] : [row.sourceMessageId]));
  }

  private async recentUserMessages(householdId: string, conversationId: string): Promise<string[]> {
    const rows = await this.database
      .select({ content: aiMessages.content })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(
        and(
          eq(aiConversations.householdId, householdId),
          eq(aiMessages.conversationId, conversationId),
          eq(aiMessages.role, 'USER'),
        ),
      )
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(this.policy.recentUserMessages);
    return rows.map((row) => row.content).reverse();
  }
}
