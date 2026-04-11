import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsString, Validate } from 'class-validator';
import { IsBeforeEndDate } from '../validators/is-before-end-date.validator';

export class QuickCourseRequestDto {
  @ApiProperty({ description: 'Course code', example: 'CS 101' })
  @IsString()
  courseCode: string;

  @ApiProperty({
    description: 'Course descriptive title',
    example: 'Introduction to Computer Science',
  })
  @IsString()
  descriptiveTitle: string;

  @ApiProperty({ description: 'Campus code', example: 'UCMN' })
  @IsString()
  campus: string;

  @ApiProperty({ description: 'Department code', example: 'CCS' })
  @IsString()
  department: string;

  @ApiProperty({ description: 'Program code', example: 'BSCS' })
  @IsString()
  program: string;

  @ApiProperty({ description: 'Semester number (1 or 2)', example: 1 })
  @IsInt()
  @IsIn([1, 2])
  semester: number;

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
