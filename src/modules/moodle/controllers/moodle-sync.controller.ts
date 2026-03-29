import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityManager } from '@mikro-orm/core';
import { QueueName } from 'src/configurations/common/queue-names';
import { UseJwtGuard } from 'src/security/decorators';
import { Audited } from 'src/modules/audit/decorators/audited.decorator';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import { AuditInterceptor } from 'src/modules/audit/interceptors/audit.interceptor';
import { MetaDataInterceptor } from 'src/modules/common/interceptors/metadata.interceptor';
import { UserRole } from 'src/modules/auth/roles.enum';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import { SyncLog } from 'src/entities/sync-log.entity';
import { TriggerSyncResponseDto } from '../dto/responses/trigger-sync.response.dto';
import {
  SyncState,
  SyncStatusResponseDto,
} from '../dto/responses/sync-status.response.dto';
import { SyncLogResponseDto } from '../dto/responses/sync-log.response.dto';
import { SyncHistoryResponseDto } from '../dto/responses/sync-history.response.dto';
import { SyncScheduleResponseDto } from '../dto/responses/sync-schedule.response.dto';
import { UpdateSyncScheduleDto } from '../dto/requests/update-sync-schedule.request.dto';
import { MoodleSyncScheduler } from '../schedulers/moodle-sync.scheduler';

@ApiTags('Moodle')
@Controller('moodle')
export class MoodleSyncController {
  private readonly logger = new Logger(MoodleSyncController.name);

  constructor(
    @InjectQueue(QueueName.MOODLE_SYNC) private readonly syncQueue: Queue,
    private readonly syncScheduler: MoodleSyncScheduler,
    private readonly em: EntityManager,
    private readonly currentUserService: CurrentUserService,
  ) {}

  @Get('sync/status')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get current Moodle sync status' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: SyncStatusResponseDto })
  async GetSyncStatus(): Promise<SyncStatusResponseDto> {
    const [activeJobs, waitingCount, failedCount] = await Promise.all([
      this.syncQueue.getActive(),
      this.syncQueue.getWaitingCount(),
      this.syncQueue.getFailedCount(),
    ]);

    const activeJob = activeJobs[0];

    if (activeJob) {
      return {
        state: SyncState.ACTIVE,
        jobId: activeJob.id,
        trigger: (activeJob.data as { trigger?: string })?.trigger,
        startedAt: activeJob.processedOn,
        waitingCount,
        failedCount,
      };
    }

    if (waitingCount > 0) {
      return {
        state: SyncState.QUEUED,
        waitingCount,
        failedCount,
      };
    }

    return {
      state: SyncState.IDLE,
      waitingCount: 0,
      failedCount,
    };
  }

  @Post('sync')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger a full Moodle sync (categories, courses, enrollments)',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: TriggerSyncResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — superadmin only' })
  @ApiResponse({
    status: 409,
    description: 'Sync already in progress or queued',
  })
  @ApiResponse({ status: 503, description: 'Sync queue unavailable' })
  @Audited({ action: AuditAction.ADMIN_SYNC_TRIGGER, resource: 'SyncLog' })
  @UseInterceptors(
    MetaDataInterceptor,
    CurrentUserInterceptor,
    AuditInterceptor,
  )
  async TriggerSync(): Promise<TriggerSyncResponseDto> {
    try {
      const [activeCount, waitingCount] = await Promise.all([
        this.syncQueue.getActiveCount(),
        this.syncQueue.getWaitingCount(),
      ]);

      if (activeCount + waitingCount > 0) {
        throw new HttpException(
          { error: 'Sync already in progress or queued' },
          HttpStatus.CONFLICT,
        );
      }

      const user = this.currentUserService.getOrFail();

      const job = await this.syncQueue.add(
        QueueName.MOODLE_SYNC,
        { trigger: 'manual', triggeredById: user.id },
        {
          jobId: `moodle-sync-manual-${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );

      this.logger.log(`Manual moodle-sync job enqueued: ${job.id}`);
      return { jobId: job.id! };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to enqueue manual sync: ${message}`);

      throw new HttpException(
        { error: 'Sync queue unavailable' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('sync/history')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get paginated Moodle sync history' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: SyncHistoryResponseDto })
  async GetSyncHistory(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ): Promise<SyncHistoryResponseDto> {
    const fork = this.em.fork();
    const currentPage = Math.max(1, Number(page));
    const itemsPerPage = Math.min(100, Math.max(1, Number(limit)));
    const offset = (currentPage - 1) * itemsPerPage;

    const [logs, totalItems] = await fork.findAndCount(
      SyncLog,
      {},
      {
        orderBy: { startedAt: 'desc' },
        limit: itemsPerPage,
        offset,
        populate: ['triggeredBy'],
        filters: { softDelete: false },
      },
    );

    return {
      data: logs.map((log) => SyncLogResponseDto.Map(log)),
      meta: {
        totalItems,
        itemCount: logs.length,
        itemsPerPage,
        totalPages: Math.ceil(totalItems / itemsPerPage),
        currentPage,
      },
    };
  }

  @Get('sync/schedule')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get current sync schedule' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: SyncScheduleResponseDto })
  GetSyncSchedule(): SyncScheduleResponseDto {
    return this.syncScheduler.getSchedule();
  }

  @Put('sync/schedule')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @Audited({
    action: AuditAction.ADMIN_SYNC_SCHEDULE_UPDATE,
    resource: 'SystemConfig',
  })
  @UseInterceptors(MetaDataInterceptor, AuditInterceptor)
  @ApiOperation({ summary: 'Update sync schedule interval' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: SyncScheduleResponseDto })
  async UpdateSyncSchedule(
    @Body() dto: UpdateSyncScheduleDto,
  ): Promise<SyncScheduleResponseDto> {
    await this.syncScheduler.updateSchedule(dto.intervalMinutes);
    return this.syncScheduler.getSchedule();
  }
}
