import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import type { AuditJobMessage } from './dto/audit-job-message.dto';
import type { EmitParams } from './dto/emit-params.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectQueue(QueueName.AUDIT) private readonly auditQueue: Queue,
  ) {}

  async Emit(params: EmitParams): Promise<void> {
    const envelope: AuditJobMessage = {
      ...params,
      occurredAt: new Date().toISOString(),
    };

    try {
      await this.auditQueue.add('audit', envelope, {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue audit event: action=${params.action}, ` +
          `actorId=${params.actorId}, resourceType=${params.resourceType}, ` +
          `resourceId=${params.resourceId} — ${(error as Error).message}`,
      );
    }
  }
}
