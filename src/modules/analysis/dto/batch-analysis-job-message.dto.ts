import { z } from 'zod';

export const vllmConfigSchema = z.object({
  // https-only to align with the admin DTO (SSRF mitigation): accepting
  // http:// or ftp:// would let a compromised SuperAdmin session redirect
  // every sentiment job to an attacker-controlled host.
  url: z
    .string()
    .url()
    .refine((v) => v.startsWith('https://'), 'URL must use https://'),
  model: z.string().min(1),
  enabled: z.boolean(),
});

export type VllmConfig = z.infer<typeof vllmConfigSchema>;

export const batchAnalysisJobSchema = z
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
      chunkIndex: z.number().int().min(0).optional(),
      chunkCount: z.number().int().positive().optional(),
    }),
    publishedAt: z.string().datetime(),
    vllmConfig: vllmConfigSchema.optional(),
  })
  .strict();

export type BatchAnalysisJobMessage = z.infer<typeof batchAnalysisJobSchema>;
