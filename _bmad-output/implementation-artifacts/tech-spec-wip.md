---
title: 'Audit Trail MVP'
slug: 'audit-trail-mvp'
created: '2026-03-29'
status: 'in-progress'
stepsCompleted: [1, 2]
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

_To be populated in Step 2 (Deep Investigation)_

### Acceptance Criteria

_To be populated in Step 3 (Generate)_

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

- Auth failure auditing requires the direct emit path since there is no authenticated user in CLS context.
- The `metadata` JSONB field should be typed loosely (`Record<string, unknown>`) to accommodate varying action payloads.
- No query endpoint in MVP — audit logs are write-only. Read access can be added in a future iteration.
