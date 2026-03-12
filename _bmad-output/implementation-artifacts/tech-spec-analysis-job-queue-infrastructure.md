---
title: 'Analysis Job Queue Infrastructure'
slug: 'analysis-job-queue-infrastructure'
created: '2026-03-12'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS v11',
    '@nestjs/bullmq',
    'bullmq',
    '@nestjs/terminus',
    'ioredis',
    'Redis',
    'Zod v4',
    'Jest v30',
    'docker-compose',
  ]
files_to_modify:
  - 'src/configurations/env/bullmq.env.ts (create)'
  - 'src/configurations/env/index.ts (modify)'
  - 'src/configurations/env/redis.env.ts (modify)'
  - 'src/modules/index.module.ts (modify)'
  - 'src/modules/analysis/analysis.module.ts (create)'
  - 'src/modules/analysis/dto/analysis-job-message.dto.ts (create)'
  - 'src/modules/analysis/dto/analysis-result-message.dto.ts (create)'
  - 'src/modules/analysis/analysis.service.ts (create)'
  - 'src/modules/analysis/processors/base.processor.ts (create)'
  - 'src/modules/analysis/processors/sentiment.processor.ts (create)'
  - 'src/modules/analysis/analysis.service.spec.ts (create)'
  - 'src/modules/analysis/processors/base.processor.spec.ts (create)'
  - 'src/modules/analysis/processors/sentiment.processor.spec.ts (create)'
  - 'src/modules/health/health.module.ts (modify)'
  - 'src/modules/health/health.service.ts (modify)'
  - 'src/modules/health/health.service.spec.ts (modify)'
  - 'src/modules/health/health.controller.ts (modify)'
  - '.env.sample (modify)'
  - 'package.json (modify)'
  - 'docker-compose.yml (create)'
  - 'mock-worker/package.json (create)'
  - 'mock-worker/tsconfig.json (create)'
  - 'mock-worker/server.ts (create)'
  - 'mock-worker/Dockerfile (create)'
  - '.github/workflows/pr-test.yml (modify)'
  - 'docs/architecture/ai-inference-pipeline.md (modify)'
  - 'CLAUDE.md (modify)'
code_patterns:
  - 'Zod schema per concern in src/configurations/env/, merged via spread in index.ts'
  - 'Infrastructure modules registered in InfrastructureModules array, application modules in ApplicationModules array'
  - 'Public service methods use PascalCase'
  - 'Tests use TestingModule with mock providers (see cache.service.spec.ts)'
  - 'Health module is barebones — migrating to @nestjs/terminus'
  - 'Redis is optional via REDIS_URL — becoming required for queue features'
  - 'Env validated at startup via Zod safeParse, exits on failure'
test_patterns:
  - '.spec.ts alongside source files'
  - 'TestingModule with { provide: X, useValue: mockObj } pattern'
  - 'CacheService spec is closest reference for infrastructure service tests'
  - 'CI uses Docker services (Postgres) in pr-test.yml — add Redis service'
---

# Tech-Spec: Analysis Job Queue Infrastructure

**Created:** 2026-03-12

## Overview

### Problem Statement

The API has no async job processing infrastructure. The upcoming AI inference pipeline (Phase 3) requires dispatching analysis jobs to external HTTP-based workers (RunPod for GPU inference, OpenAI/Gemini for LLM analysis) and handling results. Currently there is no queue system, no job processing pattern, and no worker integration scaffolding in the codebase.

### Solution

Add BullMQ on the existing Redis infrastructure with HTTP-based job processors. NestJS enqueues analysis jobs into per-type BullMQ queues, job processors make HTTP calls to external workers (RunPod endpoints or LLM APIs), and results are persisted to the database. A mock worker server enables full local development and testing without deployed workers.

### Scope

**In Scope:**

- `@nestjs/bullmq` setup with queue registration in a new `AnalysisModule`
- Queue-per-analysis-type pattern (separate queues, separate processors)
- Environment variables and Zod validation for queue config and per-worker URLs
- Base job envelope DTO (`AnalysisJobMessage`) and result envelope DTO (`AnalysisResultMessage`) with Zod schemas and contract versioning
- Job processor scaffolding — one example (sentiment) to prove the pattern
- Queue health check via `@nestjs/terminus` (migrating from barebones health module)
- Resilience: retry with exponential backoff, failed job handling, configurable concurrency and rate limiting, stall detection
- Graceful degradation when Redis is unavailable
- Base processor class (`BaseAnalysisProcessor`) for reusable HTTP dispatch + validation pattern with event listeners for observability
- Zod validation on both outbound job envelopes and inbound result envelopes
- Job deduplication via deterministic job IDs
- Bulk enqueue support via `EnqueueBatch()`
- `docker-compose.yml` with Redis (for local dev without Redis Cloud)
- Mock worker server (HTTP server mimicking RunPod worker API) with Docker Compose service
- Make `REDIS_URL` required (no longer optional — needed for BullMQ)
- Add Redis Docker service to CI (`pr-test.yml`)
- Redis strategy consideration: single instance for dev, split cache/queue in production
- Update `docs/architecture/ai-inference-pipeline.md` to reflect BullMQ + HTTP pivot (replace RabbitMQ/AMQP references)
- Update `CLAUDE.md` with AnalysisModule documentation (architecture section, module listing)

**Out of Scope:**

- Specific analysis processors beyond the scaffolded example (topic model, embeddings, etc.)
- RunPod API integration details (auth, billing, deployment config)
- LLM API integration details (OpenAI, Gemini specifics)
- Analysis-type-specific payload schemas (sentiment result shape, topic model result shape, etc.)
- Python worker code/deployment
- RabbitMQ (pivoted away — all workers are HTTP endpoints)
- Failed job monitoring UI (Bull Board) — future consideration
- Failed job cleanup cron — future consideration

## Context for Development

### Codebase Patterns

