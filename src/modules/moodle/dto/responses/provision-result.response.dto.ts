import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProvisionDetailItemDto {
  @ApiProperty({ example: 'UCMN' })
  name: string;

  @ApiProperty({ enum: ['created', 'skipped', 'error'] })
  status: 'created' | 'skipped' | 'error';

  @ApiPropertyOptional({ example: 'Already exists' })
  reason?: string;

  @ApiPropertyOptional({ example: 42 })
  moodleId?: number;
}

export class ProvisionResultDto {
  @ApiProperty({ example: 4 })
  created: number;

  @ApiProperty({ example: 1 })
  skipped: number;

  @ApiProperty({ example: 0 })
  errors: number;

  @ApiProperty({ type: [ProvisionDetailItemDto] })
  details: ProvisionDetailItemDto[];

  @ApiProperty({ example: 1234 })
  durationMs: number;

  @ApiPropertyOptional({ example: true })
  syncCompleted?: boolean;
}
