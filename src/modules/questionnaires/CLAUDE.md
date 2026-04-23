# Questionnaires Module

Questionnaire definitions, versions, drafts, submissions, and the universal ingestion engine for bulk-loading submissions from CSV/Excel.

## File map

- `questionnaires.module.ts`, `questionnaire.controller.ts`, `questionnaire-type.controller.ts` — module wiring + HTTP surface.
- `services/`
  - `questionnaire.service.ts`, `questionnaire-type.service.ts` — core CRUD + lifecycle (draft → submitted).
  - `questionnaire-schema.validator.ts` — validates questionnaire JSON schema (question shape, constraints).
  - `scoring.service.ts` — computes aggregate scores from answers.
- `ingestion/` — the universal ingestion engine (see below).
- `validators/` — custom class-validator rules (e.g. date-window constraints).
- `dto/` — request/response contracts for submissions, drafts, versions.
- `lib/` — domain helpers.
- `utils/` — generic helpers.

## Ingestion engine

Lives in `ingestion/` and is the opinionated way to load records in bulk from external files.

- `adapters/` — `base-stream.adapter.ts` defines the `SourceAdapter` contract: an async generator `extract()` that yields rows. `csv.adapter.ts` and `excel.adapter.ts` are the concrete implementations.
- `interfaces/` — engine + adapter interfaces.
- `services/` — `IngestionEngine` drives the extraction: p-limit concurrency, dry-run support, timeout handling.
- `factories/` — adapter factory so callers pick an adapter by file type.
- `dto/` — `IngestionResult`, `RawSubmissionData`.
- `constants/`, `types/`, `utils/` — supporting code.
- `IngestionMapperService` (in `services/`) — maps raw rows to domain entities.

## Key patterns

- **Streaming**: adapters are async generators — they don't load the whole file into memory. Respect this when adding a new adapter.
- **Dry-run**: the engine accepts a `dryRun` flag that runs validation + mapping without persisting. Useful for frontend preview flows.
- **Concurrency**: controlled via p-limit inside `IngestionEngine`. Don't introduce your own `Promise.all` over a whole stream.

## Gotchas

- Streaming means **partial failures are possible**: some rows may be persisted before the engine aborts. Callers should treat a failure as "some work may have landed" and use the `IngestionResult` to reconcile.
- Dry-run still runs Zod/entity validation — it only skips the database write.
- New adapters must extend `BaseStreamAdapter` and implement `extract()`; do not subclass individual CSV/Excel adapters.

## Pointers

- `docs/architecture/universal-ingestion.md` — ingestion architecture.
- `docs/architecture/questionnaire-management.md` — questionnaire lifecycle.
- `docs/workflows/questionnaire-submission.md` — end-to-end submission flow.