- **Module registration:** Infrastructure and Application module arrays in `src/modules/index.module.ts`. `BullModule.forRoot()` goes in `InfrastructureModules`, `AnalysisModule` goes in `ApplicationModules`.
- **Env config:** One Zod schema per concern in `src/configurations/env/` (e.g., `redis.env.ts`, `jwt.env.ts`). All merged via spread in `index.ts` and parsed against `process.env`. Validation in `env.validation.ts` exits process on failure.
- **Redis (current):** `REDIS_URL` is optional in `redis.env.ts` (`z.url().optional()`). `CacheModule` in `index.module.ts` falls back to in-memory when unset. **This spec makes `REDIS_URL` required** — BullMQ needs Redis.
- **Health module (current):** Barebones — `HealthService.GetServerHealth()` returns `'healthy'` string. No `@nestjs/terminus`. **This spec migrates to Terminus** with health indicators for database, Redis, and queue status.
- **Testing:** `.spec.ts` beside source. `TestingModule` with mock providers. `CacheService` spec (`cache.service.spec.ts`) is the closest reference for testing infrastructure services — mocks `CACHE_MANAGER` injection token.
- **CI:** `pr-test.yml` runs on PR/push, uses Postgres Docker service with health check. Same pattern for adding Redis. Discord webhook for test results notification.
- **HTTP calls:** `ChatKitModule` already makes HTTP calls to OpenAI. Same dispatch pattern applies to worker calls.
- **PascalCase methods:** Public service methods are PascalCase (e.g., `GetServerHealth`, `Login`, `SyncUserContext`).

### Files to Reference

| File                                             | Purpose                    | Key Details                                                                           |
| ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------- |
| `src/modules/index.module.ts`                    | Module registration arrays | `InfrastructureModules` (line 29), `ApplicationModules` (line 20)                     |
| `src/configurations/env/redis.env.ts`            | Redis Zod schema           | Pattern to follow for `bullmq.env.ts`; `REDIS_URL` changing from optional to required |
| `src/configurations/env/index.ts`                | Schema merger              | Spreads all env schemas, parses `process.env`                                         |
| `src/configurations/env/env.validation.ts`       | Startup validation         | `safeParse` + `process.exit(1)` on failure                                            |
| `src/modules/health/health.service.ts`           | Current health check       | Returns `'healthy'` string — being replaced by Terminus                               |
| `src/modules/health/health.controller.ts`        | Health endpoint            | `GET /health` — will use Terminus `HealthCheckService`                                |
| `src/modules/common/cache/cache.service.ts`      | Redis usage pattern        | Shows `@Inject(CACHE_MANAGER)` pattern, Logger usage                                  |
| `src/modules/common/cache/cache.service.spec.ts` | Test reference             | Mock injection pattern for infrastructure services                                    |
| `.env.sample`                                    | Env template               | Add worker URLs and document Redis as required                                        |
| `.github/workflows/pr-test.yml`                  | CI config                  | Add Redis service alongside existing Postgres                                         |
| `src/main.ts`                                    | App bootstrap              | No changes needed — BullMQ registers via module                                       |
| `src/app.module.ts`                              | Root module                | Imports Infrastructure + Application modules                                          |
| `package.json`                                   | Dependencies               | Add `@nestjs/bullmq`, `bullmq`, `@nestjs/terminus`                                    |

### Technical Decisions

