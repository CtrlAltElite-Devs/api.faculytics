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
import { AnalysisPipelineRepository } from '../repositories/analysis-pipeline.repository';
import { PipelineStatus } from '../modules/analysis/enums';
import { Semester } from './semester.entity';
import { User } from './user.entity';
import { QuestionnaireVersion } from './questionnaire-version.entity';
import { Department } from './department.entity';
import { Program } from './program.entity';
import { Campus } from './campus.entity';
import { Course } from './course.entity';
import { SentimentRun } from './sentiment-run.entity';
import { TopicModelRun } from './topic-model-run.entity';
import { RecommendationRun } from './recommendation-run.entity';

@Entity({ repository: () => AnalysisPipelineRepository })
@Index({ properties: ['semester', 'status'] })
export class AnalysisPipeline extends CustomBaseEntity {
  @Property({ onUpdate: () => new Date() })
  override updatedAt: Date & Opt = new Date();

  @ManyToOne(() => Semester)
  semester!: Semester;

  @ManyToOne(() => User, { nullable: true })
  faculty?: User;

  @ManyToOne(() => QuestionnaireVersion, { nullable: true })
  questionnaireVersion?: QuestionnaireVersion;

  @ManyToOne(() => Department, { nullable: true })
  department?: Department;

  @ManyToOne(() => Program, { nullable: true })
  program?: Program;

  @ManyToOne(() => Campus, { nullable: true })
  campus?: Campus;

  @ManyToOne(() => Course, { nullable: true })
  course?: Course;

  @ManyToOne(() => User)
  triggeredBy!: User;

  @Property()
  totalEnrolled!: number;

  @Property()
  submissionCount!: number;

  @Property()
  commentCount!: number;

  @Property({ type: 'decimal', precision: 10, scale: 4 })
  responseRate!: number;

  @Property({ type: 'array' })
  warnings: string[] & Opt = [];

  @Property({ nullable: true })
  sentimentGateIncluded?: number;

  @Property({ nullable: true })
  sentimentGateExcluded?: number;

  @Enum(() => PipelineStatus)
  status: PipelineStatus & Opt = PipelineStatus.AWAITING_CONFIRMATION;

  @Property({ type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ nullable: true })
  confirmedAt?: Date;

  @Property({ nullable: true })
  completedAt?: Date;

  @OneToMany(() => SentimentRun, (r) => r.pipeline)
  sentimentRuns = new Collection<SentimentRun>(this);

  @OneToMany(() => TopicModelRun, (r) => r.pipeline)
  topicModelRuns = new Collection<TopicModelRun>(this);

  @OneToMany(() => RecommendationRun, (r) => r.pipeline)
  recommendationRuns = new Collection<RecommendationRun>(this);
}
