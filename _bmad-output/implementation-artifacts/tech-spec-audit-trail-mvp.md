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
  - 'src/entities/index.entity.ts'
  - 'src/modules/audit/audit.module.ts (NEW)'
  - 'src/modules/audit/audit.service.ts (NEW)'
  - 'src/modules/audit/audit.processor.ts (NEW)'
  - 'src/modules/audit/audit-action.enum.ts (NEW)'
  - 'src/modules/audit/decorators/audited.decorator.ts (NEW)'
  - 'src/modules/audit/interceptors/audit.interceptor.ts (NEW)'
  - 'src/modules/audit/dto/audit-job-message.dto.ts (NEW)'
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

1. **Interceptor path** — An `@Audited({ action, resource? })` decorator on endpoints triggers an interceptor that auto-captures context (user, IP, route params) and enqueues an audit event post-response. Used for authenticated endpoints where CLS context is available.
2. **Direct emit path** — `AuditService.Emit()` called explicitly in service code for contexts where the interceptor can't capture full context (e.g., login success/failure where no JWT exists, token refresh, catch blocks).

Both paths feed the same queue, processor, and entity. Write-only pipeline for the MVP.

### Scope

**In Scope:**

- `AuditLog` entity (append-only, immutable, no soft delete)
- BullMQ `AUDIT` queue and processor (concurrency: 1)
- `AuditService` with `Emit()` method for direct emission
- `@Audited()` decorator and `AuditInterceptor` for endpoint-based capture
- 11 MVP endpoints tagged across three categories:
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
    - `browserName: string` — nullable
    - `os: string` — nullable
    - `ipAddress: string` — nullable
    - `occurredAt: Date` — `@Index()`, default `new Date()`
  - Notes: No `updatedAt`, no `deletedAt`. Add comment on the entity class: "Audit records are never soft-deleted. Queries must use `filters: { softDelete: false }` to bypass the global filter. See SyncLog for precedent." No custom repository for MVP — follows `SyncLog` pattern which uses `filters: { softDelete: false }` at call sites.

- [ ] Task 3: Register entity in entity index
  - File: `src/entities/index.entity.ts`
  - Action: Export `AuditLog` from the entity barrel file AND add it to the `entities` array (used by MikroORM for schema discovery/migrations). Without this, `npx mikro-orm migration:create` will not detect the new entity.

- [ ] Task 4: Create database migration
  - Command: `npx mikro-orm migration:create`
  - Action: Create `audit_log` table with all columns from Task 2. Add index on `occurred_at`. Add index on `action`.
  - Notes: Run `npx mikro-orm migration:create` after entity is created, verify generated SQL

