import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
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
import { SystemConfig } from '../../entities/system-config.entity';
import { User } from '../../entities/user.entity';
import { CommonModule } from '../common/common.module';
import DataLoaderModule from '../common/data-loaders/index.module';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { SentimentProcessor } from './processors/sentiment.processor';
import { EmbeddingProcessor } from './processors/embedding.processor';
import { TopicModelProcessor } from './processors/topic-model.processor';
import { RecommendationsProcessor } from './processors/recommendations.processor';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { TopicLabelService } from './services/topic-label.service';
import { RecommendationGenerationService } from './services/recommendation-generation.service';
import { AnalysisAccessService } from './services/analysis-access.service';
import { SentimentConfigService } from './services/sentiment-config.service';
import { AdminSentimentConfigController } from './controllers/admin-sentiment-config.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QueueName.SENTIMENT },
      { name: QueueName.EMBEDDING },
      { name: QueueName.TOPIC_MODEL },
      { name: QueueName.RECOMMENDATIONS },
      { name: QueueName.ANALYTICS_REFRESH },
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
      // Registering User makes UserRepository available to RolesGuard when
      // FAC-132's @UseJwtGuard(...roles) applies RolesGuard at the
      // controller level (RolesGuard consumes UserRepository to check
      // user.roles). Matches the pattern in AnalyticsModule.
      User,
      SystemConfig,
    ]),
    CommonModule,
    // Provides UserLoader for CurrentUserInterceptor (FAC-132 added the
    // class-level @UseInterceptors(CurrentUserInterceptor)). Same pattern
    // as AnalyticsModule.
    DataLoaderModule,
  ],
  controllers: [AnalysisController, AdminSentimentConfigController],
  providers: [
    AnalysisService,
    SentimentProcessor,
    EmbeddingProcessor,
    TopicModelProcessor,
    RecommendationsProcessor,
    PipelineOrchestratorService,
    TopicLabelService,
    RecommendationGenerationService,
    AnalysisAccessService,
    SentimentConfigService,
  ],
  exports: [
    AnalysisService,
    PipelineOrchestratorService,
    SentimentConfigService,
  ],
})
export class AnalysisModule {}
