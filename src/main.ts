import { NestFactory } from '@nestjs/core';
import {
  ApplyConfigurations,
  envPortResolve,
  InitializeDatabase,
  useNestFactoryCustomOptions,
  usePostBootstrap,
} from './configurations/index.config';
import AppModule from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    useNestFactoryCustomOptions(),
  );

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
