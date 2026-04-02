import { Inject, Injectable } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/postgresql';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { env } from 'src/configurations/index.config';
import { ReportJob } from 'src/entities/report-job.entity';
import { ReportJobRepository } from 'src/repositories/report-job.repository';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from '../interfaces/storage-provider.interface';

@Injectable()
export class ReportCleanupJob extends BaseJob {
  private isRunning = false;

  constructor(
    private readonly reportJobRepository: ReportJobRepository,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
    private readonly em: EntityManager,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, ReportCleanupJob.name);
  }

  protected runStartupTask(): Promise<JobRecordType> {
    return Promise.resolve({
      status: 'skipped',
      details: 'Cleanup runs on schedule only',
    });
  }

  @Cron('0 3 * * *', { name: 'ReportCleanupJob' })
  async handleCleanup(): Promise<void> {
    await this.safeRun();
  }

  private async safeRun(): Promise<JobRecordType> {
    if (this.isRunning) {
      this.logger.log('ReportCleanupJob is already running');
      return { status: 'skipped', details: 'Job is already running' };
    }

    this.isRunning = true;

    try {
      const cutoffDate = new Date(
        Date.now() - env.REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );

      // 1. Clean up expired completed/skipped jobs
      const expiredJobs =
        await this.reportJobRepository.FindExpiredCompleted(cutoffDate);
      const storageKeys = expiredJobs
        .map((j) => j.storageKey)
        .filter((k): k is string => !!k);

      // Batch delete R2 objects — group by prefix for efficiency
      const prefixes = new Set(
        storageKeys.map((k) => k.substring(0, k.lastIndexOf('/') + 1)),
      );
      for (const prefix of prefixes) {
        try {
          await this.storageProvider.DeleteByPrefix(prefix);
        } catch (error) {
          this.logger.warn(
            `Failed to delete R2 prefix ${prefix}: ${(error as Error).message}`,
          );
        }
      }

      let expiredCount = 0;
      if (expiredJobs.length > 0) {
        expiredCount = await this.em.nativeDelete(ReportJob, {
          id: { $in: expiredJobs.map((j) => j.id) },
        });
      }

      // 2. Clean up orphaned waiting jobs (>1hr old)
      const orphanCutoff = new Date(Date.now() - 60 * 60 * 1000);
      const orphanedCount = await this.em.nativeDelete(ReportJob, {
        status: 'waiting',
        createdAt: { $lt: orphanCutoff },
      });

      this.logger.log(
        `Cleaned up ${expiredCount} expired + ${orphanedCount} orphaned report jobs`,
      );

      return {
        status: 'executed',
        details: `Deleted ${expiredCount} expired + ${orphanedCount} orphaned jobs`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error during report cleanup:', message);
      return { status: 'failed', details: message };
    } finally {
      this.isRunning = false;
    }
  }
}
