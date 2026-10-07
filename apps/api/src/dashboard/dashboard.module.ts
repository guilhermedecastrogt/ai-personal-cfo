import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { CfoModule } from '../cfo/cfo.module.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { ProactiveModule } from '../proactive/proactive.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardWritesService } from './dashboard-writes.service.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    AuthModule,
    CfoModule,
    FinanceModule,
    DirectoryModule,
    TransactionsModule,
    ProactiveModule,
    BudgetsModule,
    GoalsModule,
    PlatformModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardWritesService],
})
export class DashboardModule {}
