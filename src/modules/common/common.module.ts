import { Module } from '@nestjs/common';
import UnitOfWork from './unit-of-work';
import { CustomJwtService } from './custom-jwt-service';

@Module({
  providers: [UnitOfWork, CustomJwtService],
  exports: [UnitOfWork, CustomJwtService],
})
export class CommonModule {}
