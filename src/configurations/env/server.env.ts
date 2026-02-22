import z from 'zod';
import { DEFAULT_PORT } from '../common/constants';

export const serverEnvSchema = z.object({
  PORT: z.coerce.number().default(DEFAULT_PORT),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  OPENAPI_MODE: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default(false),
});
