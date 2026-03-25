import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FacultyShortResponseDto } from './faculty-short.response.dto';
import { SemesterShortResponseDto } from './semester-short.response.dto';

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

export class SectionShortResponseDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;
}

export class SubmissionStatusDto {
  @ApiProperty()
  submitted: boolean;

  @ApiPropertyOptional()
  submittedAt?: Date;
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

  @ApiPropertyOptional({ type: SemesterShortResponseDto, nullable: true })
  semester: SemesterShortResponseDto | null;

  @ApiPropertyOptional({ type: SectionShortResponseDto, nullable: true })
  section: SectionShortResponseDto | null;

  @ApiProperty({ type: SubmissionStatusDto })
  submission: SubmissionStatusDto;
}
