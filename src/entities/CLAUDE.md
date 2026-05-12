# Entities

MikroORM entity definitions. All domain state lives here.

## Conventions

- **Base class**: every entity extends `CustomBaseEntity` (`base.entity.ts`) — UUID `id`, `createdAt`, `updatedAt`, nullable `deletedAt`, and a `SoftDelete()` method.
- **Naming**: `{domain}.entity.ts` (kebab-case). One entity per file.
- **Soft delete is global**: a MikroORM filter registered in `mikro-orm.config.ts` hides rows where `deletedAt IS NOT NULL` by default. To include deleted rows, pass `filters: { softDelete: false }` on the query.
- **Custom repository wiring**: entities that need extra repo methods declare it inline — `@Entity({ repository: () => XRepository })`. The repo class lives in `src/repositories/`.
- **`index.entity.ts`** aggregates entities for MikroORM config discovery — add new entities here.

## Exception: SyncLog

`sync-log.entity.ts` does **NOT** extend `CustomBaseEntity` — it has no `deletedAt` column. Any query touching `SyncLog` must pass `filters: { softDelete: false }` or the global filter will reference a missing column and fail.

## Domain clusters

- **Academic structure**: `campus`, `department`, `program`, `section`, `course`, `semester`, `user-institutional-role`.
- **Identity / auth**: `user`, `refresh-token`, `moodle-token`.
- **Moodle mirror**: `moodle-category`, `sync-log`.
- **Questionnaires**: `questionnaire`, `questionnaire-type`, `questionnaire-version`, `questionnaire-draft`, `questionnaire-submission`, `questionnaire-answer`.
- **Analysis pipeline**: `analysis-pipeline`, `sentiment-run`, `sentiment-result`, `topic-model-run`, `topic`, `topic-assignment`, `submission-embedding`, `recommendation-run`, `recommended-action`.
- **Cross-cutting**: `audit-log`, `system-config`, `dimension`, `enrollment`, `report-job`, `chatkit-thread`, `chatkit-thread-item`.

## Gotchas

- Adding a new entity requires registering it in `index.entity.ts` AND creating a migration (`npx mikro-orm migration:create`). Forgetting the migration silently diverges the dev DB from production.
- Relation decorators (`@ManyToOne`, `@OneToMany`) need matching inverse sides or MikroORM will silently drop joins.
- When writing new repos, prefer `em.fork()` + query builder inside the repo — don't leak query building into services.
- **`uq_analysis_pipeline_active_scope` is a recurring CLI suggestion trap.** This partial unique index (FAC-132, see `Migration20260414155236_fac-132-pipeline-scope-unique-index.ts`) uses `COALESCE(...,'NONE')` over nullable scope FKs and a `WHERE status NOT IN (...)` clause. MikroORM decorators can't represent it, so `migration:create` will propose dropping it on every run. **Never accept that drop** — it reopens the bug FAC-132 fixed (duplicate active pipelines for the same scope). Always strip the `drop index "uq_analysis_pipeline_active_scope"` line from generated migrations before committing.

## Pointers

- `docs/architecture/data-model.md` — ER overview.
- `src/repositories/CLAUDE.md` — repository layer conventions.
