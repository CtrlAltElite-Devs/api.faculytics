import { z } from 'zod';

export const redisEnvSchema = z.object({
  REDIS_URL: z.url(),
  REDIS_KEY_PREFIX: z.string().default('faculytics:'),
  REDIS_CACHE_TTL: z.coerce.number().default(60),
});

export type RedisEnv = z.infer<typeof redisEnvSchema>;