- [ ] Task 5: Create `AuditProcessor`
  - File: `src/modules/audit/audit.processor.ts` (NEW)
  - Action: Create processor that extends `WorkerHost` (NOT `BaseAnalysisProcessor`):
    - `@Processor(QueueName.AUDIT, { concurrency: 1 })`
    - Inject `EntityManager`
    - `process(job: Job<AuditJobMessage>)`: extract fields from job data, create `AuditLog` entity, **set `occurredAt` from the job payload** (not `new Date()` — the entity default is only a safety net; the payload timestamp reflects actual event time, not delayed queue processing time), `em.fork().persistAndFlush()`
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
      browserName?: string;
      os?: string;
      ipAddress?: string;
      occurredAt: string; // ISO timestamp
    }
    ```
  - Notes: Interface only — no Zod schema needed. The audit data comes from the trusted `AuditService.Emit()` call (internal), not from external input. Adding Zod validation in the processor would be dead code.

#### Phase 2: Service + Decorator + Interceptor

- [ ] Task 7: Create `AuditService`
  - File: `src/modules/audit/audit.service.ts` (NEW)
  - Action: Create service with:
    - `@InjectQueue(QueueName.AUDIT) private readonly auditQueue: Queue`
    - `async Emit(params: { action: string; actorId?: string; actorUsername?: string; resourceType?: string; resourceId?: string; metadata?: Record<string, unknown>; browserName?: string; os?: string; ipAddress?: string }): Promise<void>`
    - Build envelope with `occurredAt: new Date().toISOString()`
    - Enqueue via `this.auditQueue.add('audit', envelope, { attempts: 1, removeOnComplete: true, removeOnFail: 100 })`
    - Wrap in try/catch — audit failures MUST NOT break the request. Log with `Logger.warn` including the **full emission params** (action, actorId, actorUsername, resourceType, resourceId, metadata) so failed emissions preserve the audit data in application logs as a last line of defense.
  - Notes: Fire-and-forget. Set `attempts: 1` on job options (no retries). Audit inserts are idempotent-safe and not critical enough to retry.

- [ ] Task 8a: Create `AuditAction` const enum
  - File: `src/modules/audit/audit-action.enum.ts` (NEW)
  - Action: Define all MVP audit actions as a const object (same pattern as `QueueName`):
    ```typescript
    export const AuditAction = {
      AUTH_LOGIN_SUCCESS: 'auth.login.success',
      AUTH_LOGIN_FAILURE: 'auth.login.failure',
      AUTH_LOGOUT: 'auth.logout',
      AUTH_TOKEN_REFRESH: 'auth.token.refresh',
      ADMIN_SYNC_TRIGGER: 'admin.sync.trigger',
      ADMIN_SYNC_SCHEDULE_UPDATE: 'admin.sync-schedule.update',
      QUESTIONNAIRE_SUBMIT: 'questionnaire.submit',
      QUESTIONNAIRE_INGEST: 'questionnaire.ingest',
      QUESTIONNAIRE_SUBMISSIONS_WIPE: 'questionnaire.submissions.wipe',
      ANALYSIS_PIPELINE_CREATE: 'analysis.pipeline.create',
      ANALYSIS_PIPELINE_CONFIRM: 'analysis.pipeline.confirm',
      ANALYSIS_PIPELINE_CANCEL: 'analysis.pipeline.cancel',
    } as const;
    export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
    ```
  - Notes: Prevents typos in action strings. All tasks referencing action strings must use this enum.

- [ ] Task 8b: Create `@Audited()` decorator
  - File: `src/modules/audit/decorators/audited.decorator.ts` (NEW)
  - Action: Create decorator using `SetMetadata` that accepts an options object:
    ```typescript
    export const AUDIT_META_KEY = 'audit:meta';
    export interface AuditedOptions {
      action: AuditAction;
      resource?: string; // e.g. 'User', 'QuestionnaireSubmission'
    }
    export const Audited = (options: AuditedOptions) => SetMetadata(AUDIT_META_KEY, options);
    ```
  - Notes: Extended from single string to options object. `resource` is optional and populates `resourceType` in the audit log. The interceptor extracts `resourceId` from the first UUID route param (`request.params`).

- [ ] Task 9: Create `AuditInterceptor`
  - File: `src/modules/audit/interceptors/audit.interceptor.ts` (NEW)
  - Action: Create NestJS interceptor:
    - Inject `Reflector`, `AuditService`, `CurrentUserService`, `RequestMetadataService`
    - In `intercept()`:
      1. Read `AUDIT_META_KEY` from handler metadata via `Reflector.get()` — returns `AuditedOptions | undefined`
      2. If no metadata, pass through (`return next.handle()`)
      3. **CRITICAL: Use RxJS `tap()` operator, NOT `finalize()`** — `tap` only fires on successful `next` emissions. `finalize` fires on both success and error, which would log failed requests as audited actions. This distinction is essential for correct login audit behavior.
      4. Return `next.handle().pipe(tap(() => { ... }))` — emit audit event **after** successful response
      5. In the `tap` callback:
         - Read user from `CurrentUserService.get()` — may be null if user interceptor not applied
         - Read request metadata from `RequestMetadataService.get()` — if null, log `Logger.warn` with controller/handler name indicating missing CLS metadata
         - Extract `resourceId` from `request.params` — use the first UUID-shaped param value (regex: `/^[0-9a-f]{8}-/`), or null if none
         - Extract `resourceType` from `AuditedOptions.resource`
         - Capture `metadata` from `request.params` and `request.query` (shallow merge) — do NOT capture `request.body` (too large/sensitive)
         - Call `AuditService.Emit()` with action, actorId, actorUsername, resourceType, resourceId, metadata, browserName, os, ipAddress
      6. Wrap the entire `tap` callback in try/catch — errors must be logged, never propagated to the response

#### Phase 3: Module Wiring

- [ ] Task 10: Create `AuditModule` (global)
  - File: `src/modules/audit/audit.module.ts` (NEW)
  - Action: Create **global** module — audit is a cross-cutting concern (same pattern as `JwtModule`, `CacheModule`):
    ```typescript
    @Global()
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
  - Notes: `@Global()` makes `AuditService` and `AuditInterceptor` injectable in all modules without explicit imports. This avoids adding `AuditModule` to every host module (`AuthModule`, `MoodleModule`, `QuestionnaireModule`, `AnalysisModule`).

