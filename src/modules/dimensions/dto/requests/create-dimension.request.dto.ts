import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { QuestionnaireType } from 'src/modules/questionnaires/lib/questionnaire.types';

export class CreateDimensionRequestDto {
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message:
      'code must be uppercase alphanumeric with underscores (e.g. TEACHING_QUALITY)',
  })
  code?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @IsEnum(QuestionnaireType)
  questionnaireType: QuestionnaireType;
}
