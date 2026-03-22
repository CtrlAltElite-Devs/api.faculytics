/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { env } from 'src/configurations/env';
import { QueueName } from 'src/configurations/common/queue-names';
import { RecommendationRun } from 'src/entities/recommendation-run.entity';
import { RecommendedAction } from 'src/entities/recommended-action.entity';
import { RunStatus, ActionPriority, ActionCategory } from '../enums';
import { type RecommendationsJobMessage } from '../dto/recommendations.dto';
import { RecommendationGenerationService } from '../services/recommendation-generation.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';

@Processor(QueueName.RECOMMENDATIONS, {
  concurrency: env.RECOMMENDATIONS_CONCURRENCY,
  stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS,
  maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
})
export class RecommendationsProcessor extends WorkerHost {
  private readonly logger = new Logger(RecommendationsProcessor.name);

  constructor(
    private readonly em: EntityManager,
    private readonly generationService: RecommendationGenerationService,
    @Inject(forwardRef(() => PipelineOrchestratorService))
    private readonly orchestrator: PipelineOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<RecommendationsJobMessage>): Promise<void> {
    const { pipelineId, runId } = job.data.metadata;

    this.logger.log(
      `Processing recommendations for pipeline ${pipelineId}, run ${runId}`,
    );

    const recommendations = await this.generationService.Generate(pipelineId);

    const fork = this.em.fork();
    const run = await fork.findOneOrFail(RecommendationRun, runId);

    for (const rec of recommendations) {
      fork.create(RecommendedAction, {
        run,
        category: rec.category as ActionCategory,
        headline: rec.headline,
        description: rec.description,
        actionPlan: rec.actionPlan,
        priority: rec.priority as ActionPriority,
        supportingEvidence: rec.supportingEvidence,
      });
    }

    run.status = RunStatus.COMPLETED;
    run.workerVersion = env.RECOMMENDATIONS_MODEL;
    run.completedAt = new Date();

    await fork.flush();

    this.logger.log(
      `Persisted ${recommendations.length} recommended actions for run ${runId}`,
    );

    await this.orchestrator.OnRecommendationsComplete(pipelineId);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RecommendationsJobMessage>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.queueName}) failed on attempt ${job.attemptsMade}: ${error.message}`,
    );

    const { pipelineId, runId } = job.data?.metadata ?? {};
    if (!pipelineId) return;

    // Mark the run as FAILED so GetRecommendations doesn't show stuck PROCESSING
    if (runId) {
      const fork = this.em.fork();
      fork
        .findOne(RecommendationRun, runId)
        .then((run) => {
          if (run && run.status !== RunStatus.COMPLETED) {
            run.status = RunStatus.FAILED;
            return fork.flush();
          }
        })
        .catch((err: Error) =>
          this.logger.error(
            `Failed to mark run ${runId} as FAILED: ${err.message}`,
          ),
        );
    }

    if (job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      this.orchestrator
        .OnStageFailed(pipelineId, 'generating_recommendations', error.message)
        .catch((err: Error) =>
          this.logger.error(
            `Failed to update pipeline on failure: ${err.message}`,
          ),
        );
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Job ${jobId} stalled — investigating`);
  }
}
