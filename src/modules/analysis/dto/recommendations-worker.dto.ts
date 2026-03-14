import { z } from 'zod';

// --- Request Schema ---

export const recommendationsWorkerRequestSchema = z.object({
  scope: z.object({
    semester: z.string(),
    department: z.string().optional(),
    program: z.string().optional(),
    campus: z.string().optional(),
    faculty: z.string().optional(),
    course: z.string().optional(),
  }),
  data: z.object({
    submissionCount: z.number().int(),
    commentCount: z.number().int(),
    responseRate: z.number(),
    scoreDistribution: z.record(z.string(), z.number()).optional(),
    sentimentSummary: z
      .object({
        positive: z.number().int(),
        neutral: z.number().int(),
        negative: z.number().int(),
      })
      .optional(),
    topTopics: z
      .array(
        z.object({
          label: z.string(),
          keywords: z.array(z.string()),
          docCount: z.number().int(),
          avgSentiment: z.number().optional(),
        }),
      )
      .optional(),
    sampleComments: z
      .array(
        z.object({
          text: z.string(),
          sentiment: z.string(),
          topics: z.array(z.string()).optional(),
        }),
      )
      .optional(),
  }),
  metadata: z.object({
    pipelineId: z.string(),
    runId: z.string(),
  }),
});

export type RecommendationsWorkerRequest = z.infer<
  typeof recommendationsWorkerRequestSchema
>;

// --- Response Schema ---

export const recommendedActionItemSchema = z.object({
  category: z.string(),
  actionText: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  supportingEvidence: z.record(z.string(), z.unknown()),
});

export type RecommendedActionItem = z.infer<typeof recommendedActionItemSchema>;

export const recommendationsWorkerResponseSchema = z.object({
  version: z.string(),
  status: z.enum(['completed', 'failed']),
  actions: z.array(recommendedActionItemSchema).optional(),
  error: z.string().optional(),
  completedAt: z.string().datetime(),
});

export type RecommendationsWorkerResponse = z.infer<
  typeof recommendationsWorkerResponseSchema
>;
