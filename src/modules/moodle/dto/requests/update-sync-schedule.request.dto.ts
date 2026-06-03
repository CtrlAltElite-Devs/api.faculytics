import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { MOODLE_SYNC_MIN_INTERVAL_MINUTES } from '../../schedulers/moodle-sync.constants';

export class UpdateSyncScheduleDto {
  @ApiPropertyOptional({
    description: `Sync interval in minutes (minimum ${MOODLE_SYNC_MIN_INTERVAL_MINUTES})`,
    example: 60,
    minimum: MOODLE_SYNC_MIN_INTERVAL_MINUTES,
  })
  @IsOptional()
  @IsInt()
  @Min(MOODLE_SYNC_MIN_INTERVAL_MINUTES)
  intervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Enable or disable the sync cron job',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
