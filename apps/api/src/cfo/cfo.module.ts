import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AiModule } from '../ai/ai.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { FinancialSnapshotBuilder } from './analysis/financial-snapshot.builder.js';
import { CfoService } from './cfo.service.js';
import { ReviewExplainer } from './explanation/review-explainer.js';

@Module({
  imports: [
    AiModule,
    FinanceModule,
    HouseholdsModule,
    AccountsModule,
    CategoriesModule,
    GoalsModule,
  ],
  providers: [FinancialSnapshotBuilder, ReviewExplainer, CfoService],
  exports: [CfoService],
})
export class CfoModule {}
