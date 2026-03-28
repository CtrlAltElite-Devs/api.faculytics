---
title: 'API Rate Limiting'
slug: 'api-rate-limiting'
created: '2026-03-28'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    '@nestjs/throttler ^6.4.0',
    '@nest-lab/throttler-storage-redis',
    'ioredis',
    'Redis',
    'Zod',
    'Jest',
    'supertest',
  ]
files_to_modify:
  - 'package.json'
  - 'src/configurations/env/throttle.env.ts'
  - 'src/configurations/env/index.ts'
  - 'src/modules/index.module.ts'
  - 'src/app.module.ts'
  - 'src/security/guards/throttle.guard.ts'
  - 'src/security/decorators/index.ts'
  - 'src/modules/auth/auth.controller.ts'
  - 'src/modules/moodle/moodle.controller.ts'
  - 'src/modules/health/health.controller.ts'
  - '.env.sample'
  - 'src/security/guards/throttle.guard.spec.ts'
  - 'test/throttle.e2e-spec.ts'
code_patterns:
  - 'Guards extend NestJS base classes, live in src/security/guards/'
  - 'Decorators composed via applyDecorators(), barrel-exported from src/security/decorators/index.ts'
  - 'Env schemas are Zod objects in src/configurations/env/*.env.ts, merged in index.ts via spread'
  - 'Infrastructure modules registered in InfrastructureModules array in src/modules/index.module.ts'
  - 'APP_GUARD registered in AppModule providers in src/app.module.ts'
  - 'Trust proxy already configured in src/main.ts as app.set("trust proxy", 1)'
test_patterns:
  - 'Unit tests: NestJS TestingModule with jest.fn() mocks, co-located as *.spec.ts'
  - 'Guard tests: mock ExecutionContext with switchToHttp/getRequest pattern (see roles.guard.spec.ts)'
  - 'E2e tests: supertest against app.getHttpServer(), in test/*.e2e-spec.ts'
---

# Tech-Spec: API Rate Limiting

**Created:** 2026-03-28

## Overview

### Problem Statement

The Faculytics API has no request rate limiting, leaving it vulnerable to brute-force attacks on authentication endpoints (both `/auth/login` and `/moodle/login`) and general abuse from excessive requests. Without throttling, a single client can overwhelm the server or attempt credential stuffing with no restrictions.

### Solution

Implement `@nestjs/throttler` (v6.4+) with Redis-backed storage via `@nest-lab/throttler-storage-redis`, providing a global default rate limit (60 requests per 60 seconds per IP) with stricter per-endpoint overrides on authentication routes. Leverages the existing Redis infrastructure already used for BullMQ and caching.

### Scope

**In Scope:**

- Install and configure `@nestjs/throttler` + `@nest-lab/throttler-storage-redis`
- Global default throttle guard registered as `APP_GUARD` (60 req/60s per IP)
- Stricter limits on `POST /auth/login` (5 req/60s), `POST /auth/refresh` (10 req/60s), and `POST /moodle/login` (5 req/60s)
- `@SkipThrottle()` on health check endpoint
- Environment variables for global defaults (`THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT`) with minimum-value validation
- Standard HTTP 429 response with `Retry-After` header
- Fail-open resilience when Redis is unavailable
- Unit and e2e tests for throttle behavior

**Out of Scope:**

- User-ID keyed rate limits (v2 consideration if campus NAT becomes a problem)
- Frontend 429 error handling (separate follow-up ticket — frontend currently has no 429 awareness)
- Per-user billing tiers or API key-based limits
- WAF/DDoS-level protection (Cloudflare, etc.)
- Custom exception filter for 429 responses (default NestJS shape is sufficient)

## Context for Development

### Codebase Patterns

