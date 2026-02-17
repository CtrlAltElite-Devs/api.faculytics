import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsDateString,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RawAnswerData {
  @ApiProperty({ description: 'The identifier of the question' })
  @IsString()
  questionId: string;

  @ApiProperty({ description: 'The numeric value of the answer' })
  @IsNumber()
  value: number;
}

export class RawSubmissionData {
  @ApiProperty({ description: 'External identifier for the submission' })
  @IsString()
  externalId: string;

  @ApiProperty({ description: 'The Moodle user ID of the respondent' })
  @IsNumber()
  moodleUserId: number;

  @ApiProperty({
    description:
      'The Moodle user ID of the faculty. Future: make optional if derivable from course.',
  })
  @IsNumber()
  moodleFacultyId: number;

  @ApiProperty({ description: 'The Moodle course ID' })
  @IsNumber()
  courseId: number;

  @ApiProperty({ type: [RawAnswerData], description: 'List of raw answers' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RawAnswerData)
  answers: RawAnswerData[];

  @ApiProperty({
    required: false,
    description: 'Optional submission timestamp',
  })
  @IsOptional()
  @IsDateString()
  submittedAt?: string;
}
