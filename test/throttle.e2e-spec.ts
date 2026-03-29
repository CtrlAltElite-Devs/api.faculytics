import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerModule } from '@nestjs/throttler';
import { SkipThrottle, Throttle } from 'src/security/decorators';
import { CustomThrottlerGuard } from 'src/security/guards/throttle.guard';

// --- Test controllers mimicking production endpoints ---

@Controller('test')
class TestController {
  @Get()
  Get() {
    return { ok: true };
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 2 } })
  Login() {
    return { ok: true };
  }
}

@SkipThrottle()
@Controller('health')
class TestHealthController {
  @Get()
  GetHealth() {
    return { status: 'ok' };
  }
}

function createTestModule() {
  @Module({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ ttl: 60000, limit: 3 }],
        errorMessage: 'Too Many Requests',
      }),
    ],
    controllers: [TestController, TestHealthController],
    providers: [{ provide: APP_GUARD, useClass: CustomThrottlerGuard }],
  })
  class TestAppModule {}

  return TestAppModule;
}

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [createTestModule()],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

describe('Rate Limiting (e2e)', () => {
  describe('Global rate limit', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('should allow requests within the limit then return 429 when exceeded', async () => {
      // All 3 requests within the limit should succeed
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get('/test').expect(200);
      }

      // 4th request should be rate-limited
      const response = await request(app.getHttpServer()).get('/test');

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        statusCode: 429,
        message: 'Too Many Requests',
      });
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  describe('Per-route stricter limit', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('should return 429 on login after stricter limit exceeded', async () => {
      // Login has limit of 2
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer()).post('/test/login').expect(201);
      }

      const response = await request(app.getHttpServer()).post('/test/login');

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        statusCode: 429,
        message: 'Too Many Requests',
      });
    });
  });

  describe('Health endpoint skip', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('should never rate-limit the health endpoint', async () => {
      // Send more requests than the global limit
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer()).get('/health').expect(200);
      }
    });
  });
});
