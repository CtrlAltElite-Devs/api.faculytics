import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum SyncState {
  IDLE = 'idle',
  ACTIVE = 'active',
  QUEUED = 'queued',
}

export class SyncStatusResponseDto {
  @IsEnum(SyncState)
  @ApiProperty({ enum: SyncState, description: 'Current sync pipeline state' })
  state: SyncState;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Job ID of the active or queued sync' })
  jobId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'What triggered the sync (manual or scheduled)',
  })
  trigger?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({
    description: 'Unix timestamp (ms) when the job was created',
  })
  startedAt?: number;

  @IsNumber()
  @ApiProperty({ description: 'Number of waiting jobs in the queue' })
  waitingCount: number;

  @IsNumber()
  @ApiProperty({ description: 'Number of failed jobs retained in the queue' })
  failedCount: number;
}
