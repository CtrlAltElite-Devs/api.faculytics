import { Injectable, Logger } from '@nestjs/common';
import { MoodleService } from './moodle.service';
import { User } from 'src/entities/user.entity';
import { Program } from 'src/entities/program.entity';
import { Course } from 'src/entities/course.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import UnitOfWork from '../common/unit-of-work';

@Injectable()
export class MoodleUserHydrationService {
  private readonly logger = new Logger(MoodleUserHydrationService.name);

  constructor(
    private readonly moodleService: MoodleService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * Syncs courses and enrollments for a specific user.
   * This is triggered on login to ensure immediate consistency.
   */
  async hydrateUserCourses(moodleUserId: number, moodleToken: string) {
    const startTime = Date.now();
    this.logger.log(`Hydrating courses for Moodle user ${moodleUserId}...`);

    const remoteCourses = await this.moodleService.GetEnrolledCourses({
      token: moodleToken,
      userId: moodleUserId,
    });

    await this.unitOfWork.runInTransaction(async (tx) => {
      const user = await tx.findOneOrFail(User, { moodleUserId });
      const programCache = new Map<number, Program>();

      for (const remoteCourse of remoteCourses) {
        // Find the program (category) this course belongs to
        let program = programCache.get(remoteCourse.category);

        if (!program) {
          const foundProgram = await tx.findOne(Program, {
            moodleCategoryId: remoteCourse.category,
          });
          if (foundProgram) {
            program = foundProgram;
            programCache.set(remoteCourse.category, program);
          }
        }

        if (!program) {
          this.logger.warn(
            `Skipping course ${remoteCourse.shortname} (ID: ${remoteCourse.id}) because its category ${remoteCourse.category} is not yet synced.`,
          );
          continue;
        }

        // 1. Upsert Course
        const courseData = tx.create(
          Course,
          {
            moodleCourseId: remoteCourse.id,
            shortname: remoteCourse.shortname,
            fullname: remoteCourse.fullname,
            program,
            startDate: new Date(remoteCourse.startdate * 1000),
            endDate: new Date(remoteCourse.enddate * 1000),
            isVisible: remoteCourse.visible === 1,
            timeModified: new Date(remoteCourse.timemodified * 1000),
            isActive: true,
          },
          { managed: false },
        );

        const course = await tx.upsert(Course, courseData, {
          onConflictFields: ['moodleCourseId'],
          onConflictMergeFields: [
            'shortname',
            'fullname',
            'startDate',
            'endDate',
            'isVisible',
            'timeModified',
            'isActive',
            'updatedAt',
          ],
        });

        // 2. Upsert Enrollment
        const enrollmentData = tx.create(
          Enrollment,
          {
            user,
            course,
            role: 'student', // default for this endpoint
            isActive: true,
            timeModified: new Date(),
          },
          { managed: false },
        );

        await tx.upsert(Enrollment, enrollmentData, {
          onConflictFields: ['user', 'course'],
          onConflictMergeFields: [
            'role',
            'isActive',
            'timeModified',
            'updatedAt',
          ],
        });
      }

      // Derive user roles from active enrollments
      const activeEnrollments = await tx.find(Enrollment, {
        user,
        isActive: true,
      });
      user.updateRolesFromEnrollments(activeEnrollments);
      tx.persist(user);
    });

    const duration = Date.now() - startTime;
    this.logger.log(
      `Finished hydrating courses for Moodle user ${moodleUserId} in ${duration}ms`,
    );
  }
}
