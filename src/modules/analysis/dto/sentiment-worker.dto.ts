import { z } from 'zod';
import { vllmConfigSchema } from './batch-analysis-job-message.dto';

// --- Request Schema ---

export const sentimentWorkerRequestSchema = z.object({
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
  vllmConfig: vllmConfigSchema.optional(),
});

export type SentimentWorkerRequest = z.infer<
  typeof sentimentWorkerRequestSchema
>;

// --- Response Schema ---

export const sentimentResultItemSchema = z.object({
  submissionId: z.string(),
  positive: z.number().min(0).max(1),
  neutral: z.number().min(0).max(1),
  negative: z.number().min(0).max(1),
  servedBy: z.enum(['vllm', 'openai']).optional(),
});

export type SentimentResultItem = z.infer<typeof sentimentResultItemSchema>;

export const sentimentWorkerResponseSchema = z.object({
  version: z.string(),
  status: z.enum(['completed', 'failed']),
  results: z.array(sentimentResultItemSchema).optional(),
  error: z.string().optional(),
  completedAt: z.string().datetime({ offset: true }),
});

export type SentimentWorkerResponse = z.infer<
  typeof sentimentWorkerResponseSchema
>;
