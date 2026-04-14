import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { Campus } from 'src/entities/campus.entity';
import { Course } from 'src/entities/course.entity';
import { Section } from 'src/entities/section.entity';
import { env } from 'src/configurations/env';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Program } from 'src/entities/program.entity';
import { User } from 'src/entities/user.entity';
import {
  InstitutionalRoleSource,
  UserInstitutionalRole,
} from 'src/entities/user-institutional-role.entity';
import { MoodleEnrolledUser } from '../lib/moodle.types';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import { SyncPhaseResult } from '../lib/sync-result.types';
import { deriveUserScopes } from './scope-derivation.helper';

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

    // Phase 4: Backfill user.department / user.program from enrollment majority
    try {
      await this.backfillUserScopes(fetched);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to backfill user scopes: ${message}`);
    }

    // Phase 5: Derive user roles from enrollments + institutional roles
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
        // FAC-131a — reject Moodle users whose username collides with the
        // reserved "local-" namespace for Faculytics-local accounts. Without
        // this guard, the user_user_name_unique constraint would throw if a
        // Moodle sysadmin ever created a local-* account.
        if (user.username.toLowerCase().startsWith('local-')) {
          this.logger.warn(
            `Skipping Moodle user with reserved "local-" username prefix: moodleUserId=${user.id}, username=${user.username}`,
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
            departmentSource: InstitutionalRoleSource.AUTO,
            programSource: InstitutionalRoleSource.AUTO,
            campusSource: InstitutionalRoleSource.AUTO,
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

  private async backfillUserScopes(
    fetched: { course: Course; remoteUsers: MoodleEnrolledUser[] }[],
  ) {
    const fork = this.em.fork();

    // 1. Build per-user program-id list from the in-memory snapshot.
    //    course.program is a reference proxy; .id is safe without populate.
    const programIdsByMoodleUser = new Map<number, string[]>();
    const allProgramIds = new Set<string>();
    for (const { course, remoteUsers } of fetched) {
      if (!course.program) continue;
      const programId = course.program.id;
      allProgramIds.add(programId);
      for (const remote of remoteUsers) {
        if (remote.id == null || !remote.username) continue;
        let list = programIdsByMoodleUser.get(remote.id);
        if (!list) {
          list = [];
          programIdsByMoodleUser.set(remote.id, list);
        }
        list.push(programId);
      }
    }

    if (programIdsByMoodleUser.size === 0) return;

    // 2. Load programs with department populated in this fork
    const programs = await fork.find(
      Program,
      { id: { $in: [...allProgramIds] } },
      { populate: ['department'] },
    );
    const programById = new Map(programs.map((p) => [p.id, p]));

    // 3. Materialize enrollment lists referencing the fork-managed programs
    const enrollmentsByMoodleId = new Map<
      number,
      Array<{ program: Program }>
    >();
    for (const [moodleId, pids] of programIdsByMoodleUser) {
      enrollmentsByMoodleId.set(
        moodleId,
        pids
          .map((pid) => ({ program: programById.get(pid) }))
          .filter((e): e is { program: Program } => !!e.program),
      );
    }

    // 4. Load users with current source flags + program/department/campus populated
    const users = await fork.find(
      User,
      { moodleUserId: { $in: [...programIdsByMoodleUser.keys()] } },
      { populate: ['program', 'department', 'campus'] },
    );

    // 5. Derive + apply with atomic source guard + equality guard
    const counters = {
      auto_derived: 0,
      manual_skipped: 0,
      null: 0,
      campus_assigned: 0,
    };
    for (const user of users) {
      if (
        user.departmentSource === (InstitutionalRoleSource.MANUAL as string) ||
        user.programSource === (InstitutionalRoleSource.MANUAL as string)
      ) {
        counters.manual_skipped++;
        continue;
      }

      const result = deriveUserScopes({
        enrollments: enrollmentsByMoodleId.get(user.moodleUserId!) ?? [],
      });

      if (!result.primaryProgram) {
        counters.null++;
        continue;
      }

      const programChanged = user.program?.id !== result.primaryProgram.id;
      const departmentChanged =
        user.department?.id !== result.primaryDepartment?.id;

      if (programChanged || departmentChanged) {
        user.program = result.primaryProgram;
        user.department = result.primaryDepartment ?? undefined;
        user.programSource = InstitutionalRoleSource.AUTO;
        user.departmentSource = InstitutionalRoleSource.AUTO;
        counters.auto_derived++;
      }
    }

    // 6. Campus backfill: fill-if-null only. Username convention is
    //    "<campus_code>-<id>" (e.g. "ucmn-262141935"). Mirrors the lookup
    //    UserRepository.UpsertFromMoodle does at login, so cron-discovered
    //    users get a campus before they ever log in. Manual reassignments
    //    survive because we never overwrite a non-null campus.
    const usersNeedingCampus = users.filter((u) => !u.campus);
    if (usersNeedingCampus.length > 0) {
      const codesNeeded = new Set<string>();
      for (const user of usersNeedingCampus) {
        const prefix = user.userName.split('-')[0];
        if (prefix && prefix !== user.userName) {
          codesNeeded.add(prefix.toUpperCase());
        }
      }

      if (codesNeeded.size > 0) {
        const campuses = await fork.find(Campus, {
          code: { $in: [...codesNeeded] },
        });
        const campusByCode = new Map(campuses.map((c) => [c.code, c]));

        for (const user of usersNeedingCampus) {
          const prefix = user.userName.split('-')[0];
          if (!prefix || prefix === user.userName) continue;
          const campus = campusByCode.get(prefix.toUpperCase());
          if (campus) {
            user.campus = campus;
            counters.campus_assigned++;
          }
        }
      }
    }

    if (counters.auto_derived > 0 || counters.campus_assigned > 0) {
      await fork.flush();
    }

    this.logger.log(
      `Scope backfill: ${counters.auto_derived} derived, ${counters.manual_skipped} manual skipped, ${counters.null} no enrollments, ${counters.campus_assigned} campus assigned`,
    );
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
