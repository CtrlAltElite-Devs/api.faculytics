import { EntityRepository } from '@mikro-orm/postgresql';
import { QuestionnaireSubmission } from '../entities/questionnaire-submission.entity';

export class QuestionnaireSubmissionRepository extends EntityRepository<QuestionnaireSubmission> {
  // Custom repository methods
}
