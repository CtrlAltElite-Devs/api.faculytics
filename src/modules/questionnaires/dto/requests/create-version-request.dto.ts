import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmpty } from 'class-validator';
import type { QuestionnaireSchemaSnapshot } from '../../questionnaire.types';

export class CreateVersionRequest {
  @ApiProperty()
  @IsObject()
  @IsNotEmpty()
  schema!: QuestionnaireSchemaSnapshot;
}
