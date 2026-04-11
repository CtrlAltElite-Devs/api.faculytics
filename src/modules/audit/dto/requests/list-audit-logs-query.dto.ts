import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from 'src/modules/common/dto/pagination-query.dto';

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by exact audit action code',
    example: 'auth.login.success',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({
    description: 'Filter by actor UUID',
    example: '3f6dd1dd-8f33-4b2e-bb0b-6ac2d8bbf5d7',
  })
  @IsUUID()
  @IsOptional()
  actorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by actor username (partial match)',
    example: 'admin',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  actorUsername?: string;

  @ApiPropertyOptional({
    description: 'Filter by resource type',
    example: 'User',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  resourceType?: string;

  @ApiPropertyOptional({
    description: 'Filter by resource UUID',
    example: '9ad12fa1-6286-4461-93f8-33b48d2e5725',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  resourceId?: string;

  @ApiPropertyOptional({
    description: 'Lower bound (inclusive) on occurredAt (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Upper bound (inclusive) on occurredAt (ISO 8601)',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description:
      'General text search across actorUsername, action, and resourceType',
    example: 'login',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  search?: string;
}
