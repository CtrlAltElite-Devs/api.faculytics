import { Injectable } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { MoodleCourseSyncService } from 'src/modules/moodle/services/moodle-course-sync.service';

@Injectable()
export class CourseSyncJob extends BaseJob {
  private isRunning = false;

  constructor(
    private readonly courseSyncService: MoodleCourseSyncService,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, CourseSyncJob.name);
  }

  protected runStartupTask(): Promise<JobRecordType> {
    return Promise.resolve({
      status: 'skipped',
      details: 'Full course sync skipped at startup for performance.',
    });
  }

  @Cron(CronExpression.EVERY_HOUR, { name: CourseSyncJob.name })
  async handleCourseSync() {
    await this.safeRun();
  }

  private async safeRun(): Promise<JobRecordType> {
    if (this.isRunning) {
      this.logger.log(`${CourseSyncJob.name} is already running`);
      return {
        status: 'skipped',
        details: 'Job is already running',
      };
    }

    this.isRunning = true;

    try {
      await this.courseSyncService.syncAllPrograms();
      this.logger.log(`${CourseSyncJob.name} finished syncing courses`);
      this.isRunning = false;
      return {
        status: 'executed',
        details: `${CourseSyncJob.name} finished syncing courses`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error syncing courses:`, message);
      this.isRunning = false;
      return { status: 'failed', details: message };
    }
  }
}
