import { EntityRepository } from '@mikro-orm/postgresql';
import { QuestionnaireType } from '../entities/questionnaire-type.entity';

export class QuestionnaireTypeRepository extends EntityRepository<QuestionnaireType> {
  // Custom repository methods
}
