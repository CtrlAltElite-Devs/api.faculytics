import { Injectable } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { EnrollmentSyncService } from 'src/modules/moodle/moodle-enrollment-sync.service';

@Injectable()
export class EnrollmentSyncJob extends BaseJob {
  private isRunning = false;

  constructor(
    private readonly enrollmentSyncService: EnrollmentSyncService,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, EnrollmentSyncJob.name);
  }

  protected runStartupTask(): Promise<JobRecordType> {
    return Promise.resolve({
      status: 'skipped',
      details: 'Full enrollment sync skipped at startup for performance.',
    });
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
