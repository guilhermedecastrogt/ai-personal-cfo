import { Module } from '@nestjs/common';
import { BudgetsRepository } from './budgets.repository.js';

@Module({
  providers: [BudgetsRepository],
  exports: [BudgetsRepository],
})
export class BudgetsModule {}
