import z from 'zod';

export const openaiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
});
