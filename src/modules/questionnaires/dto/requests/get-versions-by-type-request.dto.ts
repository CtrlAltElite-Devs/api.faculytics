import { IsEnum } from 'class-validator';
import { QuestionnaireType } from '../../lib/questionnaire.types';

export class GetVersionsByTypeParam {
  @IsEnum(QuestionnaireType)
  type!: QuestionnaireType;
}
