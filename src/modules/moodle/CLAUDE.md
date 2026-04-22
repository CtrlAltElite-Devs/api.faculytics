# Moodle Module

Communication with the Moodle LMS: users, courses, categories, enrollments. Includes the MoodleClient HTTP wrapper, a suite of sync services, and a dynamic scheduler.

## File map

- `moodle.module.ts`, `moodle.controller.ts`, `moodle.service.ts` — module wiring + top-level HTTP surface.
- `services/`
  - `moodle-sync.service.ts` — orchestrates a full sync run.
  - `moodle-{user-hydration,category,course,enrollment,provisioning,startup}-sync.service.ts` — per-entity sync services.
  - `moodle-course-transform.service.ts`, `moodle-csv-parser.service.ts` — data shaping helpers.
  - `scope-derivation.helper.ts` (+ `.convergence.spec.ts`) — resolves a user's institutional scope (campus → department → faculty) from Moodle cohort/category data. Convergence spec exists because scope derivation is iterative.
- `schedulers/moodle-sync.scheduler.ts` — dynamic cron via `SchedulerRegistry` (no static `@Cron()` decorator).
- `schedulers/moodle-sync.constants.ts` — per-env default intervals.
- `processors/` — BullMQ processor for async sync jobs.
- `controllers/` — HTTP endpoints for sync control, provisioning.
- `lib/` — Moodle API types, constants, provisioning/sync result types.
- `dto/` — 38 request/response DTOs covering the Moodle API surface we use.

## Key patterns

- **Dynamic cron**: interval resolves in order: DB (`SystemConfig`) → env (`MOODLE_SYNC_INTERVAL_MINUTES`) → per-env default. Admins change it at runtime via `PUT /moodle/sync/schedule` (minimum 30 minutes).
- **MoodleClient** (inside `services/`) enforces a 10-second timeout on every Moodle API call. Network/timeout errors are wrapped in `MoodleConnectivityError` and surface as HTTP 401 to the caller.
- **SyncLog** tracks every run with per-phase metrics (fetched / inserted / updated / deactivated). It is used for both observability and scheduler decisions.

## Gotchas

- **`SyncLog` does NOT extend `CustomBaseEntity`** — it has no soft-delete column, so queries must pass `filters: { softDelete: false }` or the global filter will try to reference a missing `deletedAt` and explode.
- Connectivity failures → 401 (not 502/504) so clients treat Moodle being unreachable the same as invalid credentials. Don't change this without coordinating with the frontend.
- `SYNC_ON_STARTUP=true` runs course + enrollment sync during boot — expensive in production; leave disabled unless intentionally backfilling.
- Scope derivation is iterative (convergence test exists for a reason) — changes here need the convergence spec re-run.

## Pointers

- `docs/workflows/institutional-sync.md` — end-to-end sync flow.
- `docs/moodle/provisioning.md` — provisioning workflow.
- `docs/moodle/moodle_api_index.md` — index of Moodle API endpoints we consume.
