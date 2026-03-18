import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  AnalysisPipeline,
  RecommendationRun,
  RecommendedAction,
  SentimentResult,
  SentimentRun,
  SubmissionEmbedding,
  Topic,
  TopicAssignment,
  TopicModelRun,
} from '../../entities/index.entity';
import { CommonModule } from '../common/common.module';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { SentimentProcessor } from './processors/sentiment.processor';
import { EmbeddingProcessor } from './processors/embedding.processor';
import { TopicModelProcessor } from './processors/topic-model.processor';
import { RecommendationsProcessor } from './processors/recommendations.processor';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { TopicLabelService } from './services/topic-label.service';
import { RecommendationGenerationService } from './services/recommendation-generation.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'sentiment' },
      { name: 'embedding' },
      { name: 'topic-model' },
      { name: 'recommendations' },
    ),
    MikroOrmModule.forFeature([
      AnalysisPipeline,
      SentimentRun,
      SentimentResult,
      TopicModelRun,
      Topic,
      TopicAssignment,
      RecommendationRun,
      RecommendedAction,
      SubmissionEmbedding,
    ]),
    CommonModule,
  ],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    SentimentProcessor,
    EmbeddingProcessor,
    TopicModelProcessor,
    RecommendationsProcessor,
    PipelineOrchestratorService,
    TopicLabelService,
    RecommendationGenerationService,
  ],
  exports: [AnalysisService, PipelineOrchestratorService],
})
export class AnalysisModule {}
