import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { env } from 'src/configurations/env';
import { QueueName } from 'src/configurations/common/queue-names';
import { SentimentRun } from 'src/entities/sentiment-run.entity';
import { SentimentResult } from 'src/entities/sentiment-result.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { RunStatus } from '../enums';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import { sentimentResultItemSchema } from '../dto/sentiment-worker.dto';
import { RunPodBatchProcessor } from './runpod-batch.processor';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';

@Processor(QueueName.SENTIMENT, {
  concurrency: env.BULLMQ_SENTIMENT_CONCURRENCY,
  stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS,
  maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
})
export class SentimentProcessor extends RunPodBatchProcessor {
  protected readonly logger = new Logger(SentimentProcessor.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(forwardRef(() => PipelineOrchestratorService))
    private readonly orchestrator: PipelineOrchestratorService,
  ) {
    super();
  }

  GetWorkerUrl(): string | undefined {
    return env.SENTIMENT_WORKER_URL;
  }

  async Persist(
    job: Job<BatchAnalysisJobMessage>,
    result: BatchAnalysisResultMessage,
  ): Promise<void> {
    const { pipelineId, runId } = job.data.metadata;

    if (result.status === 'failed') {
      this.logger.error(
        `Sentiment worker returned failure for job ${job.id}: ${result.error}`,
      );
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'sentiment_analysis',
        result.error || 'Sentiment worker returned failure',
      );
      return;
    }

    if (!result.results || result.results.length === 0) {
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'sentiment_analysis',
        'Sentiment worker returned no results',
      );
      return;
    }

    const dispatchedIds = new Set(job.data.items.map((i) => i.submissionId));
    const validResults = result.results.filter((raw) => {
      if (typeof raw !== 'object' || raw === null) return false;
      const id = (raw as { submissionId?: unknown }).submissionId;
      return typeof id === 'string' && dispatchedIds.has(id);
    });
    const droppedCount = result.results.length - validResults.length;
    if (droppedCount > 0) {
      this.logger.warn(
        `Dropped ${droppedCount} of ${result.results.length} sentiment results for run ${runId} (unknown submissionIds)`,
      );
    }
    if (validResults.length === 0) {
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'sentiment_analysis',
        'All sentiment results were dropped (no valid submissionIds)',
      );
      return;
    }

    const fork = this.em.fork();
    const run = await fork.findOneOrFail(SentimentRun, runId);

    for (const raw of validResults) {
      const parsed = sentimentResultItemSchema.safeParse(raw);
      if (!parsed.success) {
        this.logger.error(
          `Invalid sentiment result item: ${JSON.stringify(raw)}`,
        );
        continue;
      }

      const item = parsed.data;
      const submission = fork.getReference(
        QuestionnaireSubmission,
        item.submissionId,
      );

      const scores = {
        positive: item.positive,
        neutral: item.neutral,
        negative: item.negative,
      };
      const label = Object.entries(scores).reduce((a, b) =>
        b[1] > a[1] ? b : a,
      )[0];

      fork.create(SentimentResult, {
        run,
        submission,
        positiveScore: item.positive,
        neutralScore: item.neutral,
        negativeScore: item.negative,
        label,
        rawResult: raw,
        processedAt: new Date(),
      });
    }

    run.status = RunStatus.COMPLETED;
    run.workerVersion = result.version;
    run.completedAt = new Date();

    await fork.flush();

    this.logger.log(`Persisted sentiment results for run ${runId}`);

    await this.orchestrator.OnSentimentComplete(pipelineId);
  }

  @OnWorkerEvent('failed')
  override onFailed(job: Job<BatchAnalysisJobMessage>, error: Error) {
    super.onFailed(job, error);

    const pipelineId = job.data?.metadata?.pipelineId;
    if (pipelineId && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      this.orchestrator
        .OnStageFailed(pipelineId, 'sentiment_analysis', error.message)
        .catch((err: Error) =>
          this.logger.error(
            `Failed to update pipeline on failure: ${err.message}`,
          ),
        );
    }
  }
}
