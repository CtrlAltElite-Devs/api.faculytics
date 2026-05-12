import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QueueName } from 'src/configurations/common/queue-names';
import { ErrorLog } from 'src/entities/error-log.entity';
import { User } from 'src/entities/user.entity';
import { AppClsModule } from '../common/cls/cls.module';
import { ErrorLogService } from './error-log.service';
import { ErrorLogProcessor } from './error-log.processor';
import { ErrorLogQueryService } from './error-log-query.service';
import { ErrorLogController } from './error-log.controller';
import { ErrorCaptureFilter } from './filters/error-capture.filter';
import { ErrorLogCleanupJob } from './jobs/error-log-cleanup.job';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.ERROR_LOG }),
    // User is registered alongside ErrorLog so the RolesGuard injected by
    // `@UseJwtGuard(SUPER_ADMIN)` on ErrorLogController can resolve
    // UserRepository inside this module's scope.
    MikroOrmModule.forFeature([ErrorLog, User]),
    AppClsModule,
  ],
  controllers: [ErrorLogController],
  providers: [
    ErrorLogService,
    ErrorLogProcessor,
    ErrorLogQueryService,
    ErrorLogCleanupJob,
    {
      provide: APP_FILTER,
      useClass: ErrorCaptureFilter,
    },
  ],
  exports: [ErrorLogService],
})
export class SystemErrorsModule {}
