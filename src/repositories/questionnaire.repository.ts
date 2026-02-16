import { EntityRepository } from '@mikro-orm/postgresql';
import { Questionnaire } from '../entities/questionnaire.entity';

export class QuestionnaireRepository extends EntityRepository<Questionnaire> {
  // Custom repository methods
}
