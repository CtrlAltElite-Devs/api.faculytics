import { z } from 'zod';

export const analysisResultSchema = z.object({
  jobId: z.string().uuid(),
  version: z.string(),
  status: z.enum(['completed', 'failed']),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  completedAt: z.string().datetime(),
});

export type AnalysisResultMessage = z.infer<typeof analysisResultSchema>;
