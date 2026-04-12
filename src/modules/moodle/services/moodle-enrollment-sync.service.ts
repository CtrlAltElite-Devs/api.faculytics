import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { Course } from 'src/entities/course.entity';
import { Section } from 'src/entities/section.entity';
import { env } from 'src/configurations/env';
import { Enrollment } from 'src/entities/enrollment.entity';
import { User } from 'src/entities/user.entity';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { MoodleEnrolledUser } from '../lib/moodle.types';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import { SyncPhaseResult } from '../lib/sync-result.types';

@Injectable()
export class EnrollmentSyncService {
  private readonly logger = new Logger(EnrollmentSyncService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly moodleService: MoodleService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async SyncAllCourses(): Promise<SyncPhaseResult> {
    const startTime = Date.now();
    const em = this.em.fork();
    const enrollmentCountBefore = await em.count(Enrollment);
    const courses = await em.find(Course, { isVisible: true });
    const limit = pLimit(env.MOODLE_SYNC_CONCURRENCY);

    let totalFetched = 0;
    let fetchErrors = 0;

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
            totalFetched += remoteUsers.length;
            return { course, remoteUsers };
          } catch (error: unknown) {
            fetchErrors++;
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
    let enrollmentUpserts = 0;
    let deactivated = 0;
    let enrollmentErrors = 0;

    for (const { course, remoteUsers } of fetched) {
      try {
        const metrics = await this.syncCourseEnrollments(course, remoteUsers);
        enrollmentUpserts += metrics.upserted;
        deactivated += metrics.deactivated;
      } catch (error: unknown) {
        enrollmentErrors++;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to sync enrollments for course ${course.moodleCourseId}: ${message}`,
        );
      }
    }

    // Phase 4: Derive user roles from enrollments + institutional roles
    try {
      await this.deriveUserRoles(fetched);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to derive user roles: ${message}`);
    }

    const inserted = Math.max(0, enrollmentUpserts - enrollmentCountBefore);

    return {
      status:
        fetchErrors + enrollmentErrors > 0 && enrollmentUpserts === 0
          ? 'failed'
          : 'success',
      durationMs: Date.now() - startTime,
      fetched: totalFetched,
      inserted,
      updated: enrollmentUpserts - inserted,
      deactivated,
      errors: fetchErrors + enrollmentErrors,
    };
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
  ): Promise<{ upserted: number; deactivated: number }> {
    let upserted = 0;
    let deactivated = 0;

    await this.unitOfWork.runInTransaction(async (tx) => {
      const existing = await tx.find(
        Enrollment,
        { course: { id: course.id } },
        { populate: ['user'] },
      );

      // Upsert sections from group data returned with enrolled users
      const sectionMap = await this.upsertSectionsFromGroups(
        tx,
        course,
        remoteUsers,
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

        // Resolve section from user's first group
        const userGroup = remote.groups?.[0];
        const section = userGroup ? sectionMap.get(userGroup.id) : undefined;

        const enrollmentData = tx.create(
          Enrollment,
          {
            user,
            course,
            role,
            section: section ?? null,
            isActive: true,
            timeModified: new Date(),
          },
          { managed: false },
        );

        await tx.upsert(Enrollment, enrollmentData, {
          onConflictFields: ['user', 'course'],
          onConflictMergeFields: [
            'role',
            'section',
            'isActive',
            'timeModified',
            'updatedAt',
          ],
        });
        upserted++;
      }

      // Soft deactivate users missing from remote
      for (const enrollment of existing) {
        if (
          enrollment.user.moodleUserId &&
          !remoteIds.has(enrollment.user.moodleUserId)
        ) {
          enrollment.isActive = false;
          tx.persist(enrollment);
          deactivated++;
        }
      }
    });

    return { upserted, deactivated };
  }

  private async upsertSectionsFromGroups(
    tx: EntityManager,
    course: Course,
    remoteUsers: MoodleEnrolledUser[],
  ): Promise<Map<number, Section>> {
    // Collect unique groups from all remote users for this course
    const groupMap = new Map<
      number,
      { id: number; name: string; description?: string }
    >();
    for (const remote of remoteUsers) {
      for (const group of remote.groups ?? []) {
        if (!groupMap.has(group.id)) {
          groupMap.set(group.id, group);
        }
      }
    }

    const sectionMap = new Map<number, Section>();
    for (const [groupId, groupData] of groupMap) {
      const sectionData = tx.create(
        Section,
        {
          moodleGroupId: groupId,
          name: groupData.name,
          description: groupData.description || undefined,
          course,
        },
        { managed: false },
      );

      const section = await tx.upsert(Section, sectionData, {
        onConflictFields: ['moodleGroupId'],
        onConflictMergeFields: ['name', 'description', 'updatedAt'],
      });
      sectionMap.set(groupId, section);
    }

    return sectionMap;
  }

  private async deriveUserRoles(
    fetched: { course: Course; remoteUsers: MoodleEnrolledUser[] }[],
  ) {
    // 1. Collect unique moodleUserIds from ALL remote users (no program filter)
    const uniqueMoodleUserIds = new Set<number>();
    for (const { remoteUsers } of fetched) {
      for (const remote of remoteUsers) {
        if (remote.id == null || !remote.username) continue;
        uniqueMoodleUserIds.add(remote.id);
      }
    }

    if (uniqueMoodleUserIds.size === 0) return;

    const moodleUserIds = [...uniqueMoodleUserIds];
    const fork = this.em.fork();

    // 2. Batch-load users by Moodle ID
    const users = await fork.find(User, {
      moodleUserId: { $in: moodleUserIds },
    });

    if (users.length === 0) return;

    // 3. Extract entity UUIDs for relational queries
    const userUuids = users.map((u) => u.id);

    // 4. Batch-load active enrollments and institutional roles
    const [allEnrollments, allInstRoles] = await Promise.all([
      fork.find(Enrollment, { user: { $in: userUuids }, isActive: true }),
      fork.find(UserInstitutionalRole, { user: { $in: userUuids } }),
    ]);

    // 5. Group by user ID
    const groupByUserId = <T extends { user: User | string }>(
      items: T[],
    ): Map<string, T[]> => {
      const map = new Map<string, T[]>();
      for (const item of items) {
        const userId =
          typeof item.user === 'object' ? item.user.id : String(item.user);
        if (!map.has(userId)) {
          map.set(userId, []);
        }
        map.get(userId)!.push(item);
      }
      return map;
    };

    const enrollmentsByUser = groupByUserId(allEnrollments);
    const instRolesByUser = groupByUserId(allInstRoles);

    // 6. Derive roles for each user
    let updated = 0;
    for (const user of users) {
      const oldRoles = [...user.roles].sort();
      const userEnrollments = enrollmentsByUser.get(user.id) ?? [];
      const userInstRoles = instRolesByUser.get(user.id) ?? [];

      user.updateRolesFromEnrollments(userEnrollments, userInstRoles);

      const newRoles = [...user.roles].sort();
      if (JSON.stringify(oldRoles) !== JSON.stringify(newRoles)) {
        updated++;
      }
    }

    // 7. Always flush — change counter is for logging only
    await fork.flush();

    if (updated > 0) {
      this.logger.log(`Derived roles for ${updated} users`);
    }
  }
}
