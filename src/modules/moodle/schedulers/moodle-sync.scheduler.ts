import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';

@Injectable()
export class MoodleSyncScheduler {
  private readonly logger = new Logger(MoodleSyncScheduler.name);

  constructor(
    @InjectQueue(QueueName.MOODLE_SYNC) private readonly syncQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async HandleScheduledSync() {
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
}
