import { z } from 'zod';

export const bullmqEnvSchema = z.object({
  BULLMQ_DEFAULT_ATTEMPTS: z.coerce.number().default(3),
  BULLMQ_DEFAULT_BACKOFF_MS: z.coerce.number().default(5000),
  BULLMQ_DEFAULT_TIMEOUT_MS: z.coerce.number().default(120000),
  BULLMQ_HTTP_TIMEOUT_MS: z.coerce.number().default(90000),
  BULLMQ_SENTIMENT_CONCURRENCY: z.coerce.number().default(3),
  BULLMQ_STALLED_INTERVAL_MS: z.coerce.number().default(30000),
  BULLMQ_MAX_STALLED_COUNT: z.coerce.number().default(2),
  SENTIMENT_WORKER_URL: z.url().optional(),
  EMBEDDINGS_WORKER_URL: z.url().optional(),
  EMBEDDINGS_CONCURRENCY: z.coerce.number().default(3),
  TOPIC_MODEL_WORKER_URL: z.url().optional(),
  TOPIC_MODEL_CONCURRENCY: z.coerce.number().default(1),
  BULLMQ_TOPIC_MODEL_HTTP_TIMEOUT_MS: z.coerce.number().default(300000),
  RUNPOD_API_KEY: z.string().optional(),
  RECOMMENDATIONS_WORKER_URL: z.url().optional(),
  RECOMMENDATIONS_CONCURRENCY: z.coerce.number().default(1),
});

export type BullMqEnv = z.infer<typeof bullmqEnvSchema>;
