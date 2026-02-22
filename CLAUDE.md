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
- Two strategies: `jwt` (access token) and `refresh-jwt` (refresh token)

**Cron Jobs** (`src/crons/`):

- Extend `BaseJob` class which provides startup execution and graceful shutdown
- Jobs register results in `StartupJobRegistry` for boot summary

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

## Configuration

Required environment variables (see `.env.sample`):

- `DATABASE_URL`: PostgreSQL connection string (supports Neon.tech SSL)
- `MOODLE_BASE_URL`: Moodle instance URL
- `JWT_SECRET`, `REFRESH_SECRET`: Token signing secrets
- `CORS_ORIGINS`: JSON array of allowed origins
