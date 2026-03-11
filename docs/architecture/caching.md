# Caching Layer

This document describes the caching architecture used in `api.faculytics`, including the cache service abstraction, namespace-based invalidation, and integration points.

## 1. Overview

The caching layer provides a thin abstraction (`CacheService`) over NestJS `CacheModule` with namespace-aware key tracking for targeted invalidation. It supports both **Redis** (production) and **in-memory** (development/testing) stores transparently.

## 2. Technology Stack

- **Cache Framework:** `@nestjs/cache-manager` v3 + `cache-manager` v7
- **Redis Adapter:** `@keyv/redis` (Keyv-compatible adapter required by cache-manager v7)
- **Fallback:** In-memory store when `REDIS_URL` is not configured

## 3. Architecture

### CacheService (`src/modules/common/cache/cache.service.ts`)

A wrapper around `CACHE_MANAGER` that adds namespace-aware key tracking and logging.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Controller  │────▶│   Service    │────▶│ CacheService │
│              │     │              │     │              │
│              │     │  wrap()      │     │  get/wrap    │──▶ Redis / Memory
│              │     │              │     │  invalidate  │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Key design decisions:**

- **`wrap(namespace, suffix, fn, ttlMs)`** — Checks cache first (logs HIT/MISS), delegates to `cache.wrap()` on miss for atomic get-or-set with coalescing
- **`invalidateNamespace(namespace)`** — Deletes all tracked keys for a namespace via `cache.del()`, then clears the tracking set
- **In-memory `keyRegistry: Map<CacheNamespace, Set<string>>`** — Lightweight, bounded (small number of cached endpoints), works identically for both Redis and in-memory stores
- On app restart, the registry is empty but stale keys simply expire via TTL — no correctness issue

### CacheNamespace (`src/modules/common/cache/cache-namespaces.ts`)

```typescript
enum CacheNamespace {
  QUESTIONNAIRE_TYPES = 'q-types',
  QUESTIONNAIRE_VERSIONS = 'q-versions',
  ENROLLMENTS_ME = 'enrollments-me',
}
```

## 4. What is Cached

| Endpoint                                   | Cache Key Pattern                        | TTL    | Rationale                                                         |
| ------------------------------------------ | ---------------------------------------- | ------ | ----------------------------------------------------------------- |
| `GET /enrollments/me`                      | `enrollments-me:{userId}:{page}:{limit}` | 30 min | Read-heavy, per-user. Only mutated by hourly `EnrollmentSyncJob`. |
| `GET /questionnaires/types`                | `q-types:all`                            | 1 hour | Rarely changes (admin-only operations).                           |
| `GET /questionnaires/types/:type/versions` | `q-versions:{type}`                      | 1 hour | Only changes on version CRUD.                                     |

**Not cached:** health (trivial), moodle endpoints (external proxy), chatkit (real-time streaming), drafts (frequently mutated per-user), auth/me (user loaded by guard every request).

## 5. Cache Invalidation

| Namespace                | Invalidated By                                                    | Location                                                       |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `ENROLLMENTS_ME`         | `EnrollmentSyncJob` after successful sync                         | `src/crons/jobs/enrollment-jobs/enrollment-sync.job.ts`        |
| `QUESTIONNAIRE_TYPES`    | `createQuestionnaire()`, `PublishVersion()`, `DeprecateVersion()` | `src/modules/questionnaires/services/questionnaire.service.ts` |
| `QUESTIONNAIRE_VERSIONS` | `CreateVersion()`, `PublishVersion()`, `DeprecateVersion()`       | `src/modules/questionnaires/services/questionnaire.service.ts` |

## 6. Configuration

| Environment Variable | Default       | Description                                                        |
| -------------------- | ------------- | ------------------------------------------------------------------ |
| `REDIS_URL`          | _(none)_      | Redis connection URL. If unset, falls back to in-memory cache.     |
| `REDIS_KEY_PREFIX`   | `faculytics:` | Namespace prefix for Redis keys.                                   |
| `REDIS_CACHE_TTL`    | `60`          | Default TTL in seconds (applied when no per-key TTL is specified). |

## 7. Observability

The `CacheService` logs at `LOG` level for all cache operations:

- **`Cache HIT for key "enrollments-me:abc:1:10"`** — Served from cache
- **`Cache MISS for key "enrollments-me:abc:1:10"`** — Fetched from database and cached
- **`Invalidated 3 key(s) in namespace "enrollments-me"`** — Keys cleared after data mutation

## 8. Adding a New Cached Endpoint

1. Add a new value to `CacheNamespace` in `cache-namespaces.ts`
2. Wrap the service method: `this.cacheService.wrap(NAMESPACE, suffix, () => fetchFn(), ttlMs)`
3. Add invalidation calls after mutations: `this.cacheService.invalidateNamespace(NAMESPACE)`
4. Add `CacheService` mock to any affected test files
