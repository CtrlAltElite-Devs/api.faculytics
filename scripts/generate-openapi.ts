import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import AppModule from '../src/app.module';
import { ApplyConfigurations } from '../src/configurations/index.config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { swaggerConfig } from '../src/configurations/app/open-api';

async function generate() {
  console.log('Generating OpenAPI contract...');

  // Use a dummy port and env vars if needed
  process.env.PORT = '3000';
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgres://localhost:5432/db';
  process.env.JWT_SECRET = 'secret';
  process.env.REFRESH_SECRET = 'secret';
  process.env.MOODLE_BASE_URL = 'https://moodle.com';
  process.env.MOODLE_MASTER_KEY = 'key';
  process.env.OPENAI_API_KEY = 'key';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideModule(MikroOrmModule)
    .useModule(class MockMikroOrmModule {})
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();

  // Apply configurations like versioning and prefix
  ApplyConfigurations(app);

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
