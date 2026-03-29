import { ApiProperty } from '@nestjs/swagger';
import type { QuestionnaireType } from 'src/entities/questionnaire-type.entity';

export class QuestionnaireTypeDetailResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  isSystem: boolean;

  @ApiProperty()
  createdAt: Date;

  static Map(entity: QuestionnaireType): QuestionnaireTypeDetailResponse {
    return {
      id: entity.id,
      name: entity.name,
      code: entity.code,
      description: entity.description ?? null,
      isSystem: entity.isSystem,
      createdAt: entity.createdAt,
    };
  }
}
