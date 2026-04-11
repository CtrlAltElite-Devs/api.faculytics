import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MoodleCoursePreviewDto {
  @ApiProperty({ example: 101 })
  @IsNumber()
  id: number;

  @ApiProperty({ example: 'CS101-2026' })
  @IsString()
  shortname: string;

  @ApiProperty({ example: 'Introduction to Computer Science' })
  @IsString()
  fullname: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  enrolledusercount?: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  visible: number;

  @ApiProperty({ example: 1712800000 })
  @IsNumber()
  startdate: number;

  @ApiProperty({ example: 1720000000 })
  @IsNumber()
  enddate: number;
}

export class MoodleCategoryCoursesResponseDto {
  @ApiProperty({ example: 5 })
  @IsNumber()
  categoryId: number;

  @ApiProperty({ type: [MoodleCoursePreviewDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleCoursePreviewDto)
  courses: MoodleCoursePreviewDto[];
}
