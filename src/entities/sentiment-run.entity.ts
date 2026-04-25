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
import { SentimentRunRepository } from '../repositories/sentiment-run.repository';
import { RunStatus } from '../modules/analysis/enums';
import { AnalysisPipeline } from './analysis-pipeline.entity';
import { SentimentResult } from './sentiment-result.entity';

@Entity({ repository: () => SentimentRunRepository })
@Index({ properties: ['pipeline'] })
export class SentimentRun extends CustomBaseEntity {
  @ManyToOne(() => AnalysisPipeline)
  pipeline!: AnalysisPipeline;

  @Property()
  submissionCount!: number;

  @Property({ default: 0 })
  expectedChunks: number & Opt = 0;

  @Property({ default: 0 })
  completedChunks: number & Opt = 0;

  @Property({ nullable: true })
  workerVersion?: string;

  @Property({ nullable: true })
  jobId?: string;

  @Enum(() => RunStatus)
  status: RunStatus & Opt = RunStatus.PENDING;

  @Property({ nullable: true })
  completedAt?: Date;

  @OneToMany(() => SentimentResult, (r) => r.run)
  results = new Collection<SentimentResult>(this);
}
