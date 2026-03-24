import { Injectable, Logger } from '@nestjs/common';
import { User } from 'src/entities/user.entity';
import { Program } from 'src/entities/program.entity';
import { Course } from 'src/entities/course.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Section } from 'src/entities/section.entity';
import { env } from 'src/configurations/env';
import { EntityManager } from '@mikro-orm/core';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import {
  MoodleCourse,
  MoodleCourseGroup,
  MoodleCourseUserGroupsResponse,
} from '../lib/moodle.types';
import { UserRole } from 'src/modules/auth/roles.enum';

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

    let remoteCourses: MoodleCourse[];
    try {
      remoteCourses = await this.moodleService.GetEnrolledCourses({
        token: moodleToken,
        userId: moodleUserId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to fetch enrolled courses for Moodle user ${moodleUserId}: ${message}`,
        stack,
      );
      throw error;
    }

    // Fetch roles and groups in parallel using the master key
    const courseContexts = await Promise.all(
      remoteCourses.map(async (rc) => {
        const [roleResult, groupsResult, userGroupsResult] = await Promise.all([
          this.moodleService
            .GetCourseUserProfiles({
              token: env.MOODLE_MASTER_KEY,
              userId: moodleUserId,
              courseId: rc.id,
            })
            .catch((error) => {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.error(
                `Failed to fetch role for course ${rc.id}: ${message}`,
              );
              return null;
            }),
          this.moodleService
            .GetCourseGroups({
              token: env.MOODLE_MASTER_KEY,
              courseId: rc.id,
            })
            .catch((error) => {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.warn(
                `Failed to fetch groups for course ${rc.id}: ${message}`,
              );
              return [] as MoodleCourseGroup[];
            }),
          this.moodleService
            .GetCourseUserGroups({
              token: env.MOODLE_MASTER_KEY,
              courseId: rc.id,
              userId: moodleUserId,
            })
            .catch((error): MoodleCourseUserGroupsResponse => {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.warn(
                `Failed to fetch user groups for course ${rc.id}: ${message}`,
              );
              return { groups: [] };
            }),
        ]);

        return {
          courseId: rc.id,
          role: roleResult
            ? this.moodleService.ExtractRole(roleResult[0])
            : 'student',
          courseGroups: groupsResult,
          userGroupIds: new Set(
            (userGroupsResult.groups ?? []).map((g) => g.id),
          ),
        };
      }),
    );
    const roleMap = new Map(courseContexts.map((c) => [c.courseId, c.role]));
    const courseGroupsMap = new Map(
      courseContexts.map((c) => [c.courseId, c.courseGroups]),
    );
    const userGroupIdsMap = new Map(
      courseContexts.map((c) => [c.courseId, c.userGroupIds]),
    );

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
            courseImage: remoteCourse.courseimage ?? null,
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
            'courseImage',
            'updatedAt',
          ],
        });

        // 2. Upsert Sections for this course
        const courseGroups = courseGroupsMap.get(remoteCourse.id) ?? [];
        const userGroupIds = userGroupIdsMap.get(remoteCourse.id);
        let userSection: Section | null = null;

        for (const group of courseGroups) {
          const sectionData = tx.create(
            Section,
            {
              moodleGroupId: group.id,
              name: group.name,
              description: group.description || undefined,
              course,
            },
            { managed: false },
          );

          const section = await tx.upsert(Section, sectionData, {
            onConflictFields: ['moodleGroupId'],
            onConflictMergeFields: ['name', 'description', 'updatedAt'],
          });

          // Check if this user belongs to this group
          if (userGroupIds?.has(group.id) && !userSection) {
            userSection = section;
          }
        }

        // 3. Upsert Enrollment with section
        const role = roleMap.get(remoteCourse.id) ?? 'student';
        const enrollmentData = tx.create(
          Enrollment,
          {
            user,
            course,
            role,
            section: userSection,
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
      }

      // 3. Resolve Institutional Roles (e.g. Dean)
      await this.resolveInstitutionalRoles(
        user,
        remoteCourses,
        tx,
        moodleToken,
      );

      // Derive user roles from active enrollments and institutional roles
      const activeEnrollments = await tx.find(Enrollment, {
        user,
        isActive: true,
      });
      const institutionalRoles = await tx.find(UserInstitutionalRole, { user });

      user.updateRolesFromEnrollments(activeEnrollments, institutionalRoles);
      tx.persist(user);
    });

    const duration = Date.now() - startTime;
    this.logger.log(
      `Finished hydrating courses for Moodle user ${moodleUserId} in ${duration}ms`,
    );
  }

  private async resolveInstitutionalRoles(
    user: User,
    remoteCourses: MoodleCourse[],
    tx: EntityManager,
    moodleToken: string,
  ) {
    this.logger.log(
      `Resolving institutional roles for user ${user.userName}...`,
    );

    // Map target categories (e.g. Departments at Depth 3) to representative courses
    const targetCategoryMap = new Map<number, number>();

    for (const course of remoteCourses) {
      const directCategory = await tx.findOne(MoodleCategory, {
        moodleCategoryId: course.category,
      });

      if (!directCategory) continue;

      let targetCategory: MoodleCategory | null = null;

      if (directCategory.depth === 4) {
        // Program level -> go up to Department
        targetCategory = await tx.findOne(MoodleCategory, {
          moodleCategoryId: directCategory.parentMoodleCategoryId,
        });
      } else if (directCategory.depth === 3) {
        // Already at Department level
        targetCategory = directCategory;
      }

      if (targetCategory && targetCategory.depth === 3) {
        if (!targetCategoryMap.has(targetCategory.moodleCategoryId)) {
          targetCategoryMap.set(targetCategory.moodleCategoryId, course.id);
        }
      }
    }

    const processedCategoryIds = Array.from(targetCategoryMap.keys());
    const deanCategoryIds: number[] = [];

    // Check capability for each representative course of the target categories
    for (const [categoryId, courseId] of targetCategoryMap) {
      try {
        const usersWithCapability =
          await this.moodleService.GetUsersWithCapability({
            token: moodleToken,
            courseId,
            capability: 'moodle/category:manage',
          });

        const isDean = usersWithCapability.some(
          (u) => u.id === user.moodleUserId,
        );

        if (isDean) {
          deanCategoryIds.push(categoryId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to check capability for category ${categoryId} via course ${courseId}: ${message}`,
        );
      }
    }

    // Sync roles
    for (const categoryId of processedCategoryIds) {
      const moodleCategory = await tx.findOneOrFail(MoodleCategory, {
        moodleCategoryId: categoryId,
      });

      const isDean = deanCategoryIds.includes(categoryId);

      if (isDean) {
        const roleData = tx.create(
          UserInstitutionalRole,
          {
            user,
            role: UserRole.DEAN,
            moodleCategory,
          },
          { managed: false },
        );

        await tx.upsert(UserInstitutionalRole, roleData, {
          onConflictFields: ['user', 'moodleCategory', 'role'],
          onConflictMergeFields: ['updatedAt'],
        });
      } else {
        // Remove dean role if it exists for this category
        const existingRole = await tx.findOne(UserInstitutionalRole, {
          user,
          moodleCategory,
          role: UserRole.DEAN,
        });
        if (existingRole) {
          tx.remove(existingRole);
        }
      }
    }
  }
}
