---
title: 'Refresh Token Cleanup Job'
slug: 'refresh-token-cleanup-job'
created: '2026-03-04'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  ['NestJS v11', 'MikroORM v6 (PostgreSQL)', '@nestjs/schedule', 'Jest v30']
files_to_modify:
  - 'src/repositories/refresh-token.repository.ts'
  - 'src/crons/index.jobs.ts'
  - 'src/modules/common/common.module.ts'
files_to_create:
  - 'src/crons/jobs/auth-jobs/refresh-token-cleanup.job.ts'
  - 'src/crons/jobs/auth-jobs/refresh-token-cleanup.constants.ts'
  - 'src/crons/jobs/auth-jobs/refresh-token-cleanup.job.spec.ts'
code_patterns:
  - 'Jobs extend BaseJob, inject SchedulerRegistry + service/repo'
  - 'isRunning guard prevents overlapping executions'
  - 'safeRun() wraps execution with try/catch and returns JobRecordType'
  - 'PascalCase for public methods'
  - 'Absolute imports from src/'
  - 'em.nativeDelete() for hard delete bypassing soft delete filter'
  - 'Repositories extend EntityRepository<T> from @mikro-orm/postgresql'
test_patterns:
  - '.spec.ts co-located with source file'
  - 'NestJS TestingModule with jest.fn() mocks'
  - 'No existing cron job tests — will establish pattern'
---

# Tech-Spec: Refresh Token Cleanup Job

**Created:** 2026-03-04

## Overview

### Problem Statement

Refresh tokens accumulate indefinitely in the database. Once tokens expire or are revoked (via logout or token rotation), they remain in the `refresh_token` table with `isActive = false` but are never removed. This causes unbounded table growth over time.

### Solution

Create a scheduled cron job following the existing `BaseJob` pattern that hard-deletes refresh tokens past their `expiresAt` date plus a configurable retention grace period (default 7 days). The job runs every 12 hours.

### Scope

**In Scope:**

- New cron job extending `BaseJob` that hard-deletes expired refresh tokens
- Hard delete (actual SQL `DELETE`) of tokens where `expiresAt + retentionDays < now()`
- Configurable retention period as a named constant
- Unit tests following existing test patterns

**Out of Scope:**

- Cleanup of other entities (MoodleToken, QuestionnaireDraft)
- Changes to existing token creation, rotation, or revocation logic
- Soft delete refactoring for the RefreshToken entity

## Context for Development

### Codebase Patterns

- **Job architecture:** All cron jobs extend `BaseJob` (`src/crons/base.job.ts`) which provides startup execution, graceful shutdown via `OnApplicationShutdown`, and `StartupJobRegistry` integration for boot summary
- **Job guard pattern:** Every job uses a private `isRunning = false` flag in `safeRun()` to prevent overlapping executions
- **Job delegation:** Jobs delegate to a service or repository for actual work (e.g., `CategorySyncJob` → `MoodleCategorySyncService`)
- **Job registration:** Jobs are listed in `AllCronJobs` array (`src/crons/index.jobs.ts`) and registered as providers in `AppModule`
- **Job directory structure:** `src/crons/jobs/{domain}-jobs/{job-name}.job.ts` (e.g., `category-jobs/category-sync.job.ts`)
- **Repository pattern:** `RefreshTokenRepository` extends `EntityRepository<RefreshToken>` from `@mikro-orm/postgresql`. It uses `em.nativeUpdate()` for bulk operations — we'll use `em.nativeDelete()` for hard delete
- **Module registration:** `CommonModule` registers `MikroOrmModule.forFeature([RefreshToken])` making `RefreshTokenRepository` available. It exports `UnitOfWork` and `CustomJwtService` but NOT the repository directly
- **Anti-pattern (global EM):** Never use global EntityManager — use injected repository's `this.em`
- **Anti-pattern (cron shutdown):** NEVER stop cron jobs manually in `onApplicationShutdown`

### Files to Reference

