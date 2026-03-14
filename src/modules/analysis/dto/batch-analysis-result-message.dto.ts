import { z } from 'zod';

export const batchAnalysisResultSchema = z
  .object({
    jobId: z.string().uuid(),
    version: z.string(),
    status: z.enum(['completed', 'failed']),
    results: z.array(z.record(z.string(), z.unknown())).optional(),
    error: z.string().optional(),
    completedAt: z.string().datetime(),
  })
  .passthrough();

export type BatchAnalysisResultMessage = z.infer<
  typeof batchAnalysisResultSchema
>;
