import { ApiProperty } from '@nestjs/swagger';
import {
  QuestionnaireStatus,
  QuestionnaireType,
} from '../../lib/questionnaire.types';

export class QuestionnaireVersionItem {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  versionNumber!: number;

  @ApiProperty({ enum: QuestionnaireStatus })
  status!: QuestionnaireStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ required: false, nullable: true })
  publishedAt?: Date;

  @ApiProperty()
  createdAt!: Date;
}

export class QuestionnaireVersionsResponse {
  @ApiProperty({ nullable: true })
  questionnaireId!: string | null;

  @ApiProperty({ nullable: true })
  questionnaireTitle!: string | null;

  @ApiProperty({ enum: QuestionnaireType })
  type!: QuestionnaireType;

  @ApiProperty({ type: [QuestionnaireVersionItem] })
  versions!: QuestionnaireVersionItem[];
}
