import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QueueName } from 'src/configurations/common/queue-names';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AppClsModule } from '../common/cls/cls.module';
import { AuditService } from './audit.service';
import { AuditProcessor } from './audit.processor';
import { AuditInterceptor } from './interceptors/audit.interceptor';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.AUDIT }),
    MikroOrmModule.forFeature([AuditLog]),
    AppClsModule,
  ],
  providers: [AuditService, AuditProcessor, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
