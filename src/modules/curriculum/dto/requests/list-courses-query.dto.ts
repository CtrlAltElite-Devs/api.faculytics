import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListCoursesQueryDto {
  @ApiProperty({ description: 'Semester UUID to scope course list' })
  @IsUUID()
  @IsNotEmpty()
  semesterId: string;

  @ApiPropertyOptional({ description: 'Filter by department UUID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by program UUID' })
  @IsUUID()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional({
    description: 'Search by course shortname or fullname',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;
}
