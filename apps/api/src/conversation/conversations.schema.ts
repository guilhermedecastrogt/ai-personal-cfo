import { foreignKey, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { auditTimestamps, creationTimestamp, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';

export const conversationChannel = pgEnum('conversation_channel', ['WHATSAPP', 'WEB']);

export const messageRole = pgEnum('message_role', ['USER', 'ASSISTANT']);

export const aiConversations = pgTable(
  'ai_conversations',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    memberId: uuid('member_id').notNull(),
    channel: conversationChannel('channel').notNull(),
    ...auditTimestamps,
  },
  (table) => [
    foreignKey({
      name: 'ai_conversations_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    index('ai_conversations_household_member_index').on(table.householdId, table.memberId),
  ],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    ...identifier,
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    sourceMessageId: text('source_message_id'),
    ...creationTimestamp,
  },
  (table) => [
    index('ai_messages_conversation_created_index').on(table.conversationId, table.createdAt),
  ],
);
