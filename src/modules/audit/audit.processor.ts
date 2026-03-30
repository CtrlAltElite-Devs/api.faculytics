import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { QueueName } from 'src/configurations/common/queue-names';
import { AuditLog } from 'src/entities/audit-log.entity';
import type { AuditJobMessage } from './dto/audit-job-message.dto';

@Processor(QueueName.AUDIT, { concurrency: 1 })
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(private readonly em: EntityManager) {
    super();
  }

  async process(job: Job<AuditJobMessage>): Promise<void> {
    const {
      action,
      actorId,
      actorUsername,
      resourceType,
      resourceId,
      metadata,
      browserName,
      os,
      ipAddress,
      occurredAt,
    } = job.data;

    const fork = this.em.fork();
    fork.create(AuditLog, {
      action,
      actorId,
      actorUsername,
      resourceType,
      resourceId,
      metadata,
      browserName,
      os,
      ipAddress,
      occurredAt: new Date(occurredAt),
    });
    await fork.flush();

    this.logger.log(`Persisted audit log: ${action}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<AuditJobMessage>, error: Error) {
    this.logger.error(
      `Audit job ${job.id} failed (attempt ${job.attemptsMade}): ` +
        `action=${job.data.action}, actorId=${job.data.actorId}, ` +
        `resourceType=${job.data.resourceType}, resourceId=${job.data.resourceId}, ` +
        `occurredAt=${job.data.occurredAt} — ${error.message}`,
    );
  }
}
