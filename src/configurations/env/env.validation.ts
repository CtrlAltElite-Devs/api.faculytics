import { z } from 'zod';
import { envSchema } from '.';
import { warnOnWeakJwtConfig } from './jwt.env';

export const validateEnv = (config: Record<string, unknown>) => {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(z.treeifyError(result.error));
    process.exit(1);
  }

  warnOnWeakJwtConfig(result.data);
  return result.data; // Return validated config for NestJS
};
