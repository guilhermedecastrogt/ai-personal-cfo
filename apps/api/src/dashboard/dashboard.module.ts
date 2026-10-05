import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CfoModule } from '../cfo/cfo.module.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AuthModule, CfoModule, FinanceModule, DirectoryModule, TransactionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
