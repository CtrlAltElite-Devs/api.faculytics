import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CronJob } from 'cron';
import { EntityManager } from '@mikro-orm/core';
import { QueueName } from 'src/configurations/common/queue-names';
import { SystemConfig } from 'src/entities/system-config.entity';
import { env } from 'src/configurations/env';
import {
  MOODLE_SYNC_JOB_NAME,
  MOODLE_SYNC_CONFIG_KEY,
  MOODLE_SYNC_INTERVAL_DEFAULTS,
  MOODLE_SYNC_MIN_INTERVAL_MINUTES,
  minutesToCron,
} from './moodle-sync.constants';

@Injectable()
export class MoodleSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(MoodleSyncScheduler.name);
  private currentIntervalMinutes: number;
  private currentCronExpression: string;

  constructor(
    @InjectQueue(QueueName.MOODLE_SYNC) private readonly syncQueue: Queue,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly em: EntityManager,
  ) {}

  async onModuleInit() {
    const interval = await this.resolveInterval();
    this.currentIntervalMinutes = interval;
    this.currentCronExpression = minutesToCron(interval);

    const job = CronJob.from({
      cronTime: this.currentCronExpression,
      onTick: () => this.handleScheduledSync(),
      start: true,
    });

    this.schedulerRegistry.addCronJob(MOODLE_SYNC_JOB_NAME, job);
    this.logger.log(
      `Sync scheduler initialized: every ${interval}min (${this.currentCronExpression})`,
    );
  }

  async updateSchedule(intervalMinutes: number): Promise<void> {
    const cronExpression = minutesToCron(intervalMinutes);

    // Validate by constructing — throws if invalid
    CronJob.from({ cronTime: cronExpression, onTick: () => {} });

    // Replace the running job
    this.schedulerRegistry.deleteCronJob(MOODLE_SYNC_JOB_NAME);

    const job = CronJob.from({
      cronTime: cronExpression,
      onTick: () => this.handleScheduledSync(),
      start: true,
    });

    this.schedulerRegistry.addCronJob(MOODLE_SYNC_JOB_NAME, job);

    // Persist to SystemConfig
    const fork = this.em.fork();
    const config = await fork.findOne(SystemConfig, {
      key: MOODLE_SYNC_CONFIG_KEY,
    });

    if (config) {
      config.value = String(intervalMinutes);
    } else {
      fork.create(SystemConfig, {
        key: MOODLE_SYNC_CONFIG_KEY,
        value: String(intervalMinutes),
        description: 'Moodle sync interval in minutes',
      });
    }
    await fork.flush();

    this.currentIntervalMinutes = intervalMinutes;
    this.currentCronExpression = cronExpression;
    this.logger.log(
      `Sync schedule updated: every ${intervalMinutes}min (${cronExpression})`,
    );
  }

  getSchedule(): {
    intervalMinutes: number;
    cronExpression: string;
    nextExecution: string | null;
  } {
    const job = this.schedulerRegistry.getCronJob(MOODLE_SYNC_JOB_NAME);
    const nextDate = job.nextDate();

    return {
      intervalMinutes: this.currentIntervalMinutes,
      cronExpression: this.currentCronExpression,
      nextExecution: nextDate?.toISO() ?? null,
    };
  }

  private async handleScheduledSync() {
    try {
      await this.syncQueue.add(
        QueueName.MOODLE_SYNC,
        { trigger: 'scheduled' },
        {
          jobId: 'moodle-sync-scheduled',
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
      this.logger.log('Scheduled moodle-sync job enqueued');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('duplicate') ||
        message.includes('Job already exists')
      ) {
        this.logger.log('Scheduled sync skipped — job already queued');
      } else {
        this.logger.error(`Failed to enqueue scheduled sync: ${message}`);
      }
    }
  }

  private async resolveInterval(): Promise<number> {
    // Priority 1: Database config (admin override)
    try {
      const fork = this.em.fork();
      const config = await fork.findOne(SystemConfig, {
        key: MOODLE_SYNC_CONFIG_KEY,
      });
      if (config?.value) {
        const parsed = parseInt(config.value, 10);
        if (!isNaN(parsed) && parsed >= MOODLE_SYNC_MIN_INTERVAL_MINUTES) {
          this.logger.log(
            `Using sync interval from database: ${parsed} minutes`,
          );
          return parsed;
        }
      }
    } catch {
      this.logger.warn(
        'Could not read sync interval from database, falling back to env/default',
      );
    }

    // Priority 2: Environment variable
    if (env.MOODLE_SYNC_INTERVAL_MINUTES) {
      this.logger.log(
        `Using sync interval from env: ${env.MOODLE_SYNC_INTERVAL_MINUTES} minutes`,
      );
      return env.MOODLE_SYNC_INTERVAL_MINUTES;
    }

    // Priority 3: Per-environment default
    const defaultInterval =
      MOODLE_SYNC_INTERVAL_DEFAULTS[env.NODE_ENV] ??
      MOODLE_SYNC_INTERVAL_DEFAULTS.development;
    this.logger.log(
      `Using default sync interval for ${env.NODE_ENV}: ${defaultInterval} minutes`,
    );
    return defaultInterval;
  }
}
