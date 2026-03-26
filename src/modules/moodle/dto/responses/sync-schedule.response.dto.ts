import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncScheduleResponseDto {
  @ApiProperty()
  intervalMinutes: number;

  @ApiProperty()
  cronExpression: string;

  @ApiPropertyOptional()
  nextExecution: string | null;
}
