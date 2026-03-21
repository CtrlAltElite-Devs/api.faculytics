import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { env } from 'src/configurations/env';
import { QueueName } from 'src/configurations/common/queue-names';
import { MoodleCategorySyncService } from '../services/moodle-category-sync.service';
import { MoodleCourseSyncService } from '../services/moodle-course-sync.service';
import { EnrollmentSyncService } from '../services/moodle-enrollment-sync.service';
import { CacheService } from 'src/modules/common/cache/cache.service';
import { CacheNamespace } from 'src/modules/common/cache/cache-namespaces';

interface MoodleSyncResult {
  categories: boolean;
  courses: boolean;
  enrollments: boolean;
}

@Processor(QueueName.MOODLE_SYNC, {
  concurrency: 1,
  stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS,
  maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
})
export class MoodleSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MoodleSyncProcessor.name);

  constructor(
    private readonly categorySyncService: MoodleCategorySyncService,
    private readonly courseSyncService: MoodleCourseSyncService,
    private readonly enrollmentSyncService: EnrollmentSyncService,
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  async process(job: Job<{ trigger?: string }>): Promise<MoodleSyncResult> {
    this.logger.log(
      `Processing moodle-sync job ${job.id} (trigger: ${job.data?.trigger ?? 'unknown'})`,
    );

    const result: MoodleSyncResult = {
      categories: false,
      courses: false,
      enrollments: false,
    };

    // Phase 1: Categories (required — courses/enrollments depend on hierarchy)
    try {
      await this.categorySyncService.SyncAndRebuildHierarchy();
      result.categories = true;
      this.logger.log('Category sync completed');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Category sync failed — aborting remaining phases: ${message}`,
      );
      return result;
    }

    // Phase 2: Courses (required — enrollments depend on courses)
    try {
      await this.courseSyncService.SyncAllPrograms();
      result.courses = true;
      this.logger.log('Course sync completed');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Course sync failed — skipping enrollment sync: ${message}`,
      );
      return result;
    }

    // Phase 3: Enrollments
    try {
      await this.enrollmentSyncService.SyncAllCourses();
      result.enrollments = true;
      this.logger.log('Enrollment sync completed');

      await this.cacheService.invalidateNamespace(
        CacheNamespace.ENROLLMENTS_ME,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Enrollment sync failed: ${message}`);
    }

    return result;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.queueName}) failed on attempt ${job.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Job ${jobId} stalled — investigating`);
  }
}
