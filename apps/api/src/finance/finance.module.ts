import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { FinanceService } from './application/finance.service.js';
import { LedgerRepository } from './infrastructure/ledger.repository.js';

@Module({
  imports: [HouseholdsModule, AccountsModule, CategoriesModule, BudgetsModule, GoalsModule],
  providers: [FinanceService, LedgerRepository],
  exports: [FinanceService],
})
export class FinanceModule {}
