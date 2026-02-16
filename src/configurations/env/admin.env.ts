import { z } from 'zod';

export const adminEnvSchema = z.object({
  SUPER_ADMIN_USERNAME: z.string().default('superadmin'),
  SUPER_ADMIN_PASSWORD: z.string().default('password123'),
});
