import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsString,
  ArrayNotEmpty,
  ValidateNested,
  Validate,
} from 'class-validator';
import { IsBeforeEndDate } from '../validators/is-before-end-date.validator';

export class CoursePreviewRowDto {
  @ApiProperty({ example: 'CS101' })
  @IsString()
  courseCode: string;

  @ApiProperty({ example: 'Introduction to Computer Science' })
  @IsString()
  descriptiveTitle: string;

  @ApiProperty({ example: 'BSCS' })
  @IsString()
  program: string;

  @ApiProperty({ example: '1' })
  @IsString()
  semester: string;

  @ApiProperty({ example: 42 })
  @IsInt()
  categoryId: number;
}

export class ExecuteCoursesRequestDto {
  @ApiProperty({ type: [CoursePreviewRowDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CoursePreviewRowDto)
  rows: CoursePreviewRowDto[];

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
