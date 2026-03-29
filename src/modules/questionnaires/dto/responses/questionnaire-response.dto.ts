import { ApiProperty } from '@nestjs/swagger';
import { QuestionnaireStatus } from '../../lib/questionnaire.types';
import type { Questionnaire } from 'src/entities/questionnaire.entity';

export class QuestionnaireResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  type: { id: string; name: string; code: string };

  @ApiProperty({ enum: QuestionnaireStatus })
  status: QuestionnaireStatus;

  static Map(entity: Questionnaire): QuestionnaireResponseDto {
    return {
      id: entity.id,
      title: entity.title,
      type: {
        id: entity.type.id,
        name: entity.type.name,
        code: entity.type.code,
      },
      status: entity.status,
    };
  }
}
