# Gemini Context: api.faculytics

## Project Overview

**api.faculytics** is a NestJS-based backend application designed to integrate with Moodle. It serves as an API layer that authenticates users via Moodle credentials, synchronizes user data, and likely provides analytics or extended functionality on top of Moodle data.

### Key Technologies

- **Framework:** [NestJS](https://nestjs.com/) (TypeScript)
- **Database:** PostgreSQL (via [MikroORM](https://mikro-orm.io/))
- **Authentication:** JWT, Passport, Moodle Token Integration
- **Validation:** Zod, class-validator
- **Documentation:** Swagger (OpenAPI)

## Architecture

The application follows the standard NestJS modular architecture, split into **Infrastructure** and **Application** layers.

### Module Structure (`src/modules/`)

- **InfrastructureModules:**
  - `ConfigModule`: Loads and validates environment variables (`src/configurations/env/`).
  - `MikroORMModule`: Handles database connections and entity management.
  - `JwtModule`: Global JWT configuration for signing/verifying tokens.
  - `PassportModule`: Authentication strategies.
- **ApplicationModules:**
  - `AuthModule`: Handles user login, token refresh, and session management. It authenticates users against Moodle and issues local JWTs.
  - `MoodleModule`: Core integration with Moodle. Contains `MoodleService` for API calls and `MoodleSyncService` for data synchronization.
  - `HealthModule`: Health check endpoints.

### Data Layer (`src/entities/`)

- **User:** Represents a local user account, mapped 1:1 to a Moodle user via `moodleUserId`. Stores basic profile info (first name, last name, picture).
- **MoodleToken:** Stores Moodle access tokens associated with a user.
- **MoodleCategory:** Cache for Moodle's category hierarchy, used to map courses and organizational structures.
- **Campus, Semester, Department, Program:** Local representations of the institutional hierarchy derived from Moodle categories.
- **MikroORM:** configured in `mikro-orm.config.ts`. Supports migrations and seeding (`src/migrations/`, `src/seeders/`).

## Building and Running

### Prerequisites

- Node.js (v20+ recommended)
- PostgreSQL Database

### Environment Setup

1.  Copy `.env.sample` to `.env`.
2.  Configure the database URL (supports Neon.tech SSL defaults) and Moodle API credentials.

### Scripts

- **Start Development:** `npm run start:dev` (Watch mode)
- **Build:** `npm run build`
- **Production Start:** `npm run start:prod`
- **Lint:** `npm run lint`
- **Format:** `npm run format`

### Testing

- **Unit Tests:** `npm run test`
- **E2E Tests:** `npm run test:e2e`
- **Coverage:** `npm run test:cov`

## Development Conventions

- **Configuration:** All environment variables are validated using `zod` in `src/configurations/env/`. Use `src/configurations/index.config.ts` to access them.
- **DTOs:** Request/Response DTOs are located within each module (e.g., `src/modules/auth/dto/`).
- **Database:**
  - Use `MikroORM` for all database interactions.
  - Run migrations via MikroORM CLI (commands not explicitly in package.json scripts, likely accessed via `npx mikro-orm`).
- **Code Style:** strict ESLint and Prettier rules are enforced via `husky` pre-commit hooks.

## Architectural Decisions

### Idempotent Upserts & ID Stability

To ensure data integrity during synchronization from external sources (like Moodle):

- **Business Keys:** Use external IDs (e.g., `moodleCategoryId`) as the conflict target for `em.upsert`.
- **Primary Key Stability:** Always exclude `id` and `created_at` from the update set using `onConflictMergeFields` to prevent overwriting local UUIDs or record creation timestamps.
- **Entity Initialization:** Use `tx.create(Entity, data, { managed: false })` before upserting. This ensures entity property initializers (like UUID generation) are executed, allowing the database to decide whether to use the new ID (on insert) or ignore it (on conflict).

### Cron Job Management

- **Base Class:** All cron jobs must extend `BaseJob` to ensure consistent startup logging and standardized error handling.
- **Shutdown Handling:** Do not manually attempt to stop cron jobs in `onApplicationShutdown`. NestJS's `ScheduleModule` handles the cleanup of the `SchedulerRegistry` automatically. Manual cleanup often leads to "Job not found" warnings during the shutdown sequence.

## Available Agents

To ensure efficiency and adherence to project standards, use the following specialized agents for their respective domains:

- **git-agent**: Git expert agent for all local and remote operations (commits, branching, bisect, remote sync).
  - **Tools**: `run_shell_command`, `read_file`, `grep_search`, `list_directory`.
  - **Usage**: Invoke for any version control tasks, preparing PRs, or investigating history.
- **pr-agent**: PR expert agent for automating pull requests and release workflows.
  - **Tools**: `run_shell_command`, `read_file`, `grep_search`, `list_directory`.
  - **Usage**: Invoke to create PRs, automate cherry-picking between branches (develop/staging/master), and generate descriptions.
- **e2e-test-agent**: Expert in End-to-End testing for the NestJS application.
  - **Usage**: Invoke for scenario generation, database management for tests, and failure investigation.
- **moodle-api-agent**: Expert in Moodle Web Service integration.
  - **Usage**: Invoke to scaffold Moodle API calls, generate DTOs, and integrate with MoodleClient and MoodleService.
