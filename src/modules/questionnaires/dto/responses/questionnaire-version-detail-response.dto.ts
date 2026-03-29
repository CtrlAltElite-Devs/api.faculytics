import { ApiProperty } from '@nestjs/swagger';
import { QuestionnaireStatus } from '../../lib/questionnaire.types';
import type { QuestionnaireSchemaSnapshot } from '../../lib/questionnaire.types';
import type { QuestionnaireVersion } from 'src/entities/questionnaire-version.entity';

export class QuestionnaireVersionDetailResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  questionnaireId: string;

  @ApiProperty()
  questionnaireTitle: string;

  @ApiProperty()
  questionnaireType: { id: string; name: string; code: string };

  @ApiProperty()
  versionNumber: number;

  @ApiProperty({ enum: QuestionnaireStatus })
  status: QuestionnaireStatus;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  schemaSnapshot: QuestionnaireSchemaSnapshot;

  @ApiProperty({ required: false, nullable: true })
  publishedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static Map(
    version: QuestionnaireVersion,
  ): QuestionnaireVersionDetailResponse {
    return {
      id: version.id,
      questionnaireId: version.questionnaire.id,
      questionnaireTitle: version.questionnaire.title,
      questionnaireType: {
        id: version.questionnaire.type.id,
        name: version.questionnaire.type.name,
        code: version.questionnaire.type.code,
      },
      versionNumber: version.versionNumber,
      status: version.status,
      isActive: version.isActive,
      schemaSnapshot: version.schemaSnapshot,
      publishedAt: version.publishedAt,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    };
  }
}
