import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { GoalContributionsRepository } from './goal-contributions.repository.js';
import { GoalsRepository } from './goals.repository.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [HouseholdsModule, AccountsModule],
  providers: [GoalsRepository, GoalContributionsRepository, GoalsService],
  exports: [GoalsRepository, GoalContributionsRepository, GoalsService],
})
export class GoalsModule {}
