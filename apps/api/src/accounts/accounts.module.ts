import { Module } from '@nestjs/common';
import { AccountsRepository } from './accounts.repository.js';

@Module({
  providers: [AccountsRepository],
  exports: [AccountsRepository],
})
export class AccountsModule {}
