import { Module } from '@nestjs/common';
import { UserLoader } from './user.loader';
import { IngestionMappingLoader } from './ingestion-mapping.loader';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from 'src/entities/user.entity';
import { Course } from 'src/entities/course.entity';
import { Semester } from 'src/entities/semester.entity';

@Module({
  imports: [MikroOrmModule.forFeature([User, Course, Semester])],
  providers: [UserLoader, IngestionMappingLoader],
  exports: [UserLoader, IngestionMappingLoader],
})
export default class DataLoaderModule {}
