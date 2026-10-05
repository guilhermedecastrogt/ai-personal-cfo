import type { ImageMimeType } from '../media/image-inspection.js';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface ConversationTurn {
  readonly role: 'USER' | 'ASSISTANT';
  readonly content: string;
}

export interface CategoryOption {
  readonly name: string;
  readonly kind: 'EXPENSE' | 'INCOME';
  readonly parent: string | null;
}

export interface InterpretationRequest {
  readonly message: string;
  readonly history: readonly ConversationTurn[];
  readonly senderName: string;
  readonly memberNames: readonly string[];
  readonly accountNames: readonly string[];
  readonly categories: readonly CategoryOption[];
}

export interface ImageExtractionRequest {
  readonly image: { readonly mimeType: ImageMimeType; readonly bytes: Buffer };
  readonly caption: string | null;
  readonly accountNames: readonly string[];
  readonly categories: readonly CategoryOption[];
}

export type ReplySituation =
  | 'TRANSACTION_RECORDED'
  | 'CLARIFICATION_NEEDED'
  | 'QUESTION_ANSWERED'
  | 'IMAGE_NOT_USABLE'
  | 'OUT_OF_SCOPE';

export type ReplyFacts = Readonly<Record<string, unknown>>;

export interface ReplyRequest {
  readonly situation: ReplySituation;
  readonly userMessage: string;
  readonly senderName: string;
  readonly facts: ReplyFacts;
}

export interface AIProvider {
  interpretMessage(request: InterpretationRequest): Promise<unknown>;
  extractTransactionFromImage(request: ImageExtractionRequest): Promise<unknown>;
  composeReply(request: ReplyRequest): Promise<string>;
}

export type AIFailureCategory =
  'TIMEOUT' | 'RATE_LIMITED' | 'AUTHENTICATION' | 'UNAVAILABLE' | 'REJECTED' | 'INVALID_RESPONSE';

export class AIProviderError extends Error {
  constructor(readonly category: AIFailureCategory) {
    super(`AI provider failed: ${category}`);
    this.name = AIProviderError.name;
  }
}
