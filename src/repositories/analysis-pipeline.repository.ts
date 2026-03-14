import { EntityRepository } from '@mikro-orm/postgresql';
import { AnalysisPipeline } from '../entities/analysis-pipeline.entity';

export class AnalysisPipelineRepository extends EntityRepository<AnalysisPipeline> {}
