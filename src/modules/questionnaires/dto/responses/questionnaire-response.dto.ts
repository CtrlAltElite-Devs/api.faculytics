import { ApiProperty } from '@nestjs/swagger';
import {
  QuestionnaireStatus,
  QuestionnaireType,
} from '../../lib/questionnaire.types';
import type { Questionnaire } from 'src/entities/questionnaire.entity';

export class QuestionnaireResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: QuestionnaireType })
  type: QuestionnaireType;

  @ApiProperty({ enum: QuestionnaireStatus })
  status: QuestionnaireStatus;

  static Map(entity: Questionnaire): QuestionnaireResponseDto {
    return {
      id: entity.id,
      title: entity.title,
      type: entity.type,
      status: entity.status,
    };
  }
}
