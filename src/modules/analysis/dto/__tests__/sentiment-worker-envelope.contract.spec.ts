import { z } from 'zod';
import { v4 } from 'uuid';
import { batchAnalysisJobSchema } from '../batch-analysis-job-message.dto';

/**
 * Contract test: API-built BullMQ envelope must validate against the
 * sentiment worker's own request schema.
 *
 * The worker's schema lives in an independent repo
 * (sentiment.worker.temp.faculytics) and is duplicated inline here as the
 * SINGLE source of truth for the cross-boundary contract. The worker-side
 * mirror test (api-envelope.contract.spec.ts in the worker repo) duplicates
 * the same shape. If this test breaks after a worker-side change, the
 * inline schema below must be updated — that IS the contract.
 *
 * Existing drift: the worker's sentimentRequestSchema *is* stricter in
 * shape than the OLD sentimentWorkerRequestSchema (which lacked
 * jobId/version/type/publishedAt). Validating the envelope against the
 * worker's actual schema — not the legacy API-side schema — is the whole
 * point of this contract test.
 */
const workerVllmConfigSchema = z.object({
  url: z.string().url(),
  model: z.string().min(1),
  enabled: z.boolean(),
});

const workerSentimentRequestSchema = z
  .object({
    jobId: z.string().uuid(),
    version: z.string(),
    type: z.string(),
    items: z.array(
      z.object({
        submissionId: z.string(),
        text: z.string().min(1),
      }),
    ),
    metadata: z.object({
      pipelineId: z.string(),
      runId: z.string(),
    }),
    publishedAt: z.string().datetime(),
    vllmConfig: workerVllmConfigSchema.optional(),
  })
  .passthrough();

describe('Contract: API sentiment envelope ↔ worker request schema', () => {
  const baseEnvelope = () => ({
    jobId: v4(),
    version: '1.0',
    type: 'sentiment',
    items: [{ submissionId: 's1', text: 'Great professor' }],
    metadata: {
      pipelineId: 'pipeline-1',
      runId: 'run-1',
      chunkIndex: 0,
      chunkCount: 1,
    },
    publishedAt: new Date().toISOString(),
  });

  it('envelope without vllmConfig validates on both sides (backward compatibility)', () => {
    const envelope = baseEnvelope();

    expect(batchAnalysisJobSchema.parse(envelope)).toBeDefined();
    expect(workerSentimentRequestSchema.parse(envelope)).toBeDefined();
  });

  it('envelope with vllmConfig validates on both sides', () => {
    const envelope = {
      ...baseEnvelope(),
      vllmConfig: {
        url: 'https://vllm.example',
        model: 'unsloth/gemma-4-26B-A4B-it',
        enabled: true,
      },
    };

    expect(batchAnalysisJobSchema.parse(envelope)).toBeDefined();
    expect(workerSentimentRequestSchema.parse(envelope)).toBeDefined();
  });

  it('envelope with vllmConfig.enabled=false still validates on both sides', () => {
    const envelope = {
      ...baseEnvelope(),
      vllmConfig: {
        url: 'https://vllm.example',
        model: 'unsloth/gemma',
        enabled: false,
      },
    };

    expect(batchAnalysisJobSchema.parse(envelope)).toBeDefined();
    expect(workerSentimentRequestSchema.parse(envelope)).toBeDefined();
  });

  it('bad URL fails BOTH schemas identically', () => {
    const envelope = {
      ...baseEnvelope(),
      vllmConfig: {
        url: 'not-a-url',
        model: 'gemma',
        enabled: true,
      },
    };

    expect(() => batchAnalysisJobSchema.parse(envelope)).toThrow();
    expect(() => workerSentimentRequestSchema.parse(envelope)).toThrow();
  });

  it('empty model fails BOTH schemas identically', () => {
    const envelope = {
      ...baseEnvelope(),
      vllmConfig: {
        url: 'https://v',
        model: '',
        enabled: true,
      },
    };

    expect(() => batchAnalysisJobSchema.parse(envelope)).toThrow();
    expect(() => workerSentimentRequestSchema.parse(envelope)).toThrow();
  });
});
