import { env } from 'src/configurations/env';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BaseBatchProcessor } from './base-batch.processor';

/**
 * Base processor for workers deployed on RunPod serverless.
 * Handles the RunPod `/runsync` envelope: auth header, `{ input: ... }` wrapping,
 * and `{ output: ... }` unwrapping.
 */
export abstract class RunPodBatchProcessor extends BaseBatchProcessor {
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

  protected override unwrapResponse(body: unknown): unknown {
    const obj = body as Record<string, unknown> | null;
    if (obj?.status === 'FAILED') {
      throw new Error(
        `RunPod error: ${typeof obj.error === 'string' ? obj.error : JSON.stringify(obj.error ?? 'unknown')}`,
      );
    }
    return obj?.output ?? body;
  }
}
