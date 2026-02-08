import { z } from 'zod';
import { envSchema } from '.';

export const validateEnv = (config: Record<string, unknown>) => {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(z.treeifyError(result.error));
    process.exit(1);
  }

  return result.data; // Return validated config for NestJS
};
