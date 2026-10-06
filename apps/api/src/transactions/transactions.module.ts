import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { TransactionsRepository } from './transactions.repository.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [HouseholdsModule, AccountsModule, CategoriesModule, GoalsModule],
  providers: [TransactionsRepository, TransactionsService],
  exports: [TransactionsRepository, TransactionsService],
})
export class TransactionsModule {}
