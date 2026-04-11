import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QueueName } from 'src/configurations/common/queue-names';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AppClsModule } from '../common/cls/cls.module';
import { AuditService } from './audit.service';
import { AuditProcessor } from './audit.processor';
import { AuditQueryService } from './audit-query.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditController } from './audit.controller';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.AUDIT }),
    MikroOrmModule.forFeature([AuditLog]),
    AppClsModule,
  ],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditProcessor,
    AuditInterceptor,
    AuditQueryService,
  ],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
