import { Entity, Index, ManyToOne, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { TopicAssignmentRepository } from '../repositories/topic-assignment.repository';
import { Topic } from './topic.entity';
import { QuestionnaireSubmission } from './questionnaire-submission.entity';

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
