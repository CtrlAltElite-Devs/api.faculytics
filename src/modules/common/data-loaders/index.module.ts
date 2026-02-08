import { Module } from '@nestjs/common';
import { UserLoader } from './user.loader';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from 'src/entities/user.entity';

@Module({
  imports: [MikroOrmModule.forFeature([User])],
  providers: [UserLoader],
  exports: [UserLoader],
})
export default class DataLoaderModule {}
