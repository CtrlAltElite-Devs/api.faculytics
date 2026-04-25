# Repositories

One custom MikroORM repository per entity. Most are thin, but this is where query logic belongs — keep services free of raw query builders.

## Conventions

- **Naming**: `{entity}.repository.ts`, one per entity.
- **Wiring**: entities opt in via `@Entity({ repository: () => XRepository })`; MikroORM returns an `XRepository` instance from `em.getRepository(X)`.
- **Base**: most repos extend MikroORM's `EntityRepository<T>` (or a local `BaseRepository`) and add 1–2 domain-specific methods.
- **Forking**: when a method needs its own transactional scope, `em.fork()` inside the repo method. Do NOT leak forked EMs back to the caller.
- **Query builder over raw SQL**: prefer `qb = this.createQueryBuilder()`; only drop to raw SQL for set-based operations that the QB can't express.

## Notable repos

Most repos are near-empty wrappers. Places with real logic:

- `moodle-token.repository.ts` — token lookup/refresh plumbing for Moodle sessions.
- `questionnaire-submission.repository.ts` — scoped fetches that drive the analysis pipeline.
- `refresh-token.repository.ts` — token lifecycle queries used by `RefreshTokenCleanupJob`.
- `report-job.repository.ts` — report lifecycle, including cleanup support for `ReportCleanupJob`.

## Gotchas

- The global soft-delete filter applies here too — pass `filters: { softDelete: false }` when you intentionally need deleted rows (e.g., the refresh-token cleanup path or `SyncLog` queries).
- Don't put business rules in repo methods — repos return data, services decide what to do with it.
- `__tests__/` holds repo-level specs; prefer adding repo-only tests here rather than exercising query shape from a service test.
