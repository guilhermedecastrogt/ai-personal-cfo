import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AiModule } from '../ai/ai.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CfoModule } from '../cfo/cfo.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { MediaModule } from '../media/media.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { ConversationsRepository } from './conversations.repository.js';
import { TransactionExtractionService } from './extraction/transaction-extraction.service.js';
import { ImageTransactionService } from './image/image-transaction.service.js';
import { FinancialAssistant } from './financial-assistant.service.js';
import { FinancialQueryService } from './queries/financial-query.service.js';

@Module({
  imports: [
    AiModule,
    CfoModule,
    FinanceModule,
    TransactionsModule,
    AccountsModule,
    CategoriesModule,
    GoalsModule,
    HouseholdsModule,
    MediaModule,
  ],
  providers: [
    ConversationsRepository,
    TransactionExtractionService,
    FinancialQueryService,
    ImageTransactionService,
    FinancialAssistant,
  ],
  exports: [FinancialAssistant],
})
export class ConversationModule {}