- **Guards**: Live in `src/security/guards/`. Simple pattern — extend a base class or implement `CanActivate`. Example: `JwtAuthGuard` is a 5-line file extending `AuthGuard('jwt')`.
- **Decorators**: Live in `src/security/decorators/`, barrel-exported via `index.ts`. The `UseJwtGuard` function and `Roles` decorator are defined directly in `index.ts`. Composition pattern uses `applyDecorators()`.
- **Env schemas**: Zod objects in `src/configurations/env/*.env.ts`. Each schema is a `z.object({})` with defaults. Merged into the master `envSchema` in `src/configurations/env/index.ts` via spread (`...throttleEnvSchema.shape`). Validated at startup; accessed via `import { env } from 'src/configurations/env'`.
- **Infrastructure modules**: Registered in `InfrastructureModules` array in `src/modules/index.module.ts`. Imported by `AppModule`. This is where `ThrottlerModule.forRoot()` goes.
- **APP_GUARD registration**: Register in `AppModule` providers in `src/app.module.ts` alongside `AllCronJobs`. `ThrottlerModule.forRoot()` does NOT accept a providers array.
- **Trust proxy**: Already configured in `src/main.ts:13` as `app.set('trust proxy', 1)`. This trusts exactly one proxy hop (nginx). **Do NOT add a duplicate in `ApplyConfigurations()`.**
- **Redis**: Connected via `REDIS_URL` env var. BullMQ uses `{ connection: { url: env.REDIS_URL } }`. The codebase has zero direct `import ... from 'ioredis'` — Redis is always accessed through higher-level abstractions. The `ThrottlerStorageRedisService` constructor accepts the URL string directly (`new ThrottlerStorageRedisService(env.REDIS_URL)`) — no need to import `ioredis`.
- **NestJS version**: v11 (`@nestjs/common: ^11.0.1`). Requires `@nestjs/throttler@^6.4.0` for NestJS 11 peer dependency compatibility.

### Files to Modify/Create

| File                                         | Action     | Purpose                                                                       |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `package.json`                               | Modify     | Add `@nestjs/throttler` and `@nest-lab/throttler-storage-redis`               |
| `src/configurations/env/throttle.env.ts`     | **Create** | Zod schema for `THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT` with min validation   |
| `src/configurations/env/index.ts`            | Modify     | Merge `throttleEnvSchema` into master `envSchema`                             |
| `src/modules/index.module.ts`                | Modify     | Add `ThrottlerModule.forRoot()` to `InfrastructureModules` with Redis storage |
| `src/app.module.ts`                          | Modify     | Register `APP_GUARD` with `CustomThrottlerGuard` in providers                 |
| `src/security/guards/throttle.guard.ts`      | **Create** | Custom guard extending `ThrottlerGuard` with fail-open resilience             |
| `src/security/decorators/index.ts`           | Modify     | Re-export `@Throttle()` and `@SkipThrottle()` from `@nestjs/throttler`        |
| `src/modules/auth/auth.controller.ts`        | Modify     | Add `@Throttle()` on `login` (5/60s) and `refresh` (10/60s)                   |
| `src/modules/moodle/moodle.controller.ts`    | Modify     | Add `@Throttle()` on `login` (5/60s)                                          |
| `src/modules/health/health.controller.ts`    | Modify     | Add `@SkipThrottle()` at class level                                          |
| `.env.sample`                                | Modify     | Document new env vars                                                         |
| `src/security/guards/throttle.guard.spec.ts` | **Create** | Unit tests for throttle guard (fail-open + 429 passthrough)                   |
| `test/throttle.e2e-spec.ts`                  | **Create** | E2e tests for rate limiting behavior                                          |

### Files to Reference (Read-Only Context)

| File                                      | Purpose                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `src/security/guards/jwt-auth.guard.ts`   | Guard pattern (5-line extend)                                                   |
| `src/security/guards/roles.guard.ts`      | Guard with `ExecutionContext` usage                                             |
| `src/security/guards/roles.guard.spec.ts` | Guard test pattern — mock `ExecutionContext`, `TestingModule` setup             |
| `src/security/decorators/index.ts`        | Decorator barrel exports and `UseJwtGuard` composition with `applyDecorators()` |
| `src/configurations/env/redis.env.ts`     | Env schema pattern (`z.object` + defaults + type export)                        |
| `src/app.module.ts`                       | `AppModule` providers array (where `APP_GUARD` goes)                            |
| `src/main.ts`                             | Already has `app.set('trust proxy', 1)` at line 13 — do NOT duplicate           |