- **Pivot from RabbitMQ to BullMQ:** All workers are HTTP endpoints (RunPod serverless, LLM APIs). No AMQP consumers exist or are planned. BullMQ on existing Redis eliminates an entire infrastructure layer (no new broker) while providing queuing, retry, concurrency, and failed job tracking.
- **Queue-per-type pattern:** Each analysis type (sentiment, topic model, embeddings) gets its own BullMQ queue and processor. This enables independent concurrency control, retry policies, and rate limiting per type.
- **Separate RunPod deployments per worker:** Different analysis types have different GPU requirements, scaling characteristics, and deployment lifecycles. Each gets its own RunPod endpoint and env var (`SENTIMENT_WORKER_URL`, `TOPIC_MODEL_WORKER_URL`, etc.).
- **HTTP dispatch pattern:** Job processors make HTTP POST calls to worker URLs. Workers are pure compute — receive JSON, return JSON. Transport-agnostic envelope DTOs ensure the contract works regardless of where the worker is hosted.
- **Contract versioning:** Base envelope DTOs include a `version` field for forward-compatible schema evolution.
- **Symmetric Zod validation:** Both outbound `AnalysisJobMessage` and inbound `AnalysisResultMessage` have Zod schemas. Outbound validation catches bugs at enqueue time; inbound validation catches malformed worker responses at process time.
- **Result envelope validation:** Inbound results from workers are validated with Zod at the processor level before persisting. Malformed results move the job to `failed` state with the raw response logged for debugging.
- **Base processor class:** Abstract `BaseAnalysisProcessor` handles HTTP dispatch, envelope validation, error handling, and observability event listeners. Concrete processors (e.g., `SentimentProcessor`) define queue name, worker URL, and implement a `Persist()` hook for writing results to the database. Adding a new analysis type should be additive — no existing code changes required.
- **Explicit URL guard:** `BaseAnalysisProcessor.process()` checks `GetWorkerUrl()` at the top of execution. If the URL is undefined/not configured, the job fails immediately with a clear error message rather than attempting an HTTP POST to `undefined`.
- **Separate job and HTTP timeouts:** `BULLMQ_DEFAULT_TIMEOUT_MS` is the job-level timeout (BullMQ kills the job). `BULLMQ_HTTP_TIMEOUT_MS` is the HTTP request timeout (via `AbortController` + `setTimeout`). The HTTP timeout should be shorter than the job timeout to allow clean error handling before BullMQ force-kills the worker thread.
- **Stall detection:** Configure `stalledInterval` and `maxStalledCount` on workers to detect and handle jobs where the processor dies mid-execution. Log stalled events via `@OnWorkerEvent('stalled')`.
- **Observability event listeners:** `BaseAnalysisProcessor` registers `@OnWorkerEvent('failed')` and `@OnWorkerEvent('stalled')` handlers that log job failures and stalls with full context (jobId, type, error, attempt count).
- **Job deduplication:** `EnqueueJob()` uses a deterministic job ID based on `${submissionId}:${type}` to prevent duplicate processing. If the same analysis is submitted twice, BullMQ rejects the duplicate.
- **Bulk enqueue:** `EnqueueBatch()` method uses `Queue.addBulk()` for batch insertion — avoids N Redis round-trips when processing a batch of submissions.
- **AnalysisService entry point:** A public `AnalysisService.EnqueueJob()` method serves as the single entry point for other modules to enqueue analysis jobs. `EnqueueBatch()` provides bulk support. Both abstract away queue selection and envelope construction — callers just provide the analysis type and input data.
- **Graceful degradation:** `AnalysisModule` handles Redis unavailability without crashing the API. Enqueue attempts catch connection errors and return meaningful errors to callers. Health endpoint distinguishes between "API healthy, queue unhealthy" vs "everything down".
- **Generous timeouts:** Job timeout defaults to 120s+ for GPU workers to account for RunPod cold starts (30-60s). HTTP timeout defaults to 90s. Both configurable per queue via env vars.
- **Configurable concurrency:** Processor concurrency is set via env vars (e.g., `BULLMQ_SENTIMENT_CONCURRENCY`), not hardcoded. Allows tuning per deployment without code changes.
- **Rate limiting consideration:** BullMQ `limiter` option available per queue to avoid overwhelming external workers during volume spikes. Configured via env vars.
- **Lean payloads:** Job messages carry IDs and text only — not entire submission objects. Keeps Redis memory low during spikes (~1KB per job).
- **Redis becomes required:** `REDIS_URL` changes from `z.url().optional()` to `z.url()`. The in-memory cache fallback remains viable for cache-only scenarios, but BullMQ requires a real Redis connection. The env validation will fail at startup if `REDIS_URL` is missing.
- **CacheModule runtime resilience:** The `KeyvRedis` adapter handles Redis runtime disconnections gracefully — `cache-manager` returns `undefined` on cache miss/error, and `CacheService.wrap()` falls back to executing the function. Removing the startup in-memory fallback (dead code once `REDIS_URL` is required) does not change runtime behavior. Verify `KeyvRedis` behavior on disconnect during implementation.
- **Terminus migration:** `HealthModule` migrates from returning a string to using `@nestjs/terminus` with `HealthCheckService` and custom health indicators (database, Redis, queues). Terminus returns HTTP 200 for healthy, 503 for unhealthy — load balancers and K8s probes check status codes, not response bodies.
- **Custom DB health indicator:** `@mikro-orm/nestjs` does not export a health indicator. Create a custom `DatabaseHealthIndicator` that injects `EntityManager` and runs `SELECT 1` to verify database connectivity.
- **Mock worker for local dev:** A lightweight HTTP server (using `hono`) mimicking RunPod worker API responses. Has its own `package.json` for Docker builds. Processing delay is configurable via `MOCK_WORKER_DELAY_MS` env var (defaults to 2000ms, set to 0 for tests).
- **Docker Compose:** `docker-compose.yml` at project root with Redis and mock worker services for local development.

### Architecture

```
NestJS API
├── AnalysisModule (ApplicationModules)
│   ├── AnalysisService.EnqueueJob() / EnqueueBatch() — entry points for other modules
│   ├── Queues (BullMQ on Redis)
│   │   ├── sentiment-queue
│   │   ├── topic-model-queue (scaffolded, not implemented)
│   │   └── embeddings-queue (scaffolded, not implemented)
│   ├── Processors (HTTP dispatch)
│   │   ├── BaseAnalysisProcessor (abstract — URL guard, HTTP dispatch w/ AbortController,
│   │   │     Zod validation, error handling, Persist() hook, event listeners)
│   │   └── SentimentProcessor extends Base → SENTIMENT_WORKER_URL (example impl)
│   └── DTOs (with Zod schemas)
│       ├── AnalysisJobMessage + analysisJobSchema (outbound envelope)
│       └── AnalysisResultMessage + analysisResultSchema (inbound envelope)
├── BullModule.forRoot() (InfrastructureModules — connects to REDIS_URL)
├── HealthModule (Terminus — custom DB, Redis, Queue indicators)
└── Redis (required — shared cache + queue in dev, split in prod)

External Workers (HTTP endpoints)
├── RunPod: sentiment-worker, topic-model-worker, embeddings-worker
├── LLM APIs: OpenAI, Gemini (direct HTTP calls)
└── Mock Worker: local dev server (hono) simulating worker responses

Local Dev (docker-compose.yml)
├── Redis (port 6379)
└── Mock Worker (port 3001)
```

## Implementation Plan

### Task Dependencies

> **CRITICAL: Tasks 2, 22, and 23 MUST be in the same PR.** Making `REDIS_URL` required (Task 2) without adding Redis to CI (Task 22) will break all CI runs. These are an atomic changeset.

> **Task 13 depends on Tasks 5 and 11.** The queue health indicator requires `BullModule.forRoot()` (Task 5) and `AnalysisModule` (Task 11) to be registered first. If implementing Task 13 before Tasks 5/11, conditionally register the queue indicator only when the queue module is available.

### Tasks

- [x] **Task 1: Install dependencies and verify compatibility**
  - File: `package.json`
  - Action: `npm install @nestjs/bullmq bullmq @nestjs/terminus ioredis`
  - Notes: `bullmq` is a peer dependency of `@nestjs/bullmq`. `ioredis` is used for `BullModule` connection. **Prerequisite:** Verify `ts-jest` (currently `^29.2.5`) is compatible with Jest 30 (`^30.0.0`). If tests fail to compile, update `ts-jest` to a compatible version before proceeding.

