import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { HouseholdDirectoryService } from './household-directory.service.js';

@Module({
  imports: [HouseholdsModule, AccountsModule, CategoriesModule, GoalsModule],
  providers: [HouseholdDirectoryService],
  exports: [HouseholdDirectoryService],
})
export class DirectoryModule {}
