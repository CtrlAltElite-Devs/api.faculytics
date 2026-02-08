import 'dotenv/config';
import z from 'zod';
import { moodleEnvSchema } from './moodle.env';
import { serverEnvSchema } from './server.env';
import { corsEnvSchema } from './cors.env';
import { databaseEnvSchema } from './database.env';

export const envSchema = z.object({
  ...databaseEnvSchema.shape,
  ...serverEnvSchema.shape,
  ...corsEnvSchema.shape,
  ...moodleEnvSchema.shape,
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

export const envPortResolve = () => env.PORT ?? 5200;
