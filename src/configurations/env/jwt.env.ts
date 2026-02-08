import z from 'zod';

export const jwtEnvSchema = z.object({
  JWT_SECRET: z.string(),
  REFRESH_SECRET: z.string(),
});

export type DatabaseEnv = z.infer<typeof jwtEnvSchema>;
