---
project_name: 'api.faculytics'
user_name: 'yander'
date: '2026-02-17'
sections_completed: ['technology_stack', 'critical_rules', 'code_patterns']
existing_patterns_found: 8
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Backend Framework:** NestJS v11.0.1 (TypeScript v5.7.3)
- **Database ORM:** MikroORM v6.6.6 (PostgreSQL)
- **Validation:** Zod v4.3.6, class-validator v0.14.3
- **Authentication:** Passport, JWT, Moodle Token Integration
- **Testing:** Jest v30.0.0, Supertest v7.0.0
- **Documentation:** Swagger (OpenAPI) v11.2.6
- **CI/CD:** Github Actions, semantic-release v25.0.3, Husky v9.1.7

## Critical Implementation Rules

### 1. Database Interactions (MikroORM)

- **Idempotent Upserts:** Use external IDs (e.g., `moodleCategoryId`) as the conflict target for `em.upsert`.
- **Primary Key Stability:** Always exclude `id` and `created_at` from the update set using `onConflictMergeFields` to prevent overwriting local UUIDs or record creation timestamps.
- **Entity Initialization:** Use `tx.create(Entity, data, { managed: false })` before upserting. This ensures entity property initializers (like UUID generation) are executed.
- **Repository Pattern:** Use dedicated repositories for entity-specific logic.

### 2. Cron Job Management

- **Base Class:** All cron jobs must extend `BaseJob` (from `src/crons/base.job.ts`) for standardized logging and error handling.
- **Shutdown:** Do not manually stop cron jobs in `onApplicationShutdown`; NestJS's `ScheduleModule` handles this.

### 3. Configuration & Environment

- **Validation:** All environment variables are validated using Zod in `src/configurations/env/`.
- **Access:** Always use `src/configurations/index.config.ts` (the `env` object) to access configuration values.

### 4. Code Standards

- **TypeScript:** Strict null checks enabled.
- **DTOs:** Located within their respective modules (e.g., `src/modules/auth/dto/`).
- **Imports:** Prefer absolute imports starting from `src/`.

## Existing Patterns Found

- **Modular Architecture:** Standard NestJS modular structure split into Infrastructure and Application layers.
- **Hierarchy Mapping:** Local institutional hierarchy (Campus, Semester, Department, Program) derived from Moodle categories.
- **External Sync:** Pattern of periodic synchronization from Moodle with idempotency.
- **Unit of Work Pattern:** Leveraging MikroORM's `EntityManager` for transactional integrity.
- **Swagger Documentation:** Standard use of `@nestjs/swagger` decorators on DTOs and Controllers.
- **Linting & Formatting:** Strict ESLint and Prettier rules enforced via Husky.
- **Semantic Versioning:** Automated releases via `semantic-release`.
- **Zod Validation:** Unified validation for both configuration and potentially other data structures.
