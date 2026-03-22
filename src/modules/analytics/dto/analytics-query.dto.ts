import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DepartmentOverviewQueryDto {
  @ApiProperty({ description: 'Semester UUID to query analytics for' })
  @IsUUID()
  semesterId!: string;

  @ApiPropertyOptional({
    description: 'Optional program code filter',
  })
  @IsString()
  @IsOptional()
  programCode?: string;
}

export class AttentionListQueryDto {
  @ApiProperty({ description: 'Semester UUID to query analytics for' })
  @IsUUID()
  semesterId!: string;
}

export class FacultyTrendsQueryDto {
  @ApiPropertyOptional({
    description:
      'Semester UUID for scope resolution. Falls back to latest semester if omitted.',
  })
  @IsUUID()
  @IsOptional()
  semesterId?: string;

  @ApiPropertyOptional({
    description: 'Minimum number of semesters for trend data',
    default: 3,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  minSemesters?: number;

  @ApiPropertyOptional({
    description: 'Minimum R² coefficient for trend significance',
    default: 0.5,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minR2?: number;
}
