import { Injectable } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/postgresql';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { ErrorLog } from 'src/entities/error-log.entity';

const RETENTION_DAYS = 90;

@Injectable()
export class ErrorLogCleanupJob extends BaseJob {
  private isRunning = false;

  constructor(
    private readonly em: EntityManager,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, ErrorLogCleanupJob.name);
  }

  protected runStartupTask(): Promise<JobRecordType> {
    return Promise.resolve({
      status: 'skipped',
      details: 'Cleanup runs on schedule only',
    });
  }

  // Daily at 04:00 UTC — runs after ReportCleanupJob (03:00) so they don't
  // pile up on the same connection at the same minute.
  @Cron('0 4 * * *', { name: 'ErrorLogCleanupJob' })
  async handleCleanup(): Promise<void> {
    await this.safeRun();
  }

  private async safeRun(): Promise<JobRecordType> {
    if (this.isRunning) {
      this.logger.log('ErrorLogCleanupJob is already running');
      return { status: 'skipped', details: 'Job is already running' };
    }

    this.isRunning = true;

    try {
      const cutoff = new Date(
        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );

      const deleted = await this.em.nativeDelete(ErrorLog, {
        occurredAt: { $lt: cutoff },
      });

      this.logger.log(
        `Cleaned up ${deleted} error log rows older than ${RETENTION_DAYS} days`,
      );

      return {
        status: 'executed',
        details: `Deleted ${deleted} expired error logs`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error during error-log cleanup:', message);
      return { status: 'failed', details: message };
    } finally {
      this.isRunning = false;
    }
  }
}
