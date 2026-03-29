# Audit Trail

The `AuditModule` provides an append-only audit log for security-sensitive actions. It captures who did what, when, and from where — for compliance, incident investigation, and operational accountability.

## Architecture

```mermaid
flowchart LR
    subgraph Interceptor Path
        A["@Audited() decorator"] --> B[AuditInterceptor]
        B -->|post-response tap| C[AuditService.Emit]
    end

    subgraph Direct Emit Path
        D[AuthService] -->|fire-and-forget| C
    end

    C -->|enqueue| E[AUDIT queue]
    E --> F[AuditProcessor]
    F -->|em.fork + create + flush| G[(audit_log table)]
```

### Two Emission Paths

| Path            | When                                                                                | Context Source                                                                 |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Interceptor** | Standard authenticated endpoints (logout, sync, submissions, pipelines)             | CLS (`CurrentUserService`, `RequestMetadataService`) with JWT payload fallback |
| **Direct emit** | Auth events where CLS context is unavailable (login success/failure, token refresh) | Explicit params from `AuthService`                                             |

Both paths feed the same `AuditService.Emit()` method, which enqueues a job to the `AUDIT` BullMQ queue.

## AuditLog Entity

Append-only, immutable. Does **not** extend `CustomBaseEntity` (no `updatedAt`, no `deletedAt`). Follows the `SyncLog` precedent.

| Column          | Type               | Notes                                                                                             |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `id`            | `varchar` PK       | UUID v4, auto-generated                                                                           |
| `action`        | `varchar`          | Indexed. Dot-notation action code (e.g., `auth.login.success`)                                    |
| `actorId`       | `varchar` nullable | Indexed. Plain string, **not** a FK — survives user deletion                                      |
| `actorUsername` | `varchar` nullable | Denormalized for historical accuracy                                                              |
| `resourceType`  | `varchar` nullable | Entity name (e.g., `User`, `AnalysisPipeline`)                                                    |
| `resourceId`    | `varchar` nullable | UUID of affected resource                                                                         |
| `metadata`      | `jsonb` nullable   | Action-specific details (capped at 4KB from interceptor)                                          |
| `browserName`   | `varchar` nullable | From `MetaDataInterceptor` via CLS                                                                |
| `os`            | `varchar` nullable | From `MetaDataInterceptor` via CLS                                                                |
| `ipAddress`     | `varchar` nullable | From `x-forwarded-for` or socket                                                                  |
| `occurredAt`    | `timestamptz`      | Indexed. Set from job payload (event time, not processing time). DB default `now()` as safety net |

Queries must use `filters: { softDelete: false }` to bypass the global soft-delete filter.

## MVP Actions

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
```

## Interceptor Path Detail

Endpoints are tagged with the `@Audited({ action, resource? })` decorator, which sets Reflector metadata. The `AuditInterceptor` reads this metadata and, on successful response (RxJS `tap`, not `finalize`), enqueues an audit event.

Interceptor ordering matters: `MetaDataInterceptor` (IP/browser/OS) must run before `AuditInterceptor`. When `CurrentUserInterceptor` is present, it runs between them to populate the CLS user.

```typescript
@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor, AuditInterceptor)
```

The interceptor extracts `resourceId` from route params using a UUID v4 regex heuristic. Metadata captures route params and query params (not request body), capped at 4KB.

## Direct Emit Path Detail

Used in `AuthService` for login success, login failure, and token refresh. These events occur before JWT authentication is established, so CLS user context is unavailable.

- **Login success**: Emitted after the transaction returns, with `actorId`, `actorUsername`, and `strategyUsed` metadata.
- **Login failure**: Emitted after the transaction rejects, with `username` and a sanitized `reason` code (`no_matching_strategy` or `strategy_execution_failed`). Raw error messages are never persisted.
- **Token refresh**: Emitted after the transaction returns, with `actorId` and `actorUsername`.

All direct emits use `void this.auditService?.Emit(...)` — fire-and-forget, never inside a transaction.

## Queue & Processor

| Property           | Value                             |
| ------------------ | --------------------------------- |
| Queue name         | `audit`                           |
| Concurrency        | 1                                 |
| Retry attempts     | 1 (no retries)                    |
| `removeOnComplete` | `true`                            |
| `removeOnFail`     | 100 (keep last 100 for debugging) |

The `AuditProcessor` extends `WorkerHost` directly (no HTTP dispatch). It forks the `EntityManager`, creates an `AuditLog` entity, and flushes. The `@OnWorkerEvent('failed')` handler logs non-PII fields only (no `metadata`).

## Module Design

`AuditModule` is `@Global()` — the only application module using this decorator. This makes `AuditService` and `AuditInterceptor` injectable everywhere without explicit imports. Justified because audit is a cross-cutting concern consumed by many modules.

`AuditService` is injected with `@Optional()` in `AuthService` to avoid making audit a hard dependency of authentication. All `Emit()` calls use optional chaining.

## Error Handling

Audit failures never break the request:

1. `AuditService.Emit()` wraps `queue.add()` in try/catch — logs a warning, returns void.
2. `AuditInterceptor` wraps the entire `tap` callback in try/catch — errors are logged, never propagated.
3. The `.catch()` on the `Emit()` promise handles async rejections.
