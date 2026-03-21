import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { env } from 'src/configurations/env';
import { Course } from 'src/entities/course.entity';
import {
  JobRecordType,
  StartupJobRegistry,
} from 'src/crons/startup-job-registry';
import { MoodleCategorySyncService } from './moodle-category-sync.service';
import { MoodleCourseSyncService } from './moodle-course-sync.service';
import { EnrollmentSyncService } from './moodle-enrollment-sync.service';
import { CacheService } from 'src/modules/common/cache/cache.service';
import { CacheNamespace } from 'src/modules/common/cache/cache-namespaces';

@Injectable()
export class MoodleStartupService {
  private readonly logger = new Logger(MoodleStartupService.name);

  constructor(
    private readonly categorySyncService: MoodleCategorySyncService,
    private readonly courseSyncService: MoodleCourseSyncService,
    private readonly enrollmentSyncService: EnrollmentSyncService,
    private readonly cacheService: CacheService,
    private readonly em: EntityManager,
  ) {}

  async RunStartupSync(): Promise<void> {
    // Phase 1: Categories
    let categoryResult: JobRecordType;

    if (env.DISABLE_SYNC_CATEGORY_ON_STARTUP) {
      categoryResult = { status: 'skipped' };
      StartupJobRegistry.record('CategorySync', categoryResult);
    } else {
      categoryResult = await this.RunPhase('CategorySync', () =>
        this.categorySyncService.SyncAndRebuildHierarchy(),
      );
      StartupJobRegistry.record('CategorySync', categoryResult);
    }

    if (!env.SYNC_ON_STARTUP) {
      StartupJobRegistry.record('CourseSync', { status: 'skipped' });
      StartupJobRegistry.record('EnrollmentSync', { status: 'skipped' });

      // Check for empty database warning
      const courseCount = await this.em.fork().count(Course, {});
      if (courseCount === 0) {
        this.logger.warn(
          'No courses found in database and SYNC_ON_STARTUP is disabled. ' +
            'Enable SYNC_ON_STARTUP=true or use POST /moodle/sync to populate data.',
        );
      }
      return;
    }

    // Abort downstream phases if category sync failed
    if (categoryResult.status === 'failed') {
      this.logger.error(
        'Skipping course and enrollment sync — category sync failed',
      );
      StartupJobRegistry.record('CourseSync', {
        status: 'skipped',
        details: 'Skipped — category sync failed',
      });
      StartupJobRegistry.record('EnrollmentSync', {
        status: 'skipped',
        details: 'Skipped — category sync failed',
      });
      return;
    }

    // Phase 2: Courses
    const courseResult = await this.RunPhase('CourseSync', () =>
      this.courseSyncService.SyncAllPrograms(),
    );
    StartupJobRegistry.record('CourseSync', courseResult);

    if (courseResult.status === 'failed') {
      this.logger.error('Skipping enrollment sync — course sync failed');
      StartupJobRegistry.record('EnrollmentSync', {
        status: 'skipped',
        details: 'Skipped — course sync failed',
      });
      return;
    }

    // Phase 3: Enrollments
    const enrollmentResult = await this.RunPhase('EnrollmentSync', () =>
      this.enrollmentSyncService.SyncAllCourses(),
    );
    StartupJobRegistry.record('EnrollmentSync', enrollmentResult);

    if (enrollmentResult.status === 'executed') {
      await this.cacheService.invalidateNamespace(
        CacheNamespace.ENROLLMENTS_ME,
      );
    }
  }

  private async RunPhase(
    name: string,
    fn: () => Promise<void>,
  ): Promise<JobRecordType> {
    const start = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - start;
      this.logger.log(`${name} completed in ${elapsed}ms`);
      return {
        status: 'executed',
        details: `${name} completed in ${elapsed}ms`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const elapsed = Date.now() - start;
      this.logger.error(`${name} failed after ${elapsed}ms: ${message}`);
      return { status: 'failed', details: message };
    }
  }
}
