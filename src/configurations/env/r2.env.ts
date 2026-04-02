import { z } from 'zod';

export const r2EnvSchema = z.object({
  CF_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('faculytics-reports'),
});

export type R2Env = z.infer<typeof r2EnvSchema>;