- [x] **Task 2: Make `REDIS_URL` required** ⚠️ _Must ship with Tasks 22 and 23 in same PR_
  - File: `src/configurations/env/redis.env.ts`
  - Action: Change `REDIS_URL: z.url().optional()` to `REDIS_URL: z.url()`. Remove `.optional()`.
  - Notes: This is a breaking change. Devs without Redis must now run `docker compose up redis` or use Redis Cloud.

- [x] **Task 3: Create BullMQ env schema**
  - File: `src/configurations/env/bullmq.env.ts` (create)
  - Action: Create Zod schema following `redis.env.ts` pattern:
    - `BULLMQ_DEFAULT_ATTEMPTS`: `z.coerce.number().default(3)` — retry attempts
    - `BULLMQ_DEFAULT_BACKOFF_MS`: `z.coerce.number().default(5000)` — initial backoff delay
    - `BULLMQ_DEFAULT_TIMEOUT_MS`: `z.coerce.number().default(120000)` — job-level timeout (120s, accounts for GPU cold starts)
    - `BULLMQ_HTTP_TIMEOUT_MS`: `z.coerce.number().default(90000)` — HTTP request timeout (90s, must be shorter than job timeout)
    - `BULLMQ_SENTIMENT_CONCURRENCY`: `z.coerce.number().default(3)` — sentiment processor concurrency
    - `BULLMQ_STALLED_INTERVAL_MS`: `z.coerce.number().default(30000)` — stall check interval
    - `BULLMQ_MAX_STALLED_COUNT`: `z.coerce.number().default(2)` — max stalls before job fails
    - `SENTIMENT_WORKER_URL`: `z.url().optional()` — RunPod endpoint (optional for dev without mock worker)
  - Notes: Export `BullMqEnv` type. Worker URLs are optional so the app can start without workers configured (graceful degradation).

- [x] **Task 4: Register BullMQ env schema**
  - File: `src/configurations/env/index.ts`
  - Action: Import `bullmqEnvSchema` and spread into `envSchema`: `...bullmqEnvSchema.shape`
  - Notes: Follows exact pattern of existing schema imports (redis, jwt, moodle, etc.)

- [x] **Task 5: Register `BullModule.forRoot()` in infrastructure**
  - File: `src/modules/index.module.ts`
  - Action: Add `BullModule.forRoot({ connection: env.REDIS_URL })` to `InfrastructureModules` array.
  - Notes: Import `BullModule` from `@nestjs/bullmq`. BullMQ accepts a Redis URL string directly as the `connection` value — do NOT wrap in `{ url: ... }` object. Uses the same `REDIS_URL` as the cache module. BullMQ handles connection pooling internally.

- [x] **Task 6: Create base envelope DTOs with Zod schemas**
  - File: `src/modules/analysis/dto/analysis-job-message.dto.ts` (create)
  - Action: Define the outbound job envelope with both TypeScript type and Zod schema:

    ```typescript
    import { z } from 'zod';

    export const analysisJobSchema = z.object({
      jobId: z.string().uuid(),
      version: z.string(),
      type: z.string(),
      text: z.string().min(1),
      metadata: z.object({
        submissionId: z.string(),
        facultyId: z.string(),
        versionId: z.string(),
      }),
      publishedAt: z.string().datetime(),
    });

    export type AnalysisJobMessage = z.infer<typeof analysisJobSchema>;
    ```

  - Notes: The Zod schema validates the envelope at enqueue time in `AnalysisService.EnqueueJob()`. This ensures malformed jobs never enter Redis. Symmetric with the result schema (F8 fix).

- [x] **Task 7: Create result envelope DTO with Zod schema**
  - File: `src/modules/analysis/dto/analysis-result-message.dto.ts` (create)
  - Action: Define the inbound result envelope and its Zod validation schema:

    ```typescript
    import { z } from 'zod';

    export const analysisResultSchema = z.object({
      jobId: z.string().uuid(),
      version: z.string(),
      status: z.enum(['completed', 'failed']),
      result: z.record(z.unknown()).optional(),
      error: z.string().optional(),
      completedAt: z.string().datetime(),
    });

    export type AnalysisResultMessage = z.infer<typeof analysisResultSchema>;
    ```

  - Notes: `result` is `Record<string, unknown>` — type-specific payload validated by each concrete processor. The base envelope validation ensures structural integrity; payload validation is deferred to analysis-type specs.

