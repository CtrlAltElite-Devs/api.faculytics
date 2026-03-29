import { QuestionnaireStatus } from '../../lib/questionnaire.types';

export class QuestionnaireTypeResponse {
  id!: string;
  name!: string;
  code!: string;
  description!: string | null;
  isSystem!: boolean;
  questionnaireId!: string | null;
  questionnaireTitle!: string | null;
  questionnaireStatus!: QuestionnaireStatus | null;
}
