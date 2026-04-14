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
  // TD-9 (FAC-132): paired IDs + display values. Frontend uses IDs for
  // cache keys / invalidation and display values for UI rendering.
  scope: z.object({
    semesterId: z.string(),
    semesterCode: z.string(),
    departmentId: z.string().nullable(),
    departmentCode: z.string().nullable(),
    facultyId: z.string().nullable(),
    facultyName: z.string().nullable(),
    programId: z.string().nullable(),
    programCode: z.string().nullable(),
    campusId: z.string().nullable(),
    campusCode: z.string().nullable(),
    courseId: z.string().nullable(),
    courseShortname: z.string().nullable(),
    questionnaireVersionId: z.string().nullable(),
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
