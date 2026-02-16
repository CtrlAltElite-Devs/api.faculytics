import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_TOKEN } from '../common/constants';

export const swaggerConfig = new DocumentBuilder()
  .setTitle('Faculytics API')
  .setDescription('This is the official API documentation for Faculytics')
  .setVersion('1.0')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'Authorization',
      in: 'header',
    },
    ACCESS_TOKEN,
  )
  .build();

export default function UseApiDocumentations(app: INestApplication) {
  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('swagger', app, documentFactory, {
    jsonDocumentUrl: 'openapi.json',
  });
}
