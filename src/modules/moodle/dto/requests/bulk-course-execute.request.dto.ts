import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Min,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
  Validate,
} from 'class-validator';
import { IsBeforeEndDate } from '../validators/is-before-end-date.validator';

export class ConfirmedCourseEntryDto {
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

  @ApiProperty({
    description: 'Moodle category ID from preview',
    example: 42,
  })
  @IsInt()
  @Min(1)
  categoryId: number;
}

export class BulkCourseExecuteRequestDto {
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

  @ApiProperty({
    type: [ConfirmedCourseEntryDto],
    description: 'Confirmed courses to create',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ConfirmedCourseEntryDto)
  courses: ConfirmedCourseEntryDto[];
}
