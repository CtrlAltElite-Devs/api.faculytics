import { ApiProperty } from '@nestjs/swagger';

export class IngestionRecordResult {
  @ApiProperty({ description: 'The external identifier of the record' })
  externalId: string;

  @ApiProperty({ description: 'Whether the record was successfully processed' })
  success: boolean;

  @ApiProperty({ required: false, description: 'Error message if failed' })
  error?: string;

  @ApiProperty({ required: false, description: 'Internal ID if created' })
  internalId?: string;
}

export class IngestionResultDto {
  @ApiProperty({ description: 'Unique identifier for the ingestion batch' })
  ingestionId: string;

  @ApiProperty({ description: 'Total number of records processed' })
  total: number;

  @ApiProperty({ description: 'Number of successful records' })
  successes: number;

  @ApiProperty({ description: 'Number of failed records' })
  failures: number;

  @ApiProperty({ description: 'Whether the run was a dry-run' })
  dryRun: boolean;

  @ApiProperty({ type: [IngestionRecordResult] })
  records: IngestionRecordResult[];
}
