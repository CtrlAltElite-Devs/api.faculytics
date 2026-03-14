import { Logger } from '@nestjs/common';
import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { env } from 'src/configurations/env';
import { AnalysisJobMessage } from '../dto/analysis-job-message.dto';
import {
  AnalysisResultMessage,
  analysisResultSchema,
} from '../dto/analysis-result-message.dto';

export abstract class BaseAnalysisProcessor extends WorkerHost {
  protected abstract readonly logger: Logger;

  abstract GetWorkerUrl(): string | undefined;
  abstract Persist(
    job: Job<AnalysisJobMessage>,
    result: AnalysisResultMessage,
  ): Promise<void>;

  async process(job: Job<AnalysisJobMessage>): Promise<void> {
    const workerUrl = this.GetWorkerUrl();
    if (!workerUrl) {
      throw new Error(
        `Worker URL not configured for ${job.queueName}. Set the corresponding env var.`,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      env.BULLMQ_HTTP_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job.data),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          `HTTP request to ${job.queueName} worker timed out after ${env.BULLMQ_HTTP_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `Worker responded with HTTP ${response.status} for job ${job.id}`,
      );
    }

    const rawBody: unknown = await response.json();
    const parseResult = analysisResultSchema.safeParse(rawBody);

    if (!parseResult.success) {
      this.logger.error(
        `Malformed worker response for job ${job.id}: ${JSON.stringify(rawBody)}`,
      );
      throw new Error(
        `Worker response validation failed for job ${job.id}: ${parseResult.error.message}`,
      );
    }

    await this.Persist(job, parseResult.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<AnalysisJobMessage>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.queueName}) failed on attempt ${job.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Job ${jobId} stalled — investigating`);
  }
}
