import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SyncPhaseResult } from '../../lib/sync-result.types';
import { SyncLog } from 'src/entities/sync-log.entity';

class SyncPhaseResultDto implements SyncPhaseResult {
  @ApiProperty()
  status: 'success' | 'failed' | 'skipped';

  @ApiProperty()
  durationMs: number;

  @ApiProperty()
  fetched: number;

  @ApiProperty()
  inserted: number;

  @ApiProperty()
  updated: number;

  @ApiProperty()
  deactivated: number;

  @ApiProperty()
  errors: number;

  @ApiPropertyOptional()
  errorMessage?: string;
}

export class SyncLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  trigger: string;

  @ApiPropertyOptional()
  triggeredById?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiPropertyOptional()
  durationMs?: number;

  @ApiPropertyOptional({ type: SyncPhaseResultDto })
  categories?: SyncPhaseResult;

  @ApiPropertyOptional({ type: SyncPhaseResultDto })
  courses?: SyncPhaseResult;

  @ApiPropertyOptional({ type: SyncPhaseResultDto })
  enrollments?: SyncPhaseResult;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiPropertyOptional()
  jobId?: string;

  @ApiPropertyOptional()
  cronExpression?: string;

  static Map(entity: SyncLog): SyncLogResponseDto {
    return {
      id: entity.id,
      trigger: entity.trigger,
      triggeredById: entity.triggeredBy?.id,
      status: entity.status,
      startedAt: entity.startedAt,
      completedAt: entity.completedAt,
      durationMs: entity.durationMs,
      categories: entity.categories,
      courses: entity.courses,
      enrollments: entity.enrollments,
      errorMessage: entity.errorMessage,
      jobId: entity.jobId,
      cronExpression: entity.cronExpression,
    };
  }
}
