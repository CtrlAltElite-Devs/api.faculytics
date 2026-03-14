import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { env } from 'src/configurations/env';
import { RecommendationRun } from 'src/entities/recommendation-run.entity';
import { RecommendedAction } from 'src/entities/recommended-action.entity';
import { RunStatus, ActionPriority } from '../enums';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import {
  recommendationsWorkerResponseSchema,
  recommendedActionItemSchema,
} from '../dto/recommendations-worker.dto';
import { BaseBatchProcessor } from './base-batch.processor';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';

const PRIORITY_MAP: Record<string, ActionPriority> = {
  high: ActionPriority.HIGH,
  medium: ActionPriority.MEDIUM,
  low: ActionPriority.LOW,
};

@Processor('recommendations', {
  concurrency: env.RECOMMENDATIONS_CONCURRENCY,
  stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS,
  maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
})
export class RecommendationsProcessor extends BaseBatchProcessor {
  protected readonly logger = new Logger(RecommendationsProcessor.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(forwardRef(() => PipelineOrchestratorService))
    private readonly orchestrator: PipelineOrchestratorService,
  ) {
    super();
  }

  GetWorkerUrl(): string | undefined {
    return env.RECOMMENDATIONS_WORKER_URL;
  }

  async Persist(
    job: Job<BatchAnalysisJobMessage>,
    result: BatchAnalysisResultMessage,
  ): Promise<void> {
    const { pipelineId, runId } = job.data.metadata;

    // Re-parse with typed recommendations response schema
    const parsed = recommendationsWorkerResponseSchema.safeParse(result);
    if (!parsed.success) {
      this.logger.error(
        `Invalid recommendations response: ${JSON.stringify(result)}`,
      );
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'generating_recommendations',
        `Recommendations response validation failed: ${parsed.error.message}`,
      );
      return;
    }

    const data = parsed.data;

    if (data.status === 'failed') {
      this.logger.error(
        `Recommendations worker returned failure for job ${job.id}: ${data.error}`,
      );
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'generating_recommendations',
        data.error || 'Recommendations worker returned failure',
      );
      return;
    }

    if (!data.actions || data.actions.length === 0) {
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'generating_recommendations',
        'Recommendations worker returned no actions',
      );
      return;
    }

    const fork = this.em.fork();
    const run = await fork.findOneOrFail(RecommendationRun, runId);

    for (const raw of data.actions) {
      const actionParsed = recommendedActionItemSchema.safeParse(raw);
      if (!actionParsed.success) {
        this.logger.error(
          `Invalid recommended action item: ${JSON.stringify(raw)}`,
        );
        continue;
      }

      const item = actionParsed.data;
      fork.create(RecommendedAction, {
        run,
        category: item.category,
        actionText: item.actionText,
        priority: PRIORITY_MAP[item.priority] || ActionPriority.MEDIUM,
        supportingEvidence: item.supportingEvidence,
      });
    }

    run.status = RunStatus.COMPLETED;
    run.workerVersion = data.version;
    run.completedAt = new Date();

    await fork.flush();

    this.logger.log(
      `Persisted ${data.actions.length} recommended actions for run ${runId}`,
    );

    await this.orchestrator.OnRecommendationsComplete(pipelineId);
  }

  @OnWorkerEvent('failed')
  override onFailed(job: Job<BatchAnalysisJobMessage>, error: Error) {
    super.onFailed(job, error);

    const pipelineId = job.data?.metadata?.pipelineId;
    if (pipelineId && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      this.orchestrator
        .OnStageFailed(pipelineId, 'generating_recommendations', error.message)
        .catch((err: Error) =>
          this.logger.error(
            `Failed to update pipeline on failure: ${err.message}`,
          ),
        );
    }
  }
}
