import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  ApplyConfigurations,
  envPortResolve,
  useNestFactoryCustomOptions,
  usePostBootstrap,
} from "./configurations/index.config";

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
