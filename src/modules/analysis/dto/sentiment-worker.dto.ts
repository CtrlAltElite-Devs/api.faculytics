import { z } from 'zod';

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
});

export type SentimentResultItem = z.infer<typeof sentimentResultItemSchema>;

export const sentimentWorkerResponseSchema = z.object({
  version: z.string(),
  status: z.enum(['completed', 'failed']),
  results: z.array(sentimentResultItemSchema).optional(),
  error: z.string().optional(),
  completedAt: z.string().datetime(),
});

export type SentimentWorkerResponse = z.infer<
  typeof sentimentWorkerResponseSchema
>;
