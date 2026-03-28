import { z } from 'zod';

export const throttleEnvSchema = z.object({
  THROTTLE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(60),
});

export type ThrottleEnv = z.infer<typeof throttleEnvSchema>;