- [ ] Task 11: Register `AuditModule` in application modules
  - File: `src/modules/index.module.ts`
  - Action: Import `AuditModule` and add to `ApplicationModules` array

#### Phase 4: Tag MVP Endpoints

- [ ] Task 12: Tag auth logout endpoint (interceptor path)
  - File: `src/modules/auth/auth.controller.ts`
  - Action:
    - Add `@Audited({ action: AuditAction.AUTH_LOGOUT, resource: 'User' })` to `POST /logout` handler
    - Add `@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor, AuditInterceptor)` to the `POST /logout` method — **ordering matters**: metadata first, user second, audit last
  - Notes: Only logout uses the interceptor path for auth. Login (success + failure) and refresh use direct emit (Task 13) because there is no authenticated user in CLS for login, and `CurrentUserInterceptor` is not wired for refresh.

- [ ] Task 13: Add direct audit emit for auth events (login success, login failure, token refresh)
  - File: `src/modules/auth/auth.service.ts`
  - Action:
    - Inject `AuditService` using `@Optional()` decorator — if the audit module fails to initialize (e.g., Redis down at startup), auth still works. Guard all `Emit()` calls with `this.auditService?.Emit(...)` (optional chaining).
    - **Login failure**: Inside the `if (!strategy)` block (around line 51), BEFORE the `throw new UnauthorizedException()`, call `this.auditService?.Emit({ action: AuditAction.AUTH_LOGIN_FAILURE, metadata: { username, reason: 'no_matching_strategy' }, browserName, os, ipAddress })`. Also wrap `strategy.Execute()` in a try/catch and emit with `reason: error.message` on failure before re-throwing.
    - **Login success**: After successful strategy execution and token generation, call `this.auditService?.Emit({ action: AuditAction.AUTH_LOGIN_SUCCESS, actorId: user.id, actorUsername: user.username, metadata: { strategyUsed: strategy.constructor.name }, browserName, os, ipAddress })`.
    - **Token refresh**: After successful token refresh, call `this.auditService?.Emit({ action: AuditAction.AUTH_TOKEN_REFRESH, actorId: user.id, actorUsername: user.username, browserName, os, ipAddress })`.
    - Pull IP/userAgent from `RequestMetadataService.get()` for all three.
  - Notes: `actorId`/`actorUsername` will be undefined for failed logins. `RequestMetadataService` IS available since `MetaDataInterceptor` runs before auth logic. The `@Optional()` injection with optional chaining prevents audit from being a hard dependency of auth.

- [ ] Task 14: Tag moodle sync endpoints
  - File: `src/modules/moodle/controllers/moodle-sync.controller.ts`
  - Action:
    - Add `@Audited({ action: AuditAction.ADMIN_SYNC_TRIGGER, resource: 'SyncLog' })` to `POST /moodle/sync`
    - Add `@Audited({ action: AuditAction.ADMIN_SYNC_SCHEDULE_UPDATE, resource: 'SystemConfig' })` to `PUT /moodle/sync/schedule`
    - Add `@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor, AuditInterceptor)` to each tagged method — **ordering: metadata, user, audit**
  - Notes: Both are superadmin-only endpoints. `MetaDataInterceptor` and `CurrentUserInterceptor` may not already be applied to these methods — verify and add if missing. `POST /moodle/sync` already has `CurrentUserInterceptor` but NOT `MetaDataInterceptor`. `PUT /moodle/sync/schedule` has neither.

- [ ] Task 15: Tag questionnaire endpoints
  - File: `src/modules/questionnaires/questionnaire.controller.ts`
  - Action:
    - Add `@Audited({ action: AuditAction.QUESTIONNAIRE_SUBMIT, resource: 'QuestionnaireSubmission' })` to `POST /submissions`
    - Add `@Audited({ action: AuditAction.QUESTIONNAIRE_INGEST, resource: 'QuestionnaireSubmission' })` to `POST /ingest`
    - Add `@Audited({ action: AuditAction.QUESTIONNAIRE_SUBMISSIONS_WIPE, resource: 'QuestionnaireSubmission' })` to `DELETE /versions/:versionId/submissions`
    - Add `@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor, AuditInterceptor)` to each tagged method — **ordering: metadata, user, audit**
  - Notes: Verify `MetaDataInterceptor` and `CurrentUserInterceptor` are applied — they are NOT currently on these endpoints. Submission wipe is the highest-risk action. For bulk ingestion (`POST /ingest`), the interceptor fires **once per HTTP request** (not per record) — one audit event with route params, not thousands. `POST /ingest` is accessible by 4 roles (SUPER_ADMIN, ADMIN, DEAN, CHAIRPERSON), not just superadmin. Document this explicitly so nobody adds per-record auditing inside the ingestion engine later.

