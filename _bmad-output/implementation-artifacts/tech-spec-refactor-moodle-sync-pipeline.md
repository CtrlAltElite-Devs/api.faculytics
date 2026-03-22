---
title: 'Refactor Moodle Sync Pipeline'
slug: 'refactor-moodle-sync-pipeline'
created: '2026-03-21'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [NestJS v11, MikroORM v6.6.6, BullMQ, Redis, PostgreSQL, p-limit, Zod]
files_to_modify:
  - src/configurations/env/moodle.env.ts
  - src/modules/moodle/services/moodle-course-sync.service.ts
  - src/modules/moodle/services/moodle-enrollment-sync.service.ts
  - src/modules/moodle/services/moodle-category-sync.service.ts
  - src/modules/moodle/services/moodle-startup.service.ts (new)
  - src/modules/moodle/processors/moodle-sync.processor.ts (new)
  - src/modules/moodle/schedulers/moodle-sync.scheduler.ts (new)
  - src/modules/moodle/controllers/moodle-sync.controller.ts (new — do NOT register old moodle.controller.ts)
  - src/modules/moodle/moodle.module.ts
  - src/app.module.ts
  - src/crons/index.jobs.ts
  - src/crons/jobs/category-jobs/category-sync.job.ts (delete)
  - src/crons/jobs/course-jobs/course-sync.job.ts (delete)
  - src/crons/jobs/enrollment-jobs/enrollment-sync.job.ts (delete)
  - .env.sample
code_patterns:
  - pLimit concurrency (ingestion-engine.service.ts:2,42)
  - BullMQ WorkerHost direct extend (recommendations.processor.ts)
  - BullMQ queue registration (analysis.module.ts:28-33)
  - Queue injection (@InjectQueue decorator)
  - Zod env schema (bullmq.env.ts)
  - tx.create managed false before upsert (project-context.md:60)
  - UnitOfWork transactional pattern
  - UseJwtGuard with roles (security/decorators/index.ts)
test_patterns:
  - Unit tests colocated with source (.spec.ts suffix)
  - Jest mocks for repositories and UnitOfWork
  - No existing sync service tests
---

# Tech-Spec: Refactor Moodle Sync Pipeline

**Created:** 2026-03-21

## Overview

### Problem Statement

The Moodle institutional sync pipeline uses three independent cron jobs (`CategorySyncJob`, `CourseSyncJob`, `EnrollmentSyncJob`) with sequential HTTP calls, N+1 database queries, and individual upserts. At the current scale of ~60 users and a handful of courses, `SYNC_ON_STARTUP` already takes noticeably long. The architecture doesn't scale — at 5k users with 80+ courses, the sequential approach would produce 48,000+ SQL statements and 80+ sequential HTTP round-trips per sync cycle. Additionally, there is no on-demand sync trigger, forcing developers to toggle env vars and restart the app to get fresh Moodle data during development.

### Solution

Unify the three sync cron jobs into a single BullMQ-based composite job with bounded HTTP concurrency (`pLimit`), batch upserts (`upsertMany`), and a manual `POST /moodle/sync` endpoint. Preserve existing startup behavior via a dedicated `MoodleStartupService` that calls sync services directly (blocking).

### Scope

**In Scope:**

- `MOODLE_SYNC_CONCURRENCY` env var (default 3)
- `pLimit` concurrency in course sync (`syncAllPrograms`) and enrollment sync (`syncAllCourses`)
- `upsertMany` batch operations + eliminate `findOneOrFail` N+1 in enrollment sync
- Cache parent entities in category hierarchy rebuild (in-memory Maps)
- `MoodleSyncProcessor` — single BullMQ processor: categories -> courses -> enrollments
- `MoodleSyncScheduler` — hourly `@Cron` that enqueues a composite sync job
- `POST /moodle/sync` — superadmin-only endpoint, enqueues same BullMQ job, returns `{ jobId }`
- `MoodleStartupService` — blocking startup orchestrator with timing/status logging
- Remove `CategorySyncJob`, `CourseSyncJob`, `EnrollmentSyncJob`
- Update `AppModule` bootstrap to use `MoodleStartupService`

**Out of Scope:**

- `GET /moodle/sync/:jobId` status endpoint (separate ticket)
- `MoodleUserHydrationService` optimization (login-time, different concern)
- `RefreshTokenCleanupJob` changes (stays on `BaseJob` pattern)
- Migrating non-sync cron jobs to BullMQ

## Context for Development

### Codebase Patterns

