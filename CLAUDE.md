# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Faculytics API is a NestJS backend for an analytics platform that integrates with Moodle LMS. It uses MikroORM with PostgreSQL, JWT authentication via Passport, and Zod for configuration validation.

## Common Commands

```bash
# Development
npm run start:dev          # Start with watch mode
npm run build              # Build the project
npm run lint               # Lint and auto-fix
docker compose up          # Start Redis + mock worker for local dev

# Testing
npm run test               # Run unit tests
npm run test -- --testPathPattern=<pattern>  # Run specific test file
npm run test:e2e           # Run E2E tests
npm run test:cov           # Run tests with coverage

# Database (MikroORM)
npx mikro-orm migration:create   # Create new migration
npx mikro-orm migration:up       # Apply pending migrations
npx mikro-orm migration:list     # Check migration status
```

## Architecture

### Module Organization

The app uses a split between **Infrastructure** and **Application** modules (`src/modules/index.module.ts`):

- **InfrastructureModules**: ConfigModule, PassportModule, MikroOrmModule, JwtModule, ScheduleModule, BullModule, TerminusModule
- **ApplicationModules**: HealthModule, MoodleModule, AuthModule, ChatKitModule, EnrollmentsModule, QuestionnaireModule, AnalysisModule, AnalyticsModule, AuditModule, FacultyModule, CurriculumModule, DimensionsModule, AdminModule, ReportsModule

### Key Patterns

**Entity Base Class** (`src/entities/base.entity.ts`):

- All entities extend `CustomBaseEntity` with UUID primary key, timestamps, and soft delete
- Soft delete is enforced globally via MikroORM filter in `mikro-orm.config.ts`

**Custom Repository Pattern**:

- Entities specify their repository: `@Entity({ repository: () => UserRepository })`
- Repositories are in `src/repositories/`

**Environment Configuration**:

- Zod schemas in `src/configurations/env/` validate all env vars at startup
- Access validated env via `import { env } from 'src/configurations/index.config'`

**JWT Authentication**:

- Use `@UseJwtGuard()` decorator from `src/security/decorators/` to protect endpoints
- Two Passport strategies: `jwt` (access token) and `refresh-jwt` (refresh token)

**Login Strategy Pattern** (`src/modules/auth/strategies/`):

- Authentication uses the Strategy pattern via the `LoginStrategy` interface
- Each strategy defines a `priority` (lower = higher precedence), `CanHandle()`, and `Execute()`
- Priority ranges: `0-99` core auth (local passwords), `100-199` external providers (Moodle), `200+` fallbacks
- **LocalLoginStrategy** (priority 10): bcrypt password comparison for users with local credentials
- **MoodleLoginStrategy** (priority 100): Moodle token-based auth with user hydration
- New strategies are registered via the `LOGIN_STRATEGIES` injection token

**Cron Jobs** (`src/crons/`):

- Extend `BaseJob` class which provides startup execution and graceful shutdown
- Jobs register results in `StartupJobRegistry` for boot summary
- **Active jobs:**
  - `RefreshTokenCleanupJob`: Purges expired refresh tokens every 12 hours (7-day retention)
  - `TieredPipelineSchedulerJob`: Auto-enqueues analysis pipelines for active scopes with new submissions. Three independent `@Cron` methods (FACULTY Sun 01:00 UTC, DEPARTMENT Sun 02:00, CAMPUS Sun 03:00) with per-tier `isRunning` guards. Skips scopes with no new submissions since their last completed pipeline. Pipelines created this way are tagged `trigger=SCHEDULER` and attributed to the seeded SUPER_ADMIN.
  - `ReportCleanupJob`: Daily at 03:00 — purges expired report jobs and R2 objects.

**Moodle Sync Scheduling** (`src/modules/moodle/schedulers/`):

- Dynamic cron via `SchedulerRegistry` (no static `@Cron()` decorator)
- Interval resolves: DB (`SystemConfig`) > env var (`MOODLE_SYNC_INTERVAL_MINUTES`) > per-env default
- Admin-configurable at runtime via `PUT /moodle/sync/schedule` (min 30 minutes)
- `SyncLog` entity tracks every sync with per-phase metrics (fetched, inserted, updated, deactivated)
- `SyncLog` does NOT extend `CustomBaseEntity` — queries must use `filters: { softDelete: false }`

### Analysis Job Queue

BullMQ on Redis provides async job processing for AI analysis tasks:

- **Queue-per-type pattern**: Each analysis type (sentiment, topic model, embeddings, recommendations) gets its own BullMQ queue and processor
- **Entry points**: `AnalysisService.EnqueueJob()` and `EnqueueBatch()` — other modules use these to dispatch analysis jobs
- **BaseAnalysisProcessor**: Abstract base class handling HTTP dispatch to external workers, Zod validation of responses, retry/error handling, and observability events
- **Sentiment chunking**: `PipelineOrchestratorService.dispatchSentiment()` splits a run into N chunks of `SENTIMENT_CHUNK_SIZE` (default 50) and enqueues one job per chunk. `SentimentRun.expectedChunks/completedChunks` counters track completion atomically with row inserts; the last chunk advances the pipeline.
- **vLLM-primary dispatch**: When the `SENTIMENT_VLLM_CONFIG` system-config row is enabled, the orchestrator snapshots it once per dispatch and attaches `vllmConfig` to every chunk envelope. Admin endpoint `GET/PUT /admin/sentiment/vllm-config` (SUPER_ADMIN) manages it; production enable is gated by `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true`.
- **Mock worker**: `mock-worker/` directory contains a Hono HTTP server mimicking worker responses for local dev
- **Local dev**: `docker compose up` starts Redis and mock worker

