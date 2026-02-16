import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Course } from 'src/entities/course.entity';
import { MoodleService } from './moodle.service';
import { env } from 'src/configurations/env';
import { Enrollment } from 'src/entities/enrollment.entity';
import { User } from 'src/entities/user.entity';
import { MoodleEnrolledUser } from './lib/moodle.types';
import UnitOfWork from '../common/unit-of-work';

@Injectable()
export class EnrollmentSyncService {
  constructor(
    private readonly em: EntityManager,
    private readonly moodleService: MoodleService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async syncAllCourses() {
    const em = this.em.fork();
    const courses = await em.find(Course, {
      isVisible: true,
    });

    for (const course of courses) {
      await this.syncCourseEnrollments(course);
    }
  }

  private async syncCourseEnrollments(course: Course) {
    const remoteUsers = await this.moodleService.GetEnrolledUsersByCourse({
      token: env.MOODLE_MASTER_KEY,
      courseId: course.moodleCourseId,
    });

    await this.unitOfWork.runInTransaction(async (tx) => {
      const existing = await tx.find(
        Enrollment,
        {
          course: {
            id: course.id,
          },
        },
        { populate: ['user'] },
      );

      const remoteIds = new Set<number>();

      for (const remote of remoteUsers) {
        remoteIds.add(remote.id);

        // 1. Lazy Upsert User
        const userData = tx.create(
          User,
          {
            moodleUserId: remote.id,
            userName: remote.username,
            firstName: remote.firstname,
            lastName: remote.lastname,
            fullName: remote.fullname,
            userProfilePicture: remote.profileimageurl ?? '',
            lastLoginAt: new Date(),
            isActive: true,
            roles: [],
          },
          { managed: false },
        );

        await tx.upsert(User, userData, {
          onConflictFields: ['moodleUserId'],
          onConflictMergeFields: [
            'userName',
            'firstName',
            'lastName',
            'fullName',
            'userProfilePicture',
            'isActive',
            'updatedAt',
          ],
        });

        // 2. Load User Reference
        const user = await tx.findOneOrFail(User, {
          moodleUserId: remote.id,
        });

        // 3. Upsert Enrollment
        const role = this.extractRole(remote);
        const enrollmentData = tx.create(
          Enrollment,
          {
            user,
            course,
            role,
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

      // 4. Soft deactivate users missing from remote
      for (const enrollment of existing) {
        if (!remoteIds.has(enrollment.user.moodleUserId)) {
          enrollment.isActive = false;
          tx.persist(enrollment);
        }
      }
    });
  }

  private extractRole(user: MoodleEnrolledUser): string {
    if (!user.roles?.length) return 'unknown';
    return user.roles[0].shortname;
  }
}
