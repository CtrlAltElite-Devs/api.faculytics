---
title: 'Audit Trail MVP'
slug: 'audit-trail-mvp'
created: '2026-03-29'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['NestJS', 'BullMQ', 'MikroORM', 'PostgreSQL', 'nestjs-cls', 'Zod', 'Passport/JWT']
files_to_modify:
  - 'src/configurations/common/queue-names.ts'
  - 'src/modules/index.module.ts'
  - 'src/entities/audit-log.entity.ts (NEW)'
  - 'src/modules/audit/audit.module.ts (NEW)'
  - 'src/modules/audit/audit.service.ts (NEW)'
  - 'src/modules/audit/audit.processor.ts (NEW)'
  - 'src/modules/audit/decorators/audited.decorator.ts (NEW)'
  - 'src/modules/audit/interceptors/audit.interceptor.ts (NEW)'
  - 'src/modules/auth/auth.service.ts'
  - 'src/modules/auth/auth.controller.ts'
  - 'src/modules/moodle/controllers/moodle-sync.controller.ts'
  - 'src/modules/questionnaires/questionnaire.controller.ts'
  - 'src/modules/analysis/analysis.controller.ts'
  - 'migration file (NEW)'
code_patterns:
  - 'BullMQ queue-per-type: QueueName const enum in queue-names.ts, BullModule.registerQueue() in module'
  - 'Processor: @Processor(QueueName.X, { concurrency }) extends WorkerHost, em.fork().persistAndFlush()'
  - 'CLS context: CurrentUserService.get() for user, RequestMetadataService.get() for IP/browser/OS'
  - 'Append-only entity: SyncLog pattern — no CustomBaseEntity, no soft delete, own PK/timestamps'
  - 'Custom decorator: SetMetadata(KEY, value) with exported KEY constant'
  - 'Composite decorator: applyDecorators() to combine multiple decorators'
  - 'Job enqueueing: @InjectQueue(QueueName.X), queue.add(name, envelope, { jobId, attempts, backoff })'
  - 'Direct emit for non-interceptor contexts (auth failures in catch blocks)'
test_patterns:
  - 'NestJS TestingModule with Jest mocks: { provide: Dep, useValue: { method: jest.fn() } }'
  - 'Auth tests mock CustomJwtService, UnitOfWork, CurrentUserService, RequestMetadataService'
  - 'Controller tests override JWT/role guards'
  - 'Strategy tests validate error handling paths'
---

# Tech-Spec: Audit Trail MVP

**Created:** 2026-03-29

## Overview

### Problem Statement

The platform has no visibility into who performed security-sensitive actions — auth events, admin configuration changes, or sensitive data mutations. There is no audit log for compliance, security incident investigation, or operational accountability.

### Solution

Add an append-only `AuditLog` entity backed by a dedicated BullMQ `AUDIT` queue. Capture audit events through two emission paths:

1. **Interceptor path** — An `@Audited('action')` decorator on endpoints triggers an interceptor that auto-captures context (user, IP, resource) and enqueues an audit event post-response.
2. **Direct emit path** — `AuditService.Emit()` called explicitly in service code for contexts outside the interceptor lifecycle (e.g., auth failures, catch blocks).

Both paths feed the same queue, processor, and entity. Write-only pipeline for the MVP.

### Scope

**In Scope:**

- `AuditLog` entity (append-only, immutable, no soft delete)
- BullMQ `AUDIT` queue and processor (concurrency: 1)
- `AuditService` with `Emit()` method for direct emission
- `@Audited()` decorator and `AuditInterceptor` for endpoint-based capture
- ~12 MVP endpoints tagged across three categories:
  - **Auth events**: login success/failure, logout, token refresh
  - **Admin actions**: sync schedule changes, config updates, user management
  - **Sensitive data mutations**: questionnaire submissions, analysis job dispatch

**Out of Scope:**

- Admin query/filter endpoint for audit logs
- Before/after diff capture on entity updates
- Retention policy / cleanup job
- Broader CRUD auditing beyond MVP endpoints
- Export/download of audit logs

## Context for Development

### Codebase Patterns

