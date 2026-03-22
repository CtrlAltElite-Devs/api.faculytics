import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { TriggerSyncResponseDto } from '../dto/responses/trigger-sync.response.dto';
import {
  SyncState,
  SyncStatusResponseDto,
} from '../dto/responses/sync-status.response.dto';

@ApiTags('Moodle')
@Controller('moodle')
export class MoodleSyncController {
  private readonly logger = new Logger(MoodleSyncController.name);

  constructor(
    @InjectQueue(QueueName.MOODLE_SYNC) private readonly syncQueue: Queue,
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

      const job = await this.syncQueue.add(
        QueueName.MOODLE_SYNC,
        { trigger: 'manual' },
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
}
