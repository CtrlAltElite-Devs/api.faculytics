import { EntityRepository } from '@mikro-orm/postgresql';
import { Topic } from '../entities/topic.entity';

export class TopicRepository extends EntityRepository<Topic> {}