- **BullMQ queue-per-type**: Each analysis type gets its own queue registered via `BullModule.registerQueue()` in the module. Queue names are centralized in `src/configurations/common/queue-names.ts`.
- **Processor pattern**: Analysis processors extend `WorkerHost` from `@nestjs/bullmq`. The audit processor will NOT extend `BaseAnalysisProcessor` (no HTTP dispatch needed) — it writes directly to the DB.
- **CLS context**: `nestjs-cls` provides request-scoped state. `CurrentUserService` holds the authenticated user; `RequestMetadataService` holds IP/browser/OS. Both are available in interceptors.
- **Append-only entity**: `SyncLog` is the precedent — no `CustomBaseEntity` extension, no soft delete, owns its own schema.
- **Decorator + interceptor**: The `@Audited()` decorator sets Reflector metadata on the handler. The `AuditInterceptor` reads it post-response and enqueues.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/configurations/common/queue-names.ts` | Queue name enum — add `AUDIT` here. Uses `as const` pattern with derived type. |
| `src/modules/analysis/analysis.module.ts` | Pattern for `BullModule.registerQueue({ name: QueueName.X })` and provider registration |
| `src/modules/analysis/processors/sentiment.processor.ts` | Pattern for `@Processor(QueueName.X, { concurrency })`, `WorkerHost` extension, `em.fork()` |
| `src/modules/analysis/analysis.service.ts` | Pattern for `@InjectQueue()`, envelope format `{ jobId, version, type, metadata, publishedAt }`, job options |
| `src/entities/sync-log.entity.ts` | **Primary pattern**: append-only entity, no `CustomBaseEntity`, no soft delete, own `@PrimaryKey()` + timestamps |
| `src/entities/base.entity.ts` | `CustomBaseEntity` — audit entity does NOT extend this |
| `src/modules/common/interceptors/metadata.interceptor.ts` | Extracts IP (x-forwarded-for fallback), browser, OS via UAParser; stores in CLS |
| `src/modules/common/interceptors/current-user.interceptor.ts` | Loads User entity from DataLoader, stores in CLS via `CurrentUserService.set()` |
| `src/modules/common/cls/request-metadata.service.ts` | `RequestMetadata = { browserName, os, ipAddress }`, wraps `ClsService` with typed get/set |
| `src/modules/common/cls/current-user.service.ts` | `get()` returns `User \| null`, `getUserId()` extracts from JWT payload |
| `src/modules/common/cls/cls.module.ts` | `AppClsModule` exports both CLS services |
| `src/modules/index.module.ts` | `ApplicationModules` array — add `AuditModule` here |
| `src/security/decorators/roles.decorator.ts` | Pattern for `SetMetadata(KEY, value)` custom decorator |
| `src/security/decorators/index.ts` | Pattern for `applyDecorators()` composite decorator (`UseJwtGuard`) |
| `src/modules/auth/auth.controller.ts` | MVP endpoints: `POST /login`, `POST /logout`, `POST /refresh` |
| `src/modules/auth/auth.service.ts` | Login strategy execution, failure paths at lines 51-54 (no strategy match), refresh token validation |
| `src/modules/auth/strategies/local-login.strategy.ts` | Throws `UnauthorizedException` on invalid credentials — direct emit audit point |
| `src/modules/auth/strategies/moodle-login.strategy.ts` | Catches `MoodleConnectivityError` — direct emit audit point |
| `src/modules/moodle/controllers/moodle-sync.controller.ts` | MVP endpoints: `POST /moodle/sync` (manual trigger, superadmin), `PUT /moodle/sync/schedule` (superadmin) |
| `src/modules/questionnaires/questionnaire.controller.ts` | MVP endpoints: `POST /submissions`, `POST /ingest` (bulk CSV, superadmin), `DELETE /versions/:id/submissions` (wipe, superadmin) |
| `src/modules/analysis/analysis.controller.ts` | MVP endpoints: `POST /pipelines` (create), `POST /pipelines/:id/confirm`, `POST /pipelines/:id/cancel` |

### Technical Decisions

- **Entity does NOT extend `CustomBaseEntity`**: Audit records are immutable and never soft-deleted. Following the `SyncLog` precedent.
- **Processor does NOT extend `BaseAnalysisProcessor`**: No HTTP dispatch to external workers. Simple DB persist via `em.fork().persistAndFlush()`.
- **Concurrency: 1**: Audit inserts are lightweight. Single concurrency avoids contention and is sufficient for MVP volume.
- **JSONB `metadata` field**: Flexible bag for action-specific details (auth failure reason, config before/after, questionnaire ID, etc.). Keeps schema stable across action types.
- **Denormalized `actorUsername`**: Users can be renamed; audit records preserve the username at time of action.
- **Two emission paths**: Interceptor for standard authenticated endpoints; direct `Emit()` for edge cases (failed logins, service-level events).

## Implementation Plan

### Tasks

#### Phase 1: Foundation (Entity + Queue + Processor)

- [ ] Task 1: Add `AUDIT` queue name
  - File: `src/configurations/common/queue-names.ts`
  - Action: Add `AUDIT: 'audit'` to the `QueueName` const object
  - Notes: Follows existing pattern (`SENTIMENT: 'sentiment'`, etc.)

- [ ] Task 2: Create `AuditLog` entity
  - File: `src/entities/audit-log.entity.ts` (NEW)
  - Action: Create append-only entity following `SyncLog` pattern (no `CustomBaseEntity`). Fields:
    - `id: string` — `@PrimaryKey()`, default `v4()`
    - `action: string` — e.g. `auth.login.success`, `admin.sync-schedule.update`
    - `actorId: string` — nullable (failed logins have no actor)
    - `actorUsername: string` — nullable, denormalized for historical accuracy
    - `resourceType: string` — nullable, e.g. `User`, `QuestionnaireSubmission`
    - `resourceId: string` — nullable, UUID of affected resource
    - `metadata: Record<string, unknown>` — `@Property({ type: 'jsonb', nullable: true })`
    - `ipAddress: string` — nullable
    - `userAgent: string` — nullable (browser + OS combined)
    - `occurredAt: Date` — `@Index()`, default `new Date()`
  - Notes: No `updatedAt`, no `deletedAt`. Add comment: "Audit records are never soft-deleted. Queries must use `filters: { softDelete: false }`." Also add a stub `AuditLogRepository` with a `findAll()` method that enforces `filters: { softDelete: false }` — prevents future developers from hitting the global filter footgun when building the query endpoint.

- [ ] Task 3: Register entity in entity index
  - File: `src/entities/index.entity.ts`
  - Action: Export `AuditLog` from the entity barrel file

- [ ] Task 4: Create database migration
  - Command: `npx mikro-orm migration:create`
  - Action: Create `audit_log` table with all columns from Task 2. Add index on `occurred_at`. Add index on `action`.
  - Notes: Run `npx mikro-orm migration:create` after entity is created, verify generated SQL

- [ ] Task 5: Create `AuditProcessor`
  - File: `src/modules/audit/audit.processor.ts` (NEW)
  - Action: Create processor that extends `WorkerHost` (NOT `BaseAnalysisProcessor`):
    - `@Processor(QueueName.AUDIT, { concurrency: 1 })`
    - Inject `EntityManager`
    - `process(job: Job<AuditJobMessage>)`: extract fields from job data, create `AuditLog` entity, `em.fork().persistAndFlush()`
    - `@OnWorkerEvent('failed')`: log error with job ID, attempt count, AND full job payload (so audit data is preserved in application logs even if DB write fails)
  - Notes: No HTTP dispatch. Direct DB write only. Set `attempts: 1` in job options — no retries. If the insert fails, it fails. Retrying audit inserts adds complexity with no real benefit.

- [ ] Task 6: Create `AuditJobMessage` DTO
  - File: `src/modules/audit/dto/audit-job-message.dto.ts` (NEW)
  - Action: Define interface and Zod schema for the audit queue envelope:
    ```typescript
    interface AuditJobMessage {
      action: string;
      actorId?: string;
      actorUsername?: string;
      resourceType?: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
      occurredAt: string; // ISO timestamp
    }
    ```
  - Notes: Zod schema for runtime validation in processor

#### Phase 2: Service + Decorator + Interceptor

- [ ] Task 7: Create `AuditService`
  - File: `src/modules/audit/audit.service.ts` (NEW)
  - Action: Create service with:
    - `@InjectQueue(QueueName.AUDIT) private readonly auditQueue: Queue`
    - `async Emit(params: { action: string; actorId?: string; actorUsername?: string; resourceType?: string; resourceId?: string; metadata?: Record<string, unknown>; ipAddress?: string; userAgent?: string }): Promise<void>`
    - Build envelope with `occurredAt: new Date().toISOString()`
    - Enqueue via `this.auditQueue.add('audit', envelope)`
    - Wrap in try/catch — audit failures MUST NOT break the request. Log with `Logger.warn` including the action name so failed emissions are observable in application logs.
  - Notes: Fire-and-forget. Set `attempts: 1` on job options (no retries). Audit inserts are idempotent-safe and not critical enough to retry.

- [ ] Task 8: Create `@Audited()` decorator
  - File: `src/modules/audit/decorators/audited.decorator.ts` (NEW)
  - Action: Create decorator using `SetMetadata`:
    ```typescript
    export const AUDIT_ACTION_KEY = 'audit:action';
    export const Audited = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
    ```
  - Notes: Follows `@Roles()` pattern in `src/security/decorators/roles.decorator.ts`

- [ ] Task 9: Create `AuditInterceptor`
  - File: `src/modules/audit/interceptors/audit.interceptor.ts` (NEW)
  - Action: Create NestJS interceptor:
    - Inject `Reflector`, `AuditService`, `CurrentUserService`, `RequestMetadataService`
    - In `intercept()`:
      1. Read `AUDIT_ACTION_KEY` from handler metadata via `Reflector.get()`
      2. If no action metadata, pass through (`return next.handle()`)
      3. Return `next.handle().pipe(tap(() => { ... }))` — emit audit event **after** successful response
      4. In the `tap` callback: read user from `CurrentUserService.get()`, metadata from `RequestMetadataService.get()`, call `AuditService.Emit()` with action, actorId, actorUsername, resourceType (from decorator or undefined), ipAddress, userAgent (`${browserName} on ${os}`)
    - Notes: Uses RxJS `tap` operator to fire post-response. Errors in `tap` must be caught and logged — never propagate to the response. If `RequestMetadataService.get()` returns null, log a `Logger.warn` with the controller/handler name indicating missing CLS metadata — don't fail, just record what's available.

#### Phase 3: Module Wiring

- [ ] Task 10: Create `AuditModule`
  - File: `src/modules/audit/audit.module.ts` (NEW)
  - Action: Create module:
    ```typescript
    @Module({
      imports: [
        BullModule.registerQueue({ name: QueueName.AUDIT }),
        MikroOrmModule.forFeature([AuditLog]),
        CommonModule,
      ],
      providers: [AuditService, AuditProcessor, AuditInterceptor],
      exports: [AuditService, AuditInterceptor],
    })
    export class AuditModule {}
    ```
  - Notes: Exports `AuditService` (for direct emit in auth) and `AuditInterceptor` (for controller use)

- [ ] Task 11: Register `AuditModule` in application modules
  - File: `src/modules/index.module.ts`
  - Action: Import `AuditModule` and add to `ApplicationModules` array

#### Phase 4: Tag MVP Endpoints

- [ ] Task 12: Tag auth endpoints (interceptor path)
  - File: `src/modules/auth/auth.controller.ts`
  - Action:
    - Add `@Audited('auth.login.success')` to `POST /login` handler
    - Add `@Audited('auth.logout')` to `POST /logout` handler
    - Add `@Audited('auth.token.refresh')` to `POST /refresh` handler
    - Add `@UseInterceptors(AuditInterceptor)` to the controller class (or individual methods)
  - Notes: Login success only via interceptor. Login failure handled via direct emit (Task 13).

- [ ] Task 13: Add direct audit emit for auth failures
  - File: `src/modules/auth/auth.service.ts`
  - Action:
    - Inject `AuditService` using `@Optional()` decorator — if the audit module fails to initialize (e.g., Redis down at startup), auth still works. Guard all `Emit()` calls with `if (this.auditService)`.
    - In the login method's catch/failure path (around lines 51-54 where no strategy handles): call `AuditService.Emit({ action: 'auth.login.failure', metadata: { username, reason: 'no_matching_strategy' }, ipAddress, userAgent })` — pull IP/userAgent from `RequestMetadataService.get()`
    - In strategy execution catch blocks: emit with `reason: error.message`
  - Notes: `actorId` and `actorUsername` will be undefined for failed logins. `RequestMetadataService` IS available since `MetaDataInterceptor` runs before auth logic. The `@Optional()` injection prevents audit from being a hard dependency of auth.

- [ ] Task 14: Tag moodle sync endpoints
  - File: `src/modules/moodle/controllers/moodle-sync.controller.ts`
  - Action:
    - Add `@Audited('admin.sync.trigger')` to `POST /moodle/sync`
    - Add `@Audited('admin.sync-schedule.update')` to `PUT /moodle/sync/schedule`
    - Add `@UseInterceptors(AuditInterceptor)` to tagged methods
  - Notes: Both are superadmin-only endpoints. User context available from CLS.

- [ ] Task 15: Tag questionnaire endpoints
  - File: `src/modules/questionnaires/questionnaire.controller.ts`
  - Action:
    - Add `@Audited('questionnaire.submit')` to `POST /submissions`
    - Add `@Audited('questionnaire.ingest')` to `POST /ingest`
    - Add `@Audited('questionnaire.submissions.wipe')` to `DELETE /versions/:versionId/submissions`
    - Add `@UseInterceptors(AuditInterceptor)` to tagged methods
  - Notes: Submission wipe is the highest-risk action — ensure metadata captures `versionId`. For bulk ingestion (`POST /ingest`), the `@Audited()` interceptor fires **once per HTTP request** (not per record), so this naturally produces one audit event with `metadata: { recordCount }` rather than thousands of individual events. Document this explicitly so nobody adds per-record auditing inside the ingestion engine later.

- [ ] Task 16: Tag analysis endpoints
  - File: `src/modules/analysis/analysis.controller.ts`
  - Action:
    - Add `@Audited('analysis.pipeline.create')` to `POST /pipelines`
    - Add `@Audited('analysis.pipeline.confirm')` to `POST /pipelines/:id/confirm`
    - Add `@Audited('analysis.pipeline.cancel')` to `POST /pipelines/:id/cancel`
    - Add `@UseInterceptors(AuditInterceptor)` to tagged methods

#### Phase 5: Tests

- [ ] Task 17: Unit test `AuditService`
  - File: `src/modules/audit/audit.service.spec.ts` (NEW)
  - Action: Test that `Emit()` calls `queue.add()` with correct envelope; test that Redis errors are caught and logged (not thrown)

- [ ] Task 18: Unit test `AuditProcessor`
  - File: `src/modules/audit/audit.processor.spec.ts` (NEW)
  - Action: Test that `process()` creates `AuditLog` entity with correct field mapping; test `em.fork()` is called; test malformed job data logs error

- [ ] Task 19: Unit test `AuditInterceptor`
  - File: `src/modules/audit/interceptors/audit.interceptor.spec.ts` (NEW)
  - Action: Test interceptor reads `@Audited()` metadata and calls `AuditService.Emit()` after response; test no-op when no `@Audited()` metadata; test errors in emit don't propagate

- [ ] Task 20: Update auth service tests
  - File: `src/modules/auth/auth.service.spec.ts`
  - Action: Add mock for `AuditService`; verify `Emit()` called with `auth.login.failure` on failed login

### Acceptance Criteria

#### Core Pipeline

- [ ] AC 1: Given the application starts, when the AUDIT queue is registered, then BullMQ connects to Redis and the `audit` queue is available for job dispatch
- [ ] AC 2: Given a valid `AuditJobMessage` is enqueued, when the `AuditProcessor` processes it, then an `AuditLog` row is persisted with all fields correctly mapped
- [ ] AC 3: Given the Redis connection fails during `AuditService.Emit()`, when an audited action occurs, then the error is logged but the original request completes successfully (audit never breaks the app)

#### Interceptor Path

- [ ] AC 4: Given a controller method decorated with `@Audited('auth.logout')`, when the endpoint returns a successful response, then an audit event is enqueued with `action='auth.logout'`, the current user's ID/username, and request metadata (IP, user agent)
- [ ] AC 5: Given a controller method WITHOUT `@Audited()`, when the `AuditInterceptor` is applied, then no audit event is emitted (pass-through)
- [ ] AC 6: Given the `AuditInterceptor` fails to emit (e.g., service error), when the endpoint handler succeeds, then the original response is still returned to the client

#### Direct Emit Path

- [ ] AC 7: Given a user submits invalid credentials, when the login strategy throws `UnauthorizedException`, then `AuditService.Emit()` is called with `action='auth.login.failure'`, the attempted username in metadata, and the request IP address
- [ ] AC 8: Given a user logs in successfully, when the auth service returns tokens, then `AuditService.Emit()` is called via the interceptor with `action='auth.login.success'` and the authenticated user's ID

#### Entity Integrity

- [ ] AC 9: Given the `audit_log` table exists, when a query is run without `filters: { softDelete: false }`, then the global soft-delete filter does not exclude audit records (entity has no `deletedAt` field, but queries must still bypass the filter)
- [ ] AC 10: Given an `AuditLog` record is created, then it has no `updatedAt` or `deletedAt` fields — it is immutable and append-only

#### MVP Endpoint Coverage

- [ ] AC 11: Given the MVP is complete, when inspecting the codebase, then the following endpoints have `@Audited()` decorators: `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `POST /moodle/sync`, `PUT /moodle/sync/schedule`, `POST /questionnaires/submissions`, `POST /questionnaires/ingest`, `DELETE /questionnaires/versions/:id/submissions`, `POST /analysis/pipelines`, `POST /analysis/pipelines/:id/confirm`, `POST /analysis/pipelines/:id/cancel`

