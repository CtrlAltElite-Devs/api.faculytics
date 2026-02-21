import { Injectable, Logger } from '@nestjs/common';
import { User } from 'src/entities/user.entity';
import { Program } from 'src/entities/program.entity';
import { Course } from 'src/entities/course.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { env } from 'src/configurations/env';
import { EntityManager } from '@mikro-orm/core';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import { MoodleCourse } from '../lib/moodle.types';

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

    // Fetch roles in parallel using the master key to ensure we get the full profile
    const rolesPerCourse = await Promise.all(
      remoteCourses.map(async (rc) => {
        try {
          const profiles = await this.moodleService.GetCourseUserProfiles({
            token: env.MOODLE_MASTER_KEY,
            userId: moodleUserId,
            courseId: rc.id,
          });
          return {
            courseId: rc.id,
            role: this.moodleService.ExtractRole(profiles[0]),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to fetch role for course ${rc.id}: ${message}`,
          );
          return { courseId: rc.id, role: 'student' };
        }
      }),
    );
    const roleMap = new Map(rolesPerCourse.map((r) => [r.courseId, r.role]));

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
        const role = roleMap.get(remoteCourse.id) ?? 'student';
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
            role: 'dean',
            moodleCategory,
          },
          { managed: false },
        );

        await tx.upsert(UserInstitutionalRole, roleData, {
          onConflictFields: ['user', 'moodleCategory', 'role'],
          onConflictMergeFields: ['updatedAt'],
        });
      } else {
        // Remove 'dean' role if it exists for this category
        const existingRole = await tx.findOne(UserInstitutionalRole, {
          user,
          moodleCategory,
          role: 'dean',
        });
        if (existingRole) {
          tx.remove(existingRole);
        }
      }
    }
  }
}
