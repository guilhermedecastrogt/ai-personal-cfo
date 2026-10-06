import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { AI_PROVIDER, type AIProvider } from './ai-provider.js';
import { MessageInterpreter } from './interpretation/message-interpreter.js';
import { OpenAIProvider } from './openai/openai-provider.js';
import { ReplyComposer } from './reply/reply-composer.js';
import { ImageTransactionReader } from './vision/image-transaction-reader.js';

@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): AIProvider =>
        new OpenAIProvider({
          apiKey: config.openaiApiKey,
          model: config.openaiModel,
          reasoningEffort: config.openaiReasoningEffort,
        }),
    },
    MessageInterpreter,
    ImageTransactionReader,
    ReplyComposer,
  ],
  exports: [AI_PROVIDER, MessageInterpreter, ImageTransactionReader, ReplyComposer],
})
export class AiModule {}
