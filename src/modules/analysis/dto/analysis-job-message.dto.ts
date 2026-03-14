import { z } from 'zod';

export const analysisJobSchema = z.object({
  jobId: z.string().uuid(),
  version: z.string(),
  type: z.string(),
  text: z.string().min(1),
  metadata: z.object({
    submissionId: z.string(),
    facultyId: z.string(),
    versionId: z.string(),
  }),
  publishedAt: z.string().datetime(),
});

export type AnalysisJobMessage = z.infer<typeof analysisJobSchema>;
