import { Injectable } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { REFRESH_TOKEN_RETENTION_DAYS } from './refresh-token-cleanup.constants';

@Injectable()
export class RefreshTokenCleanupJob extends BaseJob {
  private isRunning = false;

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, RefreshTokenCleanupJob.name);
  }

  protected runStartupTask(): Promise<JobRecordType> {
    return Promise.resolve({
      status: 'skipped',
      details: 'Cleanup not needed at startup',
    });
  }

  @Cron('0 */12 * * *', { name: RefreshTokenCleanupJob.name })
  async handleCleanup() {
    await this.safeRun();
  }

  private async safeRun(): Promise<JobRecordType> {
    if (this.isRunning) {
      this.logger.log(`${RefreshTokenCleanupJob.name} is already running`);
      return {
        status: 'skipped',
        details: 'Job is already running',
      };
    }

    this.isRunning = true;

    try {
      const cutoffDate = new Date(
        Date.now() - REFRESH_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const deletedCount =
        await this.refreshTokenRepository.deleteExpired(cutoffDate);
      this.logger.log(
        `${RefreshTokenCleanupJob.name} deleted ${deletedCount} expired tokens`,
      );
      return {
        status: 'executed',
        details: `Deleted ${deletedCount} expired tokens`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error cleaning up refresh tokens:`, message);
      return { status: 'failed', details: message };
    } finally {
      this.isRunning = false;
    }
  }
}
