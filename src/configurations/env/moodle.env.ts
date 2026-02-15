import z from 'zod';

export const moodleEnvSchema = z.object({
  MOODLE_BASE_URL: z.url(),
  MOODLE_MASTER_KEY: z.string(),
});

export type MoodleEnv = z.infer<typeof moodleEnvSchema>;
