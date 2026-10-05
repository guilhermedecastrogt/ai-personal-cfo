import { Logger } from '@nestjs/common';
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import {
  AIProviderError,
  type AIFailureCategory,
  type AIProvider,
  type ImageExtractionRequest,
  type InterpretationRequest,
  type ReplyRequest,
  type ReviewExplanationRequest,
} from '../ai-provider.js';
import { buildInterpretationInstructions } from '../interpretation/interpretation-instructions.js';
import {
  MESSAGE_INTERPRETATION_SCHEMA_NAME,
  messageInterpretationJsonSchema,
} from '../interpretation/message-interpretation.schema.js';
import { buildReplyInput, buildReplyInstructions } from '../reply/reply-instructions.js';
import {
  buildReviewExplanationInput,
  buildReviewExplanationInstructions,
} from '../review/review-explanation-instructions.js';
import {
  REVIEW_NARRATIVE_SCHEMA_NAME,
  reviewNarrativeJsonSchema,
} from '../review/review-narrative.schema.js';
import {
  buildImageCaptionText,
  buildImageExtractionInstructions,
} from '../vision/image-extraction-instructions.js';
import {
  IMAGE_EXTRACTION_SCHEMA_NAME,
  imageExtractionJsonSchema,
} from '../vision/image-extraction.schema.js';

const REQUEST_TIMEOUT_IN_MILLISECONDS = 30_000;
const MAXIMUM_RETRIES = 2;

export interface OpenAIProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly timeoutInMilliseconds?: number;
  readonly maximumRetries?: number;
}

type Operation =
  'interpretMessage' | 'extractTransactionFromImage' | 'explainMonthlyReview' | 'composeReply';

export class OpenAIProvider implements AIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: options.timeoutInMilliseconds ?? REQUEST_TIMEOUT_IN_MILLISECONDS,
      maxRetries: options.maximumRetries ?? MAXIMUM_RETRIES,
    });
  }

  async interpretMessage(request: InterpretationRequest): Promise<unknown> {
    const output = await this.respond('interpretMessage', {
      instructions: buildInterpretationInstructions(request),
      input: [
        ...request.history.map((turn) => ({
          role: turn.role === 'USER' ? ('user' as const) : ('assistant' as const),
          content: turn.content,
        })),
        { role: 'user' as const, content: request.message },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: MESSAGE_INTERPRETATION_SCHEMA_NAME,
          strict: true,
          schema: messageInterpretationJsonSchema(),
        },
      },
    });
    return parseStructuredOutput(output);
  }

  async extractTransactionFromImage(request: ImageExtractionRequest): Promise<unknown> {
    const { mimeType, bytes } = request.image;
    const output = await this.respond('extractTransactionFromImage', {
      instructions: buildImageExtractionInstructions(request),
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: buildImageCaptionText(request.caption) },
            {
              type: 'input_image',
              detail: 'high',
              image_url: `data:${mimeType};base64,${bytes.toString('base64')}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: IMAGE_EXTRACTION_SCHEMA_NAME,
          strict: true,
          schema: imageExtractionJsonSchema(),
        },
      },
    });
    return parseStructuredOutput(output);
  }

  async explainMonthlyReview(request: ReviewExplanationRequest): Promise<unknown> {
    const output = await this.respond('explainMonthlyReview', {
      instructions: buildReviewExplanationInstructions(),
      input: buildReviewExplanationInput(request),
      text: {
        format: {
          type: 'json_schema',
          name: REVIEW_NARRATIVE_SCHEMA_NAME,
          strict: true,
          schema: reviewNarrativeJsonSchema(),
        },
      },
    });
    return parseStructuredOutput(output);
  }

  async composeReply(request: ReplyRequest): Promise<string> {
    return this.respond('composeReply', {
      instructions: buildReplyInstructions(request.situation),
      input: buildReplyInput(request),
    });
  }

  private async respond(
    operation: Operation,
    parameters: Pick<
      OpenAI.Responses.ResponseCreateParamsNonStreaming,
      'instructions' | 'input' | 'text'
    >,
  ): Promise<string> {
    const startedAt = Date.now();
    try {
      const response = await this.client.responses.create({
        ...parameters,
        model: this.model,
        store: false,
      });
      if (response.status !== 'completed' || response.output_text === '') {
        throw new AIProviderError('INVALID_RESPONSE');
      }
      this.logOutcome(operation, startedAt, 'success');
      return response.output_text;
    } catch (error) {
      const failure =
        error instanceof AIProviderError ? error : new AIProviderError(categorizeFailure(error));
      this.logOutcome(operation, startedAt, failure.category);
      throw failure;
    }
  }

  private logOutcome(operation: Operation, startedAt: number, outcome: string): void {
    const message = `provider=openai operation=${operation} outcome=${outcome} durationMs=${String(Date.now() - startedAt)}`;
    if (outcome === 'success') {
      this.logger.log(message);
    } else {
      this.logger.warn(message);
    }
  }
}

function parseStructuredOutput(output: string): unknown {
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new AIProviderError('INVALID_RESPONSE');
  }
}

export function categorizeFailure(error: unknown): AIFailureCategory {
  if (error instanceof APIConnectionTimeoutError) {
    return 'TIMEOUT';
  }
  if (error instanceof RateLimitError) {
    return 'RATE_LIMITED';
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return 'AUTHENTICATION';
  }
  if (error instanceof APIConnectionError || error instanceof InternalServerError) {
    return 'UNAVAILABLE';
  }
  if (error instanceof APIError) {
    return 'REJECTED';
  }
  return 'UNAVAILABLE';
}
