export interface ConversationPolicy {
  readonly recentUserMessages: number;
  readonly maximumMessageLength: number;
  readonly retainedMessages: number;
  readonly stateLifetimeInMinutes: number;
}

export const CONVERSATION_POLICY: ConversationPolicy = {
  recentUserMessages: 3,
  maximumMessageLength: 1000,
  retainedMessages: 20,
  stateLifetimeInMinutes: 30,
};
