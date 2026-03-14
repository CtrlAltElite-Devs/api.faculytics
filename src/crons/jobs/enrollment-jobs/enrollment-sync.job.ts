import { Injectable } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { EnrollmentSyncService } from 'src/modules/moodle/services/moodle-enrollment-sync.service';
import { CacheService } from 'src/modules/common/cache/cache.service';
import { CacheNamespace } from 'src/modules/common/cache/cache-namespaces';

@Injectable()
export class EnrollmentSyncJob extends BaseJob {
  private isRunning = false;

  constructor(
    private readonly enrollmentSyncService: EnrollmentSyncService,
    private readonly cacheService: CacheService,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, EnrollmentSyncJob.name);
  }

  protected async runStartupTask(): Promise<JobRecordType> {
    return await this.safeRun();
  }

  @Cron(CronExpression.EVERY_HOUR, { name: EnrollmentSyncJob.name })
  async handleEnrollmentSync() {
    await this.safeRun();
  }

  private async safeRun(): Promise<JobRecordType> {
    if (this.isRunning) {
      this.logger.log(`${EnrollmentSyncJob.name} is already running`);
      return {
        status: 'skipped',
        details: 'Job is already running',
      };
    }

    this.isRunning = true;

    try {
      await this.enrollmentSyncService.syncAllCourses();
      await this.cacheService.invalidateNamespace(
        CacheNamespace.ENROLLMENTS_ME,
      );
      this.logger.log(`${EnrollmentSyncJob.name} finished syncing enrollments`);
      this.isRunning = false;
      return {
        status: 'executed',
        details: `${EnrollmentSyncJob.name} finished syncing enrollments`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error syncing enrollments:`, message);
      this.isRunning = false;
      return { status: 'failed', details: message };
    }
  }
}
