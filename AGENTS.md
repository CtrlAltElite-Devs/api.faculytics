# AGENTS.md

This file provides guidance to OpenAI Codex CLI when working with code in this repository.

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
npx mikro-orm migration:create   # Create a new migration
npx mikro-orm migration:up       # Apply pending migrations
npx mikro-orm migration:list     # Check migration status
```

## Architecture

### Module Organization

The app uses a split between **Infrastructure** and **Application** modules (`src/modules/index.module.ts`):

- **InfrastructureModules**: ConfigModule, PassportModule, MikroOrmModule, JwtModule, ScheduleModule, BullModule, TerminusModule
- **ApplicationModules**: HealthModule, MoodleModule, AuthModule, ChatKitModule, EnrollmentsModule, QuestionnaireModule, AnalysisModule

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

**Moodle Sync Scheduling** (`src/modules/moodle/schedulers/`):

- Dynamic cron via `SchedulerRegistry` (no static `@Cron()` decorator)
- Interval resolves: DB (`SystemConfig`) > env var (`MOODLE_SYNC_INTERVAL_MINUTES`) > per-env default
- Admin-configurable at runtime via `PUT /moodle/sync/schedule` (min 30 minutes)
- `SyncLog` entity tracks every sync with per-phase metrics (fetched, inserted, updated, deactivated)
- `SyncLog` does not extend `CustomBaseEntity` so queries must use `filters: { softDelete: false }`

**Analysis Job Queue**:

- BullMQ on Redis provides async job processing for AI analysis tasks
- Each analysis type (sentiment, topic model, embeddings) has its own BullMQ queue and processor
- Entry points are `AnalysisService.EnqueueJob()` and `EnqueueBatch()`
- `BaseAnalysisProcessor` handles HTTP dispatch to external workers, Zod validation of responses, retry or error handling, and observability events
- `mock-worker/` contains a Hono HTTP server that mimics worker responses for local development

**Ingestion Engine** (`src/modules/questionnaires/ingestion/`):

- `SourceAdapter` defines `extract()` as an async generator for streaming records
- CSV and Excel adapters live in `adapters/`
- `IngestionEngine` handles concurrency control, dry-run support, and timeout handling
- `IngestionMapperService` maps raw data into domain entities

**Moodle Integration**:

- `MoodleModule` handles communication with Moodle LMS
- Users are synced from Moodle site info
- Enrollments, categories, and courses are synced via scheduled jobs
- `MoodleClient` enforces a 10-second request timeout on Moodle API calls
- Network and timeout errors are wrapped in `MoodleConnectivityError` and surfaced as 401 responses

## Testing

Tests use NestJS `TestingModule` with Jest mocks:

```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [
    ServiceUnderTest,
    { provide: Dependency, useValue: { method: jest.fn() } },
  ],
}).compile();
```

## Code Style Rules

- Implement only the change requested by the issue or task; do not add speculative features
- Prefer the existing module and repository patterns over new abstractions
- Do not add backwards-compatibility shims unless the requirement explicitly calls for them
- Keep changes consistent with the current NestJS, MikroORM, and DTO structure already used in the codebase
- Update tests when behavior changes or when adding logic that can regress

## Custom Workflows

Repository-specific Codex workflow docs live in `.codex/commands/`.

- `.codex/commands/generate-moodle-index.md` - Build or refresh the searchable Moodle API index from the PDF in `docs/moodle/`
- `.codex/commands/moodle-api-agent.md` - Research and scaffold new Moodle API integrations using the indexed PDF docs and the existing NestJS patterns
- `.codex/commands/promote-backlog.md` - Promote a GitHub issue from Backlog to Ready with the next `FAC-XX` ticket number

These mirror the non-BMAD custom Claude commands in `.claude/commands/`. Prefer the Codex copies when following project-specific workflows.

## Custom Skills

Repository-specific Codex skills live in `.codex/skills/`.

- `.codex/skills/update-docs/SKILL.md` - Review branch changes and update `docs/` to match the current implementation
- `.codex/skills/neon-postgres/SKILL.md` - Neon Serverless Postgres guidance and reference links for Neon-related work

These mirror the repo-local Claude skills in `.claude/skills/`.

## Custom Skills

Repository-specific Codex skills live in `.codex/skills/`.

- `.codex/skills/update-docs/SKILL.md` - Review branch changes and update `docs/` to match the current implementation
- `.codex/skills/neon-postgres/SKILL.md` - Neon Serverless Postgres guidance and reference links for Neon-related work

These mirror the repo-local Claude skills in `.claude/skills/`.

## Project Board And Workflow

The project is tracked on a GitHub Projects board.

### Issue Lifecycle

1. **Backlog** - Issues are created freely (rough ideas, bugs, feature requests). No ticket number required yet.
2. **Ready** - During refinement, the issue is cleaned up with details and scope, then assigned a `FAC-XX` ticket number in the title. The ticket number signals the issue is well-defined and ready to be picked up.
3. **In Progress** - A developer picks up the issue and begins work.
4. **In Review** - A PR is opened and linked to the issue.
5. **In Develop** - PR is merged into the `develop` branch.
6. **In Staging** - The merge commit is cherry-picked onto the `staging` branch for pre-production validation.
7. **Done** - Deployed to production.

### Conventions

- Issue titles follow the format: `FAC-XX type: description` (example: `FAC-33 feat: add Moodle connectivity error handling`)
- PR titles should match their issue title
- Issue bodies should include the PR link and merge commit hash for cherry-pick reference when moving to staging
- The `FAC-XX` ticket number prefix is the quality gate; only assigned issues are ready for development

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
- `JWT_BCRYPT_ROUNDS`: Bcrypt cost factor for refresh-token hashing (default: `10`; values below `10` log a warning outside production)
- `OPENAPI_MODE`: Set to `"true"` to enable Swagger docs (default: disabled)
- `SYNC_ON_STARTUP`: Set to `"true"` to run Course and Enrollment sync on startup (default: disabled)
- `SUPER_ADMIN_USERNAME`: Default super admin username (default: `superadmin`)
- `SUPER_ADMIN_PASSWORD`: Default super admin password (default: `password123`)
- `BULLMQ_DEFAULT_ATTEMPTS`: Job retry attempts (default: `3`)
- `BULLMQ_DEFAULT_BACKOFF_MS`: Initial backoff delay in ms (default: `5000`)
- `BULLMQ_DEFAULT_TIMEOUT_MS`: Job-level timeout in ms (default: `120000`)
- `BULLMQ_HTTP_TIMEOUT_MS`: HTTP request timeout in ms (default: `90000`)
- `BULLMQ_SENTIMENT_CONCURRENCY`: Sentiment processor concurrency (default: `3`)
- `SENTIMENT_WORKER_URL`: RunPod or mock worker URL for sentiment analysis
- `MOODLE_SYNC_INTERVAL_MINUTES`: Sync schedule interval in minutes (min `30`; defaults per env: dev=60, staging=360, prod=180)

Keep `CLAUDE.md` and `AGENTS.md` in sync when project architecture or workflow guidance changes.