- [ ] Task 16: Tag analysis endpoints
  - File: `src/modules/analysis/analysis.controller.ts`
  - Action:
    - Add `@Audited({ action: AuditAction.ANALYSIS_PIPELINE_CREATE, resource: 'AnalysisPipeline' })` to `POST /pipelines`
    - Add `@Audited({ action: AuditAction.ANALYSIS_PIPELINE_CONFIRM, resource: 'AnalysisPipeline' })` to `POST /pipelines/:id/confirm`
    - Add `@Audited({ action: AuditAction.ANALYSIS_PIPELINE_CANCEL, resource: 'AnalysisPipeline' })` to `POST /pipelines/:id/cancel`
    - Add `@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor, AuditInterceptor)` to each tagged method — **ordering: metadata, user, audit**
  - Notes: Verify `MetaDataInterceptor` and `CurrentUserInterceptor` are applied — `AnalysisController` currently has neither on any endpoint.

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
  - Action: Add mock for `AuditService`; verify `Emit()` called with `auth.login.failure` on failed login; add test case where `AuditService` is `undefined` (not provided via `@Optional()`) and verify login/logout still completes without throwing

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
- [ ] AC 8: Given a user logs in successfully, when the auth service returns tokens, then `AuditService.Emit()` is called via the **direct emit path** inside `AuthService` with `action=AuditAction.AUTH_LOGIN_SUCCESS`, the authenticated user's ID/username, and the strategy used in metadata

#### Entity Integrity

- [ ] AC 9: Given the `audit_log` table exists, when a query is run without `filters: { softDelete: false }`, then the global soft-delete filter does not exclude audit records (entity has no `deletedAt` field, but queries must still bypass the filter)
- [ ] AC 10: Given an `AuditLog` record is created, then it has no `updatedAt` or `deletedAt` fields — it is immutable and append-only

#### MVP Endpoint Coverage

- [ ] AC 11: Given the MVP is complete, when inspecting the codebase, then: `POST /auth/logout`, `POST /moodle/sync`, `PUT /moodle/sync/schedule`, `POST /questionnaires/submissions`, `POST /questionnaires/ingest`, `DELETE /questionnaires/versions/:id/submissions`, `POST /analysis/pipelines`, `POST /analysis/pipelines/:id/confirm`, `POST /analysis/pipelines/:id/cancel` have `@Audited()` decorators (interceptor path); and `POST /auth/login` (success + failure) and `POST /auth/refresh` use direct `AuditService.Emit()` calls (direct emit path)

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
- `audit.interceptor.spec.ts` — Test interceptor reads `@Audited()` metadata, calls `AuditService.Emit()` post-response with correct action/context/resource; test no-op when decorator is absent; test that when `RequestMetadataService.get()` returns null, a `Logger.warn` fires but the audit event still emits with null IP/browser/OS; test that route params are captured in metadata; test that `tap()` does NOT fire on error responses

**Integration Points (existing test files to update):**

- `auth.service.spec.ts` — Verify `AuditService.Emit()` is called on login success (with user ID and strategy name), login failure (with username and reason), and token refresh (with user ID)
- Controller tests — Verify `@Audited()` decorator is present on tagged endpoints (metadata reflection test)

### Notes

**High-Risk Items:**

- **Global soft-delete filter bypass**: `AuditLog` has no `deletedAt` field, but the global MikroORM filter in `mikro-orm.config.ts` applies to all entities. Any direct query on `AuditLog` must use `filters: { softDelete: false }`. The processor's `em.fork()` handles writes fine, but future read queries must remember this.
- **Auth service coupling**: Injecting `AuditService` into `AuthService` creates a new dependency. If the audit module fails to load (e.g., Redis down at startup), it could block auth. Ensure `AuditService.Emit()` is fully fire-and-forget with try/catch.
- **CLS context availability**: `RequestMetadataService` is populated by `MetaDataInterceptor`. If a controller doesn't use that interceptor, IP/browser/OS will be null. All MVP endpoints now explicitly include `MetaDataInterceptor` and `CurrentUserInterceptor` in their interceptor stacks (Tasks 12, 14-16).
- **Test environment Redis**: Any test that imports `AuditModule` (directly or transitively) will attempt to connect to Redis via BullMQ. Unit tests should mock the queue; integration/E2E tests need Redis running (already required for other queues in the test environment).

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
