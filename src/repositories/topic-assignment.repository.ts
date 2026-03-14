import { EntityRepository } from '@mikro-orm/postgresql';
import { TopicAssignment } from '../entities/topic-assignment.entity';

export class TopicAssignmentRepository extends EntityRepository<TopicAssignment> {}
