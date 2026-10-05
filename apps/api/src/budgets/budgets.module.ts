import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { BudgetsRepository } from './budgets.repository.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [HouseholdsModule, AccountsModule, CategoriesModule],
  providers: [BudgetsRepository, BudgetsService],
  exports: [BudgetsRepository, BudgetsService],
})
export class BudgetsModule {}
