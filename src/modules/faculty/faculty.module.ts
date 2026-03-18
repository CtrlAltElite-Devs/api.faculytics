import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Course } from 'src/entities/course.entity';
import { Program } from 'src/entities/program.entity';
import { Department } from 'src/entities/department.entity';
import { User } from 'src/entities/user.entity';
import { Semester } from 'src/entities/semester.entity';
import { CommonModule } from '../common/common.module';
import DataLoaderModule from '../common/data-loaders/index.module';
import { FacultyController } from './faculty.controller';
import { FacultyService } from './services/faculty.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      Enrollment,
      Course,
      Program,
      Department,
      User,
      Semester,
    ]),
    CommonModule,
    DataLoaderModule,
  ],
  controllers: [FacultyController],
  providers: [FacultyService],
  exports: [FacultyService],
})
export class FacultyModule {}
