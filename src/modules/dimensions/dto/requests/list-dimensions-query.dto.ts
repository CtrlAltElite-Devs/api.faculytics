import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { QuestionnaireType } from 'src/modules/questionnaires/lib/questionnaire.types';
import { Transform } from 'class-transformer';

export class ListDimensionsQueryDto {
  @IsEnum(QuestionnaireType)
  @IsOptional()
  questionnaireType?: QuestionnaireType;

  @IsOptional()
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) => obj.active === 'true',
  )
  active?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
