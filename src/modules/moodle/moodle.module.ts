import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
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
import { MoodleSyncProcessor } from './processors/moodle-sync.processor';
import { MoodleSyncScheduler } from './schedulers/moodle-sync.scheduler';
import { MoodleStartupService } from './services/moodle-startup.service';
import { MoodleSyncController } from './controllers/moodle-sync.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.MOODLE_SYNC }),
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
  controllers: [MoodleSyncController],
  providers: [
    MoodleService,
    MoodleSyncService,
    MoodleCategorySyncService,
    MoodleCourseSyncService,
    EnrollmentSyncService,
    MoodleUserHydrationService,
    MoodleSyncProcessor,
    MoodleSyncScheduler,
    MoodleStartupService,
  ],
  exports: [
    MoodleService,
    MoodleSyncService,
    MoodleCategorySyncService,
    MoodleCourseSyncService,
    EnrollmentSyncService,
    MoodleUserHydrationService,
    MoodleStartupService,
  ],
})
export default class MoodleModule {}
