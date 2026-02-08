import z from "zod";

export const moodleEnvSchema = z.object({
  MOODLE_BASE_URL: z.url()
});

export type MoodleEnv = z.infer<typeof moodleEnvSchema>;
