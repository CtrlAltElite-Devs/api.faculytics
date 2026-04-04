import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CommitRecordResultDto {
  @ApiProperty()
  externalId: string;

  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  internalId?: string;
}

export class CommitResultDto {
  @ApiProperty()
  commitId: string;

  @ApiProperty()
  total: number;

  @ApiProperty()
  successes: number;

  @ApiProperty()
  failures: number;

  @ApiProperty()
  dryRun: boolean;

  @ApiProperty({ type: [CommitRecordResultDto] })
  records: CommitRecordResultDto[];
}
