import { Module } from '@nestjs/common';
import UnitOfWork from './unit-of-work';
import { CustomJwtService } from './custom-jwt-service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RefreshToken } from 'src/entities/refresh-token.entity';

@Module({
  imports: [MikroOrmModule.forFeature([RefreshToken])],
  providers: [UnitOfWork, CustomJwtService],
  exports: [UnitOfWork, CustomJwtService],
})
export class CommonModule {}
