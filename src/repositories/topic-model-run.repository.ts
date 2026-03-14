import { EntityRepository } from '@mikro-orm/postgresql';
import { TopicModelRun } from '../entities/topic-model-run.entity';

export class TopicModelRunRepository extends EntityRepository<TopicModelRun> {}
