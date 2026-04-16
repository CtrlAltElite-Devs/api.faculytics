import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const SENTIMENT_LABELS = ['positive', 'neutral', 'negative'] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export class DepartmentOverviewQueryDto {
  @ApiProperty({ description: 'Semester UUID to query analytics for' })
  @IsUUID()
  semesterId!: string;

  @ApiPropertyOptional({
    description: 'Optional program code filter',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @IsOptional()
  programCode?: string;
}

export class AttentionListQueryDto {
  @ApiProperty({ description: 'Semester UUID to query analytics for' })
  @IsUUID()
  semesterId!: string;

  @ApiPropertyOptional({ description: 'Optional program code filter' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @IsOptional()
  programCode?: string;
}

export class FacultyTrendsQueryDto {
  @ApiPropertyOptional({
    description:
      'Semester UUID for scope resolution. Falls back to latest semester if omitted.',
  })
  @IsUUID()
  @IsOptional()
  semesterId?: string;

  @ApiPropertyOptional({
    description: 'Minimum number of semesters for trend data',
    default: 3,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  minSemesters?: number;

  @ApiPropertyOptional({
    description: 'Minimum R² coefficient for trend significance',
    default: 0.5,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minR2?: number;
}

export class BaseFacultyReportQueryDto {
  @ApiProperty({ description: 'Semester UUID' })
  @IsUUID()
  semesterId!: string;

  @ApiProperty({ description: 'Questionnaire type code' })
  @IsString()
  @IsNotEmpty()
  questionnaireTypeCode!: string;

  @ApiPropertyOptional({ description: 'Optional course UUID filter' })
  @IsUUID()
  @IsOptional()
  courseId?: string;
}

export class FacultyReportQueryDto extends BaseFacultyReportQueryDto {}

export class FacultyReportCommentsQueryDto extends BaseFacultyReportQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter comments by sentiment label',
    enum: SENTIMENT_LABELS,
  })
  @IsIn(SENTIMENT_LABELS as readonly string[])
  @IsOptional()
  sentiment?: SentimentLabel;

  @ApiPropertyOptional({
    description: 'Filter comments by dominant topic assignment (theme UUID)',
  })
  @IsUUID()
  @IsOptional()
  themeId?: string;
}

export class QualitativeSummaryQueryDto extends BaseFacultyReportQueryDto {}

export class FacultyQuestionnaireTypesQueryDto {
  @ApiProperty({ description: 'Semester UUID' })
  @IsUUID()
  semesterId!: string;
}