## Additional Context

### Dependencies

- `@nestjs/bullmq` / `bullmq` (already installed)
- `nestjs-cls` (already installed)
- Redis (already running via docker-compose)
- No new external dependencies required

### Testing Strategy

**Unit Tests (NestJS TestingModule + Jest):**

- `audit.service.spec.ts` — Test `Emit()` enqueues correct envelope to AUDIT queue; test error handling for Redis connection failures
- `audit.processor.spec.ts` — Test `process()` persists `AuditLog` entity with correct fields via `em.fork().persistAndFlush()`; test malformed job data handling
- `audit.interceptor.spec.ts` — Test interceptor reads `@Audited()` metadata, calls `AuditService.Emit()` post-response with correct action/context; test no-op when decorator is absent

**Integration Points (existing test files to update):**

- `auth.service.spec.ts` — Verify `AuditService.Emit()` is called on login success, login failure, logout, and refresh
- Controller tests — Verify `@Audited()` decorator is present on tagged endpoints (metadata reflection test)

### Notes

**High-Risk Items:**

- **Global soft-delete filter bypass**: `AuditLog` has no `deletedAt` field, but the global MikroORM filter in `mikro-orm.config.ts` applies to all entities. Any direct query on `AuditLog` must use `filters: { softDelete: false }`. The processor's `em.fork()` handles writes fine, but future read queries must remember this.
- **Auth service coupling**: Injecting `AuditService` into `AuthService` creates a new dependency. If the audit module fails to load (e.g., Redis down at startup), it could block auth. Ensure `AuditService.Emit()` is fully fire-and-forget with try/catch.
- **CLS context availability**: `RequestMetadataService` is populated by `MetaDataInterceptor`. If a controller doesn't use that interceptor, IP/userAgent will be null. Verify all MVP controllers have the metadata interceptor applied.

**Known Limitations:**

- Auth failure auditing captures the attempted username from the DTO but cannot resolve to a user ID (user may not exist).
- No before/after diffs on entity mutations — only the action and resource ID are recorded.
- Audit logs grow unbounded — no retention policy in MVP.

**Future Considerations (out of scope):**

- Admin query endpoint with filtering by action, actor, date range, resource type
- Retention/archival job (similar to `RefreshTokenCleanupJob` pattern)
- Before/after entity snapshots using MikroORM lifecycle hooks
- Broader CRUD auditing via global interceptor
- Export to external log aggregation (ELK, Datadog, etc.)
