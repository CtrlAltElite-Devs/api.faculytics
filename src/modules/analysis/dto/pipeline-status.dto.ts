import { z } from 'zod';

const stageStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'skipped']),
  progress: z
    .object({
      current: z.number().int(),
      total: z.number().int(),
    })
    .nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

const sentimentGateSchema = stageStatusSchema.extend({
  included: z.number().int().nullable(),
  excluded: z.number().int().nullable(),
});

export const pipelineStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  scope: z.object({
    semester: z.string(),
    department: z.string().nullable(),
    faculty: z.string().nullable(),
    questionnaireVersion: z.string().nullable(),
    program: z.string().nullable(),
    campus: z.string().nullable(),
    course: z.string().nullable(),
  }),
  coverage: z.object({
    totalEnrolled: z.number().int(),
    submissionCount: z.number().int(),
    commentCount: z.number().int(),
    responseRate: z.number(),
    lastEnrollmentSyncAt: z.string().datetime().nullable(),
  }),
  stages: z.object({
    embeddings: stageStatusSchema,
    sentiment: stageStatusSchema,
    sentimentGate: sentimentGateSchema,
    topicModeling: stageStatusSchema,
    recommendations: stageStatusSchema,
  }),
  warnings: z.array(z.string()),
  errorMessage: z.string().nullable(),
  retryable: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export type PipelineStatusResponse = z.infer<typeof pipelineStatusSchema>;
