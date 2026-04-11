import z from 'zod';

export const moodleEnvSchema = z.object({
  MOODLE_BASE_URL: z.url(),
  MOODLE_MASTER_KEY: z.string(),
  MOODLE_SYNC_CONCURRENCY: z.coerce.number().min(1).max(20).default(3),
  MOODLE_SYNC_INTERVAL_MINUTES: z.coerce.number().min(30).optional(),
  MOODLE_ROLE_ID_STUDENT: z.coerce.number().default(5),
  MOODLE_ROLE_ID_EDITING_TEACHER: z.coerce.number().default(3),
});

export type MoodleEnv = z.infer<typeof moodleEnvSchema>;
