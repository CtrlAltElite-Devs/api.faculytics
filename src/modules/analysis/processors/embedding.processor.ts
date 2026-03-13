import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { env } from 'src/configurations/env';
import { SubmissionEmbedding } from 'src/entities/submission-embedding.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { AnalysisJobMessage } from '../dto/analysis-job-message.dto';
import { AnalysisResultMessage } from '../dto/analysis-result-message.dto';
import { BaseAnalysisProcessor } from './base.processor';

@Processor('embedding', {
  concurrency: env.EMBEDDINGS_CONCURRENCY,
  stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS,
  maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
})
export class EmbeddingProcessor extends BaseAnalysisProcessor {
  protected readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(private readonly em: EntityManager) {
    super();
  }

  GetWorkerUrl(): string | undefined {
    return env.EMBEDDINGS_WORKER_URL;
  }

  async Persist(
    job: Job<AnalysisJobMessage>,
    result: AnalysisResultMessage,
  ): Promise<void> {
    if (result.status === 'failed') {
      this.logger.error(
        `Embedding worker returned failure for job ${job.id}: ${result.error}`,
      );
      return;
    }

    const embedding = result.result?.['embedding'] as number[] | undefined;
    if (!embedding || !Array.isArray(embedding)) {
      this.logger.error(
        `Embedding worker response missing embedding array for job ${job.id}`,
      );
      return;
    }

    const submissionId = job.data.metadata.submissionId;
    const fork = this.em.fork();

    const submission = await fork.findOne(
      QuestionnaireSubmission,
      submissionId,
    );
    if (!submission) {
      this.logger.error(`Submission ${submissionId} not found for embedding`);
      return;
    }

    // Upsert: find existing or create new
    const existing = await fork.findOne(SubmissionEmbedding, {
      submission,
      deletedAt: null,
    });

    if (existing) {
      existing.embedding = embedding;
      existing.modelName = (result.result?.['modelName'] as string) || 'LaBSE';
    } else {
      fork.create(SubmissionEmbedding, {
        submission,
        embedding,
        modelName: (result.result?.['modelName'] as string) || 'LaBSE',
      });
    }

    await fork.flush();
    this.logger.log(`Persisted embedding for submission ${submissionId}`);
  }
}
