import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { env } from 'src/configurations/env';
import { AnalysisJobMessage } from '../dto/analysis-job-message.dto';
import { AnalysisResultMessage } from '../dto/analysis-result-message.dto';
import { BaseAnalysisProcessor } from './base.processor';

@Processor('sentiment', {
  concurrency: env.BULLMQ_SENTIMENT_CONCURRENCY,
  stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS,
  maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
})
export class SentimentProcessor extends BaseAnalysisProcessor {
  protected readonly logger = new Logger(SentimentProcessor.name);

  GetWorkerUrl(): string | undefined {
    return env.SENTIMENT_WORKER_URL;
  }

  Persist(
    job: Job<AnalysisJobMessage>,
    result: AnalysisResultMessage,
  ): Promise<void> {
    this.logger.log(
      `Sentiment analysis result for job ${job.id}: ${JSON.stringify(result)}`,
    );
    return Promise.resolve();
  }
}
