import z from 'zod';

export const corsEnvSchema = z.object({
  CORS_ORIGINS: z
    .string()
    .transform((v) => JSON.parse(v) as unknown)
    .pipe(z.array(z.string())),
});

export type CorsEnv = z.infer<typeof corsEnvSchema>;
