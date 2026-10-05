import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { GoalsRepository } from './goals.repository.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [HouseholdsModule, AccountsModule],
  providers: [GoalsRepository, GoalsService],
  exports: [GoalsRepository, GoalsService],
})
export class GoalsModule {}
