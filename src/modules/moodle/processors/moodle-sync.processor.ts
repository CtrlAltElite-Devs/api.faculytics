import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/core';
import { env } from 'src/configurations/env';
import { QueueName } from 'src/configurations/common/queue-names';
import { SyncLog } from 'src/entities/sync-log.entity';
import { User } from 'src/entities/user.entity';
import { MoodleCategorySyncService } from '../services/moodle-category-sync.service';
import { MoodleCourseSyncService } from '../services/moodle-course-sync.service';
import { EnrollmentSyncService } from '../services/moodle-enrollment-sync.service';
import { CacheService } from 'src/modules/common/cache/cache.service';
import { CacheNamespace } from 'src/modules/common/cache/cache-namespaces';
import {
  MoodleSyncJobData,
  SyncPhaseResult,
  SyncStatus,
} from '../lib/sync-result.types';

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
    private readonly em: EntityManager,
  ) {
    super();
  }

  async process(job: Job<MoodleSyncJobData>): Promise<SyncLog> {
    const fork = this.em.fork();
    const startedAt = new Date();

    this.logger.log(
      `Processing moodle-sync job ${job.id} (trigger: ${job.data?.trigger ?? 'unknown'})`,
    );

    const syncLog = fork.create(SyncLog, {
      trigger: job.data?.trigger ?? 'scheduled',
      triggeredBy: job.data?.triggeredById
        ? fork.getReference(User, job.data.triggeredById)
        : undefined,
      status: 'running',
      startedAt,
      jobId: job.id,
    });
    await fork.persistAndFlush(syncLog);

    let coursesResult: SyncPhaseResult | undefined;
    let enrollmentsResult: SyncPhaseResult | undefined;

    // Phase 1: Categories (required — courses/enrollments depend on hierarchy)
    const categoriesResult =
      await this.categorySyncService.SyncAndRebuildHierarchy();
    syncLog.categories = categoriesResult;
    await fork.flush();

    if (categoriesResult.status === 'failed') {
      this.logger.error(
        `Category sync failed — aborting remaining phases: ${categoriesResult.errorMessage}`,
      );
      coursesResult = {
        status: 'skipped',
        durationMs: 0,
        fetched: 0,
        inserted: 0,
        updated: 0,
        deactivated: 0,
        errors: 0,
      };
      enrollmentsResult = {
        status: 'skipped',
        durationMs: 0,
        fetched: 0,
        inserted: 0,
        updated: 0,
        deactivated: 0,
        errors: 0,
      };
    } else {
      this.logger.log('Category sync completed');

      // Phase 2: Courses (required — enrollments depend on courses)
      coursesResult = await this.courseSyncService.SyncAllPrograms();
      syncLog.courses = coursesResult;
      await fork.flush();

      if (coursesResult.status === 'failed') {
        this.logger.error(
          `Course sync failed — skipping enrollment sync: ${coursesResult.errorMessage}`,
        );
        enrollmentsResult = {
          status: 'skipped',
          durationMs: 0,
          fetched: 0,
          inserted: 0,
          updated: 0,
          deactivated: 0,
          errors: 0,
        };
      } else {
        this.logger.log('Course sync completed');

        // Phase 3: Enrollments
        enrollmentsResult = await this.enrollmentSyncService.SyncAllCourses();
        syncLog.enrollments = enrollmentsResult;

        if (enrollmentsResult.status !== 'failed') {
          this.logger.log('Enrollment sync completed');
          await this.cacheService.invalidateNamespace(
            CacheNamespace.ENROLLMENTS_ME,
          );
        } else {
          this.logger.error(
            `Enrollment sync failed: ${enrollmentsResult.errorMessage}`,
          );
        }
      }
    }

    // Finalize sync log
    const completedAt = new Date();
    syncLog.courses = coursesResult;
    syncLog.enrollments = enrollmentsResult;
    syncLog.completedAt = completedAt;
    syncLog.durationMs = completedAt.getTime() - startedAt.getTime();
    syncLog.status = this.resolveOverallStatus(
      categoriesResult,
      coursesResult,
      enrollmentsResult,
    );
    await fork.flush();

    return syncLog;
  }

  private resolveOverallStatus(
    categories: SyncPhaseResult,
    courses: SyncPhaseResult,
    enrollments: SyncPhaseResult,
  ): SyncStatus {
    const phases = [categories, courses, enrollments];
    const allFailed = phases.every(
      (p) => p.status === 'failed' || p.status === 'skipped',
    );
    const allSuccess = phases.every((p) => p.status === 'success');

    if (allFailed) return 'failed';
    if (allSuccess) return 'completed';
    return 'partial';
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
