import { Module } from '@nestjs/common';
import { GoalsRepository } from './goals.repository.js';

@Module({
  providers: [GoalsRepository],
  exports: [GoalsRepository],
})
export class GoalsModule {}
