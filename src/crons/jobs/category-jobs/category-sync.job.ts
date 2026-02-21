import { Injectable } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { MoodleCategorySyncService } from 'src/modules/moodle/services/moodle-category-sync.service';

@Injectable()
export class CategorySyncJob extends BaseJob {
  private isRunning = false;

  constructor(
    private readonly categorySyncService: MoodleCategorySyncService,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, CategorySyncJob.name);
  }

  protected async runStartupTask(): Promise<JobRecordType> {
    return await this.safeRun();
  }

  @Cron(CronExpression.EVERY_30_MINUTES, { name: CategorySyncJob.name })
  async handleCategorySync() {
    await this.safeRun();
  }

  private async safeRun(): Promise<JobRecordType> {
    if (this.isRunning) {
      this.logger.log(`${CategorySyncJob.name} is already running`);
      return {
        status: 'skipped',
        details: 'Job is already running',
      };
    }

    this.isRunning = true;

    try {
      await this.categorySyncService.SyncAndRebuildHierarchy();
      this.logger.log(`${CategorySyncJob.name} finished syncing categories`);
      this.isRunning = false;
      return {
        status: 'executed',
        details: `${CategorySyncJob.name} finished syncing categories`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error syncing categories:`, message);
      this.isRunning = false;
      return { status: 'failed', details: message };
    }
  }
}
