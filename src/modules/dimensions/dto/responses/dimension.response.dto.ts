import { ApiProperty } from '@nestjs/swagger';
import { Dimension } from 'src/entities/dimension.entity';
import { QuestionnaireType } from 'src/modules/questionnaires/lib/questionnaire.types';

export class DimensionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: QuestionnaireType })
  questionnaireType: QuestionnaireType;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  static Map(dimension: Dimension): DimensionResponseDto {
    return {
      id: dimension.id,
      code: dimension.code,
      displayName: dimension.displayName,
      questionnaireType: dimension.questionnaireType,
      active: dimension.active,
      createdAt: dimension.createdAt.toISOString(),
      updatedAt: dimension.updatedAt.toISOString(),
    };
  }
}