| File                                                | Purpose                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/crons/base.job.ts`                             | BaseJob abstract class — extend this                                                    |
| `src/crons/startup-job-registry.ts`                 | JobRecordType type and StartupJobRegistry                                               |
| `src/crons/index.jobs.ts`                           | AllCronJobs array — register new job here                                               |
| `src/crons/jobs/category-jobs/category-sync.job.ts` | Reference implementation for job pattern                                                |
| `src/entities/refresh-token.entity.ts`              | RefreshToken entity with `expiresAt` field                                              |
| `src/repositories/refresh-token.repository.ts`      | Custom repository — add `DeleteExpired()` method here                                   |
| `src/modules/common/common.module.ts`               | Registers `MikroOrmModule.forFeature([RefreshToken])` — need to export `MikroOrmModule` |
| `src/modules/auth/auth.service.spec.ts`             | Reference test pattern for TestingModule setup                                          |

### Technical Decisions

- **Hard delete over soft delete:** Refresh tokens already track revocation state via `isActive`/`revokedAt`. Soft-deleting them doesn't solve the growth problem since they'd still occupy space. Hard delete is appropriate for expired, unusable tokens.
- **7-day grace period:** Tokens are kept for 7 days after expiration for any audit needs, then permanently removed.
- **12-hour schedule:** Cleanup is not time-sensitive — running twice daily balances hygiene with resource usage.
- **Retention period as constant:** The grace period is defined as a named constant for easy future adjustment.
- **Repository method over direct EM:** Add `DeleteExpired()` to `RefreshTokenRepository` using `em.nativeDelete()` — follows the project's repository pattern and keeps DB logic encapsulated.
- **CommonModule export:** Export `MikroOrmModule` from `CommonModule` so that `RefreshTokenRepository` (registered via `MikroOrmModule.forFeature([RefreshToken])`) becomes injectable in `AppModule` where cron jobs are providers. The job injects the repository directly — the cleanup logic is simple enough that a dedicated service adds no value.

## Implementation Plan

### Tasks

- [x] **Task 1: Create cleanup constants file**
  - File: `src/crons/jobs/auth-jobs/refresh-token-cleanup.constants.ts` (CREATE)
  - Action: Define a `REFRESH_TOKEN_RETENTION_DAYS` constant set to `7`. This is the grace period in days after `expiresAt` before a token is hard-deleted.
  - Notes: Using a named constant makes the retention period easy to find and adjust.

- [x] **Task 2: Add `DeleteExpired()` method to `RefreshTokenRepository`**
  - File: `src/repositories/refresh-token.repository.ts` (MODIFY)
  - Action: Add a new method `DeleteExpired(cutoffDate: Date): Promise<number>` that:
    - Calls `this.em.nativeDelete(RefreshToken, { expiresAt: { $lt: cutoffDate } })` to hard-delete all tokens whose `expiresAt` is before the cutoff date
    - Returns the number of deleted rows (nativeDelete returns this)
  - Notes: The cutoff date is computed by the caller (job) as `now() - retentionDays`. Using `$lt` on `expiresAt` alone is sufficient — if a token has expired + grace period has passed, it's dead regardless of `isActive` status. `nativeDelete` bypasses the soft delete filter and issues a raw SQL `DELETE`.

- [x] **Task 3: Export `MikroOrmModule` from `CommonModule`**
  - File: `src/modules/common/common.module.ts` (MODIFY)
  - Action: Add `MikroOrmModule` to the `exports` array alongside the existing `UnitOfWork` and `CustomJwtService` exports. This re-exports the `MikroOrmModule.forFeature([RefreshToken])` registration, making `RefreshTokenRepository` injectable in any module that imports `CommonModule`.
  - Notes: `AppModule` already imports `CommonModule` transitively via `AuthModule` → `CommonModule`. However, since cron jobs are providers directly on `AppModule`, `AppModule` needs to import `CommonModule` directly for the repository to be injectable. Alternatively, add `CommonModule` to `AppModule` imports if not already present. Check if `AppModule` already imports it transitively — if so, adding the export to `CommonModule` is sufficient since `AuthModule` imports `CommonModule` and `AppModule` imports `AuthModule`.

- [x] **Task 4: Create the `RefreshTokenCleanupJob`**
  - File: `src/crons/jobs/auth-jobs/refresh-token-cleanup.job.ts` (CREATE)
  - Action: Create a new `@Injectable()` class `RefreshTokenCleanupJob` that:
    - Extends `BaseJob`
    - Injects `RefreshTokenRepository` and `SchedulerRegistry`
    - Calls `super(schedulerRegistry, RefreshTokenCleanupJob.name)` in constructor
    - Implements `runStartupTask()` returning `{ status: 'skipped', details: 'Cleanup not needed at startup' }` (no startup execution needed)
    - Has a `@Cron('0 */12 * * *', { name: RefreshTokenCleanupJob.name })` decorated method `handleCleanup()` that calls `safeRun()`
    - Has a private `safeRun()` method following the existing pattern:
      - Guards with `isRunning` flag
      - Computes cutoff date: `new Date(Date.now() - REFRESH_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000)` — note: this is the cutoff for `expiresAt`, meaning tokens whose expiration + retention grace has passed
      - Calls `this.refreshTokenRepository.DeleteExpired(cutoffDate)`
      - Logs the count of deleted tokens
      - Returns `JobRecordType` with status and details
      - Catches errors and returns `{ status: 'failed', details: message }`
      - Resets `isRunning` in `finally`
  - Notes: Uses cron expression `0 */12 * * *` (every 12 hours at minute 0) since `CronExpression` enum doesn't have `EVERY_12_HOURS`. Follow `CategorySyncJob` structure exactly.

- [x] **Task 5: Register the job in `AllCronJobs`**
  - File: `src/crons/index.jobs.ts` (MODIFY)
  - Action: Import `RefreshTokenCleanupJob` and add it to the `AllCronJobs` array.
  - Notes: This makes the job a provider in `AppModule` automatically.

- [x] **Task 6: Ensure `RefreshTokenRepository` is injectable for cron jobs**
  - File: `src/app.module.ts` (MODIFY — if needed)
  - Action: Verify that `CommonModule` is imported by `AppModule` (directly or transitively). If cron job injection fails because the repository isn't available at `AppModule` scope, add `CommonModule` to `AppModule` imports. Since `AuthModule` imports `CommonModule` and `AppModule` imports `AuthModule`, and Task 3 exports `MikroOrmModule` from `CommonModule`, the repository should be available. Test injection and add direct import only if needed.
  - Notes: NestJS module scoping means providers in `AppModule` can only inject from modules imported by `AppModule`. The transitive chain is: `AppModule` → `AuthModule` → `CommonModule` → `MikroOrmModule.forFeature([RefreshToken])`. With the export from Task 3, this chain should make `RefreshTokenRepository` injectable.

- [x] **Task 7: Write unit tests for `RefreshTokenCleanupJob`**
  - File: `src/crons/jobs/auth-jobs/refresh-token-cleanup.job.spec.ts` (CREATE)
  - Action: Create unit tests using `TestingModule` with mocked `RefreshTokenRepository` and `SchedulerRegistry`:
    - Test: job is defined
    - Test: `runStartupTask()` returns skipped status
    - Test: `handleCleanup()` calls `DeleteExpired` with correct cutoff date (now minus retention days)
    - Test: `handleCleanup()` logs the number of deleted tokens
    - Test: `handleCleanup()` returns failed status when repository throws
    - Test: concurrent execution is skipped when `isRunning` is true
  - Notes: Mock `RefreshTokenRepository` with `{ DeleteExpired: jest.fn() }`. Mock `SchedulerRegistry` with `{}`. Follow the pattern from `auth.service.spec.ts` for TestingModule setup. Use `jest.useFakeTimers()` to control `Date.now()` for deterministic cutoff date assertions.

### Acceptance Criteria

- [x] **AC 1:** Given refresh tokens exist with `expiresAt` older than 7 days ago, when the cleanup job runs, then those tokens are permanently deleted from the database (hard delete, not soft delete).

- [x] **AC 2:** Given refresh tokens exist with `expiresAt` within the last 7 days, when the cleanup job runs, then those tokens remain in the database untouched.

- [x] **AC 3:** Given refresh tokens exist with `expiresAt` in the future (still valid), when the cleanup job runs, then those tokens remain in the database untouched.

- [x] **AC 4:** Given the cleanup job is already running, when the cron trigger fires again, then the second execution is skipped and logged.

- [x] **AC 5:** Given the database query fails during cleanup, when the job catches the error, then it logs the error and returns a `failed` status without crashing the application.

- [x] **AC 6:** Given the application starts up, when the cleanup job's startup task is called, then it returns `skipped` status (cleanup is not needed at boot time).

- [x] **AC 7:** Given the `REFRESH_TOKEN_RETENTION_DAYS` constant is changed to a different value, when the job runs, then the cutoff date reflects the updated retention period.

## Additional Context

### Dependencies

- No new package dependencies required
- Uses existing `@nestjs/schedule` (`Cron` decorator, `SchedulerRegistry`) already in the project
- Uses existing `MikroORM` (`nativeDelete`) already in the project
- Depends on `RefreshTokenRepository` being injectable at `AppModule` scope (Task 3 + Task 6)

### Testing Strategy

**Unit Tests (Task 7):**

- Mock `RefreshTokenRepository.DeleteExpired()` to verify it's called with the correct cutoff date
- Mock `SchedulerRegistry` (required by `BaseJob` constructor)
- Use `jest.useFakeTimers()` to make `Date.now()` deterministic for cutoff date assertions
- Test the `isRunning` guard by simulating concurrent execution
- Test error handling by making the mock reject

**Manual Verification:**

- Start the app with `npm run start:dev`
- Verify the job appears in startup logs (with `skipped` status)
- Optionally seed expired tokens and trigger the cron manually or wait for the 12-hour cycle
- Check the `refresh_token` table to confirm expired tokens beyond the retention period are deleted

### Notes

- The `RefreshToken` entity inherits `deletedAt` from `CustomBaseEntity` but it's never used by auth flows — all tokens have `deletedAt = NULL`. The hard delete via `nativeDelete` removes rows entirely.
- `em.nativeDelete()` returns the count of affected rows, which we log for observability.
- `AppModule.onApplicationBootstrap()` currently only runs `categorySyncJob.executeStartup()`. The cleanup job skips startup, so no changes to `onApplicationBootstrap()` are needed.
- Future consideration: this pattern could be extended to clean up stale `MoodleToken` entries or `QuestionnaireDraft` entities (both have TODOs in the codebase for cleanup mechanisms).

## Review Notes

- Adversarial review completed
- Findings: 11 total, 3 fixed, 8 skipped (2 noise, 6 design decisions per tech-spec)
- Resolution approach: auto-fix
- F1 fixed: Renamed `HandleCleanup` → `handleCleanup` (match existing cron handler convention)
- F4 fixed: Added comment in AppModule explaining direct CommonModule import
- F10 fixed: Renamed `DeleteExpired` → `deleteExpired` (match sibling repo method convention)
