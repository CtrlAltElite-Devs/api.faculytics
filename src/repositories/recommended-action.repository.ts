import { EntityRepository } from '@mikro-orm/postgresql';
import { RecommendedAction } from '../entities/recommended-action.entity';

export class RecommendedActionRepository extends EntityRepository<RecommendedAction> {}
