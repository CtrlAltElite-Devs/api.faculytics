import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FacultyShortResponseDto } from './faculty-short.response.dto';

export class CourseShortResponseDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsNumber()
  moodleCourseId: number;

  @ApiProperty()
  @IsString()
  shortname: string;

  @ApiProperty()
  @IsString()
  fullname: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseImage?: string;
}

export class EnrollmentResponseDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  role: string;

  @ApiProperty({ type: CourseShortResponseDto })
  course: CourseShortResponseDto;

  @ApiPropertyOptional({ type: FacultyShortResponseDto, nullable: true })
  faculty: FacultyShortResponseDto | null;
}
