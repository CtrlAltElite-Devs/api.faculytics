import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsUUID,
  IsOptional,
  IsBoolean,
  IsString,
  IsInt,
  Min,
  Max,
  Length,
} from 'class-validator';

export class IngestCsvRequestDto {
  @ApiProperty({ description: 'Target questionnaire version ID' })
  @IsUUID()
  versionId: string;

  @ApiProperty({
    required: false,
    description: 'Run in dry-run mode (validate only, no persistence)',
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (typeof raw === 'string') return raw === 'true';
    return raw === true;
  })
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({ required: false, description: 'CSV delimiter character' })
  @IsOptional()
  @IsString()
  @Length(1, 1)
  delimiter?: string;

  @ApiProperty({
    required: false,
    description: 'Maximum number of errors before stopping',
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  maxErrors?: number;

  @ApiProperty({
    required: false,
    description: 'Maximum number of records to process (default: 500)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value != null ? parseInt(String(value), 10) : undefined,
  )
  @IsInt()
  @Min(1)
  @Max(5000)
  maxRecords?: number = 500;
}
