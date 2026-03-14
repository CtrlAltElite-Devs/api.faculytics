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
import { RecommendationRunRepository } from '../repositories/recommendation-run.repository';
import { RunStatus } from '../modules/analysis/enums';
import { AnalysisPipeline } from './analysis-pipeline.entity';
import { RecommendedAction } from './recommended-action.entity';

@Entity({ repository: () => RecommendationRunRepository })
@Index({ properties: ['pipeline'] })
export class RecommendationRun extends CustomBaseEntity {
  @ManyToOne(() => AnalysisPipeline)
  pipeline!: AnalysisPipeline;

  @Property()
  submissionCount!: number;

  @Property({ default: 0 })
  sentimentCoverage: number & Opt = 0;

  @Property({ default: 0 })
  topicCoverage: number & Opt = 0;

  @Property({ nullable: true })
  workerVersion?: string;

  @Property({ nullable: true })
  jobId?: string;

  @Enum(() => RunStatus)
  status: RunStatus & Opt = RunStatus.PENDING;

  @Property({ nullable: true })
  completedAt?: Date;

  @OneToMany(() => RecommendedAction, (a) => a.run)
  actions = new Collection<RecommendedAction>(this);
}
