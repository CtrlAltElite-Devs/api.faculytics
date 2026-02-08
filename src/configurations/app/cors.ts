import { INestApplication } from '@nestjs/common';
import { env } from '../env';

export default function UseCorsConfigurations(app: INestApplication<any>) {
  const corsOrigins = env.CORS_ORIGINS;
  console.log('cors: ', corsOrigins);
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (
        err: Error | null,
        origin?: boolean | string | RegExp | (string | RegExp)[],
      ) => void,
    ) => {
      // Non-browser requests (curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Logical wildcard
      if (corsOrigins.includes('*')) {
        return callback(null, origin); // reflect request origin
      }

      // Explicit allowlist
      if (corsOrigins.includes(origin)) {
        return callback(null, origin);
      }

      callback(new Error('Not allowed by CORS'));
    },
  });
}
