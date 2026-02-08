import { Module } from '@nestjs/common';
import UnitOfWork from './unit-of-work';

@Module({
  providers: [UnitOfWork],
  exports: [UnitOfWork],
})
export class CommonModule {}
