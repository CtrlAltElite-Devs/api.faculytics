import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GeneratePreviewRequestDto {
  @ApiProperty({ description: 'Questionnaire version UUID' })
  @IsUUID()
  @IsNotEmpty()
  versionId: string;

  @ApiProperty({ description: 'Faculty username (exact match)' })
  @IsString()
  @IsNotEmpty()
  facultyUsername: string;

  @ApiProperty({ description: 'Course shortname (exact match)' })
  @IsString()
  @IsNotEmpty()
  courseShortname: string;

  @ApiPropertyOptional({
    description:
      'Optional cap on how many submissions to generate. If omitted or greater than available, all available students are used. Otherwise a random sample of the requested size is taken.',
    minimum: 1,
    maximum: 500,
  })
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  count?: number;

  @ApiPropertyOptional({
    description:
      'Optional free-text guidance to bias the tone/topic of generated qualitative comments (e.g., "mostly positive, emphasizes teaching clarity"). Ignored when qualitative feedback is disabled on the version.',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  promptTheme?: string;
}
