import z from 'zod';
import { isValidJwtDuration } from './jwt-duration.util';

let hasWarnedWeakJwtBcryptRounds = false;

export const jwtEnvSchema = z.object({
  JWT_SECRET: z.string(),
  REFRESH_SECRET: z.string(),
  JWT_ACCESS_TOKEN_EXPIRY: z
    .string()
    .trim()
    .refine(isValidJwtDuration, {
      message: 'JWT_ACCESS_TOKEN_EXPIRY must be a valid positive duration',
    })
    .default('300s'),
  JWT_REFRESH_TOKEN_EXPIRY: z
    .string()
    .trim()
    .refine(isValidJwtDuration, {
      message: 'JWT_REFRESH_TOKEN_EXPIRY must be a valid positive duration',
    })
    .default('30d'),
  JWT_BCRYPT_ROUNDS: z.coerce.number().int().positive().default(10),
});

export type JwtEnv = z.infer<typeof jwtEnvSchema>;

export const warnOnWeakJwtConfig = (config: {
  NODE_ENV: 'development' | 'production' | 'test';
  JWT_BCRYPT_ROUNDS: number;
}) => {
  if (
    config.NODE_ENV === 'production' ||
    config.JWT_BCRYPT_ROUNDS >= 10 ||
    hasWarnedWeakJwtBcryptRounds
  ) {
    return;
  }

  hasWarnedWeakJwtBcryptRounds = true;
  console.warn(
    `JWT_BCRYPT_ROUNDS is set to ${config.JWT_BCRYPT_ROUNDS}. Values below 10 reduce refresh-token hashing cost and should only be used for non-production convenience.`,
  );
};
