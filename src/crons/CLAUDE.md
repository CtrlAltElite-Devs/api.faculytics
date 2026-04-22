# Crons

Scheduled background jobs. The pattern here is custom (not just `@Cron()`): jobs participate in a boot-time startup phase and register their results for diagnostics.

## File map

- `base.job.ts` — abstract `BaseJob` class; every job extends this.
- `startup-job-registry.ts` — static `StartupJobRegistry` that collects per-job results during bootstrap.
- `index.jobs.ts` — aggregates job providers for module registration.
- `jobs/analysis-jobs/` — `tiered-pipeline-scheduler.job.ts` + constants.
- `jobs/auth-jobs/` — `refresh-token-cleanup.job.ts` + constants.

## BaseJob contract

Every job:

1. Extends `BaseJob` and passes a stable `jobName` to the constructor.
2. Implements `protected runStartupTask(): Promise<JobRecordType>`.
3. Calls `executeStartup()` during bootstrap — this runs `runStartupTask()`, records the result in `StartupJobRegistry`, and logs failures without crashing the app.
4. Uses `schedulerRegistry` (injected `SchedulerRegistry`) for any cron it owns; jobs with fixed schedules can also decorate methods with `@Cron()`.
5. Gets free graceful-shutdown logging via `onApplicationShutdown()`.

## Active jobs

- **RefreshTokenCleanupJob** (`jobs/auth-jobs/`) — every 12 hours, purges refresh tokens older than the 7-day retention window.
- **TieredPipelineSchedulerJob** (`jobs/analysis-jobs/`) — three independent `@Cron` methods that enqueue pipelines for active scopes with new submissions:
  - FACULTY tier: Sun 01:00 UTC
  - DEPARTMENT tier: Sun 02:00 UTC
  - CAMPUS tier: Sun 03:00 UTC
  - Each tier has its own `isRunning` guard; scopes with no new submissions since their last completed pipeline are skipped.
  - Pipelines created here are tagged `trigger=SCHEDULER` and attributed to the seeded SUPER_ADMIN.

## Gotchas

- `executeStartup()` **swallows failures** by design — a failed startup check won't crash the app, but it WILL be visible in the boot summary. Don't rely on an exception propagating.
- The per-tier `isRunning` guard prevents overlapping runs but is per-process — in a multi-instance deploy you'd need a distributed lock. We currently run single-instance.
- `JobRecordType` is a status + details shape; return it explicitly, don't just `return;`.

## Pointers

- Root `CLAUDE.md` — quick listing of active jobs (this file expands on the mechanism).
