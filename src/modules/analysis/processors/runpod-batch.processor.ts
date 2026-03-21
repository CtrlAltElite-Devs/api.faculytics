import { Logger } from '@nestjs/common';
import { env } from 'src/configurations/env';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BaseBatchProcessor } from './base-batch.processor';

const RUNPOD_POLL_INTERVAL_MS = 5_000;

type RunPodResponse = Record<string, unknown> | null;

/**
 * Base processor for workers deployed on RunPod serverless.
 * Handles the RunPod envelope: auth header, `{ input: ... }` wrapping,
 * `{ output: ... }` unwrapping, and async job polling when `/runsync` times out.
 */
export abstract class RunPodBatchProcessor extends BaseBatchProcessor {
  protected abstract override readonly logger: Logger;

  protected override buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(env.RUNPOD_API_KEY
        ? { Authorization: `Bearer ${env.RUNPOD_API_KEY}` }
        : {}),
    };
  }

  protected override wrapBody(data: BatchAnalysisJobMessage): unknown {
    return { input: data };
  }

  protected override async unwrapResponse(body: unknown): Promise<unknown> {
    const obj = body as RunPodResponse;

    if (obj?.status === 'FAILED') {
      throw new Error(
        `RunPod error: ${typeof obj.error === 'string' ? obj.error : JSON.stringify(obj.error ?? 'unknown')}`,
      );
    }

    if (obj?.status === 'IN_QUEUE' || obj?.status === 'IN_PROGRESS') {
      const jobId = obj.id as string;
      this.logger.log(
        `RunPod returned ${obj.status} for job ${jobId}, polling for result...`,
      );
      return this.pollRunPodJob(jobId);
    }

    return obj?.output ?? body;
  }

  private async pollRunPodJob(runpodJobId: string): Promise<unknown> {
    const workerUrl = this.GetWorkerUrl()!;
    const statusUrl = this.deriveStatusUrl(workerUrl, runpodJobId);
    const headers = this.buildHeaders();
    const deadline = Date.now() + this.getHttpTimeoutMs();

    while (Date.now() < deadline) {
      await this.sleep(RUNPOD_POLL_INTERVAL_MS);

      const response = await fetch(statusUrl, { headers });
      if (!response.ok) {
        throw new Error(
          `RunPod status poll returned HTTP ${response.status} for job ${runpodJobId}`,
        );
      }

      const body = (await response.json()) as RunPodResponse;
      const status = body?.status as string;

      if (status === 'COMPLETED') {
        this.logger.log(`RunPod job ${runpodJobId} completed`);
        return body?.output ?? body;
      }

      if (status === 'FAILED') {
        throw new Error(
          `RunPod error: ${typeof body?.error === 'string' ? body.error : JSON.stringify(body?.error ?? 'unknown')}`,
        );
      }

      // IN_QUEUE or IN_PROGRESS — keep polling
    }

    throw new Error(
      `RunPod job ${runpodJobId} did not complete within ${this.getHttpTimeoutMs()}ms`,
    );
  }

  /**
   * Derives the RunPod status URL from the worker URL.
   * e.g. https://api.runpod.ai/v2/{endpoint-id}/runsync
   *    → https://api.runpod.ai/v2/{endpoint-id}/status/{job-id}
   */
  private deriveStatusUrl(workerUrl: string, runpodJobId: string): string {
    const base = workerUrl.replace(/\/(runsync|run)\/?$/, '');
    return `${base}/status/${runpodJobId}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
