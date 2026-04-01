import { z } from 'zod';

export const reportEnvSchema = z.object({
  REPORT_PRESIGNED_URL_EXPIRY_SECONDS: z.coerce.number().default(3600),
  REPORT_BATCH_MAX_SIZE: z.coerce.number().default(100),
  REPORT_RETENTION_DAYS: z.coerce.number().default(7),
});

export type ReportEnv = z.infer<typeof reportEnvSchema>;
