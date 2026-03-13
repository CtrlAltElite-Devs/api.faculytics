import { Entity, Index, ManyToOne, Opt, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { SentimentResultRepository } from '../repositories/sentiment-result.repository';
import { SentimentRun } from './sentiment-run.entity';
import { QuestionnaireSubmission } from './questionnaire-submission.entity';

@Entity({ repository: () => SentimentResultRepository })
@Index({ properties: ['run'] })
@Index({ properties: ['submission'] })
export class SentimentResult extends CustomBaseEntity {
  @ManyToOne(() => SentimentRun)
  run!: SentimentRun;

  @ManyToOne(() => QuestionnaireSubmission)
  submission!: QuestionnaireSubmission;

  @Property({ type: 'decimal', precision: 10, scale: 4 })
  positiveScore!: number;

  @Property({ type: 'decimal', precision: 10, scale: 4 })
  neutralScore!: number;

  @Property({ type: 'decimal', precision: 10, scale: 4 })
  negativeScore!: number;

  @Property()
  label!: string;

  @Property({ type: 'jsonb' })
  rawResult!: Record<string, unknown>;

  @Property({ default: false })
  passedTopicGate: boolean & Opt = false;

  @Property()
  processedAt!: Date;
}
