import { EntityRepository } from '@mikro-orm/postgresql';
import { QuestionnaireVersion } from '../entities/questionnaire-version.entity';

export class QuestionnaireVersionRepository extends EntityRepository<QuestionnaireVersion> {
  // Custom repository methods
}
