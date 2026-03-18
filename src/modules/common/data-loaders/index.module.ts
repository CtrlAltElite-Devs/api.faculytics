import { Module } from '@nestjs/common';
import { UserLoader } from './user.loader';
import { IngestionMappingLoader } from './ingestion-mapping.loader';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ClsModule } from 'nestjs-cls';
import { User } from 'src/entities/user.entity';
import { Course } from 'src/entities/course.entity';
import { Semester } from 'src/entities/semester.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([User, Course, Semester]),
    ClsModule.forFeatureAsync({
      useClass: UserLoader,
      imports: [MikroOrmModule.forFeature([User])],
    }),
  ],
  providers: [IngestionMappingLoader],
  exports: [ClsModule, IngestionMappingLoader],
})
export default class DataLoaderModule {}
