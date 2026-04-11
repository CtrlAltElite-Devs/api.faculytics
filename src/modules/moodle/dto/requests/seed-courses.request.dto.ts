import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, Validate } from 'class-validator';
import { IsBeforeEndDate } from '../validators/is-before-end-date.validator';

export class SeedCoursesContextDto {
  @ApiProperty({ description: 'Campus code', example: 'UCMN' })
  @IsString()
  campus: string;

  @ApiProperty({ description: 'Department code', example: 'CCS' })
  @IsString()
  department: string;

  @ApiProperty({
    description: 'Academic year start date (ISO 8601)',
    example: '2025-08-01',
  })
  @IsDateString()
  @Validate(IsBeforeEndDate)
  startDate: string;

  @ApiProperty({
    description: 'Academic year end date (ISO 8601)',
    example: '2026-06-01',
  })
  @IsDateString()
  endDate: string;
}
