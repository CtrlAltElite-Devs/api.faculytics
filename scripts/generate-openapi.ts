process.env.OPENAPI_MODE = 'true';

import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import AppModule from '../src/app.module';
import {
  ApplyConfigurations,
  useNestFactoryCustomOptions,
} from '../src/configurations/index.config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { swaggerConfig } from '../src/configurations/app/open-api';
import { NestFactory } from '@nestjs/core';

async function generate() {
  console.log('Generating OpenAPI contract...');
  console.log('test: ', process.env.OPENAPI_MODE);

  // Use a dummy port and env vars if needed
  process.env.PORT = '3000';
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgres://localhost:5432/db';
  process.env.JWT_SECRET = 'secret';
  process.env.REFRESH_SECRET = 'secret';
  process.env.MOODLE_BASE_URL = 'https://moodle.com';
  process.env.MOODLE_MASTER_KEY = 'key';
  process.env.OPENAI_API_KEY = 'key';
  process.env.OPENAPI_MODE = 'true';

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    useNestFactoryCustomOptions(),
  );

  // Apply configurations like versioning and prefix
  ApplyConfigurations(app);

  await app.init();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  writeFileSync('openapi.json', JSON.stringify(document, null, 2));

  console.log('OpenAPI contract generated successfully: openapi.json');

  await app.close();
  process.exit(0);
}

generate().catch((err) => {
  console.error('Failed to generate OpenAPI contract:', err);
  process.exit(1);
});
