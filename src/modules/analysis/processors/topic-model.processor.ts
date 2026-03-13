import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { env } from 'src/configurations/env';
import { TopicModelRun } from 'src/entities/topic-model-run.entity';
import { Topic } from 'src/entities/topic.entity';
import { TopicAssignment } from 'src/entities/topic-assignment.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { RunStatus } from '../enums';
import { TOPIC_ASSIGNMENT_BATCH_SIZE } from '../constants';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import { topicModelWorkerResponseSchema } from '../dto/topic-model-worker.dto';
import { BaseBatchProcessor } from './base-batch.processor';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';

@Processor('topic-model', {
  concurrency: env.TOPIC_MODEL_CONCURRENCY,
  stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS,
  maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT,
})
export class TopicModelProcessor extends BaseBatchProcessor {
  protected readonly logger = new Logger(TopicModelProcessor.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(forwardRef(() => PipelineOrchestratorService))
    private readonly orchestrator: PipelineOrchestratorService,
  ) {
    super();
  }

  GetWorkerUrl(): string | undefined {
    return env.TOPIC_MODEL_WORKER_URL;
  }

  async Persist(
    job: Job<BatchAnalysisJobMessage>,
    result: BatchAnalysisResultMessage,
  ): Promise<void> {
    const { pipelineId, runId } = job.data.metadata;

    // Re-parse with typed topic model response schema
    const parsed = topicModelWorkerResponseSchema.safeParse(result);
    if (!parsed.success) {
      this.logger.error(
        `Invalid topic model response: ${JSON.stringify(result)}`,
      );
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'topic_modeling',
        `Topic model response validation failed: ${parsed.error.message}`,
      );
      return;
    }

    const data = parsed.data;

    if (data.status === 'failed') {
      this.logger.error(
        `Topic model worker returned failure for job ${job.id}: ${data.error}`,
      );
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'topic_modeling',
        data.error || 'Topic model worker returned failure',
      );
      return;
    }

    if (!data.topics || !data.assignments) {
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'topic_modeling',
        'Topic model worker returned no topics or assignments',
      );
      return;
    }

    const fork = this.em.fork();
    const run = await fork.findOneOrFail(TopicModelRun, runId);

    // Create Topic entities
    const topicMap = new Map<number, Topic>();
    for (const topicData of data.topics) {
      const topic = fork.create(Topic, {
        run,
        topicIndex: topicData.topicIndex,
        rawLabel: topicData.rawLabel,
        keywords: topicData.keywords,
        docCount: topicData.docCount,
      });
      topicMap.set(topicData.topicIndex, topic);
    }

    // Filter assignments by probability > 0.01
    const validAssignments = data.assignments.filter(
      (a) => a.probability > 0.01,
    );

    // Determine dominant topic per submission
    const dominantBySubmission = new Map<string, number>();
    for (const a of validAssignments) {
      const current = dominantBySubmission.get(a.submissionId);
      if (
        current === undefined ||
        a.probability >
          (validAssignments.find(
            (va) =>
              va.submissionId === a.submissionId && va.topicIndex === current,
          )?.probability ?? 0)
      ) {
        dominantBySubmission.set(a.submissionId, a.topicIndex);
      }
    }

    // Create TopicAssignment entities in chunks
    const assignmentEntities: TopicAssignment[] = [];
    for (const a of validAssignments) {
      const topic = topicMap.get(a.topicIndex);
      if (!topic) continue;

      const submission = fork.getReference(
        QuestionnaireSubmission,
        a.submissionId,
      );
      const isDominant =
        dominantBySubmission.get(a.submissionId) === a.topicIndex;

      assignmentEntities.push(
        fork.create(
          TopicAssignment,
          { topic, submission, probability: a.probability, isDominant },
          { persist: false },
        ),
      );
    }

    // Persist in chunks
    for (
      let i = 0;
      i < assignmentEntities.length;
      i += TOPIC_ASSIGNMENT_BATCH_SIZE
    ) {
      const chunk = assignmentEntities.slice(
        i,
        i + TOPIC_ASSIGNMENT_BATCH_SIZE,
      );
      fork.persist(chunk);
    }

    // Update run metadata
    run.topicCount = data.topics.length;
    run.outlierCount = data.outlierCount ?? 0;
    run.metrics = data.metrics as Record<string, unknown> | undefined;
    run.status = RunStatus.COMPLETED;
    run.workerVersion = data.version;
    run.completedAt = new Date();

    await fork.flush();

    this.logger.log(
      `Persisted ${data.topics.length} topics and ${assignmentEntities.length} assignments for run ${runId}`,
    );

    await this.orchestrator.OnTopicModelComplete(pipelineId);
  }

  @OnWorkerEvent('failed')
  override onFailed(job: Job<BatchAnalysisJobMessage>, error: Error) {
    super.onFailed(job, error);

    const pipelineId = job.data?.metadata?.pipelineId;
    if (pipelineId && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      this.orchestrator
        .OnStageFailed(pipelineId, 'topic_modeling', error.message)
        .catch((err: Error) =>
          this.logger.error(
            `Failed to update pipeline on failure: ${err.message}`,
          ),
        );
    }
  }
}
