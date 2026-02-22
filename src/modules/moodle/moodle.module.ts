import { Module } from '@nestjs/common';
import { MoodleService } from './moodle.service';
import { CommonModule } from '../common/common.module';
import { MoodleSyncService } from './services/moodle-sync.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from '../../entities/user.entity';
import { MoodleCategorySyncService } from './services/moodle-category-sync.service';
import { Campus } from 'src/entities/campus.entity';
import { Semester } from 'src/entities/semester.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { EnrollmentSyncService } from './services/moodle-enrollment-sync.service';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Course } from 'src/entities/course.entity';
import { MoodleCourseSyncService } from './services/moodle-course-sync.service';
import { MoodleUserHydrationService } from './services/moodle-user-hydration.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      User,
      Campus,
      Semester,
      Department,
      Program,
      Enrollment,
      Course,
    ]),
    CommonModule,
  ],
  controllers: [],
  providers: [
    MoodleService,
    MoodleSyncService,
    MoodleCategorySyncService,
    MoodleCourseSyncService,
    EnrollmentSyncService,
    MoodleUserHydrationService,
  ],
  exports: [
    MoodleService,
    MoodleSyncService,
    MoodleCategorySyncService,
    MoodleCourseSyncService,
    EnrollmentSyncService,
    MoodleUserHydrationService,
  ],
})
export default class MoodleModule {}
