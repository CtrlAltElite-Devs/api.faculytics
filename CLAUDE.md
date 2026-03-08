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

- **InfrastructureModules**: ConfigModule, PassportModule, MikroOrmModule, JwtModule, ScheduleModule
- **ApplicationModules**: HealthModule, MoodleModule, AuthModule, ChatKitModule, EnrollmentsModule, QuestionnaireModule

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
  - `CategorySyncJob`: Syncs Moodle categories to local hierarchy
  - `CourseSyncJob`: Syncs Moodle courses
  - `EnrollmentSyncJob`: Syncs user-course enrollments
  - `RefreshTokenCleanupJob`: Purges expired refresh tokens every 12 hours (7-day retention)

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

Optional:

- `OPENAPI_MODE`: Set to `"true"` to enable Swagger docs (default: disabled)
- `SUPER_ADMIN_USERNAME`: Default super admin username (default: `superadmin`)
- `SUPER_ADMIN_PASSWORD`: Default super admin password (default: `password123`)
