import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { Course } from 'src/entities/course.entity';
import { env } from 'src/configurations/env';
import { Enrollment } from 'src/entities/enrollment.entity';
import { User } from 'src/entities/user.entity';
import { MoodleEnrolledUser } from '../lib/moodle.types';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';

@Injectable()
export class EnrollmentSyncService {
  private readonly logger = new Logger(EnrollmentSyncService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly moodleService: MoodleService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async SyncAllCourses() {
    const em = this.em.fork();
    const courses = await em.find(Course, { isVisible: true });
    const limit = pLimit(env.MOODLE_SYNC_CONCURRENCY);

    // Phase 1: Concurrent HTTP fetch
    const results = await Promise.all(
      courses.map((course) =>
        limit(async () => {
          try {
            const remoteUsers =
              await this.moodleService.GetEnrolledUsersByCourse({
                token: env.MOODLE_MASTER_KEY,
                courseId: course.moodleCourseId,
              });
            return { course, remoteUsers };
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Failed to fetch enrollments for course ${course.moodleCourseId}: ${message}`,
            );
            return null;
          }
        }),
      ),
    );

    const fetched = results.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );

    // Phase 2: Deduplicate and batch upsert all Users
    await this.syncAllUsers(fetched);

    // Phase 3: Sequential per-course enrollment upsert
    for (const { course, remoteUsers } of fetched) {
      try {
        await this.syncCourseEnrollments(course, remoteUsers);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to sync enrollments for course ${course.moodleCourseId}: ${message}`,
        );
      }
    }
  }

  private async syncAllUsers(
    fetched: { course: Course; remoteUsers: MoodleEnrolledUser[] }[],
  ) {
    // Deduplicate users across all courses
    const uniqueUsers = new Map<number, MoodleEnrolledUser>();
    for (const { remoteUsers } of fetched) {
      for (const user of remoteUsers) {
        if (user.id == null || !user.username) {
          this.logger.warn(
            `Skipping user with missing id or username: ${JSON.stringify({ id: user.id, username: user.username })}`,
          );
          continue;
        }
        uniqueUsers.set(user.id, user);
      }
    }

    if (uniqueUsers.size === 0) return;

    const buildUserData = (fork: EntityManager) =>
      [...uniqueUsers.values()].map((remote) =>
        fork.create(
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
        ),
      );

    const mergeFields = [
      'userName',
      'firstName',
      'lastName',
      'fullName',
      'userProfilePicture',
      'isActive',
      'updatedAt',
    ] as const;

    // Try batch upsert first (single atomic INSERT ... ON CONFLICT)
    try {
      const fork = this.em.fork();
      await fork.upsertMany(User, buildUserData(fork), {
        onConflictFields: ['moodleUserId'],
        onConflictMergeFields: [...mergeFields],
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Batch user upsert failed, falling back to individual upserts: ${message}`,
      );

      // Fresh fork — previous fork's connection may be in aborted state
      const fallbackFork = this.em.fork();
      for (const userData of buildUserData(fallbackFork)) {
        try {
          await fallbackFork.upsert(User, userData, {
            onConflictFields: ['moodleUserId'],
            onConflictMergeFields: [...mergeFields],
          });
        } catch (innerError: unknown) {
          const innerMessage =
            innerError instanceof Error
              ? innerError.message
              : String(innerError);
          this.logger.error(
            `Failed to upsert user ${userData.moodleUserId}: ${innerMessage}`,
          );
        }
      }
    }
  }

  private async syncCourseEnrollments(
    course: Course,
    remoteUsers: MoodleEnrolledUser[],
  ) {
    await this.unitOfWork.runInTransaction(async (tx) => {
      const existing = await tx.find(
        Enrollment,
        { course: { id: course.id } },
        { populate: ['user'] },
      );

      // Load user references for this course's users in a single SELECT
      const moodleUserIds = remoteUsers
        .filter((r) => r.id != null && r.username)
        .map((r) => r.id);

      const users = await tx.find(User, {
        moodleUserId: { $in: moodleUserIds },
      });
      const userMap = new Map(users.map((u) => [u.moodleUserId, u]));

      const remoteIds = new Set<number>();

      for (const remote of remoteUsers) {
        if (remote.id == null || !remote.username) continue;
        remoteIds.add(remote.id);

        const user = userMap.get(remote.id);
        if (!user) {
          this.logger.warn(
            `User with moodleUserId ${remote.id} not found after Phase 2 upsert — skipping enrollment`,
          );
          continue;
        }

        const role = this.moodleService.ExtractRole(remote);
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

      // Soft deactivate users missing from remote
      for (const enrollment of existing) {
        if (
          enrollment.user.moodleUserId &&
          !remoteIds.has(enrollment.user.moodleUserId)
        ) {
          enrollment.isActive = false;
          tx.persist(enrollment);
        }
      }
    });
  }
}
