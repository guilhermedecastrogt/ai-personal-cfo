import { Inject, Injectable } from '@nestjs/common';
import {
  AI_PROVIDER,
  AIProviderError,
  type AIProvider,
  type ImageExtractionRequest,
} from '../ai-provider.js';
import { imageExtractionWireSchema, type ImageReading } from './image-extraction.schema.js';

@Injectable()
export class ImageTransactionReader {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  async read(request: ImageExtractionRequest): Promise<ImageReading> {
    const parsed = imageExtractionWireSchema.safeParse(
      await this.provider.extractTransactionFromImage(request),
    );
    if (!parsed.success) {
      throw new AIProviderError('INVALID_RESPONSE');
    }
    const { kind, transaction, transactionCount } = parsed.data;
    if (kind === 'SINGLE_TRANSACTION') {
      if (transaction === null) {
        throw new AIProviderError('INVALID_RESPONSE');
      }
      return { kind, transaction };
    }
    return kind === 'MULTIPLE_TRANSACTIONS' ? { kind, transactionCount } : { kind };
  }
}
