import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
  Validate,
} from 'class-validator';
import { IsBeforeEndDate } from '../validators/is-before-end-date.validator';

export class CourseEntryDto {
  @ApiProperty({ description: 'Course code', example: 'CS101' })
  @IsString()
  @IsNotEmpty()
  courseCode: string;

  @ApiProperty({
    description: 'Descriptive title',
    example: 'Introduction to Computer Science',
  })
  @IsString()
  @IsNotEmpty()
  descriptiveTitle: string;
}

export class BulkCoursePreviewRequestDto {
  @ApiProperty({ description: 'Semester UUID' })
  @IsUUID()
  semesterId: string;

  @ApiProperty({ description: 'Department UUID' })
  @IsUUID()
  departmentId: string;

  @ApiProperty({ description: 'Program UUID' })
  @IsUUID()
  programId: string;

  @ApiProperty({
    description: 'Course start date (ISO 8601)',
    example: '2025-08-01',
  })
  @IsDateString()
  @Validate(IsBeforeEndDate)
  startDate: string;

  @ApiProperty({
    description: 'Course end date (ISO 8601)',
    example: '2025-12-18',
  })
  @IsDateString()
  endDate: string;

  @ApiProperty({ type: [CourseEntryDto], description: 'Courses to preview' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CourseEntryDto)
  courses: CourseEntryDto[];
}
