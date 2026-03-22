import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { Course } from 'src/entities/course.entity';
import { Semester } from 'src/entities/semester.entity';
import { User } from 'src/entities/user.entity';
import { CommonModule } from '../common/common.module';
import DataLoaderModule from '../common/data-loaders/index.module';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './services/curriculum.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([Department, Program, Course, Semester, User]),
    CommonModule,
    DataLoaderModule,
  ],
  controllers: [CurriculumController],
  providers: [CurriculumService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
