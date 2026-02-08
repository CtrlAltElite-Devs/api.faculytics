import { NestFactory } from "@nestjs/core";
import {
  ApplyConfigurations,
  envPortResolve,
  useNestFactoryCustomOptions,
  usePostBootstrap,
} from "./configurations/index.config";
import AppModule from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    useNestFactoryCustomOptions(),
  );

  ApplyConfigurations(app);

  const port = envPortResolve();
  await app.listen(port);

  usePostBootstrap();
}
bootstrap();
