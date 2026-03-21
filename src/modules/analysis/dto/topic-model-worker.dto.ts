import { z } from 'zod';

// --- Request Schema ---

export const topicModelWorkerRequestSchema = z.object({
  items: z.array(
    z.object({
      submissionId: z.string(),
      text: z.string().min(1),
      embedding: z.array(z.number()).length(768),
    }),
  ),
  params: z
    .object({
      min_topic_size: z.number().int().positive().optional(),
      nr_topics: z.number().int().positive().optional(),
      umap_n_neighbors: z.number().int().positive().optional(),
      umap_n_components: z.number().int().positive().optional(),
    })
    .optional(),
  metadata: z.object({
    pipelineId: z.string(),
    runId: z.string(),
  }),
});

export type TopicModelWorkerRequest = z.infer<
  typeof topicModelWorkerRequestSchema
>;

// --- Response Schema ---

const topicItemSchema = z.object({
  topicIndex: z.number().int(),
  rawLabel: z.string(),
  keywords: z.array(z.string()),
  docCount: z.number().int(),
});

const topicAssignmentItemSchema = z.object({
  submissionId: z.string(),
  topicIndex: z.number().int(),
  probability: z.number().min(0).max(1),
});

export const topicModelWorkerResponseSchema = z.object({
  version: z.string(),
  status: z.enum(['completed', 'failed']),
  topics: z.array(topicItemSchema).optional(),
  assignments: z.array(topicAssignmentItemSchema).optional(),
  metrics: z
    .object({
      npmi_coherence: z.number().optional(),
      topic_diversity: z.number().optional(),
      outlier_ratio: z.number().optional(),
      silhouette_score: z.number().optional(),
      embedding_coherence: z.number().optional(),
    })
    .optional(),
  outlierCount: z.number().int().optional(),
  error: z.string().optional(),
  completedAt: z.string().datetime({ offset: true }),
});

export type TopicModelWorkerResponse = z.infer<
  typeof topicModelWorkerResponseSchema
>;
