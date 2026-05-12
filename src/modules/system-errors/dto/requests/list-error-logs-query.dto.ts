import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from 'src/modules/common/dto/pagination-query.dto';

export class ListErrorLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by exact HTTP status code',
    example: 500,
  })
  @IsInt()
  @Min(100)
  @IsOptional()
  @Type(() => Number)
  statusCode?: number;

  @ApiPropertyOptional({
    description: 'Filter by HTTP method',
    example: 'POST',
  })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  method?: string;

  @ApiPropertyOptional({
    description: 'Filter by request path (partial match)',
    example: '/api/v1/auth/login',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  pathSearch?: string;

  @ApiPropertyOptional({
    description:
      'Filter by error class name (e.g. TypeError, QueryFailedError)',
    example: 'TypeError',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  errorName?: string;

  @ApiPropertyOptional({
    description: 'Filter by user name (partial match)',
    example: 'ucmn-t-67092',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  userName?: string;

  @ApiPropertyOptional({
    description: 'Filter by acknowledged status. Omit to include both states.',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  acknowledged?: boolean;

  @ApiPropertyOptional({
    description: 'Lower bound (inclusive) on occurredAt (ISO 8601)',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Upper bound (inclusive) on occurredAt (ISO 8601)',
    example: '2026-05-31T23:59:59.999Z',
  })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description:
      'General text search across path, errorName, message, and userName',
    example: 'login',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  search?: string;
}
