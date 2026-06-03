import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncScheduleResponseDto {
  @ApiProperty()
  intervalMinutes: number;

  @ApiProperty()
  cronExpression: string;

  @ApiPropertyOptional()
  nextExecution: string | null;

  @ApiProperty({ description: 'Whether the sync cron job is enabled' })
  enabled: boolean;
}