### Technical Decisions

- **Redis-backed storage over in-memory**: Even though deployment is single-instance, Redis storage survives server restarts during deployments and is future-proof for scaling. Zero incremental cost since Redis is already running.
- **IP-only keying for v1**: Simpler implementation. User-ID keying would require JWT parsing inside the guard (guards run before interceptors in NestJS pipeline), adding complexity. Defer to v2 if campus NAT shared-IP becomes a real issue.
- **Auth endpoint limits as hardcoded decorator values**: These are security policy, not runtime configuration. Global defaults are env-configurable for operational tuning.
- **Default NestJS 429 response shape**: `{ "statusCode": 429, "message": "Too Many Requests" }`. Note: `ThrottlerException`'s built-in default message is `"ThrottlerException: Too Many Requests"` (with class name prefix). To get the clean `"Too Many Requests"`, pass `errorMessage: 'Too Many Requests'` in `ThrottlerModule.forRoot()`. No custom exception filter needed. Frontend will add handling in a follow-up ticket.
- **Custom ThrottlerGuard subclass**: Handles Redis failure gracefully (fail open) and provides a clean extension point for user-ID keying in v2 via `getTracker()` override.
- **APP_GUARD in AppModule providers**: `ThrottlerModule.forRoot()` does not accept a providers array. The `APP_GUARD` registration goes in `src/app.module.ts` providers, alongside `AllCronJobs`.
- **Fail-open on Redis errors**: If Redis is unreachable, the throttle guard catches the error (via `instanceof ThrottlerException` to distinguish from legitimate 429s) and allows the request through with a logged warning. Rate limiting is defense-in-depth, not a hard dependency.
- **Trust proxy already configured**: `src/main.ts:13` has `app.set('trust proxy', 1)` — trusts one proxy hop (nginx). Deployment: Client → Cloudflare DNS-only (no orange cloud proxy) → Hostinger VPS → nginx → NestJS. If Cloudflare proxy is ever enabled, change to `trust proxy: 2` or use `CF-Connecting-IP`.
- **`@nestjs/throttler` v6 API**: `ttl` is in **milliseconds**, not seconds. The env var uses seconds for human readability, so the module config multiplies by 1000. This is a common gotcha — document it in a code comment.
- **`Retry-After` header**: Verified — `@nestjs/throttler` v6 sets this header by default (`setHeaders` defaults to `true`). Value is in **seconds** (`Math.ceil((blockExpiresAt - Date.now()) / 1000)`). Header is `Retry-After` for the unnamed/`"default"` throttler.
- **`X-RateLimit-*` response headers**: The throttler also sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` on **every** response (not just 429s) by default. Ensure CORS config and nginx do not strip these if the frontend needs them.
- **Per-route `@Throttle()` overrides, does not stack**: A `@Throttle()` decorator **replaces** the global default for that route — the request does NOT count against both. A client rate-limited on `/auth/login` (5/min) still has the full 60/min budget on other endpoints. This is intended behavior.

## Implementation Plan

### Tasks

- [x] **Task 1: Install packages**
  - File: `package.json`
  - Action: Run `npm install @nestjs/throttler @nest-lab/throttler-storage-redis`
  - Notes: Two new dependencies. `@nestjs/throttler@^6.4.0` is required for NestJS 11 peer compatibility. `@nest-lab/throttler-storage-redis` provides `ThrottlerStorageRedisService` — the throttler core does NOT ship Redis storage. The existing `ioredis` (v5.10.0) satisfies the peer dependency for the storage package.

- [x] **Task 2: Create throttle env schema**
  - File: `src/configurations/env/throttle.env.ts` (CREATE)
  - Action: Create a Zod schema following the `redis.env.ts` pattern:

    ```typescript
    import { z } from 'zod';

    export const throttleEnvSchema = z.object({
      THROTTLE_TTL_SECONDS: z.coerce.number().min(1).default(60),
      THROTTLE_LIMIT: z.coerce.number().min(1).default(60),
    });

    export type ThrottleEnv = z.infer<typeof throttleEnvSchema>;
    ```

  - Notes: `z.coerce.number()` handles string-to-number conversion from env vars. `.min(1)` prevents misconfiguration — `THROTTLE_LIMIT=0` would block all requests, and `THROTTLE_TTL_SECONDS=0` is nonsensical. Defaults ensure the app works without these vars set.

- [x] **Task 3: Merge throttle schema into master env**
  - File: `src/configurations/env/index.ts`
  - Action: Import `throttleEnvSchema` and spread into `envSchema`:
    ```typescript
    import { throttleEnvSchema } from './throttle.env';
    // In envSchema:
    ...throttleEnvSchema.shape,
    ```
  - Notes: Follows the exact pattern used by `redisEnvSchema`, `bullmqEnvSchema`, etc.

- [x] **Task 4: Create custom ThrottlerGuard with fail-open resilience**
  - File: `src/security/guards/throttle.guard.ts` (CREATE)
  - Action: Create a guard extending the base `ThrottlerGuard` that fails open on Redis errors:

    ```typescript
    import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
    import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

    @Injectable()
    export class CustomThrottlerGuard extends ThrottlerGuard {
      private readonly logger = new Logger(CustomThrottlerGuard.name);

      async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
          return await super.canActivate(context);
        } catch (error) {
          if (error instanceof ThrottlerException) {
            throw error; // Re-throw legitimate 429s
          }
          this.logger.warn(
            `Rate limiter unavailable, allowing request: ${error instanceof Error ? error.message : error}`,
          );
          return true; // Fail open — allow request if Redis is down
        }
      }
    }
    ```

  - Notes: Uses `instanceof ThrottlerException` (type-safe, version-resilient) to distinguish legitimate 429s from infrastructure errors. The custom subclass also provides a clean extension point for v2 user-ID keying via `getTracker()` override. Constructor inheritance from `ThrottlerGuard` is handled automatically by NestJS DI — no explicit constructor needed.

- [x] **Task 5: Register ThrottlerModule with Redis storage**
  - File: `src/modules/index.module.ts`
  - Action: Add `ThrottlerModule.forRootAsync()` to the `InfrastructureModules` array:

    ```typescript
    import { ThrottlerModule } from '@nestjs/throttler';
    import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

    // Add to InfrastructureModules array:
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: env.THROTTLE_TTL_SECONDS * 1000, // v6 uses milliseconds
            limit: env.THROTTLE_LIMIT,
          },
        ],
        storage: new ThrottlerStorageRedisService(env.REDIS_URL),
        errorMessage: 'Too Many Requests',
      }),
    }),
    ```

  - Notes:
    - Uses `forRootAsync()` so NestJS manages the `ThrottlerStorageRedisService` lifecycle. This ensures `onModuleDestroy()` fires on shutdown, properly disconnecting the Redis connection (no resource leak).
    - Pass `env.REDIS_URL` as a string directly to `ThrottlerStorageRedisService` — no need for `import Redis from 'ioredis'`. The service constructor accepts `(url?: string, options?: RedisOptions)` and creates its own Redis instance internally with `disconnectRequired = true`.
    - `errorMessage: 'Too Many Requests'` overrides the default `'ThrottlerException: Too Many Requests'` to produce clean 429 response bodies.
    - `ttl` in **milliseconds** — the env var is in seconds, so multiply by 1000.
    - Import from `@nest-lab/throttler-storage-redis` (NOT from `@nestjs/throttler`).
    - This task only registers the module — `APP_GUARD` goes in Task 6.

- [x] **Task 6: Register APP_GUARD in AppModule**
  - File: `src/app.module.ts`
  - Action: Add the `APP_GUARD` provider to `AppModule`:

    ```typescript
    import { APP_GUARD } from '@nestjs/core';
    import { CustomThrottlerGuard } from './security/guards/throttle.guard';

    @Module({
      imports: [...InfrastructureModules, ...ApplicationModules, CommonModule],
      providers: [
        ...AllCronJobs,
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      ],
    })
    ```

  - Notes: `APP_GUARD` must be registered in a module's `providers` array. `ThrottlerModule.forRoot()` does NOT accept a providers array. `AppModule` is the correct location, alongside the existing `AllCronJobs` providers.

- [x] **Task 7: Re-export throttle decorators**
  - File: `src/security/decorators/index.ts`
  - Action: Add re-exports for the throttler decorators:
    ```typescript
    export { Throttle, SkipThrottle } from '@nestjs/throttler';
    ```
  - Notes: Keeps all security decorators importable from a single barrel. Controllers import `@Throttle()` and `@SkipThrottle()` from `src/security/decorators`.

- [x] **Task 8: Apply stricter limits to auth endpoints**
  - File: `src/modules/auth/auth.controller.ts`
  - Action: Add `@Throttle()` decorators to `login` and `refresh` methods:

    ```typescript
    import { Throttle } from 'src/security/decorators';

    @Post('login')
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    @UseInterceptors(MetaDataInterceptor)
    async Login(@Body() body: LoginRequest) { ... }

    @Post('refresh')
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    @UseGuards(JwtRefreshGuard)
    @UseInterceptors(MetaDataInterceptor)
    async Refresh(...) { ... }
    ```

  - Notes: `ttl` in milliseconds (60000 = 60 seconds). These override the global default (60 req/60s) with stricter limits. The `default` key matches the throttler name from `ThrottlerModule.forRoot()`.

- [x] **Task 9: Apply stricter limits to Moodle login endpoint**
  - File: `src/modules/moodle/moodle.controller.ts`
  - Action: Add `@Throttle()` decorator to the `Login` method:

    ```typescript
    import { Throttle } from 'src/security/decorators';

    @Post('login')
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    async Login(@Body() body: LoginMoodleRequest) { ... }
    ```

  - Notes: `POST /moodle/login` is an unauthenticated endpoint that accepts Moodle credentials — equally brute-forceable as `/auth/login`. Same 5 req/60s limit. The other Moodle endpoints (`get-site-info`, `get-enrolled-courses`, etc.) are also unauthenticated but accept a Moodle token in the body rather than credentials, so the global limit (60/min) is sufficient for those.

- [x] **Task 10: Skip throttle on health endpoint**
  - File: `src/modules/health/health.controller.ts`
  - Action: Add `@SkipThrottle()` at the class level:

    ```typescript
    import { SkipThrottle } from 'src/security/decorators';

    @SkipThrottle()
    @Controller('health')
    export class HealthController { ... }
    ```

  - Notes: Class-level decorator exempts all routes in the controller. Prevents monitoring/health checks from being rate-limited.

- [x] **Task 11: Update .env.sample**
  - File: `.env.sample`
  - Action: Add the new env vars with documentation:
    ```
    # Rate Limiting
    THROTTLE_TTL_SECONDS=60     # Time window in seconds (default: 60, min: 1)
    THROTTLE_LIMIT=60           # Max requests per window (default: 60, min: 1)
    ```
  - Notes: Both have defaults in the Zod schema, so they're optional in `.env`.

- [x] **Task 12: Write unit tests for CustomThrottlerGuard**
  - File: `src/security/guards/throttle.guard.spec.ts` (CREATE)
  - Action: Create unit tests covering:
    - Test that `CustomThrottlerGuard` extends `ThrottlerGuard`
    - Test fail-open: when `super.canActivate()` rejects with a non-throttle error (e.g., Redis connection error), the guard returns `true`
    - Test 429 passthrough: when `super.canActivate()` rejects with a `ThrottlerException` (`instanceof`), the guard re-throws it
  - Notes: `ThrottlerGuard` has constructor dependencies (`ThrottlerOptions[]`, `ThrottlerStorage`, `Reflector`). To instantiate `CustomThrottlerGuard` in a test, provide mocks for these via `TestingModule`:
    ```typescript
    const module = await Test.createTestingModule({
      providers: [
        CustomThrottlerGuard,
        { provide: THROTTLER_OPTIONS, useValue: [{ ttl: 60000, limit: 60 }] },
        { provide: ThrottlerStorage, useValue: {} },
        Reflector,
      ],
    }).compile();
    const guard = module.get(CustomThrottlerGuard);
    ```
    Then use `jest.spyOn(ThrottlerGuard.prototype, 'canActivate')` to control the parent's behavior for fail-open and 429 passthrough tests. The `roles.guard.spec.ts` pattern of mocking `ExecutionContext` via `switchToHttp/getRequest` still applies for the mock context.

- [x] **Task 13: Write e2e tests for rate limiting**
  - File: `test/throttle.e2e-spec.ts` (CREATE)
  - Action: Create e2e tests using supertest:
    - Test global limit: send requests past the limit, verify 429 response
    - Test auth login limit: 6 POSTs to `/api/v1/auth/login`, verify 6th returns 429
    - Test health skip: send requests past the global limit, verify `/api/v1/health` still returns 200
    - Verify 429 response body matches `{ "statusCode": 429, "message": "Too Many Requests" }`
    - Verify `Retry-After` header is present (if supported by default; if not, document and adjust ACs)
  - Notes: **Test isolation** — override `ThrottlerModule` in the test module to use in-memory storage (omit `storage` option in `ThrottlerModule.forRoot()`). This avoids requiring Docker Redis in CI and prevents rate limit state bleeding between test runs. Use low TTL/limit values in test config (e.g., `ttl: 1000, limit: 2`) to keep tests fast.

### Acceptance Criteria

- [ ] **AC 1**: Given the API is running with default config, when a client sends 60 requests to any endpoint within 60 seconds from the same IP, then all 60 succeed with their normal status codes.

- [ ] **AC 2**: Given the API is running with default config, when a client sends a 61st request to any endpoint within the same 60-second window from the same IP, then the response is HTTP 429 with body `{ "statusCode": 429, "message": "Too Many Requests" }` and a `Retry-After` header is present.

- [ ] **AC 3**: Given the API is running, when a client sends 5 POST requests to `/api/v1/auth/login` within 60 seconds from the same IP, then all 5 succeed.

- [ ] **AC 4**: Given the API is running, when a client sends a 6th POST request to `/api/v1/auth/login` within the same 60-second window from the same IP, then the response is HTTP 429.

- [ ] **AC 5**: Given the API is running, when a client sends 10 POST requests to `/api/v1/auth/refresh` within 60 seconds from the same IP, then all 10 succeed (assuming valid refresh tokens).

- [ ] **AC 6**: Given the API is running, when a client sends an 11th POST request to `/api/v1/auth/refresh` within the same 60-second window, then the response is HTTP 429.

- [ ] **AC 7**: Given the API is running, when a client sends 5 POST requests to `/api/v1/moodle/login` within 60 seconds from the same IP, then all 5 succeed.

- [ ] **AC 8**: Given the API is running, when a client sends a 6th POST request to `/api/v1/moodle/login` within the same 60-second window, then the response is HTTP 429.

- [ ] **AC 9**: Given the API is running, when any number of requests are sent to `GET /api/v1/health`, then the health endpoint always responds normally and is never rate-limited.

- [ ] **AC 10**: Given the env vars `THROTTLE_TTL_SECONDS=30` and `THROTTLE_LIMIT=10` are set, when the API starts, then the global rate limit is 10 requests per 30 seconds (env vars override defaults).

- [ ] **AC 11**: Given neither `THROTTLE_TTL_SECONDS` nor `THROTTLE_LIMIT` are set in the environment, when the API starts, then the global rate limit defaults to 60 requests per 60 seconds (Zod defaults apply).

- [ ] **AC 12**: Given `THROTTLE_LIMIT=0` or `THROTTLE_TTL_SECONDS=0` is set, when the API starts, then Zod validation fails and the app exits with a clear error (min 1 enforced).

- [ ] **AC 13**: Given the API is running, when a rate-limited response (429) is returned, then the `Retry-After` header is present and contains the number of seconds (integer) until the client can retry.

- [ ] **AC 14**: Given Redis is unavailable (connection error), when any request is made, then the request is allowed through (fail open) and a warning is logged — the API does not return 500.

- [ ] **AC 15**: Given the API is behind nginx (trust proxy configured in `main.ts`), when requests arrive from different client IPs via `X-Forwarded-For`, then each client IP has its own independent rate limit bucket.

## Additional Context

### Dependencies

- **New packages**:
  - `@nestjs/throttler@^6.4.0` — NestJS official rate limiting module (v6.4+ required for NestJS 11 peer compatibility)
  - `@nest-lab/throttler-storage-redis` — Redis storage adapter for `@nestjs/throttler` (requires `ioredis >=5.0.0` peer, already installed)
- **Existing (no changes)**: `ioredis` (v5.10.0), Redis instance via `docker compose up`
- **No other feature dependencies** — this is a standalone infrastructure concern

### Testing Strategy

- **Unit tests** (`src/security/guards/throttle.guard.spec.ts`):
  - Verify `CustomThrottlerGuard` extends `ThrottlerGuard`
  - Verify fail-open: non-throttle errors (Redis down) return `true`
  - Verify 429 passthrough: `ThrottlerException` is re-thrown via `instanceof`
  - Approach: `jest.spyOn(ThrottlerGuard.prototype, 'canActivate')` to mock parent behavior

- **E2e tests** (`test/throttle.e2e-spec.ts`):
  - Test global limit exceeded → 429
  - Test auth login limit (5/min) exceeded → 429
  - Test health endpoint exempt from throttling
  - Verify 429 response body and `Retry-After` header
  - **Test isolation**: Override `ThrottlerModule` with in-memory storage (omit `storage` option) to avoid Redis dependency in CI and prevent state bleeding between runs
  - Use low TTL/limit values (e.g., `ttl: 1000, limit: 2`) for fast tests

- **Manual verification**:
  - Start dev server with `npm run start:dev` + `docker compose up`
  - Use `curl` or a script to rapid-fire requests and observe 429 responses
  - Verify Redis keys are created (inspect with `redis-cli KEYS "throttler:*"`)
  - Stop Redis container, verify API continues to serve requests (fail-open)

### Notes

- **Related GitHub issue**: https://github.com/CtrlAltElite-Devs/api.faculytics/issues/88
- **Frontend follow-up needed**: `app.faculytics` has no 429 handling — Axios interceptors only handle 401. `lib/api-errors.ts` has `isAxiosErrorWithStatus()` utility ready to use. Toast via `sonner` is the error surfacing pattern. This should be a separate ticket.
- **v2 consideration**: If shared campus NAT becomes a problem (many students behind one IP), override `getTracker()` in `CustomThrottlerGuard` to key by user ID for authenticated requests and fall back to IP for unauthenticated. The custom guard subclass makes this a single-file change.
- **Cloudflare proxy note**: If Cloudflare orange cloud (proxy) is ever enabled, `trust proxy` in `main.ts` needs to change from `1` to `2`, or use the `CF-Connecting-IP` header. Currently DNS-only, so single hop (nginx) is correct.
- **File upload consideration**: `POST /questionnaires/ingest` accepts multipart uploads. The global 60 req/60s limit should be sufficient — ingestion is admin-only and infrequent. If bulk workflows hit the limit, add `@SkipThrottle()` or a higher override on that specific endpoint.
- **`/auth/logout` and `/auth/me`**: Intentionally left at the global default (60 req/60s). Both are JWT-protected, low-abuse-risk endpoints. No stricter limit needed.
- **`Retry-After` header**: Verified — set by default in v6 (`setHeaders: true`). Value is in seconds. Present on 429 responses for the unnamed/`"default"` throttler.

## Review Notes

- Adversarial review completed
- Findings: 7 total, 1 fixed, 6 skipped
- Resolution approach: walk-through
- Fixed: F3 — added `.int()` validation to throttle env schema to reject fractional values
- Skipped: F1 (separate Redis connection — idiomatic NestJS), F2 (pre-existing unauth Moodle endpoints — out of scope), F4 (no max bound — matches codebase pattern), F5 (hardcoded auth TTL — intentional per spec), F6 (fail-open on Redis outage — deliberate availability tradeoff), F7 (in-memory e2e storage — intentional per spec)
