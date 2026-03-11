import {
  QuestionnaireStatus,
  QuestionnaireType,
} from '../../lib/questionnaire.types';

export class QuestionnaireTypeResponse {
  type!: QuestionnaireType;
  questionnaireId!: string | null;
  title!: string | null;
  status!: QuestionnaireStatus | null;
}
