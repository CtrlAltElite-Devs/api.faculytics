import 'dotenv/config';
import z from 'zod';
import { moodleEnvSchema } from './moodle.env';
import { serverEnvSchema } from './server.env';
import { corsEnvSchema } from './cors.env';
import { DEFAULT_PORT } from '../common/constants';
import { databaseEnvSchema } from './database.env';
import { jwtEnvSchema } from './jwt.env';
import { openaiEnvSchema } from './openai.env';
import { adminEnvSchema } from './admin.env';

export const envSchema = z.object({
  ...databaseEnvSchema.shape,
  ...serverEnvSchema.shape,
  ...jwtEnvSchema.shape,
  ...corsEnvSchema.shape,
  ...moodleEnvSchema.shape,
  ...openaiEnvSchema.shape,
  ...adminEnvSchema.shape,
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

export const envPortResolve = () => env.PORT ?? DEFAULT_PORT;