### Ingestion Engine

The questionnaire module includes a data ingestion system (`src/modules/questionnaires/ingestion/`):

- **SourceAdapter interface**: Defines `extract()` async generator for streaming records
- **Adapters**: CSV and Excel adapters in `adapters/`
- **IngestionEngine**: Processes streams with concurrency control (p-limit), dry-run support, and timeout handling
- **IngestionMapperService**: Maps raw data to domain entities

### Moodle Integration

- `MoodleModule` handles communication with Moodle LMS
- Users are synced from Moodle site info
- Enrollments, categories, and courses are synced via cron jobs
- `MoodleClient` enforces a 10-second request timeout on all Moodle API calls
- Network/timeout errors are wrapped in `MoodleConnectivityError` and surfaced as 401 responses

## Testing

Tests use NestJS TestingModule with Jest mocks:

```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [
    ServiceUnderTest,
    { provide: Dependency, useValue: { method: jest.fn() } },
  ],
}).compile();
```

## Project Board & Workflow

The project is tracked on a GitHub Projects board.

### Issue Lifecycle

1. **Backlog** — Issues are created freely (rough ideas, bugs, feature requests). No ticket number required yet.
2. **Ready** — During refinement, the issue is cleaned up with details and scope, then assigned a `FAC-XX` ticket number in the title. The ticket number signals the issue is well-defined and ready to be picked up.
3. **In Progress** — A developer picks up the issue and begins work.
4. **In Review** — A PR is opened and linked to the issue.
5. **In Develop** — PR is merged into the `develop` branch.
6. **In Staging** — The merge commit is cherry-picked onto the `staging` branch for pre-production validation.
7. **Done** — Deployed to production.

### Conventions

- Issue titles follow the format: `FAC-XX type: description` (e.g., `FAC-33 feat: add Moodle connectivity error handling`)
- PR titles match their issue title
- Issue bodies include the **PR link** and **merge commit hash** for cherry-pick reference when moving to staging
- The `FAC-XX` ticket number prefix is the quality gate — only assigned issues are ready for development

## Configuration

Required environment variables (see `.env.sample`):

- `PORT`: Server port (default: `5200`)
- `NODE_ENV`: `development` | `production` | `test` (default: `development`)
- `DATABASE_URL`: PostgreSQL connection string (supports Neon.tech SSL)
- `MOODLE_BASE_URL`: Moodle instance URL
- `MOODLE_MASTER_KEY`: Moodle web services master key
- `JWT_SECRET`, `REFRESH_SECRET`: Token signing secrets
- `CORS_ORIGINS`: JSON array of allowed origins
- `OPENAI_API_KEY`: OpenAI API key (for ChatKit module)
- `REDIS_URL`: Redis connection URL (used for caching and job queues)

Optional:

- `JWT_ACCESS_TOKEN_EXPIRY`: Access token lifetime (default: `300s`)
- `JWT_REFRESH_TOKEN_EXPIRY`: Refresh token lifetime (default: `30d`)
- `JWT_BCRYPT_ROUNDS`: Bcrypt cost factor for refresh-token hashing (default: `10`; values below `10` warn outside production)
- `OPENAPI_MODE`: Set to `"true"` to enable Swagger docs (default: disabled)
- `SYNC_ON_STARTUP`: Set to `"true"` to run Course and Enrollment sync on startup (default: disabled)
- `SUPER_ADMIN_USERNAME`: Default super admin username (default: `superadmin`)
- `SUPER_ADMIN_PASSWORD`: Default super admin password (default: `password123`)
- `BULLMQ_DEFAULT_ATTEMPTS`: Job retry attempts (default: `3`)
- `BULLMQ_DEFAULT_BACKOFF_MS`: Initial backoff delay in ms (default: `5000`)
- `BULLMQ_DEFAULT_TIMEOUT_MS`: Job-level timeout in ms (default: `120000`)
- `BULLMQ_HTTP_TIMEOUT_MS`: HTTP request timeout in ms (default: `90000`)
- `BULLMQ_SENTIMENT_CONCURRENCY`: Sentiment processor concurrency (default: `3`)
- `SENTIMENT_WORKER_URL`: RunPod/mock worker URL for sentiment analysis
- `SENTIMENT_CHUNK_SIZE`: Submissions per sentiment chunk dispatched to the worker (default: `50`)
- `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD`: Production safety gate — required to enable vLLM dispatch when `NODE_ENV=production` (default: `false`)
- `MOODLE_SYNC_INTERVAL_MINUTES`: Sync schedule interval in minutes (min `30`; defaults per env: dev=60, staging=360, prod=180)
