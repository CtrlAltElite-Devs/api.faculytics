import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import type { EmitErrorParams } from './dto/emit-error-params.dto';
import type { ErrorLogJobMessage } from './dto/error-log-job-message.dto';

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(
    @InjectQueue(QueueName.ERROR_LOG) private readonly errorLogQueue: Queue,
  ) {}

  async Emit(params: EmitErrorParams): Promise<void> {
    const envelope: ErrorLogJobMessage = {
      ...params,
      occurredAt: new Date().toISOString(),
    };

    try {
      await this.errorLogQueue.add('error-log', envelope, {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (error) {
      // We can't surface this as another 500 — we'd recurse through the
      // exception filter. Best effort: write a structured warning so it
      // shows up in stdout/pino even if the queue is unreachable.
      this.logger.warn(
        `Failed to enqueue error log: statusCode=${params.statusCode}, ` +
          `path=${params.path}, errorName=${params.errorName} — ` +
          `${(error as Error).message}`,
      );
    }
  }
}
