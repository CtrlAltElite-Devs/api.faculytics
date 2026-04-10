import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsString,
  ArrayMinSize,
  ValidateNested,
  ArrayNotEmpty,
  Validate,
} from 'class-validator';
import { IsBeforeEndDate } from '../validators/is-before-end-date.validator';

class DepartmentDto {
  @ApiProperty({ description: 'Department code', example: 'CCS' })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Program codes under this department',
    example: ['BSCS', 'BSIT'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  programs: string[];
}

export class ProvisionCategoriesRequestDto {
  @ApiProperty({
    description: 'Campus codes',
    example: ['UCMN'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  campuses: string[];

  @ApiProperty({
    description: 'Semester numbers (1 and/or 2)',
    example: [1, 2],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn([1, 2], { each: true })
  semesters: number[];

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

  @ApiProperty({
    description: 'Departments with their programs',
    type: [DepartmentDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DepartmentDto)
  departments: DepartmentDto[];
}
