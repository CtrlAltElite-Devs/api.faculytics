import {
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  Opt,
  Property,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { TopicModelRunRepository } from '../repositories/topic-model-run.repository';
import { RunStatus } from '../modules/analysis/enums';
import { AnalysisPipeline } from './analysis-pipeline.entity';
import { Topic } from './topic.entity';

@Entity({ repository: () => TopicModelRunRepository })
@Index({ properties: ['pipeline'] })
export class TopicModelRun extends CustomBaseEntity {
  @ManyToOne(() => AnalysisPipeline)
  pipeline!: AnalysisPipeline;

  @Property()
  submissionCount!: number;

  @Property({ default: 0 })
  topicCount: number & Opt = 0;

  @Property({ default: 0 })
  outlierCount: number & Opt = 0;

  @Property({ type: 'jsonb', nullable: true })
  modelParams?: Record<string, unknown>;

  @Property({ type: 'jsonb', nullable: true })
  metrics?: Record<string, unknown>;

  @Property({ nullable: true })
  workerVersion?: string;

  @Property({ nullable: true })
  jobId?: string;

  @Enum(() => RunStatus)
  status: RunStatus & Opt = RunStatus.PENDING;

  @Property({ nullable: true })
  completedAt?: Date;

  @OneToMany(() => Topic, (t) => t.run)
  topics = new Collection<Topic>(this);
}
