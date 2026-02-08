import { INestApplication, ValidationPipe } from '@nestjs/common';
import UseApiVersioning from './api-versioning';
import UseApiDocumentations from './open-api';
import UseCorsConfigurations from './cors';

export default function ApplyConfigurations(app: INestApplication<any>) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  UseApiVersioning(app);
  UseApiDocumentations(app);
  UseCorsConfigurations(app);
}
