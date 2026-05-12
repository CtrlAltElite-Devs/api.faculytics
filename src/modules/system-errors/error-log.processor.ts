import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { QueueName } from 'src/configurations/common/queue-names';
import { ErrorLog } from 'src/entities/error-log.entity';
import type { ErrorLogJobMessage } from './dto/error-log-job-message.dto';

@Processor(QueueName.ERROR_LOG, { concurrency: 1 })
export class ErrorLogProcessor extends WorkerHost {
  private readonly logger = new Logger(ErrorLogProcessor.name);

  constructor(private readonly em: EntityManager) {
    super();
  }

  async process(job: Job<ErrorLogJobMessage>): Promise<void> {
    const {
      statusCode,
      method,
      path,
      userId,
      userName,
      errorName,
      message,
      stack,
      requestBody,
      requestQuery,
      browserName,
      os,
      ipAddress,
      occurredAt,
    } = job.data;

    const fork = this.em.fork();
    fork.create(ErrorLog, {
      statusCode,
      method,
      path,
      userId,
      userName,
      errorName,
      message,
      stack,
      requestBody,
      requestQuery,
      browserName,
      os,
      ipAddress,
      occurredAt: new Date(occurredAt),
    });
    await fork.flush();

    this.logger.log(
      `Persisted error log: ${statusCode} ${method} ${path} — ${errorName}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ErrorLogJobMessage>, error: Error) {
    this.logger.error(
      `Error log job ${job.id} failed (attempt ${job.attemptsMade}): ` +
        `statusCode=${job.data.statusCode}, path=${job.data.path}, ` +
        `errorName=${job.data.errorName}, occurredAt=${job.data.occurredAt} — ` +
        `${error.message}`,
    );
  }
}
