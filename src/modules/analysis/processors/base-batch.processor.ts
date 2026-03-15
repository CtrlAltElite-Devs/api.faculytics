import { Logger } from '@nestjs/common';
import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { env } from 'src/configurations/env';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import {
  BatchAnalysisResultMessage,
  batchAnalysisResultSchema,
} from '../dto/batch-analysis-result-message.dto';

export abstract class BaseBatchProcessor extends WorkerHost {
  protected abstract readonly logger: Logger;

  abstract GetWorkerUrl(): string | undefined;
  abstract Persist(
    job: Job<BatchAnalysisJobMessage>,
    result: BatchAnalysisResultMessage,
  ): Promise<void>;

  /** Override to add custom headers (e.g. auth). */
  protected buildHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  /** Override to wrap the request body (e.g. RunPod `{ input: ... }`). */
  protected wrapBody(data: BatchAnalysisJobMessage): unknown {
    return data;
  }

  /** Override to unwrap the response body (e.g. RunPod `body.output`). */
  protected unwrapResponse(body: unknown): unknown {
    return body;
  }

  /** Override for per-processor HTTP timeout. */
  protected getHttpTimeoutMs(): number {
    return env.BULLMQ_HTTP_TIMEOUT_MS;
  }

  async process(job: Job<BatchAnalysisJobMessage>): Promise<void> {
    const workerUrl = this.GetWorkerUrl();
    if (!workerUrl) {
      throw new Error(
        `Worker URL not configured for ${job.queueName}. Set the corresponding env var.`,
      );
    }

    const timeoutMs = this.getHttpTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(workerUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.wrapBody(job.data)),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          `HTTP request to ${job.queueName} worker timed out after ${timeoutMs}ms`,
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
    const unwrapped = this.unwrapResponse(rawBody);
    const parseResult = batchAnalysisResultSchema.safeParse(unwrapped);

    if (!parseResult.success) {
      this.logger.error(
        `Malformed worker response for job ${job.id}: ${JSON.stringify(unwrapped)}`,
      );
      throw new Error(
        `Worker response validation failed for job ${job.id}: ${parseResult.error.message}`,
      );
    }

    await this.Persist(job, parseResult.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<BatchAnalysisJobMessage>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.queueName}) failed on attempt ${job.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Job ${jobId} stalled — investigating`);
  }
}
