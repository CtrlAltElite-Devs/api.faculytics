import { z } from 'zod';
import { QueueName } from 'src/configurations/common/queue-names';

// --- Evidence Schemas ---

export const topicSourceSchema = z.object({
  type: z.literal('topic'),
  topicLabel: z.string(),
  commentCount: z.number(),
  sentimentBreakdown: z.object({
    positive: z.number(),
    neutral: z.number(),
    negative: z.number(),
  }),
  sampleQuotes: z.array(z.string()).max(3),
});

export type TopicSource = z.infer<typeof topicSourceSchema>;

export const dimensionScoresSourceSchema = z.object({
  type: z.literal('dimension_scores'),
  scores: z.array(
    z.object({
      dimensionCode: z.string(),
      avgScore: z.number(),
    }),
  ),
});

export type DimensionScoresSource = z.infer<typeof dimensionScoresSourceSchema>;

export const supportingEvidenceSourceSchema = z.discriminatedUnion('type', [
  topicSourceSchema,
  dimensionScoresSourceSchema,
]);

export type SupportingEvidenceSource = z.infer<
  typeof supportingEvidenceSourceSchema
>;

export const supportingEvidenceSchema = z.object({
  sources: z.array(supportingEvidenceSourceSchema),
  confidenceLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  basedOnSubmissions: z.number(),
});

export type SupportingEvidence = z.infer<typeof supportingEvidenceSchema>;

// --- LLM Response Schema ---

export const llmRecommendationItemSchema = z.object({
  category: z.enum(['STRENGTH', 'IMPROVEMENT']),
  headline: z.string(),
  description: z.string(),
  actionPlan: z.string(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  topicReference: z.string().nullable().optional(),
});

export type LlmRecommendationItem = z.infer<typeof llmRecommendationItemSchema>;

export const llmRecommendationsResponseSchema = z.object({
  recommendations: z.array(llmRecommendationItemSchema),
});

export type LlmRecommendationsResponse = z.infer<
  typeof llmRecommendationsResponseSchema
>;

// --- Job Message Type ---

export const recommendationsJobSchema = z.object({
  jobId: z.string().uuid(),
  version: z.string(),
  type: z.literal(QueueName.RECOMMENDATIONS),
  metadata: z.object({
    pipelineId: z.string(),
    runId: z.string(),
  }),
  publishedAt: z.string().datetime(),
});

export type RecommendationsJobMessage = z.infer<
  typeof recommendationsJobSchema
>;

// --- Persisted Action Schema ---

export const recommendedActionItemSchema = z.object({
  category: z.enum(['STRENGTH', 'IMPROVEMENT']),
  headline: z.string(),
  description: z.string(),
  actionPlan: z.string(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  supportingEvidence: supportingEvidenceSchema,
});

export type RecommendedActionItem = z.infer<typeof recommendedActionItemSchema>;
