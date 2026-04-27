import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { env } from 'src/configurations/env';
import { QueueName } from 'src/configurations/common/queue-names';
import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import { SentimentRun } from 'src/entities/sentiment-run.entity';
import { SentimentResult } from 'src/entities/sentiment-result.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { RunStatus } from '../enums';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import { sentimentResultItemSchema } from '../dto/sentiment-worker.dto';
import { RunPodBatchProcessor } from './runpod-batch.processor';
import {
  PipelineOrchestratorService,
  TERMINAL_STATUSES,
} from '../services/pipeline-orchestrator.service';

type ChunkLogStatus =
  | 'persisted'
  | 'duplicate-swallowed'
  | 'failed'
  | 'superseded';

interface ChunkLogFields {
  pipelineId: string;
  runId: string;
  chunkIndex: number;
  chunkCount: number;
  durationMs: number | null;
  attemptsMade: number;
  status: ChunkLogStatus;
  reason?: string;
  lastChunk?: boolean;
}

class SupersededChunkError extends Error {}

type CounterRow = {
  completedChunks: number;
  expectedChunks: number;
};

type PersistOutcome =
  | { kind: 'persisted'; completedChunks: number; expectedChunks: number }
  | { kind: 'duplicate-swallowed' }
  | { kind: 'superseded'; reason: string };

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
    const startedAt = Date.now();
    const {
      pipelineId,
      runId,
      chunkIndex = 0,
      chunkCount = 1,
    } = job.data.metadata;
    const baseLog = {
      pipelineId,
      runId,
      chunkIndex,
      chunkCount,
      attemptsMade: job.attemptsMade,
    };

    const statusFork = this.em.fork();
    const pipeline = await statusFork.findOne(AnalysisPipeline, pipelineId);
    if (!pipeline) {
      // Pipeline missing (soft-deleted or never existed). Do not retry — emit
      // a superseded log and exit cleanly so BullMQ does not burn the retry
      // budget (and OpenAI tokens via the worker) against a pipeline we can
      // neither advance nor audit.
      this.emitChunkLog({
        ...baseLog,
        durationMs: Date.now() - startedAt,
        status: 'superseded',
        reason: 'pipeline-missing',
      });
      return;
    }
    if (TERMINAL_STATUSES.includes(pipeline.status)) {
      this.emitChunkLog({
        ...baseLog,
        durationMs: Date.now() - startedAt,
        status: 'superseded',
        reason: 'pipeline-terminal',
      });
      return;
    }

    if (result.status === 'failed') {
      this.logger.error(
        `Sentiment worker returned failure for job ${job.id}: ${result.error}`,
      );
      const message = `chunk ${chunkIndex + 1}/${chunkCount} failed after ${job.attemptsMade} retries: ${result.error ?? 'Sentiment worker returned failure'}`;
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'sentiment_analysis',
        message,
      );
      this.emitChunkLog({
        ...baseLog,
        durationMs: Date.now() - startedAt,
        status: 'failed',
        reason: result.error,
      });
      return;
    }

    if (!result.results || result.results.length === 0) {
      const message = `chunk ${chunkIndex + 1}/${chunkCount} returned no results from worker`;
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'sentiment_analysis',
        message,
      );
      this.emitChunkLog({
        ...baseLog,
        durationMs: Date.now() - startedAt,
        status: 'failed',
        reason: 'no-results',
      });
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
      const message = `chunk ${chunkIndex + 1}/${chunkCount} returned no valid results (all submissionIds unknown)`;
      await this.orchestrator.OnStageFailed(
        pipelineId,
        'sentiment_analysis',
        message,
      );
      this.emitChunkLog({
        ...baseLog,
        durationMs: Date.now() - startedAt,
        status: 'failed',
        reason: 'all-dropped',
      });
      return;
    }

    // Verify runId belongs to pipelineId before we touch any state. A misbound
    // chunk (client bug or malicious envelope) otherwise pollutes version-drift
    // warnings and wastes a transaction slot.
    const priorRun = await statusFork.findOne(SentimentRun, {
      id: runId,
      pipeline: pipelineId,
    });
    if (!priorRun) {
      this.emitChunkLog({
        ...baseLog,
        durationMs: Date.now() - startedAt,
        status: 'superseded',
        reason: 'run-missing-or-mismatched',
      });
      return;
    }
    if (priorRun.workerVersion && priorRun.workerVersion !== result.version) {
      this.logger.warn({
        event: 'sentiment_worker_version_drift',
        runId,
        priorVersion: priorRun.workerVersion,
        chunkVersion: result.version,
      });
    }

    const outcome: PersistOutcome = await this.em
      .transactional(async (tx) => {
        for (const raw of validResults) {
          const parsed = sentimentResultItemSchema.safeParse(raw);
          if (!parsed.success) {
            this.logger.error(
              `Invalid sentiment result item: ${JSON.stringify(raw)}`,
            );
            continue;
          }
          const item = parsed.data;
          const submission = tx.getReference(
            QuestionnaireSubmission,
            item.submissionId,
          );
          const run = tx.getReference(SentimentRun, runId);
          const scores = {
            positive: item.positive,
            neutral: item.neutral,
            negative: item.negative,
          };
          const label = Object.entries(scores).reduce((a, b) =>
            b[1] > a[1] ? b : a,
          )[0];
          tx.create(SentimentResult, {
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

        // Let errors propagate out of the callback. Catching a 23505 here
        // and returning normally tells MikroORM to COMMIT on top of an
        // already-aborted Postgres transaction, which then fails with
        // 25P02 ("current transaction is aborted, commands ignored until
        // end of transaction block"). The duplicate-swallow translation
        // lives in the outer .catch() so MikroORM rolls back first.
        await tx.flush();

        // Pass tx context so the raw UPDATE runs inside the active transaction.
        // Without it, AbstractSqlConnection.execute uses a pooled Knex connection
        // and the UPDATE commits even if the surrounding em.transactional rolls
        // back — which would strand completed_chunks ahead of the row inserts.
        const rows = await tx.getConnection().execute<CounterRow[]>(
          `UPDATE sentiment_run
           SET completed_chunks = completed_chunks + 1
           WHERE id = ?
             AND deleted_at IS NULL
             AND completed_chunks < expected_chunks
             AND id = (
               SELECT id FROM sentiment_run
               WHERE pipeline_id = ? AND deleted_at IS NULL
               ORDER BY created_at DESC
               LIMIT 1
             )
           RETURNING completed_chunks AS "completedChunks", expected_chunks AS "expectedChunks"`,
          [runId, pipelineId],
          'all',
          tx.getTransactionContext(),
        );

        if (rows.length === 0) {
          throw new SupersededChunkError();
        }

        const { completedChunks, expectedChunks } = rows[0];
        const isLastChunk = completedChunks === expectedChunks;

        if (isLastChunk) {
          // Fold the run-completion writes into the same transaction as the
          // counter UPDATE. If the tx commits, run.status/workerVersion/
          // completedAt are durable alongside completedChunks; if it rolls
          // back, we see the retry via UniqueConstraintViolationException
          // (which the duplicate-swallowed branch compensates below).
          const run = await tx.findOneOrFail(SentimentRun, runId);
          run.status = RunStatus.COMPLETED;
          run.workerVersion = result.version;
          run.completedAt = new Date();
          await tx.flush();
        }

        return {
          kind: 'persisted' as const,
          completedChunks,
          expectedChunks,
        };
      })
      .catch((err: unknown) => {
        if (err instanceof SupersededChunkError) {
          return { kind: 'superseded' as const, reason: '' };
        }
        if (err instanceof UniqueConstraintViolationException) {
          return { kind: 'duplicate-swallowed' as const };
        }
        throw err;
      });

    const durationMs = Date.now() - startedAt;

    if (outcome.kind === 'duplicate-swallowed') {
      // If a prior transaction succeeded on the last chunk but a post-commit
      // failure stranded OnSentimentComplete, compensate here: re-read the
      // counter and fire OnSentimentComplete when saturated. Calling it when
      // the pipeline has already advanced is safe — OnSentimentComplete's
      // own status guard no-ops outside SENTIMENT_ANALYSIS.
      const run = await this.em
        .fork()
        .findOne(SentimentRun, { id: runId, pipeline: pipelineId });
      const saturated =
        run !== null && run.completedChunks === run.expectedChunks;
      this.emitChunkLog({
        ...baseLog,
        durationMs,
        status: 'duplicate-swallowed',
        ...(saturated ? { lastChunk: true } : {}),
      });
      if (saturated) {
        await this.orchestrator.OnSentimentComplete(pipelineId);
      }
      return;
    }

    if (outcome.kind === 'superseded') {
      const reason = await this.determineSupersedeReason(pipelineId, runId);
      this.emitChunkLog({
        ...baseLog,
        durationMs,
        status: 'superseded',
        reason,
      });
      return;
    }

    const isLastChunk = outcome.completedChunks === outcome.expectedChunks;
    if (isLastChunk) {
      await this.orchestrator.OnSentimentComplete(pipelineId);
    }

    this.emitChunkLog({
      ...baseLog,
      durationMs,
      status: 'persisted',
      lastChunk: isLastChunk,
    });
  }

  /**
   * Discriminates among the three states that trigger SupersededChunkError
   * in the transactional UPDATE: counter saturated, run soft-deleted, or
   * stale run (a later dispatch created a newer SentimentRun for the same
   * pipeline). Best-effort; defaults to 'unknown' if the read fails.
   */
  private async determineSupersedeReason(
    pipelineId: string,
    runId: string,
  ): Promise<string> {
    try {
      const fork = this.em.fork();
      const run = await fork.findOne(SentimentRun, runId, {
        filters: { softDelete: false },
      });
      if (!run) return 'run-missing';
      if (run.deletedAt) return 'run-soft-deleted';
      if (run.completedChunks >= run.expectedChunks) return 'counter-saturated';
      const latest = await fork.findOne(
        SentimentRun,
        { pipeline: pipelineId },
        { orderBy: { createdAt: 'DESC' } },
      );
      if (latest && latest.id !== runId) return 'stale-run';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  @OnWorkerEvent('failed')
  override onFailed(job: Job<BatchAnalysisJobMessage>, error: Error) {
    super.onFailed(job, error);

    const pipelineId = job.data?.metadata?.pipelineId;
    const runId = job.data?.metadata?.runId;
    const chunkIndex = job.data?.metadata?.chunkIndex ?? 0;
    const chunkCount = job.data?.metadata?.chunkCount ?? 1;
    const attempts = job.opts?.attempts ?? 3;
    const durationMs = job.processedOn
      ? Math.max(0, Date.now() - job.processedOn)
      : null;

    if (!pipelineId || !runId) {
      this.logger.error({
        event: 'sentiment_chunk_malformed_envelope',
        jobId: job.id,
        queueName: job.queueName,
        attemptsMade: job.attemptsMade,
        reason: error.message,
      });
      return;
    }

    if (job.attemptsMade < attempts) {
      return;
    }

    const message = `chunk ${chunkIndex + 1}/${chunkCount} failed after ${attempts} retries: ${error.message}`;

    this.emitChunkLog({
      pipelineId,
      runId,
      chunkIndex,
      chunkCount,
      durationMs,
      attemptsMade: job.attemptsMade,
      status: 'failed',
      reason: error.message,
    });

    this.orchestrator
      .OnStageFailed(pipelineId, 'sentiment_analysis', message)
      .catch((err: Error) =>
        this.logger.error(
          `Failed to update pipeline on failure: ${err.message}`,
        ),
      );
  }

  private emitChunkLog(fields: ChunkLogFields): void {
    const payload = { event: 'sentiment_chunk', ...fields };
    if (fields.status === 'failed' || fields.status === 'superseded') {
      this.logger.warn(payload);
    } else {
      this.logger.log(payload);
    }
  }
}
