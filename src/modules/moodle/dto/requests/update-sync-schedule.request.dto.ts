import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { MOODLE_SYNC_MIN_INTERVAL_MINUTES } from '../../schedulers/moodle-sync.constants';

export class UpdateSyncScheduleDto {
  @ApiProperty({
    description: `Sync interval in minutes (minimum ${MOODLE_SYNC_MIN_INTERVAL_MINUTES})`,
    example: 60,
    minimum: MOODLE_SYNC_MIN_INTERVAL_MINUTES,
  })
  @IsInt()
  @Min(MOODLE_SYNC_MIN_INTERVAL_MINUTES)
  intervalMinutes: number;
}
