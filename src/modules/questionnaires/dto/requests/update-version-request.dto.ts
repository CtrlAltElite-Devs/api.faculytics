import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import type { QuestionnaireSchemaSnapshot } from '../../lib/questionnaire.types';

export class UpdateVersionRequest {
  @ApiProperty()
  @IsObject()
  @IsNotEmpty()
  schema!: QuestionnaireSchemaSnapshot;

  @ApiProperty({ required: false })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;
}