- **Env var concurrency**: `BULLMQ_SENTIMENT_CONCURRENCY` in `src/configurations/env/bullmq.env.ts` — `z.coerce.number().default(3)`
- **pLimit usage**: `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts:2,42` — `import pLimit from 'p-limit'; const limit = pLimit(6);`
- **Entity initialization before upsert**: `tx.create(Entity, data, { managed: false })` — required per `project-context.md:60` to trigger property initializers
- **UnitOfWork transactions**: `unitOfWork.runInTransaction(async (tx) => { ... })` — all multi-step DB ops wrapped
- **BullMQ processors**: `src/modules/analysis/processors/` — existing pattern for queue-based job processing
- **Idempotent upserts**: Use external IDs (e.g., `moodleUserId`) as `onConflictFields`, exclude `id` and `createdAt` from merge fields
- **PascalCase public methods**: Service methods use PascalCase per project convention

### Files to Reference

| File                                                                             | Purpose                                                                                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/modules/moodle/services/moodle-enrollment-sync.service.ts`                  | Primary optimization target — sequential HTTP, N+1, individual upserts                                     |
| `src/modules/moodle/services/moodle-course-sync.service.ts`                      | Sequential HTTP calls per program                                                                          |
| `src/modules/moodle/services/moodle-category-sync.service.ts`                    | Parent entity lookups via `findOneOrFail` per depth level                                                  |
| `src/modules/moodle/moodle.service.ts`                                           | Moodle API facade — creates new `MoodleClient` per call                                                    |
| `src/modules/moodle/moodle.controller.ts`                                        | OLD controller — 7 unguarded endpoints, DO NOT register. Stays orphaned.                                   |
| `src/modules/moodle/controllers/moodle-sync.controller.ts`                       | NEW controller for `POST /moodle/sync` only                                                                |
| `src/modules/common/cache/cache.service.ts`                                      | CacheService — needed for `ENROLLMENTS_ME` invalidation after enrollment sync                              |
| `src/modules/common/cache/cache-namespaces.ts`                                   | `CacheNamespace.ENROLLMENTS_ME` constant                                                                   |
| `src/modules/moodle/services/moodle-sync.service.ts`                             | EXISTING `MoodleSyncService` — user-context hydration on login. NOT the same as new `MoodleStartupService` |
| `src/modules/moodle/moodle.module.ts`                                            | Module definition — needs queue registration, controller registration, new providers                       |
| `src/modules/moodle/lib/moodle.client.ts`                                        | HTTP client with 10s timeout, `MoodleConnectivityError`                                                    |
| `src/crons/jobs/category-jobs/category-sync.job.ts`                              | To be deleted — extends `BaseJob`, `@Cron(EVERY_30_MINUTES)`                                               |
| `src/crons/jobs/course-jobs/course-sync.job.ts`                                  | To be deleted — extends `BaseJob`, `@Cron(EVERY_HOUR)`                                                     |
| `src/crons/jobs/enrollment-jobs/enrollment-sync.job.ts`                          | To be deleted — extends `BaseJob`, `@Cron(EVERY_HOUR)`                                                     |
| `src/crons/base.job.ts`                                                          | Abstract base class — stays for `RefreshTokenCleanupJob`                                                   |
| `src/crons/index.jobs.ts`                                                        | `AllCronJobs` array — remove 3 sync jobs                                                                   |
| `src/crons/startup-job-registry.ts`                                              | Static registry — stays for non-sync jobs                                                                  |
| `src/app.module.ts`                                                              | Bootstrap — swap sync job refs for `MoodleStartupService`                                                  |
| `src/configurations/env/moodle.env.ts`                                           | Add `MOODLE_SYNC_CONCURRENCY`                                                                              |
| `src/modules/analysis/processors/recommendations.processor.ts`                   | Reference: `WorkerHost` direct extend pattern (no HTTP worker)                                             |
| `src/modules/analysis/analysis.module.ts:28-33`                                  | Reference: `BullModule.registerQueue()` pattern                                                            |
| `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts:2,42` | Reference: `pLimit` import and usage                                                                       |
| `src/configurations/env/bullmq.env.ts`                                           | Reference: concurrency env var pattern                                                                     |
| `src/security/decorators/index.ts`                                               | Reference: `UseJwtGuard(UserRole.SUPER_ADMIN)` pattern                                                     |
| `src/modules/common/unit-of-work/index.ts`                                       | Reference: `runInTransaction()` wrapper                                                                    |

### Technical Decisions

- **Concurrency default 3**: Conservative for self-hosted Moodle shared across staging/production environments
- **Single composite job**: Categories, courses, enrollments always run in sequence within one BullMQ job — ordering dependency naturally expressed as sequential calls
- **Startup stays blocking**: Direct service calls with `await`, NOT via BullMQ — app must have data before accepting HTTP traffic
- **Startup behavior preserved**: Categories always sync on boot; courses + enrollments gated by `SYNC_ON_STARTUP` (default `false`)
- **Cron + manual share BullMQ queue**: `concurrency: 1` prevents overlap; cron `isRunning` flags become unnecessary
- **No cross-concern locking**: BullMQ queue handles manual vs cron overlap; startup runs before BullMQ workers are active, so no conflict
- **Processor extends `WorkerHost` directly**: Like `RecommendationsProcessor` — no HTTP worker dispatch, just internal service calls
- **New sync controller, NOT the old one**: The existing `moodle.controller.ts` has 7 unguarded Moodle proxy endpoints (login, getSiteInfo, etc.). Registering it would expose them as public attack surface. Create a separate `MoodleSyncController` for the sync endpoint only. Old controller stays orphaned. Controller should return 503 with `{ error: 'Sync queue unavailable' }` if `queue.add()` fails (Redis down).
- **Naming clarity**: `MoodleSyncService` (existing) handles user-context hydration on login. `MoodleStartupService` (new) handles institutional sync at boot. Different purposes despite similar names — do not confuse or rename.
- **Queue registered in `MoodleModule`**: Not in `AnalysisModule` — sync is a Moodle concern, not an analysis concern
- **`upsertMany` preserves `tx.create()` pattern**: Build array of `tx.create(Entity, data, { managed: false })` results, pass to `upsertMany`
- **`upsertMany` composite key risk**: `upsertMany` with `onConflictFields: ['user', 'course']` on Enrollment is untested in this codebase. Must write an integration test before shipping. If it fails, fall back to individual `upsert()` with captured return value (still eliminates the N+1 `findOneOrFail`). Also verify that `upsertMany` returns managed entities usable as FK references in subsequent operations. Pre-filter invalid remote users (missing required fields) before building the batch — log skipped records.
- **Scheduler error handling**: `MoodleSyncScheduler.handleScheduledSync()` must wrap `queue.add()` in try/catch with `logger.error()` — if Redis is down, the enqueue fails silently otherwise
- **Job deduplication**: Use a fixed `jobId` (e.g., `'moodle-sync-hourly'`) for cron-enqueued jobs. BullMQ silently ignores duplicate `jobId` if a job with the same ID is already waiting/active. Prevents redundant sync runs when multiple NestJS instances run the same cron.
- **Processor stall detection**: Set `stalledInterval` and `maxStalledCount` on `MoodleSyncProcessor` (same pattern as analysis processors) — defense-in-depth against hung Moodle calls that bypass the 10s timeout.
- **Job cleanup policy**: Set `removeOnComplete: true` and `removeOnFail: 50` (keep last 50 failures for debugging) on job options to prevent Redis memory growth from accumulated job records.
- **Startup logging unified**: `MoodleStartupService` should register results into `StartupJobRegistry` using the existing `record()` API, so there's one consolidated boot summary rather than two separate log outputs
- **Empty database warning**: At startup, if zero courses exist in DB and `SYNC_ON_STARTUP=false`, log a warning reminding the developer to enable it or use `POST /moodle/sync` — prevents confusion on fresh staging deploys

## Implementation Plan

### Tasks

#### Task 1: Add `MOODLE_SYNC_CONCURRENCY` env var

- File: `src/configurations/env/moodle.env.ts`
- Action: Add `MOODLE_SYNC_CONCURRENCY: z.coerce.number().min(1).max(20).default(3)` to `moodleEnvSchema`
- Notes: Follows `BULLMQ_SENTIMENT_CONCURRENCY` pattern in `bullmq.env.ts`. Update `MoodleEnv` type export.

#### Task 2: Optimize category sync — cache parent entities

- File: `src/modules/moodle/services/moodle-category-sync.service.ts`
- Action:
  - Change `processCampuses` to return `Map<number, Campus>` — capture each `tx.upsert()` return value keyed by `moodleCategoryId`
  - Change `processSemesters` to accept `campusMap: Map<number, Campus>`, look up parent from map instead of `tx.findOneOrFail(Campus, ...)`. Return `Map<number, Semester>`.
  - Change `processDepartments` to accept `semesterMap`, same pattern. Return `Map<number, Department>`.
  - Change `processPrograms` to accept `departmentMap`, same pattern.
  - Update `rebuildHierarchy` to thread maps through: `campusMap → semesterMap → departmentMap → processPrograms`
- Notes: Eliminates ~27 `findOneOrFail` SELECTs. The `categoryMap` (line 81) already exists for raw category lookups — the new maps are for the upserted normalized entities.

#### Task 3: Optimize course sync — pLimit concurrency

- File: `src/modules/moodle/services/moodle-course-sync.service.ts`
- Action:
  - Add `import pLimit from 'p-limit'` and `import { env } from 'src/configurations/env'`
  - Replace sequential `for...of` loop in `syncAllPrograms()` with `pLimit(env.MOODLE_SYNC_CONCURRENCY)` gated `Promise.all`
  - Move try/catch inside the `pLimit` closure (error isolation per program)
- Notes: Each `syncProgramCourses` already creates its own transaction via `unitOfWork.runInTransaction` — no shared mutable state.

#### Task 4: Restructure enrollment sync — 3-phase architecture

> **Critical design change:** The original approach (parallelize per-course enrollment sync with `pLimit`) causes deadlocks because the same User rows are upserted by multiple concurrent transactions. The fix is a 3-phase architecture that separates HTTP I/O, User upsert, and Enrollment upsert into distinct stages.

- File: `src/modules/moodle/services/moodle-enrollment-sync.service.ts`
- Action: Restructure `syncAllCourses()` into three phases:

  **Phase 1: Concurrent HTTP fetch (pLimit)**
  - Add `import pLimit from 'p-limit'` and env import
  - Fetch all enrollment data from Moodle concurrently using `pLimit(env.MOODLE_SYNC_CONCURRENCY)`
  - Each course: `moodleService.GetEnrolledUsersByCourse()` — pure HTTP, no DB
  - Collect results into array of `{ course, remoteUsers }` (null on failure, log error)
  - Filter out nulls (failed fetches)

  ```typescript
  async syncAllCourses() {
    const em = this.em.fork();
    const courses = await em.find(Course, { isVisible: true });
    const limit = pLimit(env.MOODLE_SYNC_CONCURRENCY);

    // Phase 1: Concurrent HTTP fetch
    const results = await Promise.all(
      courses.map((course) =>
        limit(async () => {
          try {
            const remoteUsers = await this.moodleService.GetEnrolledUsersByCourse({
              token: env.MOODLE_MASTER_KEY,
              courseId: course.moodleCourseId,
            });
            return { course, remoteUsers };
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to fetch enrollments for course ${course.moodleCourseId}: ${message}`);
            return null;
          }
        }),
      ),
    );

    const fetched = results.filter((r): r is NonNullable<typeof r> => r !== null);

    // Phase 2: Deduplicate and batch upsert all Users
    await this.syncAllUsers(fetched);

    // Phase 3: Sequential per-course enrollment upsert
    for (const { course, remoteUsers } of fetched) {
      try {
        await this.syncCourseEnrollments(course, remoteUsers);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to sync enrollments for course ${course.moodleCourseId}: ${message}`);
      }
    }
  }
  ```

  **Phase 2: Single-transaction User upsert (new private method `syncAllUsers`)**
  - Deduplicate users across all courses: build `Map<moodleUserId, MoodleEnrolledUser>` from all fetched results
  - Build user data array using `tx.create(User, { ... }, { managed: false })` per unique user
  - Single `tx.upsertMany(User, userDataList, { onConflictFields: ['moodleUserId'], onConflictMergeFields: [...] })` in one transaction
  - No deadlock risk — single transaction, single batch, no concurrent writes
  - Set `lastLoginAt: new Date()` — semantically imprecise (sync is not a login), but required because the column is NOT NULL with no default (User entity line 61-62). Preserves existing behavior. Fixing this properly requires a migration to make the column nullable — out of scope.
  - Wrap `upsertMany` in try/catch — if a `userName` unique constraint violation occurs (separate from `moodleUserId` conflict target), fall back to individual `upsert()` per user with per-user error logging. This prevents one poisoned username from nuking the entire batch.

  **Phase 3: Sequential per-course Enrollment upsert (updated `syncCourseEnrollments`)**
  - Accepts `(course, remoteUsers)` — no Moodle HTTP call (data already fetched in Phase 1)
  - Runs in its own transaction via `unitOfWork.runInTransaction()`
  - Load existing enrollments for the course (with `populate: ['user']`)
  - Load user references for this course's users: `tx.find(User, { moodleUserId: { $in: [...ids] } })` — single SELECT
  - Build enrollment data array, `upsertMany(Enrollment, ...)` — single bulk SQL
  - Build `remoteIds` Set from `remoteUsers.map(r => r.id)` for soft-deactivation comparison
  - Soft-deactivate missing enrollments: iterate `existing`, if `enrollment.user.moodleUserId` not in `remoteIds`, set `isActive = false` and `tx.persist(enrollment)` (unchanged logic from original)
  - Sequential iteration (no `pLimit`) — avoids `RequestContext`/EM isolation concerns

- Notes:
  - Phase 1 is the performance win — parallel HTTP calls, the slow part
  - Phase 2 eliminates redundant User upserts (~4x reduction at scale when users are enrolled in multiple courses)
  - Phase 3 is fast (single `upsertMany` per course) — sequential is fine
  - Memory: holds all fetched enrollment data in memory during Phase 1. At 80 courses × 200 users × ~3KB = ~48MB peak. Acceptable.
  - `moodleUserId` is optional/nullable on User entity — safe because all Moodle API users have `id`, and NULL != NULL in PostgreSQL means superadmin never conflicts
  - If `upsertMany` with composite keys (`['user', 'course']`) fails in testing (Risk #2), fall back to individual `upsert()` with captured return value in Phase 3

#### Tasks 5–9: BullMQ Infrastructure (implement as a batch — mutually dependent)

> **Note:** Tasks 5, 6, 7, and 8 create providers that depend on the queue registered in Task 9. Task 9 registers these providers in the module. Implement Task 9 first (or alongside) to avoid compilation errors. The ordering below is logical, not sequential.

#### Task 5: Create `MoodleSyncProcessor`

- File: `src/modules/moodle/processors/moodle-sync.processor.ts` (new)
- Action:
  - Create directory `src/modules/moodle/processors/`
  - Extend `WorkerHost` from `@nestjs/bullmq` (like `RecommendationsProcessor`)
  - Decorate with `@Processor('moodle-sync', { concurrency: 1, stalledInterval: env.BULLMQ_STALLED_INTERVAL_MS, maxStalledCount: env.BULLMQ_MAX_STALLED_COUNT })`
  - Inject `MoodleCategorySyncService`, `MoodleCourseSyncService`, `EnrollmentSyncService`, `CacheService`
  - `process(job: Job)`: call the three services in sequence. **After enrollment sync completes, call `this.cacheService.invalidateNamespace(CacheNamespace.ENROLLMENTS_ME)`** (migrated from deleted `EnrollmentSyncJob:43-44`). Return summary object `{ categories: true, courses: true, enrollments: true }` (set false on per-phase failure with try/catch)
  - Add `@OnWorkerEvent('failed')` and `@OnWorkerEvent('stalled')` handlers with logging
- Notes: Processor does NOT use `BaseAnalysisProcessor` — no HTTP worker dispatch. Uses `BULLMQ_STALLED_INTERVAL_MS` / `BULLMQ_MAX_STALLED_COUNT` from existing env config. Cache invalidation is critical — without it, users see stale enrollment data after sync.

#### Task 6: Create `MoodleSyncScheduler`

- File: `src/modules/moodle/schedulers/moodle-sync.scheduler.ts` (new)
- Action:
  - Create directory `src/modules/moodle/schedulers/`
  - Inject `@InjectQueue('moodle-sync') private readonly syncQueue: Queue`
  - Add `@Cron(CronExpression.EVERY_HOUR)` method `HandleScheduledSync()`
  - Wrap `queue.add()` in try/catch with `logger.error()` (Risk #4)
  - Use fixed `jobId: 'moodle-sync-scheduled'` for deduplication (Risk #9)
  - Set job options: `removeOnComplete: true`, `removeOnFail: 50` (Risk #10)
- Notes: PascalCase method name per convention. Single hourly cron replaces three separate schedules.

#### Task 7: Add `POST /moodle/sync` endpoint

- File: `src/modules/moodle/controllers/moodle-sync.controller.ts` (new)
- Action:
  - **Create a NEW controller** — do NOT register the existing `moodle.controller.ts` (it has 7 unguarded proxy endpoints that would become public attack surface — see Adversarial Review F10)
  - Create `src/modules/moodle/controllers/moodle-sync.controller.ts`
  - `@Controller('moodle')` and `@ApiTags('Moodle')`
  - Inject `@InjectQueue('moodle-sync') private readonly syncQueue: Queue`
  - Add `@Post('sync')` with `@UseJwtGuard(UserRole.SUPER_ADMIN)`
  - Method `TriggerSync()`: try `queue.add('moodle-sync', { trigger: 'manual' }, { jobId: `moodle-sync-manual-${Date.now()}`, removeOnComplete: true, removeOnFail: 50 })`, return `{ jobId: job.id }`
  - Catch `queue.add()` failure: return 503 `{ error: 'Sync queue unavailable' }` (Risk #4)
  - Add Swagger decorators (`@ApiOperation`, `@ApiBearerAuth`, `@ApiResponse`)
  - Create `TriggerSyncResponseDto` (in `src/modules/moodle/dto/responses/`): `{ jobId: string }` — used as `@ApiResponse` type and return type
- Notes: Manual trigger uses unique `jobId` (includes timestamp) so it's never deduped. Cron uses fixed `jobId` for dedup. The old `moodle.controller.ts` stays orphaned (`controllers: []`) — cleaning it up is out of scope.

#### Task 8: Create `MoodleStartupService`

- File: `src/modules/moodle/services/moodle-startup.service.ts` (new)
- Action:
  - Inject `MoodleCategorySyncService`, `MoodleCourseSyncService`, `EnrollmentSyncService`, `CacheService`, `EntityManager`
  - Public method `RunStartupSync()`:
    1. Run category sync phase (always) — timed, try/caught
    2. If `env.SYNC_ON_STARTUP`: run course sync phase, then enrollment sync phase — each timed, try/caught
    3. **After enrollment sync (if it ran): call `this.cacheService.invalidateNamespace(CacheNamespace.ENROLLMENTS_ME)`** (same as processor)
    4. Register each phase result into `StartupJobRegistry.record()` (Risk #5)
    5. After all phases: use `this.em.fork().count(Course, {})` to check for zero courses — if zero and `SYNC_ON_STARTUP=false`, log warning (Risk #1). **Must use `em.fork()` for the count query** to avoid polluting the global EM identity map.
  - Private helper `RunPhase(name, fn)`: wraps a sync call with timing (`Date.now()` delta), try/catch, returns `JobRecordType`
- Notes: Uses `StartupJobRegistry` for unified boot summary. Does NOT use BullMQ — direct blocking calls. Note: `lastLoginAt` semantic bug (sync sets it to current time as if it were a login) is a pre-existing issue — fixing requires a migration to make the column nullable. Out of scope.

#### Task 9: Update `MoodleModule`

- File: `src/modules/moodle/moodle.module.ts`
- Action:
  - Add `BullModule.registerQueue({ name: 'moodle-sync' })` to imports
  - Add `MoodleSyncProcessor`, `MoodleSyncScheduler`, `MoodleStartupService` to providers
  - Register `MoodleSyncController` in `controllers: [MoodleSyncController]` — do NOT register the old `MoodleController` (unguarded endpoints, security risk)
  - Add `MoodleStartupService` to exports (needed by `AppModule`)
- Notes: Queue registration follows `analysis.module.ts:28-33` pattern.

#### Task 10: Update `AppModule` bootstrap

- File: `src/app.module.ts`
- Action:
  - Remove constructor injections: `CategorySyncJob`, `CourseSyncJob`, `EnrollmentSyncJob`
  - Add constructor injection: `MoodleStartupService` (available via `MoodleModule` exports)
  - Update `onApplicationBootstrap()`:
    ```
    if (env.OPENAPI_MODE) return;
    await this.moodleStartupService.RunStartupSync();
    StartupJobRegistry.printSummary();
    ```
  - Do NOT add `refreshTokenCleanupJob.executeStartup()` — it does not exist in the current `AppModule`. `RefreshTokenCleanupJob` works purely through `AllCronJobs` providers and its own `@Cron` decorator. Its `runStartupTask()` returns `{ status: 'skipped' }`.
- Notes: `RefreshTokenCleanupJob` stays unchanged — no explicit injection needed. `MoodleModule` is already in `ApplicationModules` (via `index.module.ts`), so `MoodleStartupService` is injectable.

#### Task 11: Remove old sync cron jobs

- Files:
  - Delete `src/crons/jobs/category-jobs/category-sync.job.ts`
  - Delete `src/crons/jobs/course-jobs/course-sync.job.ts`
  - Delete `src/crons/jobs/enrollment-jobs/enrollment-sync.job.ts`
  - Modify `src/crons/index.jobs.ts` — remove the three sync jobs from `AllCronJobs` array
- Action: Delete files, update the barrel export. Verify `RefreshTokenCleanupJob` remains in `AllCronJobs`.
- Notes: Empty parent directories (`category-jobs/`, `course-jobs/`, `enrollment-jobs/`) can be deleted if they contain no other files.

### Acceptance Criteria

- [x] AC 1: Given `MOODLE_SYNC_CONCURRENCY=3` in `.env`, when the app starts, then `env.MOODLE_SYNC_CONCURRENCY` resolves to `3`. Given it is absent, then it defaults to `3`. Given a value of `0`, then startup fails with Zod validation error.
- [x] AC 2: Given `SYNC_ON_STARTUP=false` (default), when the app boots, then only category sync runs at startup. Courses and enrollments are NOT synced. `StartupJobRegistry` summary shows category as `executed`, courses and enrollments as `skipped`.
- [x] AC 3: Given `SYNC_ON_STARTUP=true`, when the app boots, then categories, courses, and enrollments sync in sequence (blocking). `StartupJobRegistry` summary shows all three as `executed` with timing.
- [x] AC 4: Given the app is running, when the hourly cron fires, then a `moodle-sync` job is enqueued to BullMQ. The processor executes categories → courses → enrollments in sequence.
- [x] AC 5: Given a superadmin JWT, when `POST /moodle/sync` is called, then a `moodle-sync` job is enqueued and `{ jobId }` is returned. Given a non-superadmin JWT, then 403 is returned. Given no JWT, then 401 is returned.
- [x] AC 6: Given Redis is unavailable, when `POST /moodle/sync` is called, then 503 with `{ error: 'Sync queue unavailable' }` is returned. When the hourly cron fires, the error is logged and the app continues.
- [x] AC 7: Given 20 programs in the database, when course sync runs, then Moodle HTTP calls are made with bounded concurrency (max 3 concurrent). All programs are synced. One program's failure does not abort others.
- [x] AC 8: Given 30 courses with overlapping enrolled users, when enrollment sync runs, then: (Phase 1) Moodle HTTP calls are concurrent with `pLimit`. (Phase 2) All unique users are batch-upserted in a single transaction — no deadlocks from overlapping User rows. (Phase 3) Enrollments are upserted sequentially per course via `upsertMany`. The `findOneOrFail` N+1 query is eliminated. If `upsertMany` with composite keys (`['user', 'course']`) proves unreliable, the fallback uses individual `upsert()` with captured return values.
- [x] AC 9: Given the category hierarchy has changed in Moodle, when category sync runs, then parent entities (Campus, Semester, Department) are looked up from in-memory Maps, not via `findOneOrFail` DB queries.
- [x] AC 10: Given a `moodle-sync` job is already active/waiting in BullMQ, when the hourly cron fires again, then the duplicate job is silently ignored (same `jobId`).
- [x] AC 11: Given the three old sync cron job files are deleted, when the app starts, then no errors occur. `RefreshTokenCleanupJob` still functions on its `BaseJob` schedule.
- [x] AC 12: Given `SYNC_ON_STARTUP=false` and zero courses exist in the database, when the app boots, then a warning is logged advising to enable `SYNC_ON_STARTUP` or use `POST /moodle/sync`.

## Additional Context

### Dependencies

- `p-limit` — already installed (used by ingestion engine)
- `@nestjs/bullmq` — already installed (used by analysis module)
- Redis — already in `docker-compose.yml`
- `em.upsertMany()` — available in MikroORM v6.6.6 (confirmed in `EntityManager.d.ts`), not yet used in codebase

### Testing Strategy

**Build verification:**

- `npm run build` — no type errors after all changes

**Unit tests:**

- `MoodleStartupService.spec.ts`: Mock sync services and `StartupJobRegistry`. Verify: (1) categories always sync, (2) courses/enrollments only sync when `SYNC_ON_STARTUP=true`, (3) cache invalidation after enrollment sync, (4) failed phase registers as `failed` in registry, (5) zero-courses warning when `SYNC_ON_STARTUP=false`
- `MoodleSyncScheduler.spec.ts`: Mock queue. Verify: (1) `queue.add()` called with correct jobId and options, (2) Redis failure caught and logged without throwing
- For tests that call `StartupJobRegistry.record()`: use `jest.spyOn(StartupJobRegistry, 'record').mockImplementation(() => {})` to intercept calls AND prevent real mutation of the static array (avoids state leaking across test cases)

**Integration tests (if `upsertMany` composite keys need validation):**

- Focused integration test: create 2-3 enrollments via `tx.upsertMany(Enrollment, [...], { onConflictFields: ['user', 'course'] })` — verify ON CONFLICT behavior and that returned entities are managed references

**Manual smoke tests:**

1. `SYNC_ON_STARTUP=true npm run start:dev` — verify startup logs show all three phases with timing, `StartupJobRegistry` prints unified summary
2. `SYNC_ON_STARTUP=false npm run start:dev` — verify only categories sync, warning logged if zero courses
3. `POST /moodle/sync` with superadmin JWT — verify `{ jobId }` returned, sync executes in BullMQ
4. `POST /moodle/sync` with non-superadmin JWT — verify 403
5. Wait for hourly cron or manually trigger — verify job appears in Redis, processor runs
6. Kill Redis, call `POST /moodle/sync` — verify 503 response
7. Kill Redis, wait for cron — verify error logged, app continues

**Error isolation:**

- Add a bad `MOODLE_BASE_URL` for one test, verify sync logs error for affected courses/programs but completes for others

### Notes

- At 5k users / 80 courses: optimization reduces SQL from ~48,000 to ~160 statements per sync cycle (300x reduction)
- Staging and production share the same Moodle instance — concurrency setting affects load on shared server
- `upsertMany` with composite conflict keys (`['user', 'course']` on Enrollment) is new to the codebase — highest-risk item, must validate before shipping (Risk #2, #8)
- Future follow-up tickets: `GET /moodle/sync/:jobId` status endpoint, `MoodleUserHydrationService` login-time optimization
- If `upsertMany` with composite keys proves unreliable, the fallback (individual `upsert()` with captured return value) still eliminates the N+1 and provides significant improvement

### Risks (Pre-mortem)

| #   | Risk                                                                                   | Prevention                                                                                                                                                  | Priority             |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Empty staging on first deploy — no courses, confusing empty responses                  | Log warning if zero courses + `SYNC_ON_STARTUP=false`                                                                                                       | Medium               |
| 2   | `upsertMany` composite FK conflict failure                                             | Integration test + fallback to individual `upsert` with captured return value                                                                               | High                 |
| 3   | Moodle overload from concurrent sync calls                                             | Default concurrency 3 is conservative; document peak-hour awareness                                                                                         | Low                  |
| 4   | Redis down = silent sync failure, cron enqueue throws unhandled                        | try/catch + logger.error in scheduler's `queue.add()`                                                                                                       | High                 |
| 5   | Fragmented startup logging after removing sync jobs from `StartupJobRegistry`          | Register `MoodleStartupService` results into `StartupJobRegistry.record()`                                                                                  | Medium               |
| 6   | Processor stalls on hung Moodle call bypassing 10s timeout                             | Set `stalledInterval` + `maxStalledCount` on processor                                                                                                      | Medium               |
| 7   | Bad remote user data poisons entire `upsertMany` batch for a course                    | Pre-filter invalid users before batching; log skipped records                                                                                               | Medium               |
| 8   | `upsertMany` returns non-managed objects, breaking FK refs for enrollment upsert       | Integration test verifying returned entities work as FK references                                                                                          | High                 |
| 9   | Multiple NestJS instances each enqueue duplicate cron jobs                             | Use fixed `jobId` for dedup — BullMQ ignores duplicate waiting jobs                                                                                         | High                 |
| 10  | Redis memory growth from accumulated completed/failed job records                      | `removeOnComplete: true`, `removeOnFail: 50` on job options                                                                                                 | Medium               |
| 11  | Rapid-fire `POST /moodle/sync` enqueues redundant jobs                                 | Intentional: manual trigger uses unique `jobId` so each request queues. Jobs serialize via `concurrency: 1`. Acceptable — user explicitly asked for a sync. | Low                  |
| 12  | Registering old `MoodleController` exposes 7 unguarded proxy endpoints                 | Create separate `MoodleSyncController` for the sync endpoint only. Old controller stays orphaned.                                                           | Critical             |
| 13  | Deleting `EnrollmentSyncJob` loses `ENROLLMENTS_ME` cache invalidation                 | Migrate `cacheService.invalidateNamespace()` call to `MoodleSyncProcessor` and `MoodleStartupService`                                                       | Critical             |
| 14  | Concurrent User upserts across courses cause deadlocks (same user in multiple courses) | 3-phase architecture: hoist User upsert into single batch before per-course enrollment sync                                                                 | Critical             |
| 15  | Shared `EntityManager` identity map under concurrent `pLimit` tasks                    | Phase 1 is HTTP-only (no EM), Phase 2 is single transaction, Phase 3 is sequential — no concurrent EM usage                                                 | Critical (mitigated) |
| 16  | `MoodleStartupService` bare EM injection pollutes global identity map                  | Use `em.fork()` for zero-course count query                                                                                                                 | Medium               |