- [x] **Task 8: Create `BaseAnalysisProcessor`**
  - File: `src/modules/analysis/processors/base.processor.ts` (create)
  - Action: Create abstract base class:
    - Extends `WorkerHost` from `@nestjs/bullmq`
    - Constructor receives a `Logger`
    - `process(job: Job<AnalysisJobMessage>)`:
      1. **URL guard:** Calls `GetWorkerUrl()`. If undefined, throws `Error('Worker URL not configured for [queue name]. Set the corresponding env var.')` — job moves to failed immediately.
      2. **HTTP dispatch:** Makes HTTP POST to worker URL using native `fetch` with `AbortController` for timeout. Timeout set to `env.BULLMQ_HTTP_TIMEOUT_MS` (default 90s). On abort, throws a timeout-specific error.
      3. **Response validation:** Parses response JSON, validates with `analysisResultSchema`. On validation failure, logs the raw response body and throws — job moves to failed.
      4. **Persistence:** Calls `Persist()` on success.
    - Abstract `GetWorkerUrl(): string | undefined` — concrete processors return their worker URL from env
    - Abstract `Persist(job: Job<AnalysisJobMessage>, result: AnalysisResultMessage): Promise<void>` — concrete processors implement persistence
    - **Event listeners:**
      - `@OnWorkerEvent('failed')`: Logs job failure with jobId, type, error message, attempt count
      - `@OnWorkerEvent('stalled')`: Logs stalled job with jobId for investigation
    - Error handling: catches HTTP errors (timeout, 5xx, network), logs with job context, lets BullMQ retry. Catches Zod validation errors, logs raw response, moves job to failed (no retry — malformed responses won't fix themselves).
  - Notes: Uses native `fetch` (Node 18+) with `AbortController` for HTTP timeout — separate from BullMQ's job-level timeout. PascalCase for public methods per project convention.

- [x] **Task 9: Create `SentimentProcessor` (example implementation)**
  - File: `src/modules/analysis/processors/sentiment.processor.ts` (create)
  - Action: Create concrete processor:
    - `@Processor('sentiment')` decorator
    - Extends `BaseAnalysisProcessor`
    - `GetWorkerUrl()`: returns `env.SENTIMENT_WORKER_URL`
    - `Persist()`: logs the result (no-op for this spec — real persistence deferred to sentiment-specific spec)
    - Constructor configures concurrency from `env.BULLMQ_SENTIMENT_CONCURRENCY`, `stalledInterval` from `env.BULLMQ_STALLED_INTERVAL_MS`, `maxStalledCount` from `env.BULLMQ_MAX_STALLED_COUNT`
  - Notes: This is the copyable template for future processors. Keep it minimal — the pattern should be obvious.

- [x] **Task 10: Create `AnalysisService`**
  - File: `src/modules/analysis/analysis.service.ts` (create)
  - Action: Create the enqueue entry point:
    - Inject queues via `@InjectQueue('sentiment')` (and future queues)
    - **`EnqueueJob(type: string, text: string, metadata: { submissionId, facultyId, versionId }): Promise<string>`:**
      - Builds `AnalysisJobMessage` envelope (generates UUID jobId, sets version `'1.0'`, timestamp)
      - Validates envelope with `analysisJobSchema.parse()` before enqueueing
      - Uses deterministic job ID: `${metadata.submissionId}:${type}` for deduplication — BullMQ rejects duplicates
      - Adds to the correct queue based on `type`, returns the jobId
      - Throws `BadRequestException` if unknown analysis type is requested
      - Catches Redis connection errors, logs them, throws `ServiceUnavailableException` (graceful degradation)
      - Configures job options: `attempts` from `env.BULLMQ_DEFAULT_ATTEMPTS`, `backoff: { type: 'exponential', delay: env.BULLMQ_DEFAULT_BACKOFF_MS }`, `timeout` from `env.BULLMQ_DEFAULT_TIMEOUT_MS`
    - **`EnqueueBatch(jobs: Array<{ type: string, text: string, metadata: {...} }>): Promise<string[]>`:**
      - Groups jobs by type, builds envelopes for each, validates all with `analysisJobSchema`
      - Uses `Queue.addBulk()` per queue type — single Redis round-trip per queue instead of N round-trips
      - Returns array of jobIds
      - Same error handling as `EnqueueJob()`
  - Notes: PascalCase method names. Uses `uuid` package (already in dependencies) for jobId generation. Deterministic job ID prevents duplicate processing when the same submission+type is enqueued twice.

- [x] **Task 11: Create `AnalysisModule`**
  - File: `src/modules/analysis/analysis.module.ts` (create)
  - Action: Create module:
    - `BullModule.registerQueue({ name: 'sentiment' })` in imports
    - Providers: `AnalysisService`, `SentimentProcessor`
    - Exports: `AnalysisService` (so other modules can call `EnqueueJob()`)
  - Notes: Future analysis types add their queue registration and processor here.

- [x] **Task 12: Register `AnalysisModule` in application modules**
  - File: `src/modules/index.module.ts`
  - Action: Import `AnalysisModule` and add to `ApplicationModules` array.
  - Notes: Place after `QuestionnaireModule` in the array.

- [x] **Task 13: Migrate `HealthModule` to Terminus** ⚠️ _Depends on Tasks 5 and 11_
  - File: `src/modules/health/health.module.ts` (modify)
  - Action: Add `TerminusModule` to imports.
  - File: `src/modules/health/health.service.ts` (modify)
  - Action: Replace barebones implementation with Terminus health checks:
    - Inject `HealthCheckService` from `@nestjs/terminus`
    - Create custom `DatabaseHealthIndicator` — injects `EntityManager` from `@mikro-orm/core` and runs `SELECT 1` to verify connectivity. **Note:** `@mikro-orm/nestjs` does NOT export a health indicator — this must be custom.
    - Create custom `RedisHealthIndicator` — pings Redis via the cache manager or a direct `ioredis` connection
    - Create custom `QueueHealthIndicator` — checks BullMQ queue connection status. **If implementing before Tasks 5/11:** conditionally register this indicator only when the queue module is available.
    - `GetServerHealth()`: returns `this.health.check([...indicators])` with all indicators
  - File: `src/modules/health/health.controller.ts` (modify)
  - Action: Update controller to return the Terminus `HealthCheckResult` object instead of a plain string. Keep `GET /health` endpoint path.
  - Notes: **Breaking change:** Response shape changes from `'healthy'` string to Terminus JSON object. HTTP status codes change: 200 for healthy, 503 for unhealthy. Load balancers and K8s probes typically check status codes (not response body), so this should be transparent to most monitoring. Document in release notes for any monitoring that parses the response body.

- [x] **Task 14: Update health check tests**
  - File: `src/modules/health/health.service.spec.ts` (modify)
  - Action: Update tests to mock Terminus `HealthCheckService` and custom indicators. Test scenarios:
    - All indicators healthy → overall `ok` status, HTTP 200
    - Redis down → `error` status with Redis indicator details, HTTP 503
    - Queue down → `error` status with queue indicator details, HTTP 503
    - Database down → `error` status with database indicator details, HTTP 503
  - Notes: Follow `cache.service.spec.ts` mock injection pattern.

- [x] **Task 15: Write `AnalysisService` unit tests**
  - File: `src/modules/analysis/analysis.service.spec.ts` (create)
  - Action: Test scenarios:
    - `EnqueueJob('sentiment', ...)` → adds job to sentiment queue with correct envelope shape (jobId, version, type, text, metadata, publishedAt)
    - `EnqueueJob('sentiment', ...)` → validates envelope with `analysisJobSchema` before enqueueing
    - `EnqueueJob('sentiment', ...)` → uses deterministic job ID `${submissionId}:sentiment`
    - `EnqueueJob('unknown_type', ...)` → throws `BadRequestException`
    - Queue connection failure → catches error, throws `ServiceUnavailableException`
    - Job options include correct attempts, backoff, and timeout from env
    - `EnqueueBatch(...)` → groups by type, calls `addBulk()` per queue, returns jobIds
    - `EnqueueBatch([])` → returns empty array (no-op)
  - Notes: Mock queues via `{ provide: getQueueToken('sentiment'), useValue: { add: jest.fn(), addBulk: jest.fn() } }`.

- [x] **Task 16: Write `BaseAnalysisProcessor` unit tests**
  - File: `src/modules/analysis/processors/base.processor.spec.ts` (create)
  - Action: Create a concrete test subclass of `BaseAnalysisProcessor`. Test scenarios:
    - Successful HTTP response with valid envelope → calls `Persist()` with parsed result
    - HTTP timeout (AbortController fires) → throws timeout error, BullMQ retries
    - HTTP 500 response → throws, BullMQ retries
    - Valid HTTP response but malformed envelope (Zod validation failure) → job fails, raw response logged, `Persist()` NOT called
    - Worker URL not configured (undefined) → throws `Error('Worker URL not configured...')`, job fails immediately
    - `@OnWorkerEvent('failed')` handler → logs job failure with context
    - `@OnWorkerEvent('stalled')` handler → logs stalled warning
  - Notes: Mock `fetch` globally via `jest.spyOn(global, 'fetch')`. Create `TestProcessor extends BaseAnalysisProcessor` with mock `GetWorkerUrl()` and `Persist()`.

- [x] **Task 17: Write `SentimentProcessor` unit tests**
  - File: `src/modules/analysis/processors/sentiment.processor.spec.ts` (create)
  - Action: Test scenarios:
    - `GetWorkerUrl()` returns `env.SENTIMENT_WORKER_URL`
    - `Persist()` logs the result (no-op verification)
    - Processor is decorated with `@Processor('sentiment')`
  - Notes: Lightweight — most logic is tested via `BaseAnalysisProcessor` tests.

- [x] **Task 18: Create `docker-compose.yml`**
  - File: `docker-compose.yml` (create)
  - Action: Create Docker Compose file with:
    - **Redis service:** `redis:7-alpine`, port 6379, health check via `redis-cli ping`
    - **Mock worker service:** builds from `mock-worker/Dockerfile`, port 3001, depends on nothing, env: `MOCK_WORKER_DELAY_MS=2000`
  - Notes: No NestJS service in compose — devs run the API directly via `npm run start:dev`. Compose is only for supporting services.

- [x] **Task 19: Create mock worker server**
  - File: `mock-worker/package.json` (create)
  - Action: Create minimal package.json with `hono` and `@hono/node-server` as dependencies, `tsx` as devDependency. Set `"type": "module"`.
  - File: `mock-worker/tsconfig.json` (create)
  - Action: Minimal tsconfig for the mock worker.
  - File: `mock-worker/server.ts` (create)
  - Action: Create minimal hono HTTP server:
    - `POST /sentiment` → waits `MOCK_WORKER_DELAY_MS` ms (default 2000, configurable via env var — set to 0 for fast tests), returns canned `AnalysisResultMessage` with `status: 'completed'`, sample sentiment result
    - `GET /health` → returns `{ status: 'ok' }`
    - Logs incoming requests for debugging
    - Reads port from `PORT` env var (default 3001)
  - Notes: Keep it under 50 lines. The response shape must match `analysisResultSchema` exactly — this is the living contract. Configurable delay enables fast integration tests.

- [x] **Task 20: Create mock worker Dockerfile**
  - File: `mock-worker/Dockerfile` (create)
  - Action: Node.js Dockerfile:
    - Base: `node:24-alpine`
    - `WORKDIR /app`
    - Copy `mock-worker/package.json` and `mock-worker/package-lock.json`
    - `RUN npm ci`
    - Copy `mock-worker/` source files
    - Expose port 3001
    - `CMD ["npx", "tsx", "server.ts"]`
  - Notes: Has its own `package.json` with `hono` as a production dependency — NOT relying on the parent project's devDependencies.

- [x] **Task 21: Update `.env.sample`**
  - File: `.env.sample`
  - Action: Add new env vars with documentation comments:

    ```
    # Required: Redis connection (used for caching and job queues)
    REDIS_URL=redis://localhost:6379
    # REDIS_KEY_PREFIX=faculytics:
    # REDIS_CACHE_TTL=60

    # Optional: Analysis job queue configuration
    # BULLMQ_DEFAULT_ATTEMPTS=3
    # BULLMQ_DEFAULT_BACKOFF_MS=5000
    # BULLMQ_DEFAULT_TIMEOUT_MS=120000
    # BULLMQ_HTTP_TIMEOUT_MS=90000
    # BULLMQ_SENTIMENT_CONCURRENCY=3
    # BULLMQ_STALLED_INTERVAL_MS=30000
    # BULLMQ_MAX_STALLED_COUNT=2

    # Optional: Analysis worker URLs (use mock worker for local dev)
    # SENTIMENT_WORKER_URL=http://localhost:3001/sentiment
    ```

  - Notes: Move `REDIS_URL` from the optional section to required. Update the comment to reflect it's used for both caching and queues.

- [x] **Task 22: Add Redis service to CI** ⚠️ _Must ship with Tasks 2 and 23 in same PR_
  - File: `.github/workflows/pr-test.yml`
  - Action: Add Redis Docker service alongside existing Postgres service:
    ```yaml
    redis:
      image: redis:7-alpine
      ports:
        - 6379:6379
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
    ```
    Add `REDIS_URL: redis://localhost:6379` to the test env vars in the "Run tests" step.
  - Notes: Follows exact pattern of existing Postgres service. Health check ensures Redis is ready before tests run.

- [x] **Task 23: Update `CacheModule` to remove in-memory fallback** ⚠️ _Must ship with Tasks 2 and 22 in same PR_
  - File: `src/modules/index.module.ts`
  - Action: Since `REDIS_URL` is now required, simplify the `CacheModule.registerAsync` factory:
    - Remove the `if (!env.REDIS_URL)` branch that returns in-memory config
    - Always create `KeyvRedis` store with `env.REDIS_URL`
    - Keep the logging
  - Notes: The Zod validation now guarantees `REDIS_URL` is present, so the fallback branch is dead code. **Runtime note:** Verify that `KeyvRedis` handles Redis runtime disconnections gracefully (returns `undefined` on cache miss/error rather than throwing). If it throws, the `CacheService.wrap()` method's try/catch should handle it — test this during implementation.

- [x] **Task 24: Update `docs/architecture/ai-inference-pipeline.md`**
  - File: `docs/architecture/ai-inference-pipeline.md`
  - Action: Update to reflect the BullMQ + HTTP architecture:
    - **Section 1:** Replace RabbitMQ architecture diagram with BullMQ + HTTP dispatch diagram. NestJS is both producer and consumer (no separate Python AMQP consumers).
    - **Section 2 (Why RabbitMQ):** Replace with "Why BullMQ" — reuses existing Redis, all workers are HTTP endpoints (RunPod, LLM APIs), no AMQP needed, simpler operational overhead.
    - **Section 3 (Message Contract):** Update to show `AnalysisJobMessage` and `AnalysisResultMessage` envelope DTOs with the HTTP request/response flow instead of AMQP publish/consume.
    - **Section 4 (Redis Strategy):** Keep but update — Redis now serves caching AND job queues. Note the production split recommendation.
    - **Section 5 (Incremental Rollout):** Replace RabbitMQ/Python worker steps with BullMQ setup, mock worker, sentiment processor, topic modeling, embeddings.
    - **Section 6 (Open Questions):** Update — remove RabbitMQ-specific questions, add relevant open questions (RunPod auth, rate limiting tuning, vector storage).
  - Notes: Preserve the document's draft status and intent. This is an architecture reference update, not a rewrite.

- [x] **Task 25: Update `CLAUDE.md`**
  - File: `CLAUDE.md`
  - Action:
    - **Architecture > Module Organization:** Add `AnalysisModule` to ApplicationModules list. Add `BullModule` and `TerminusModule` to InfrastructureModules list.
    - **Architecture:** Add a new subsection "Analysis Job Queue" describing: BullMQ on Redis, queue-per-type pattern, `AnalysisService.EnqueueJob()` / `EnqueueBatch()` entry points, `BaseAnalysisProcessor` with HTTP dispatch, mock worker for local dev.
    - **Common Commands:** Add `docker compose up` for local Redis + mock worker.
    - **Configuration:** Add new env vars to the required/optional lists. Update `REDIS_URL` from optional to required.
  - Notes: Keep descriptions concise — CLAUDE.md is a reference, not a tutorial.

### Acceptance Criteria

- [x] **AC 1:** Given the NestJS app starts with a valid `REDIS_URL`, when `BullModule.forRoot()` initializes, then it connects to Redis successfully and the health check reports queue status as `up`.

- [x] **AC 2:** Given the NestJS app starts without `REDIS_URL` in environment, when Zod validation runs, then the process exits with a clear error message indicating `REDIS_URL` is required.

- [x] **AC 3:** Given a module calls `AnalysisService.EnqueueJob('sentiment', 'The professor was helpful', { submissionId: 's1', facultyId: 'f1', versionId: 'v1' })`, when the method executes, then a job is added to the `sentiment` BullMQ queue with a valid `AnalysisJobMessage` envelope (validated by `analysisJobSchema`) containing a UUID jobId, version `'1.0'`, the provided text and metadata, an ISO timestamp, and a deterministic job ID of `s1:sentiment`.

- [x] **AC 4:** Given a module calls `AnalysisService.EnqueueJob('unknown_type', ...)`, when the method executes, then it throws a `BadRequestException` with a message indicating the analysis type is not supported.

- [x] **AC 5:** Given Redis is unavailable, when `AnalysisService.EnqueueJob()` is called, then it catches the connection error and throws a `ServiceUnavailableException` without crashing the API. Other non-analysis endpoints continue to function.

- [x] **AC 6:** Given a job is in the sentiment queue and `SENTIMENT_WORKER_URL` is configured, when `SentimentProcessor` picks up the job, then it makes an HTTP POST to the worker URL with the `AnalysisJobMessage` as the request body, using `AbortController` with a timeout of `BULLMQ_HTTP_TIMEOUT_MS`.

- [x] **AC 7:** Given the worker returns a valid response matching `analysisResultSchema`, when the processor receives it, then it validates the envelope with Zod, calls `Persist()`, and the job completes successfully.

- [x] **AC 8:** Given the worker returns a malformed response (missing required fields, wrong types), when the processor validates it, then Zod validation fails, the raw response is logged, and the job moves to `failed` state without calling `Persist()` and without retrying (malformed responses don't self-correct).

- [x] **AC 9:** Given the HTTP request times out (AbortController fires at `BULLMQ_HTTP_TIMEOUT_MS`), when the processor catches the abort error, then BullMQ retries the job up to `BULLMQ_DEFAULT_ATTEMPTS` times with exponential backoff starting at `BULLMQ_DEFAULT_BACKOFF_MS`.

- [x] **AC 10:** Given `SENTIMENT_WORKER_URL` is not configured (undefined), when `SentimentProcessor` picks up a job, then `BaseAnalysisProcessor` throws an error with the message "Worker URL not configured for sentiment. Set the corresponding env var." and the job moves to `failed` state.

- [x] **AC 11:** Given `docker compose up` is run in the project root, when the services start, then Redis is available on port 6379 and the mock worker is available on port 3001. The mock worker's `POST /sentiment` endpoint returns a valid `AnalysisResultMessage` envelope after `MOCK_WORKER_DELAY_MS` delay.

- [x] **AC 12:** Given the health endpoint `GET /health` is called, when all services are healthy, then it returns HTTP 200 with a Terminus `HealthCheckResult` JSON object with `status: 'ok'` and individual indicator statuses for database, Redis, and queue.

- [x] **AC 13:** Given Redis is down, when `GET /health` is called, then it returns HTTP 503 with `status: 'error'` and the Redis indicator showing `down`, while other indicators still report their actual status.

- [x] **AC 14:** Given a new developer clones the repo and runs `docker compose up` then `npm run start:dev` with the provided `.env.sample` values, when the app starts, then it connects to local Redis, registers BullMQ queues, and the health check reports all systems healthy.

- [x] **AC 15:** Given `AnalysisService.EnqueueJob('sentiment', ..., { submissionId: 's1', ... })` is called twice with the same submissionId, when the second call executes, then BullMQ rejects the duplicate job (same deterministic job ID `s1:sentiment`).

- [x] **AC 16:** Given a batch of 100 submissions, when `AnalysisService.EnqueueBatch(jobs)` is called, then it uses `Queue.addBulk()` to insert all jobs in a single Redis round-trip per queue type, returning 100 jobIds.

- [x] **AC 17:** Given a job stalls (processor dies mid-execution), when `stalledInterval` elapses, then BullMQ detects the stall, the `@OnWorkerEvent('stalled')` handler logs a warning, and the job is re-queued up to `maxStalledCount` times.

## Additional Context

### Dependencies

- `@nestjs/bullmq` — NestJS BullMQ integration module
- `bullmq` — BullMQ job queue library (Redis-backed)
- `@nestjs/terminus` — Health check framework with indicators
- `ioredis` — Redis client (used by BullMQ for connection)
- `hono` — Used in mock worker server (mock-worker has its own package.json)

### Testing Strategy

- **Unit tests (5 spec files):**
  - `analysis.service.spec.ts` — Mock queues, verify envelope construction and Zod validation, deduplication via deterministic job ID, error handling, type routing, bulk enqueue
  - `base.processor.spec.ts` — Mock fetch, verify URL guard → HTTP dispatch with AbortController → Zod validate → persist flow, all error paths (timeout, 500, malformed, no URL), event listener logging
  - `sentiment.processor.spec.ts` — Verify correct URL and queue binding, lightweight
  - `health.service.spec.ts` — Mock Terminus indicators (custom DB, Redis, Queue), verify up/down reporting and HTTP status codes
  - (Existing `health.service.spec.ts` updated, not new)

- **Integration tests (deferred to follow-up):**
  - Real Redis + mock worker (with `MOCK_WORKER_DELAY_MS=0` for fast tests), full enqueue → process → HTTP call → result loop
  - Requires Redis Docker service in CI (added in Task 22)

- **Manual testing:**
  1. `docker compose up` — start Redis + mock worker
  2. `npm run start:dev` — start NestJS API
  3. Call `GET /health` — verify all indicators report `up` with HTTP 200
  4. Trigger an enqueue (via test endpoint or unit test) — verify job is processed, mock worker receives HTTP call, result is logged

### Notes

- **Redis production split:** In production, consider splitting into Cache Redis (`allkeys-lru`, no persistence) and Queue Redis (`noeviction`, AOF/RDB) as noted in the pipeline architecture doc. BullMQ data must not be evicted — use `noeviction` policy. This is a DevOps concern, not a code change — just use different `REDIS_URL` values per environment.
- **Mock worker as living contract:** The mock worker's response shapes define the API contract that real RunPod workers must implement. When building Python workers, reference `mock-worker/server.ts` for the expected request/response format.
- **Adding new analysis types:** To add a new analysis type (e.g., topic modeling): (1) create `TopicModelProcessor extends BaseAnalysisProcessor`, (2) add `TOPIC_MODEL_WORKER_URL` to `bullmq.env.ts`, (3) register queue in `AnalysisModule`, (4) add queue injection to `AnalysisService`, (5) add mock endpoint in `mock-worker/server.ts`. ~30 minutes of work.
- **Breaking changes:** Two breaking changes in this spec: (a) `REDIS_URL` becomes required — mitigated by `docker-compose.yml`, (b) `GET /health` response changes from `'healthy'` string to Terminus JSON with HTTP 200/503 status codes — update any monitoring that parses the response body.
- **Failed job monitoring (future):** This spec does not include a UI for inspecting failed jobs (e.g., Bull Board) or a cleanup cron for the failed job set in Redis. These should be addressed in a follow-up spec to prevent unbounded Redis memory growth from accumulated failed jobs.
- **CacheModule runtime resilience:** Verify during implementation that `KeyvRedis` handles Redis runtime disconnections gracefully. The `CacheService.wrap()` method should catch errors and fall back to executing the wrapped function. If `KeyvRedis` throws on disconnect, add try/catch in `CacheService`.

## Review Notes

- Adversarial review completed
- Findings: 22 total, 0 fixed, 22 skipped
- Resolution approach: skip
- Notable findings for follow-up: F1/F2 (BullModule connection config), F9 (job retention), F14 (mock-worker Dockerfile)
