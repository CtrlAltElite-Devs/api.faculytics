import { EntityRepository } from '@mikro-orm/postgresql';
import { RecommendationRun } from '../entities/recommendation-run.entity';

export class RecommendationRunRepository extends EntityRepository<RecommendationRun> {}
