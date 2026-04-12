import { Entity, Index, ManyToOne, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { TopicAssignmentRepository } from '../repositories/topic-assignment.repository';
import { Topic } from './topic.entity';
import { QuestionnaireSubmission } from './questionnaire-submission.entity';

@Index({
  name: 'topic_assignment_topic_id_submission_id_unique',
  expression:
    'create unique index "topic_assignment_topic_id_submission_id_unique" on "topic_assignment" ("topic_id", "submission_id") where "deleted_at" is null',
})
@Entity({ repository: () => TopicAssignmentRepository })
@Index({ properties: ['topic'] })
@Index({ properties: ['submission'] })
export class TopicAssignment extends CustomBaseEntity {
  @ManyToOne(() => Topic)
  topic!: Topic;

  @ManyToOne(() => QuestionnaireSubmission)
  submission!: QuestionnaireSubmission;

  @Property({ type: 'decimal', precision: 10, scale: 4 })
  probability!: number;

  @Property()
  isDominant!: boolean;
}
