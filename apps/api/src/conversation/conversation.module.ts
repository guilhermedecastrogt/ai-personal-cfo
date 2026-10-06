import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CfoModule } from '../cfo/cfo.module.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { MediaModule } from '../media/media.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { ConversationsRepository } from './conversations.repository.js';
import { CorrectionService } from './corrections/correction.service.js';
import { GoalContributionService } from './goals/goal-contribution.service.js';
import { TransactionExtractionService } from './extraction/transaction-extraction.service.js';
import { ImageTransactionService } from './image/image-transaction.service.js';
import { FinancialAssistant } from './financial-assistant.service.js';
import { FinancialQueryService } from './queries/financial-query.service.js';

@Module({
  imports: [
    AiModule,
    CfoModule,
    DirectoryModule,
    FinanceModule,
    GoalsModule,
    TransactionsModule,
    MediaModule,
  ],
  providers: [
    ConversationsRepository,
    CorrectionService,
    GoalContributionService,
    TransactionExtractionService,
    FinancialQueryService,
    ImageTransactionService,
    FinancialAssistant,
  ],
  exports: [FinancialAssistant],
})
export class ConversationModule {}
