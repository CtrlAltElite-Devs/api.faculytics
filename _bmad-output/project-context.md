---
project_name: 'api.faculytics'
user_name: 'yander'
date: '2026-02-17'
---

project_name: 'api.faculytics'
user_name: 'yander'
date: '2026-02-17'
sections_completed:
[
'technology_stack',
'language_rules',
'framework_rules',
'testing_rules',
'quality_rules',
'workflow_rules',
'anti_patterns',
]
status: 'complete'
rule_count: 18
optimized_for_llm: true

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

### Language-Specific Rules

- **Strict TypeScript:** Strict null checks are enforced.
- **Absolute Imports:** Prefer absolute imports starting from `src/`.
- **Explicit DTOs:** Request and response DTOs must be explicitly defined in their respective module's `dto/` folder.
- **Entity Repositories:** Use dedicated repository classes (e.g., `UserRepository`) for business logic.
- **Standard Exceptions:** Use NestJS built-in exceptions (`NotFoundException`, `UnauthorizedException`, etc.).
- **Transactional Integrity:** Wrap multi-step database operations in `unitOfWork.runInTransaction(async (em) => { ... })`.

### Framework-Specific Rules (NestJS & MikroORM)

- **Method Naming:** Public Service methods MUST use `PascalCase` (e.g., `Login`, `SyncUserContext`).
- **Transactions:** Always use `UnitOfWork` (from `src/modules/common/unit-of-work`) for database transactions.
- **Idempotent Upserts:** Use external IDs (e.g., `moodleUserId`) as conflict targets for `em.upsert`.
- **MikroORM Stability:** Exclude `id` and `created_at` from `onConflictMergeFields`.
- **Entity Initialization:** Use `tx.create(Entity, data, { managed: false })` before upserts to trigger property initializers.
- **Questionnaire Leaf-Weight Rule:** Weights can ONLY be assigned to "Leaf" sections. The sum of weights in a version MUST equal exactly 100.
- **Section Mutual Exclusivity:** Sections can contain sub-sections OR questions, never both.

### Testing Rules

- **Unit Tests:** Located alongside the source file with `.spec.ts` suffix.
- **E2E Tests:** Located in `test/` root directory.
- **Mocks:** Services must be tested with mocked repositories and `UnitOfWork`.
- **Seeder Idempotency:** Any seeder additions must be verified for idempotency in tests.

### Code Quality & Style Rules

- **Husky Enforcement:** Linting and formatting rules are strictly enforced via pre-commit hooks.
- **DTO Placement:** Requests and Responses must be separated within `dto/` folders (e.g., `dto/requests/`).
- **File Naming:** Entities, Services, and Controllers use `kebab-case`.
- **Method Naming:** Public methods use `PascalCase`.
- **Swagger Documentation:** All endpoints and DTO properties must use `@nestjs/swagger` decorators.

### Development Workflow Rules

- **Commit Messages:** Follow **Conventional Commits** (e.g., `feat:`, `fix:`) for automated releases.
- **Automated Releases:** Uses `semantic-release` for versioning and changelogs.
- **Startup Integrity:** Strict sequence: Migrations -> Seeders -> Bootstrap.
- **PR Checks:** All PRs must pass automated linting and tests via GitHub Actions.

### Critical Don't-Miss Rules (Anti-Patterns & Edge Cases)

- **Anti-Pattern (Upsert):** Never use `em.upsert` without `onConflictMergeFields` if local metadata (IDs, timestamps) must be preserved.
- **Anti-Pattern (EM):** Avoid using the global `EntityManager`. Always inject it or use `UnitOfWork`.
- **Anti-Pattern (Cron):** NEVER stop cron jobs manually in `onApplicationShutdown`.
- **Edge Case (Dean):** Users with the `DEAN` role bypass course enrollment checks in questionnaire submissions.
- **Edge Case (Moodle Roles):** Always use `MoodleRoleMapping` enum for converting Moodle roles to internal roles.
- **Immutability:** `QuestionnaireVersion` is immutable once submissions exist.
- **Security:** Ensure sensitive fields (like `password`) are marked `@Property({ hidden: true })` and never returned in DTOs.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-02-17
