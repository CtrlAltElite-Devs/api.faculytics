import { z } from 'zod';

export const batchAnalysisJobSchema = z.object({
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
});

export type BatchAnalysisJobMessage = z.infer<typeof batchAnalysisJobSchema>;
