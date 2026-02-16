import { EntityRepository } from '@mikro-orm/postgresql';
import { QuestionnaireAnswer } from '../entities/questionnaire-answer.entity';

export class QuestionnaireAnswerRepository extends EntityRepository<QuestionnaireAnswer> {
  // Custom repository methods
}
