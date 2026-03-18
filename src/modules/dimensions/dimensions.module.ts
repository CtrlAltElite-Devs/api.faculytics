import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Dimension } from 'src/entities/dimension.entity';
import { User } from 'src/entities/user.entity';
import { DimensionsController } from './dimensions.controller';
import { DimensionsService } from './services/dimensions.service';

@Module({
  imports: [MikroOrmModule.forFeature([Dimension, User])],
  controllers: [DimensionsController],
  providers: [DimensionsService],
  exports: [DimensionsService],
})
export class DimensionsModule {}
