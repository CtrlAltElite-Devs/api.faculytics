import { NestFactory } from '@nestjs/core';
import {
  ApplyConfigurations,
  envPortResolve,
  InitializeDatabase,
  usePostBootstrap,
} from './configurations/index.config';
import AppModule from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  ApplyConfigurations(app);
  await InitializeDatabase(app);
  app.enableShutdownHooks();
  const port = envPortResolve();
  await app.listen(port);
}
bootstrap()
  .then(usePostBootstrap)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
