import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class TriggerSyncResponseDto {
  @IsString()
  @ApiProperty({ description: 'The BullMQ job ID for the enqueued sync' })
  jobId: string;
}
