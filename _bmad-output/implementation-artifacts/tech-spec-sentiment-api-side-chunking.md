---
title: 'Sentiment analysis API-side chunking'
slug: 'sentiment-api-side-chunking'
created: '2026-04-17'
status: 'review-complete'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - NestJS 11 (TypeScript 5.7)
  - MikroORM 6.6 (PostgreSQL)
  - BullMQ on Redis (via @nestjs/bullmq)
  - Zod 4 for env + DTO validation
  - Jest 30 for unit/integration tests
files_to_modify:
  - src/modules/analysis/services/pipeline-orchestrator.service.ts
  - src/modules/analysis/processors/sentiment.processor.ts
  - src/modules/analysis/processors/sentiment.processor.spec.ts
  - src/modules/analysis/dto/batch-analysis-job-message.dto.ts
  - src/entities/sentiment-run.entity.ts
  - src/configurations/env/bullmq.env.ts
  - src/migrations/Migration20260417120000_sentiment-chunk-counters.ts
  - .env.sample
code_patterns:
  - Queue-per-type dispatch via BullMQ with deterministic zero-padded chunk jobId
  - RunPodBatchProcessor envelope wrap/unwrap (unchanged per chunk)
  - Atomic counter increment via raw SQL `UPDATE ... SET completed_chunks = completed_chunks + 1 WHERE id = ? AND completed_chunks < expected_chunks RETURNING ...` (no-op on 0 rows)
  - Idempotent persist via full unique index on `(run_id, submission_id)` + try-catch on UniqueConstraintViolationException
  - Orchestrator idempotency via pipeline-status guards + current-run verification
  - Structured per-chunk logging with mandatory fields for ops greppability
test_patterns:
  - NestJS TestingModule with mocked EntityManager (`em.fork`, `findOneOrFail`, `getReference`, `create`, `flush`)
  - Fake BullMQ Job via `as unknown as Job<BatchAnalysisJobMessage>`
  - Jest spec co-located with source file (`*.spec.ts`)
---

# Tech-Spec: Sentiment analysis API-side chunking

**Created:** 2026-04-17

## Overview

### Problem Statement

The sentiment stage of the analysis pipeline dispatches every submission in a scope as a **single HTTP POST** to the temporary sentiment worker's `/runsync` endpoint. Today's failure (pipeline `199951f7-fbd3-4b5e-858f-75a0b6b8e11f`, campus UCMN, 849 comments) returned **HTTP 504** after ~3 minutes because the worker processes items internally with `OPENAI_BATCH_SIZE=10` × `OPENAI_CONCURRENCY=10`, which exceeds the API's `BULLMQ_HTTP_TIMEOUT_MS` (90s) on large scopes. When the gateway aborts, all in-flight work is discarded and the pipeline is marked `FAILED` with zero partial progress persisted.

### Solution

Introduce **API-side chunking** in `PipelineOrchestratorService.dispatchSentiment`. The orchestrator splits the submission list into fixed-size chunks (default 50, env-configurable) and enqueues one BullMQ job per chunk against the existing sentiment queue. The worker is untouched — each chunk carries a smaller batch that completes well under HTTP timeout. `SentimentProcessor.Persist` upserts results per chunk and atomically increments `SentimentRun.completedChunks`; the chunk that increments the counter to `expectedChunks` triggers `OnSentimentComplete`. BullMQ's existing retry policy handles transient failures per chunk, and the first chunk to exhaust retries fires `OnStageFailed` with a `chunk X/Y` diagnostic.

### Scope

**In Scope:**

- API-side chunking of `dispatchSentiment` into N-sized BullMQ jobs (default N=50)
- `SentimentRun` gains `expectedChunks: int` + `completedChunks: int` counters (NOT NULL DEFAULT 0)
- Atomic counter increment in `SentimentProcessor.Persist` via raw SQL `UPDATE ... SET completed_chunks = completed_chunks + 1 RETURNING completed_chunks, expected_chunks`
- Last-chunk detection (returned counter == expectedChunks) is the single trigger for `OnSentimentComplete`
- `BatchAnalysisJobMessage.metadata` extended with optional `chunkIndex` + `chunkCount` (sentiment envelope only, non-breaking)
- BullMQ jobId pattern changes to `${pipeline.id}--sentiment--${chunkIndex}` (zero-padded to 4 digits to avoid lexical collisions with >10 chunks)
- Idempotent result writes via **full** unique index on `(run_id, submission_id)` (migration drops the existing `WHERE deleted_at IS NULL` clause) + try-catch on `UniqueConstraintViolationException`
- Fail-fast: first chunk exhausting `BULLMQ_DEFAULT_ATTEMPTS` calls `OnStageFailed` with message `sentiment_analysis: chunk X/Y failed after N retries: <underlying error>`
- New env var `SENTIMENT_CHUNK_SIZE` (Zod: `z.coerce.number().int().positive().default(50)`)
- Migration: add two int columns to `sentiment_run` (NOT NULL, DEFAULT 0); drop + recreate the `sentiment_result` unique index without the partial predicate; no backfill needed (new columns default 0; existing index migration is metadata-only since no soft-deleted duplicates exist today — verify in the migration with a preflight count)
- Structured per-chunk log event with mandatory field set: `pipelineId`, `runId`, `chunkIndex`, `chunkCount`, `durationMs`, `attemptsMade`, `status` (`persisted` | `duplicate-swallowed` | `failed` | `superseded`)
- Cross-dispatch safety + counter guard merged: persist + atomic UPDATE run inside a single `em.transactional()`. The UPDATE's WHERE clause includes both `completed_chunks < expected_chunks` (over-increment guard) and a subquery confirming `sentiment_run.id` is the latest run for the pipeline (stale-run guard). Single round-trip, crash-safe.
- Passive detection of cancelled / superseded / failed pipelines: `Persist` uses `TERMINAL_STATUSES` (includes `CANCELLED`) for its terminal-status guard
- Unit tests for chunk-split math, concurrent-chunk completion, last-chunk detection, unique-violation swallow, fail-fast error message, stale-run rejection, counter over-increment guard, transactional rollback on mid-persist crash
- `.env.sample` updated

**Out of Scope:**

- Topic modeling chunking (open follow-up ticket — different payload shape, embeddings attached inline)
- Embeddings chunking (not observed failing at current scale)
- Pipeline-status DTO changes — `progress.current` already uses `fork.count(SentimentResult, { run })` which naturally reflects chunk progress (pipeline-orchestrator.service.ts:604-610)
- Switching to RunPod async `/run` + `/status` polling (orthogonal; chunking works for both sync and async workers)
- Worker-side changes — temp worker already chunks internally; future fine-tuned RunPod model is contract-compatible. The worker's envelope schema's **inner** `metadata` object uses Zod default `.strip()` so it silently drops `chunkIndex` / `chunkCount` — chunk identity is visible only in API-side logs. Updating the worker schema to expose chunk identity worker-side is a tracked follow-up.
- **Passive** detection of cancelled / superseded runs is in scope (no-op at `Persist`); **active** removal of pending BullMQ chunk jobs from the sentiment queue on cancellation/fail-fast is deferred to a follow-up ticket.

## Context for Development

### Codebase Patterns

- **Queue-per-type dispatch**: `PipelineOrchestratorService.dispatchSentiment` (src/modules/analysis/services/pipeline-orchestrator.service.ts:1661-1717) creates a `SentimentRun` and enqueues one BullMQ job on `QueueName.SENTIMENT` with deterministic jobId `${pipeline.id}--sentiment`. The new pattern enqueues N jobs with jobId `${pipeline.id}--sentiment--${chunkIndex.padStart(4,'0')}` and items split into chunks of `env.SENTIMENT_CHUNK_SIZE`.
- **Single `SentimentRun` per dispatch**: All chunks of a single dispatch share one `SentimentRun`. `submissionCount` remains the total; `expectedChunks` and `completedChunks` are the new progress counters.
- **Idempotent orchestrator transitions**: `OnSentimentComplete(pipelineId)` guards on `pipeline.status === SENTIMENT_ANALYSIS`; `OnStageFailed` guards on terminal status. Multiple parallel chunk failures do not cause duplicate stage transitions.
- **Transactional persist + counter update (crash-safe)**: `Persist` wraps result insertion AND the atomic counter UPDATE in a single `em.transactional(async (tx) => { ... })`. If the process crashes between flush and counter update, the transaction rolls back both — no orphan result rows with an un-ticked counter (which would deadlock the run forever). Inside the transaction:
  1. `tx.create(SentimentResult, …)` for each validated item, then `await tx.flush()`.
  2. Atomic UPDATE on the same transaction's connection:
     ```sql
     UPDATE sentiment_run
     SET completed_chunks = completed_chunks + 1
     WHERE id = ?
       AND deleted_at IS NULL
       AND completed_chunks < expected_chunks
       AND id = (
         SELECT id FROM sentiment_run
         WHERE pipeline_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
       )
     RETURNING completed_chunks AS "completedChunks", expected_chunks AS "expectedChunks"
     ```
  3. If the UPDATE returns **0 rows**: either the counter was saturated (retried last chunk), the run is not the latest for its pipeline (superseded by re-dispatch), or the run is soft-deleted. Roll back the transaction (or return without calling `OnSentimentComplete`), emit a `superseded` chunk-log event with the narrower `reason`, and stop.
  4. Note: `updated_at` is **not** explicitly set. `CustomBaseEntity.updatedAt` has no `onUpdate` hook in this codebase (see base.entity.ts:11-12) — the field is effectively frozen-at-insert today. Keep that contract consistent rather than creating a sentiment-run-only exception.
- **Global soft-delete filter IS active**: `mikro-orm.config.ts:42-45` registers a global `softDelete` filter with `default: true`, so `em.find` / `em.findOne` automatically exclude rows with `deletedAt IS NOT NULL` for every entity that declares the `deletedAt` column — including `SentimentRun` and `SentimentResult`. Raw SQL **does** bypass this filter; raw statements in Task 4 and Task 6 explicitly include `AND deleted_at IS NULL` where soft-delete exclusion matters.
- **Idempotent result writes**: `SentimentResult` will gain a **full** unique index on `(run_id, submission_id)` via this migration (dropping the existing partial `WHERE deleted_at IS NULL`). This closes the soft-delete-then-retry duplication hazard. On chunk retry after a committed prior transaction, the re-inserts will violate the constraint inside the new transaction. Catch `UniqueConstraintViolationException` inside the `em.transactional` lambda, translate to `status: duplicate-swallowed`, and return without running the counter UPDATE — the prior successful transaction already incremented, so re-running the UPDATE would also be correct but unnecessary. Matches project-context.md "Error Handling for Concurrency" rule.
- **Progress surfacing is already correct**: `pipeline-orchestrator.service.ts:604-610` computes `sentimentCompleted = fork.count(SentimentResult, { run })`. Pipeline status response reports `progress: { current, total }` where `current` is this count, capped at `submissionCount`. No DTO or status-builder changes required.
- **Failure notification fires exactly once per chunk**: `SentimentProcessor.onFailed` (sentiment.processor.ts:135-149) checks `job.attemptsMade >= job.opts.attempts` before calling `OnStageFailed`. Each chunk has its own retry budget and will fire at most once on exhaustion; orchestrator idempotency handles the multi-chunk-failure case.
- **Logger pattern (pino-first)**: The app uses `nestjs-pino` (registered in `src/modules/index.module.ts:106`). **Never pass `JSON.stringify(obj)` to `this.logger.log`** — pino treats the string as the `msg` field and emits `{"msg":"{\"event\":...}"}` (escaped-string inside `msg`, unusable in `jq` pipelines). Pass the object directly: `this.logger.log({ event: 'sentiment_chunk', ...fields })` — pino flattens top-level keys into the structured log line.

### Files to Reference

| File                                                                                                          | Purpose                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:1661-1717`                                    | `dispatchSentiment` — rewrite to split submissions into chunks, compute `expectedChunks`, enqueue N BullMQ jobs                                                                               |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:400-510`                                      | `OnSentimentComplete` — unchanged; queries latest `SentimentRun` by `createdAt DESC` and expects results already persisted                                                                    |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:965-982`                                      | `OnStageFailed` — unchanged; idempotent via terminal-status guard                                                                                                                             |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:604-610`                                      | `sentimentCompleted` count — unchanged; naturally tracks chunk-level progress                                                                                                                 |
| `src/modules/analysis/processors/sentiment.processor.ts`                                                      | `Persist` — rewrite to swallow unique-violation, atomic-increment `completedChunks`, call `OnSentimentComplete` only on last chunk                                                            |
| `src/modules/analysis/processors/sentiment.processor.ts:135-149`                                              | `onFailed` override — adjust error message to include `chunk X/Y`; wiring otherwise unchanged                                                                                                 |
| `src/modules/analysis/processors/sentiment.processor.spec.ts`                                                 | Mock patterns for `Job<BatchAnalysisJobMessage>` + `EntityManager` fork; new tests added here                                                                                                 |
| `src/modules/analysis/processors/base-batch.processor.ts:41-93`                                               | `process` — unchanged; chunks reuse the fetch/abort/unwrap path                                                                                                                               |
| `src/modules/analysis/processors/runpod-batch.processor.ts`                                                   | Envelope wrap/unwrap — unchanged; each chunk is its own envelope                                                                                                                              |
| `src/modules/analysis/dto/batch-analysis-job-message.dto.ts`                                                  | Extend `metadata` with optional `chunkIndex: number` + `chunkCount: number`                                                                                                                   |
| `src/entities/sentiment-run.entity.ts`                                                                        | Add `@Property() expectedChunks: number = 0` and `@Property() completedChunks: number = 0`                                                                                                    |
| `src/entities/sentiment-result.entity.ts:12-16`                                                               | Partial unique index `(run_id, submission_id) WHERE deleted_at IS NULL` — **migration converts to full unique index** (drops the partial predicate) to close the soft-delete duplicate hazard |
| `src/configurations/env/bullmq.env.ts`                                                                        | Add `SENTIMENT_CHUNK_SIZE: z.coerce.number().int().positive().default(50)`                                                                                                                    |
| `src/configurations/env/index.ts`                                                                             | No change — `bullmqEnvSchema.shape` spread already picks up the new key                                                                                                                       |
| `src/migrations/Migration20260316120000_add-cleaned-comment.ts`                                               | Migration style reference (ALTER TABLE ADD COLUMN)                                                                                                                                            |
| `.env.sample`                                                                                                 | Document `SENTIMENT_CHUNK_SIZE=50` with inline comment                                                                                                                                        |
| `/home/yander/Documents/codes/faculytics/sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.ts` | Worker — no change; confirms any batch size is accepted                                                                                                                                       |

### Technical Decisions

Locked from party-mode consensus (Winston, Barry, Dr. Quinn, John, user accepted 2026-04-17) and refined after investigation:

1. **Approach: Option A — API-side chunking**. Rejected: Option B (async `/run`+`/status`) unnecessary when chunks stay short; Option C (raise timeouts) doesn't scale past gateway hard caps.
2. **Chunk size**: env var `SENTIMENT_CHUNK_SIZE`, default **50**. Rationale: ~5-8s per chunk at worker internals (10×10). Tunable for post-RunPod rebaselining. No min constraint beyond `.int().positive()`.
3. **Failure semantics**: **fail-fast**. First chunk to exhaust BullMQ retries calls `OnStageFailed`. Error message format: `sentiment_analysis: chunk X/Y failed after N retries: <underlying error>`. Subsequent chunk failures hit the terminal-status guard and no-op.
4. **Progress model**: **chunk-level counters on `SentimentRun`** (`expectedChunks`, `completedChunks`) as the source of truth for "is this run done". **User-facing progress is unchanged** — pipeline-status DTO's existing `COUNT(SentimentResult) / submissionCount` already reports accurate item-level progress as chunks write results.
5. **No `SentimentChunk` entity**. Chunks are ephemeral BullMQ jobs; persistence is only on `SentimentRun` counters + existing `SentimentResult` rows.
6. **Scope is sentiment-only**. Topic modeling tracked as a separate follow-up ticket. Embeddings deferred until failure observed.
7. **Chunking survives RunPod migration**. RunPod `/runsync` hard cap is 300s; fine-tuned model doesn't change that ceiling.
8. **Chunk-index surfacing**: Extend `BatchAnalysisJobMessage.metadata` with optional `chunkIndex: z.number().int().min(0).optional()` and `chunkCount: z.number().int().positive().optional()`. `chunkIndex` is 0-based (admits 0). `chunkCount` is always ≥1 by invariant; `positive()` catches accidental zero-chunk envelopes loudly instead of silently. **Tighten the top-level `batchAnalysisJobSchema` to `.strict()`** so future field additions scream (Zod default `.strip()` would silently drop unknown keys). Non-breaking for existing persisted jobs since both new fields are `.optional()`. Enables "chunk X/Y" error messages without parsing jobId strings.
9. **Idempotent Persist inside the transaction**: Rely on the unique index `sentiment_result_run_id_submission_id_unique` — which **this spec converts from partial to full** via migration (see Decision 13). Catch `UniqueConstraintViolationException` from `@mikro-orm/core` _inside_ the `em.transactional` lambda. On catch: emit chunk-log `status: duplicate-swallowed`, skip the counter UPDATE (prior successful transaction already incremented), and return. Matches project-context.md "Error Handling for Concurrency" rule.
10. **Transactional persist + counter update (F2 fix — crash-safe)**: `Persist` wraps `fork.flush()` and the atomic counter UPDATE in a single `em.transactional()`. Crash / process-kill / unhandled exception between the two steps rolls back both — no orphan result rows with un-ticked counter. Retry replays cleanly: either the TX fully committed previously (retry hits `UniqueConstraintViolationException`, emits `duplicate-swallowed`, no double increment) or it fully rolled back (retry writes fresh and increments). This closes the deadlock class where a crash in the split-step design would strand the run with `completedChunks < expectedChunks` forever.
11. **Counter UPDATE folds over-increment + run-freshness checks (F2 + F9 fix)**: The UPDATE statement inside the transaction uses a single WHERE clause that encodes three guards:
    - `deleted_at IS NULL` — exclude soft-deleted runs
    - `completed_chunks < expected_chunks` — prevent over-increment on retried last chunks
    - `id = (SELECT id FROM sentiment_run WHERE pipeline_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)` — reject stale chunks from a superseded dispatch
      Zero rows returned means one of the three guards triggered; treat as `superseded` with a discriminator `reason` (`counter-saturated`, `run-soft-deleted`, or `stale-run` — determined by follow-up read on `completed_chunks` vs `expected_chunks` if needed).
12. **Post-terminal-pipeline chunks (F3 fix)**: Before opening the transaction, `Persist` reads pipeline status and checks against `TERMINAL_STATUSES` — the same constant used by `OnStageFailed` (pipeline-orchestrator.service.ts:973), which includes `FAILED`, `COMPLETED`, and `CANCELLED`. If the pipeline is in any terminal state, `Persist` emits `status: superseded` with `reason: pipeline-terminal` and returns without opening the transaction. Avoids out-of-order writes after fail-fast / cancellation.
13. **Unique index migration**: Same migration drops `sentiment_result_run_id_submission_id_unique` (partial, `WHERE deleted_at IS NULL`) and recreates it WITHOUT the predicate. Preflight check: `SELECT COUNT(*) FROM sentiment_result WHERE deleted_at IS NOT NULL GROUP BY run_id, submission_id HAVING COUNT(*) > 1` must return 0 rows — if not, the migration aborts. Rationale: the partial index was defensive against re-analysis of soft-deleted submissions, but within a single `SentimentRun` the (run_id, submission_id) pair is always unique regardless of soft-delete state.
14. **JobId zero-padding**: Use 4-digit zero-padded chunk index (`--sentiment--0000`, `--sentiment--0001`). Supports up to 10,000 chunks (500k submissions at chunk size 50), ample for any foreseeable semester. Prevents BullMQ jobId lexical ordering confusion in ops tooling.
15. **`run.jobId` semantic under chunking**: Set `run.jobId = `${pipeline.id}--sentiment`` (no chunk suffix) — the shared BullMQ jobId *prefix*. The field now names the run's jobId namespace rather than a single job. Per-chunk jobIds (`--0000`, `--0001`, …) are derivable. One-line inline comment at the assignment explains the shift for future readers.
16. **Structured per-chunk logging via pino object argument (F5 fix)**: Each `Persist` invocation path emits exactly one structured log event at its terminal point (persisted / duplicate-swallowed / superseded); each terminal `onFailed` invocation emits exactly one (failed). The helper passes the payload as an **object** to `this.logger.log(...)` / `this.logger.warn(...)`: `this.logger.log({ event: 'sentiment_chunk', ...fields })`. Pino flattens the object into top-level structured fields so `| jq 'select(.event == "sentiment_chunk")'` works. **Mandatory fields**: `pipelineId`, `runId`, `chunkIndex`, `chunkCount`, `durationMs` (number or null — null acceptable from `onFailed` when no `startedAt` is captured; best-effort computed as `Date.now() - (job.processedOn ?? Date.now())`), `attemptsMade`, `status` (`persisted` | `duplicate-swallowed` | `failed` | `superseded`). Optional fields: `reason` (discriminator on `superseded` / `failed`), `lastChunk: boolean` (true on the chunk that triggers `OnSentimentComplete`). Field names are locked — future dashboards depend on this contract.
17. **Worker-version drift warning**: If any chunk's `result.version` differs from a previously-persisted chunk's version within the same run, log a `warn` event `sentiment worker version mismatch within run` with both versions. Last chunk's version still wins on `SentimentRun.workerVersion` — the warn is observability, not enforcement.

## Implementation Plan

### Tasks

Ordered by dependency (lowest level first). A fresh agent can implement these top-to-bottom without further investigation.

- [x] **Task 1: Add `SENTIMENT_CHUNK_SIZE` env var**
  - File: `src/configurations/env/bullmq.env.ts`
  - Action: Add `SENTIMENT_CHUNK_SIZE: z.coerce.number().int().positive().default(50)` to the Zod schema object. Place it alphabetically near `BULLMQ_SENTIMENT_CONCURRENCY` for locality.
  - File: `.env.sample`
  - Action: Append line `SENTIMENT_CHUNK_SIZE=50  # submissions per sentiment-worker HTTP call; tune down if gateway timeouts recur`
  - Notes: `src/configurations/env/index.ts` needs no change — the schema is composed via `...bullmqEnvSchema.shape`.

- [x] **Task 2: Extend `BatchAnalysisJobMessage` metadata schema + tighten top-level envelope to `.strict()`**
  - File: `src/modules/analysis/dto/batch-analysis-job-message.dto.ts`
  - Action 1 — In the `metadata` object inside `batchAnalysisJobSchema`, add two optional fields with invariant-matching bounds:
    ```typescript
    metadata: z.object({
      pipelineId: z.string(),
      runId: z.string(),
      chunkIndex: z.number().int().min(0).optional(),   // 0-based
      chunkCount: z.number().int().positive().optional(), // always ≥1 by invariant
    }),
    ```
  - Action 2 — Call `.strict()` on the outer `batchAnalysisJobSchema` so future unexpected top-level fields fail validation loudly instead of being silently stripped. Today's default is `.strip()`:
    ```typescript
    export const batchAnalysisJobSchema = z.object({ … }).strict();
    ```
  - Notes:
    - `chunkIndex` is legitimately 0-based (first chunk is `0`); `chunkCount` is never 0 in practice (the dispatcher short-circuits on zero submissions before creating any envelope). Matching the schema to the invariant catches accidental envelope-construction bugs loudly.
    - `.strict()` on the outer envelope scopes only to unknown _top-level_ fields. The `metadata` sub-object remains default-`.strip()` to stay tolerant of worker-side passthrough behavior if the worker ever adds telemetry fields.
    - Worker-side `sentimentRequestSchema` uses `.passthrough()` on the outer schema but its inner `metadata` is default-`.strip()` — so the worker silently drops `chunkIndex` / `chunkCount` from its own view. Chunk identity is API-side only (follow-up ticket tracks updating the worker schema to surface chunk identity in worker-side logs).

- [x] **Task 3: Add `expectedChunks` + `completedChunks` to `SentimentRun` entity**
  - File: `src/entities/sentiment-run.entity.ts`
  - Action: Add two new properties between `submissionCount` and `workerVersion`:

    ```typescript
    @Property({ default: 0 })
    expectedChunks: number & Opt = 0;

    @Property({ default: 0 })
    completedChunks: number & Opt = 0;
    ```

  - Notes: Use `& Opt` type marker consistent with existing `status` field. Default 0 ensures historical rows are well-formed post-migration.

- [x] **Task 4: Create migration for counter columns + unique-index conversion**
  - File: `src/migrations/Migration20260417120000_sentiment-chunk-counters.ts` — **hand-write this file** with the exact filename and class name shown below. Do NOT use `npx mikro-orm migration:create` (which would generate a different timestamp and break the spec's references).
  - Action: Hand-written migration:

    ```typescript
    import { Migration } from '@mikro-orm/migrations';

    export class Migration20260417120000 extends Migration {
      override async up(): Promise<void> {
        // 1. Add counter columns (metadata-only on PG11+; no rewrite)
        this.addSql(
          `alter table "sentiment_run" add column "expected_chunks" int not null default 0;`,
        );
        this.addSql(
          `alter table "sentiment_run" add column "completed_chunks" int not null default 0;`,
        );

        // 2. Preflight: confirm no (run_id, submission_id) pairs exist across ALL rows (live + soft-deleted combined).
        // The new unique index is non-partial; a live+soft-deleted pair sharing the same keys would pass the
        // original soft-deleted-only preflight but fail CREATE UNIQUE INDEX at runtime. Check across everything.
        const rows = await this.execute(
          `select count(*)::int as n from (
             select run_id, submission_id
             from sentiment_result
             group by run_id, submission_id
             having count(*) > 1
           ) t`,
        );
        const dupeCount = Number(
          (rows[0] as { n: number } | undefined)?.n ?? 0,
        );
        if (dupeCount > 0) {
          throw new Error(
            `Cannot convert sentiment_result unique index to full: ${dupeCount} duplicate (run_id, submission_id) pairs exist (live + soft-deleted combined). Investigate before re-running.`,
          );
        }

        // 3. Drop the partial unique index and recreate without the predicate
        this.addSql(
          `drop index if exists "sentiment_result_run_id_submission_id_unique";`,
        );
        this.addSql(
          `create unique index "sentiment_result_run_id_submission_id_unique" on "sentiment_result" ("run_id", "submission_id");`,
        );
      }

      override async down(): Promise<void> {
        // Reverse order
        this.addSql(
          `drop index if exists "sentiment_result_run_id_submission_id_unique";`,
        );
        this.addSql(
          `create unique index "sentiment_result_run_id_submission_id_unique" on "sentiment_result" ("run_id", "submission_id") where deleted_at is null;`,
        );
        this.addSql(
          `alter table "sentiment_run" drop column "completed_chunks";`,
        );
        this.addSql(
          `alter table "sentiment_run" drop column "expected_chunks";`,
        );
      }
    }
    ```

  - Notes:
    - `ALTER TABLE ... ADD COLUMN ... DEFAULT 0` is metadata-only on PostgreSQL 11+ — safe online.
    - The index DROP/CREATE holds a short `ACCESS EXCLUSIVE` lock on `sentiment_result`. To avoid blocking writes on large tables, the implementer MAY rewrite the second step as `CREATE UNIQUE INDEX CONCURRENTLY "sentiment_result_run_id_submission_id_unique_new" ... ; DROP INDEX ... _unique; ALTER INDEX _unique_new RENAME TO _unique;` — but only if they split into separate migrations (CONCURRENTLY cannot run in a transaction).
    - The preflight check is the guard against the corruption scenario. If it fails, the implementer must reconcile or hard-delete duplicate rows before re-running. **The query checks all rows (live + soft-deleted combined)** because the new full unique index applies uniformly.
    - **MikroORM migration execution order gotcha**: `addSql(str)` **queues** strings to run after `up()` returns; `await this.execute(query)` runs **immediately** via the active driver connection. In this migration the preflight `this.execute(...)` runs _before_ the queued ALTER/DROP/CREATE strings execute. That's fine here because the preflight only reads `sentiment_result` (no dependency on the new columns or index shape). Future edits that depend on prior `addSql` results must account for this ordering — use `this.execute` throughout or structure carefully.
    - Verify with `npx mikro-orm migration:list` after running. Inspect `\d sentiment_run` and `\d sentiment_result` in psql to confirm the columns and index shape.

- [x] **Task 5: Rewrite `dispatchSentiment` to chunk submissions and enqueue N jobs**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts` (lines 1661-1717)
  - Action: Replace the single-job enqueue block with a chunk loop. Reference shape (logic, not literal copy):

    ```typescript
    const chunkSize = env.SENTIMENT_CHUNK_SIZE;
    const chunks: QuestionnaireSubmission[][] = [];
    for (let i = 0; i < submissions.length; i += chunkSize) {
      chunks.push(submissions.slice(i, i + chunkSize));
    }

    // UUIDs are client-generated by CustomBaseEntity, so `run.id` is available immediately after `em.create()`.
    // No pre-flush round-trip needed — set `run.jobId` and flush once.
    //
    // `run.jobId` under chunking names the BullMQ jobId *prefix* shared by all this run's chunks.
    // Per-chunk BullMQ jobIds are derived as `${run.jobId}--${paddedChunkIndex}`.
    const run = em.create(SentimentRun, {
      pipeline,
      submissionCount: submissions.length,
      expectedChunks: chunks.length,
      completedChunks: 0,
      status: RunStatus.PROCESSING,
      jobId: `${pipeline.id}--sentiment`,
    });
    await em.flush();

    const addOps = chunks.map(async (chunkItems, chunkIndex) => {
      const envelopeJobId = v4();
      const envelope: BatchAnalysisJobMessage = {
        jobId: envelopeJobId,
        version: '1.0',
        type: QueueName.SENTIMENT,
        items: chunkItems.map((s) => ({
          submissionId: s.id,
          text: s.cleanedComment!,
        })),
        metadata: {
          pipelineId: pipeline.id,
          runId: run.id,
          chunkIndex,
          chunkCount: chunks.length,
        },
        publishedAt: new Date().toISOString(),
      };
      batchAnalysisJobSchema.parse(envelope);
      const paddedIndex = String(chunkIndex).padStart(4, '0');
      await this.sentimentQueue.add(QueueName.SENTIMENT, envelope, {
        jobId: `${run.jobId}--${paddedIndex}`,
        attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
        backoff: { type: 'exponential', delay: env.BULLMQ_DEFAULT_BACKOFF_MS },
      });
    });
    await Promise.all(addOps);

    this.logger.log(
      `Dispatched sentiment batch for pipeline ${pipeline.id}: ${submissions.length} items in ${chunks.length} chunk(s) of up to ${chunkSize}`,
    );
    ```

  - Notes: Keep the existing zero-submissions guard (`submissions.length === 0` → `failPipeline`). `Promise.all` is safe because `Queue.add` is independent per job. The single-chunk case (submissions ≤ chunkSize) produces one job and is functionally identical to the pre-chunking behavior aside from the jobId suffix.

- [x] **Task 6: Rewrite `SentimentProcessor.Persist` for transactional persist + counter update + structured logging**
  - File: `src/modules/analysis/processors/sentiment.processor.ts`
  - Imports to add (none exist today in this file):
    ```typescript
    import { UniqueConstraintViolationException } from '@mikro-orm/core';
    import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
    import { PipelineStatus } from '../enums';
    import { TERMINAL_STATUSES } from '../services/pipeline-orchestrator.service'; // or wherever it's exported
    ```
    (If `TERMINAL_STATUSES` is not exported today, export it from `pipeline-orchestrator.service.ts` near line 973 as a named `export const` — a trivial refactor.)
  - Action: Replace the current `Persist` method body. New flow:
    1. **Capture start timestamp**: `const startedAt = Date.now();`
    2. Extract from `job.data.metadata`: `const { pipelineId, runId, chunkIndex = 0, chunkCount = 1 } = job.data.metadata;` — the fallbacks (`0` / `1`) preserve the pre-chunking single-batch envelope for any job queued before deploy.
    3. **Base payload** for log events: `const baseLog = { pipelineId, runId, chunkIndex, chunkCount, attemptsMade: job.attemptsMade };`
    4. **Pipeline status guard (F3 fix)**: fetch pipeline on a preliminary fork and compare against the full terminal set:
       ```typescript
       const statusFork = this.em.fork();
       const pipeline = await statusFork.findOneOrFail(
         AnalysisPipeline,
         pipelineId,
       );
       if (TERMINAL_STATUSES.includes(pipeline.status)) {
         this.emitChunkLog({
           ...baseLog,
           durationMs: Date.now() - startedAt,
           status: 'superseded',
           reason: 'pipeline-terminal',
         });
         return;
       }
       ```
    5. Worker-level failure handling (unchanged from today, with chunk-aware messages + log event):
       - If `result.status === 'failed'`: `await this.orchestrator.OnStageFailed(pipelineId, 'sentiment_analysis', `chunk ${chunkIndex + 1}/${chunkCount} failed after ${job.attemptsMade} retries: ${result.error}`);` then `this.emitChunkLog({ ...baseLog, durationMs: Date.now() - startedAt, status: 'failed', reason: result.error });` and return.
       - If `!result.results || result.results.length === 0`: similar pattern with message `chunk X/Y returned no results from worker`.
       - If `validResults.length === 0` (after filtering against `dispatchedIds`): message `chunk X/Y returned no valid results (all submissionIds unknown)`.
    6. **Worker-version drift check (Decision 17)**:
       ```typescript
       const latestRun = await statusFork.findOne(SentimentRun, runId);
       if (
         latestRun?.workerVersion &&
         latestRun.workerVersion !== result.version
       ) {
         this.logger.warn({
           event: 'sentiment_worker_version_drift',
           runId,
           priorVersion: latestRun.workerVersion,
           chunkVersion: result.version,
         });
       }
       ```
    7. **Transactional persist + counter update (F2 + F9 fold — crash-safe)**:

       ```typescript
       type CounterRow = { completedChunks: number; expectedChunks: number };

       const outcome = await this.em
         .transactional(async (tx) => {
           for (const raw of validResults) {
             const parsed = sentimentResultItemSchema.safeParse(raw);
             if (!parsed.success) {
               continue;
             } // existing per-item warn log kept as-is
             const item = parsed.data;
             const submission = tx.getReference(
               QuestionnaireSubmission,
               item.submissionId,
             );
             const run = tx.getReference(SentimentRun, runId);
             const scores = {
               positive: item.positive,
               neutral: item.neutral,
               negative: item.negative,
             };
             const label = Object.entries(scores).reduce((a, b) =>
               b[1] > a[1] ? b : a,
             )[0];
             tx.create(SentimentResult, {
               run,
               submission,
               positiveScore: item.positive,
               neutralScore: item.neutral,
               negativeScore: item.negative,
               label,
               rawResult: raw,
               processedAt: new Date(),
             });
           }

           try {
             await tx.flush();
           } catch (err) {
             if (err instanceof UniqueConstraintViolationException) {
               // Prior transaction committed this chunk's results. Skip counter (already ticked there).
               return { kind: 'duplicate-swallowed' as const };
             }
             throw err; // non-unique errors bubble out; transaction rolls back.
           }

           // Fold over-increment guard + run-freshness into a single UPDATE. Zero rows returned => superseded.
           const rows = await tx.getConnection().execute<CounterRow[]>(
             `UPDATE sentiment_run
            SET completed_chunks = completed_chunks + 1
            WHERE id = ?
              AND deleted_at IS NULL
              AND completed_chunks < expected_chunks
              AND id = (
                SELECT id FROM sentiment_run
                WHERE pipeline_id = ? AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT 1
              )
            RETURNING completed_chunks AS "completedChunks", expected_chunks AS "expectedChunks"`,
             [runId, pipelineId],
           );

           if (rows.length === 0) {
             // Roll back the just-inserted SentimentResult rows by throwing; MikroORM will rollback.
             // Either the run is superseded / soft-deleted / saturated.
             throw new SupersededChunkError('counter-saturated-or-superseded');
           }

           const { completedChunks, expectedChunks } = rows[0];
           return {
             kind: 'persisted' as const,
             completedChunks,
             expectedChunks,
           };
         })
         .catch((err) => {
           if (err instanceof SupersededChunkError)
             return { kind: 'superseded' as const, reason: err.message };
           throw err;
         });
       ```

       Define a local sentinel class `class SupersededChunkError extends Error {}` at file scope (or in the processor file) so the catch can discriminate without swallowing other errors.

    8. **Branch on outcome**:
       - `duplicate-swallowed`: `this.emitChunkLog({ ...baseLog, durationMs: ..., status: 'duplicate-swallowed' });` return.
       - `superseded`: `this.emitChunkLog({ ...baseLog, durationMs: ..., status: 'superseded', reason: outcome.reason });` return.
       - `persisted`:
         - If `completedChunks === expectedChunks`: mark run complete via a fresh fork — `const completeFork = this.em.fork(); const run = await completeFork.findOneOrFail(SentimentRun, runId); run.status = RunStatus.COMPLETED; run.workerVersion = result.version; run.completedAt = new Date(); await completeFork.flush();` — then `await this.orchestrator.OnSentimentComplete(pipelineId);` — then `this.emitChunkLog({ ...baseLog, durationMs: ..., status: 'persisted', lastChunk: true });`
         - Else: `this.emitChunkLog({ ...baseLog, durationMs: ..., status: 'persisted', lastChunk: false });`

  - Notes:
    - `updated_at` is deliberately NOT set in the raw UPDATE — `CustomBaseEntity.updatedAt` has no `onUpdate` hook and is insert-frozen across the codebase (see base.entity.ts:11-12). Keep that invariant.
    - Rolling back on superseded returns the pre-transaction state, so no partial `SentimentResult` rows land for a stale-run chunk. This is the correct behavior: the stale run should not accumulate data.
    - The `em.transactional` boundary holds row locks on any row referenced by the inserted `SentimentResult` FKs + the `sentiment_run` row being updated. With `BULLMQ_SENTIMENT_CONCURRENCY=3`, at most 3 such TXes run in parallel per node — operator should watch `pg_locks` on first large-scale deploy (see PR checklist in Notes).

- [x] **Task 7: Update `SentimentProcessor.onFailed` to surface chunk identity + emit structured log + handle malformed envelopes**
  - File: `src/modules/analysis/processors/sentiment.processor.ts` (current lines 135-149)
  - Action: Pull `chunkIndex` + `chunkCount` from `job.data?.metadata`. Guard explicitly against missing `pipelineId` (type-correctness under strict null checks AND defensive logging for malformed envelopes):

    ```typescript
    const pipelineId = job.data?.metadata?.pipelineId;
    const runId = job.data?.metadata?.runId;
    const chunkIndex = job.data?.metadata?.chunkIndex ?? 0;
    const chunkCount = job.data?.metadata?.chunkCount ?? 1;
    const attempts = job.opts?.attempts ?? 3;

    // Best-effort duration: BullMQ sets `processedOn` when the worker picks up the job.
    const durationMs = job.processedOn
      ? Math.max(0, Date.now() - job.processedOn)
      : null;

    if (!pipelineId || !runId) {
      // Malformed envelope (should be impossible post-Zod parse at enqueue time, but defend the type contract).
      this.logger.error({
        event: 'sentiment_chunk_malformed_envelope',
        jobId: job.id,
        queueName: job.queueName,
        attemptsMade: job.attemptsMade,
        reason: error.message,
      });
      return;
    }

    // Guard: only fire on terminal failure. Non-terminal retries are logged by BullMQ itself.
    if (job.attemptsMade < attempts) {
      return;
    }

    const message = `chunk ${chunkIndex + 1}/${chunkCount} failed after ${attempts} retries: ${error.message}`;

    this.emitChunkLog({
      pipelineId,
      runId,
      chunkIndex,
      chunkCount,
      durationMs,
      attemptsMade: job.attemptsMade,
      status: 'failed',
      reason: error.message,
    });

    this.orchestrator
      .OnStageFailed(pipelineId, 'sentiment_analysis', message)
      .catch((err: Error) =>
        this.logger.error(
          `Failed to update pipeline on failure: ${err.message}`,
        ),
      );
    ```

  - Call the original `super.onFailed(job, error)` **before** this new logic (preserving base-class error logging).
  - Notes: `OnStageFailed` is idempotent so parallel chunk failures are safe. Testing requirement: add a unit test for the malformed-envelope path (job with no `metadata.pipelineId`) asserting `error`-level log and no `OnStageFailed` call.

- [x] **Task 8: Extend `sentiment.processor.spec.ts` with chunking test coverage**
  - File: `src/modules/analysis/processors/sentiment.processor.spec.ts`
  - Action: Using existing `createMockBatchJob` helper, add test cases (see Testing Strategy for list). Extend the mock `em` to include a `getConnection().execute` fake that returns configurable `{ completed_chunks, expected_chunks }` rows. Mock `fork.findOneOrFail(AnalysisPipeline, ...)` to return pipeline objects with configurable status.
  - Notes: Keep existing single-chunk tests passing by defaulting mocks to `chunkIndex: 0, chunkCount: 1, completed_chunks: 1, expected_chunks: 1` — this is the one-chunk happy path.

- [x] **Task 9: Extract `dispatchSentiment` into a testable pure helper + add unit tests**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action 1 — Add an exported pure function (or a private static method if file scope is preferred): `chunkSubmissionsForSentiment(submissions: QuestionnaireSubmission[], chunkSize: number): QuestionnaireSubmission[][]`. This is the only logic that needs unit-testing in isolation — the chunk-split math. It's pure, synchronous, and has no dependencies.
  - File (new): `src/modules/analysis/services/__tests__/chunk-submissions-for-sentiment.spec.ts`
  - Action 2 — Direct unit tests for the helper:
    - 785 submissions, chunkSize 50 → 16 chunks (sizes `[50, 50, 50, ..., 50, 35]`).
    - 40 submissions, chunkSize 50 → 1 chunk of 40.
    - 50 submissions, chunkSize 50 → 1 chunk of 50.
    - 0 submissions, chunkSize 50 → empty array (caller handles the zero-submission failure path).
    - Property test: for any `n`, `sum(chunks.map(c => c.length)) === n` and no submission appears in two chunks.
  - File (new): `src/modules/analysis/services/__tests__/pipeline-orchestrator.chunking.spec.ts`
  - Action 3 — Integration-style test for `dispatchSentiment` via the service's public entry point (whichever transitions a pipeline into the sentiment stage). Mock `EntityManager`, `sentimentQueue.add`, and verify:
    - Correct chunk count matches helper output.
    - `SentimentRun` is created once with `expectedChunks = chunks.length` and `jobId = ${pipeline.id}--sentiment`.
    - `sentimentQueue.add` called N times with jobIds `${pipeline.id}--sentiment--0000` through `...--<padded N-1>` and matching `metadata.chunkIndex` / `metadata.chunkCount` on each envelope.
    - Zero-submission path: no `sentimentQueue.add` calls, `failPipeline` is invoked with the existing message.
  - Notes: The helper extraction is trivial (<10 LOC) but removes all ambiguity about how to unit-test the most-important piece of the change. The integration test exercises the wiring; the helper test exercises the math.

- [x] **Task 10: Run migration locally + verify pre-implementation assumptions**
  - Action 1 — migration: `cd api.faculytics && npx mikro-orm migration:up && npx mikro-orm migration:list` — confirm the new migration is listed as applied. Query `\d sentiment_run` in psql to confirm both counter columns exist with the correct defaults. Query `\d sentiment_result` to confirm the unique index is now **without** the `WHERE deleted_at IS NULL` predicate.
  - Action 2 — mock worker contract check: read `api.faculytics/mock-worker/server.ts` (or whichever file handles the sentiment route). Confirm the response shape matches `sentimentResultItemSchema` — specifically that it returns `{ output: { jobId, version, status: 'completed', results: [{ submissionId, positive, neutral, negative }], completedAt } }`. If it does NOT match (e.g., returns a flat `{ sentiment, confidence }`), **file a precursor fix** before running integration smoke — the chunking integration test cannot succeed otherwise.
  - Action 3 — `updated_at` behavior verification: confirm whether `CustomBaseEntity.updated_at` has a DB-level default/trigger or relies solely on MikroORM's `@Property({ onUpdate })` hook. Inspect with `\d+ sentiment_run` and look for `DEFAULT` clauses or triggers. If there is NO DB-level mechanism, the raw SQL `SET updated_at = now()` in Task 6 is required (keep as-is). If there IS a DB-level trigger, the raw SET is redundant but harmless.
  - Action 4 — rollback dry-run: `npx mikro-orm migration:down` then `migration:up` again on a scratch DB. Confirm the round-trip is clean and the preflight check's dupe query continues to return 0 rows.
  - Notes: Not a code change; documented as a task so none of these verifications are skipped. Block the PR until all four actions pass.

- [x] **Task 11: Lint + typecheck**
  - Action: `npm run lint` and `npm run build` in `api.faculytics`. Fix any strict-null-check or import issues.

- [x] **Task 12: Define and wire the structured per-chunk log event (pino object-argument pattern)**
  - File: `src/modules/analysis/processors/sentiment.processor.ts`
  - Action 1 — Define the log event payload type (mandatory fields per Decision 16, `durationMs` is nullable for best-effort reporting from `onFailed`):

    ```typescript
    type ChunkLogStatus =
      | 'persisted'
      | 'duplicate-swallowed'
      | 'failed'
      | 'superseded';

    interface ChunkLogFields {
      pipelineId: string;
      runId: string;
      chunkIndex: number;
      chunkCount: number;
      durationMs: number | null; // nullable: onFailed may not have a reliable start timestamp
      attemptsMade: number;
      status: ChunkLogStatus;
      reason?: string;
      lastChunk?: boolean;
    }
    ```

  - Action 2 — Add the private helper. **Pass the payload as an object, not a stringified JSON** — `nestjs-pino` takes the object and flattens its top-level keys into the structured log line:
    ```typescript
    private emitChunkLog(fields: ChunkLogFields): void {
      const payload = { event: 'sentiment_chunk', ...fields };
      if (fields.status === 'failed' || fields.status === 'superseded') {
        this.logger.warn(payload);
      } else {
        this.logger.log(payload);
      }
    }
    ```
  - Action 3 — Wire the helper at every exit point: steps 4, 5, 8 of the revised Task 6, and the terminal-failure point of Task 7. Every exit path emits exactly one `emitChunkLog` call.
  - Notes:
    - The output shape in production logs is `{"level":30,"event":"sentiment_chunk","pipelineId":"...","runId":"...",...,"msg":""}`. `jq 'select(.event == "sentiment_chunk")'` works. **Never call `this.logger.log(JSON.stringify(...))`** — pino will put the whole JSON string inside `msg` as an escaped string, breaking the contract.
    - The field names are a **public contract** for future dashboards — don't rename without coordinating.
    - Unit tests must spy on `this.logger.log` / `this.logger.warn` with an **object matcher** (Jest `expect.objectContaining(...)`), not a string matcher, to match the pino-native call shape.

### Acceptance Criteria

Every AC is testable via the test strategy in the following section.

- [ ] **AC 1 (chunk math): Given** a dispatch of 785 submissions with `SENTIMENT_CHUNK_SIZE=50`, **when** `dispatchSentiment` executes, **then** 16 BullMQ `Queue.add` calls occur (15 chunks of 50 + 1 of 35) and a single `SentimentRun` is created with `expectedChunks = 16` and `submissionCount = 785`.
- [ ] **AC 2 (single-chunk): Given** a dispatch of 40 submissions with `SENTIMENT_CHUNK_SIZE=50`, **when** `dispatchSentiment` executes, **then** exactly 1 BullMQ `Queue.add` call occurs with jobId suffix `--sentiment--0000` and `SentimentRun.expectedChunks = 1`.
- [ ] **AC 3 (jobId pattern): Given** a dispatch producing 16 chunks, **when** jobs are enqueued, **then** jobIds are `${pipelineId}--sentiment--0000` through `${pipelineId}--sentiment--0015` (4-digit zero-padded).
- [ ] **AC 4 (envelope metadata): Given** any chunk dispatched, **when** the envelope is inspected, **then** `metadata.chunkIndex` and `metadata.chunkCount` are set to the chunk's index and the total chunk count respectively; `batchAnalysisJobSchema.parse(envelope)` succeeds.
- [ ] **AC 5 (last-chunk completion): Given** a run with `expectedChunks = 3` and `completedChunks = 2`, **when** the third chunk's `Persist` transaction commits successfully, **then** the atomic counter UPDATE returns `completedChunks = 3, expectedChunks = 3` (aliased camelCase), the run is marked `status = COMPLETED` with `workerVersion` and `completedAt` populated in a follow-up fork, and `OnSentimentComplete(pipelineId)` is called exactly once with the last-chunk log entry carrying `lastChunk: true`.
- [ ] **AC 6 (non-last chunk): Given** a run with `expectedChunks = 3` and `completedChunks = 0`, **when** the first chunk's `Persist` transaction commits, **then** the counter UPDATE returns `completedChunks = 1, expectedChunks = 3`, `run.status` remains `PROCESSING`, `OnSentimentComplete` is NOT called, and the chunk-log entry carries `lastChunk: false`.
- [ ] **AC 7 (progress reporting): Given** a run with 785 submissions split into 16 chunks, **when** 3 chunks have completed (150 `SentimentResult` rows written), **then** the pipeline-status endpoint returns `sentiment.progress = { current: 150, total: 785 }`.
- [ ] **AC 8 (fail-fast message — generic): Given** a chunk that exhausts `BULLMQ_DEFAULT_ATTEMPTS` retries with any underlying `Error.message`, **when** `onFailed` fires, **then** `OnStageFailed(pipelineId, 'sentiment_analysis', message)` is called with `message` matching `/^chunk \d+\/\d+ failed after \d+ retries: .+/`. The regex deliberately does not anchor on specific underlying messages because `base-batch.processor.ts:65` (timeout path) and `:73-75` (non-2xx path) produce different strings.
- [ ] **AC 9 (fail-fast idempotency): Given** a pipeline already in `FAILED` status due to one failed chunk, **when** a second chunk also exhausts retries and calls `OnStageFailed`, **then** the pipeline status does not change and no duplicate `PipelineFailureAudit` is written (verified by existing idempotency guard; add assertion in test).
- [ ] **AC 10 (retry idempotency via committed prior): Given** a chunk whose results have already been committed in a prior transaction, **when** BullMQ re-delivers the same chunk job, **then** `tx.flush()` inside the new transaction throws `UniqueConstraintViolationException`, the transaction lambda returns `{ kind: 'duplicate-swallowed' }` without executing the counter UPDATE, the handler emits one `emitChunkLog` event with `status: 'duplicate-swallowed'`, and returns without calling `OnSentimentComplete`. (The prior successful transaction already incremented `completedChunks`, so no double-increment occurs.)
- [ ] **AC 11 (zero submissions): Given** a pipeline with zero submissions having `cleanedComment != null`, **when** `dispatchSentiment` executes, **then** the pipeline fails with the existing message `"No submissions with cleaned comments found for sentiment analysis"` — no SentimentRun is created and no BullMQ jobs are enqueued.
- [ ] **AC 12 (post-terminal chunk no-op — all terminal states): Given** a pipeline in any terminal state (`FAILED`, `COMPLETED`, or `CANCELLED` — matched against `TERMINAL_STATUSES`), **when** a residual chunk's `Persist` is invoked, **then** no transaction is opened, no `SentimentResult` rows are written, the counter is not incremented, `OnSentimentComplete` is not called, and exactly one `emitChunkLog` event is emitted with `status: 'superseded'` and `reason: 'pipeline-terminal'`.
- [ ] **AC 13 (env var validation): Given** `SENTIMENT_CHUNK_SIZE=-1` in the environment, **when** the app boots, **then** Zod validation fails at startup with a clear message; given `SENTIMENT_CHUNK_SIZE` unset, **then** the effective value is `50`.
- [ ] **AC 14 (migration): Given** the new migration is applied, **when** `\d sentiment_run` is inspected in psql, **then** columns `expected_chunks int not null default 0` and `completed_chunks int not null default 0` are present; `migration:down` followed by `migration:up` round-trips cleanly.
- [ ] **AC 15 (backward-compat envelope): Given** a legacy envelope without `chunkIndex`/`chunkCount` in metadata (e.g. queued before the deploy), **when** `Persist` runs, **then** it treats the job as chunk 1 of 1 and does not crash on missing fields.
- [ ] **AC 16 (counter over-increment guard): Given** a run with `completedChunks = 3, expectedChunks = 3` (already saturated), **when** a retried last chunk's `Persist` transaction reaches the counter UPDATE, **then** the UPDATE returns zero rows (the `completed_chunks < expected_chunks` guard triggers), a `SupersededChunkError` is thrown rolling back the transaction so no `SentimentResult` rows land, the handler emits one `emitChunkLog` event with `status: 'superseded'` and `reason` containing `counter-saturated-or-superseded`, and `OnSentimentComplete` is NOT called a second time.
- [ ] **AC 17 (cross-dispatch run supersede): Given** a pipeline that was cancelled and re-dispatched (a new `SentimentRun` exists with a later `createdAt`), **when** a chunk carrying the OLD `runId` reaches its transactional UPDATE, **then** the sub-select in the UPDATE's WHERE clause (`id = (SELECT id ... ORDER BY created_at DESC LIMIT 1)`) rejects the row, the UPDATE returns zero rows, `SupersededChunkError` rolls back the transaction (no `SentimentResult` rows for the stale run), `emitChunkLog` emits `status: 'superseded'`, and `OnSentimentComplete` is NOT called for the stale run.
- [ ] **AC 18 (soft-delete-then-retry idempotency — F9): Given** a `SentimentResult` row was soft-deleted (simulated by setting `deleted_at`) and the same chunk retries, **when** `Persist.fork.flush()` runs, **then** the flush raises `UniqueConstraintViolationException` (because the migrated unique index no longer has the `WHERE deleted_at IS NULL` predicate), the processor logs `duplicate-swallowed`, the counter is NOT incremented again, and no duplicate live row is created.
- [ ] **AC 19 (structured log contract): Given** any `Persist` invocation path (persisted / duplicate-swallowed / superseded), **when** the path terminates, **then** exactly one `emitChunkLog` call occurs on that path with all mandatory fields present (`pipelineId`, `runId`, `chunkIndex`, `chunkCount`, `durationMs` _(nullable)_, `attemptsMade`, `status`). **And Given** any terminal `onFailed` invocation (where `job.attemptsMade >= job.opts.attempts`), **when** the handler completes, **then** exactly one `emitChunkLog` call occurs with `status: 'failed'` and all mandatory fields present. Assertable by spying on `this.logger.log` / `this.logger.warn` with `expect.objectContaining({ event: 'sentiment_chunk', pipelineId: expect.any(String), ..., status: 'persisted' | 'duplicate-swallowed' | 'superseded' | 'failed' })`.
- [ ] **AC 20 (worker-version drift warning — F13): Given** a run where `SentimentRun.workerVersion` is already set to `"1.0.0-openai"` and a new chunk returns `result.version: "1.0.1-openai"`, **when** `Persist` executes the drift check, **then** a `warn` log `"sentiment worker version mismatch within run"` is emitted with both version strings; persistence proceeds normally; last-chunk-wins still applies to the final `workerVersion` on the run row.
- [ ] **AC 21 (migration preflight — all rows): Given** the database has zero duplicate `(run_id, submission_id)` pairs across all `sentiment_result` rows (live and soft-deleted combined), **when** `migration:up` runs, **then** the unique-index conversion succeeds; **given** one or more such duplicate pairs exist in ANY combination (live+live, live+deleted, deleted+deleted), **when** `migration:up` runs, **then** it throws with a clear message naming the duplicate count and the migration transaction rolls back cleanly.
- [ ] **AC 22 (fail-fast on timeout path): Given** a chunk that exhausts retries due to worker HTTP timeout (underlying error `"HTTP request to sentiment worker timed out after 90000ms"`), **when** `onFailed` fires, **then** the `OnStageFailed` message matches `/^chunk \d+\/\d+ failed after \d+ retries: HTTP request to sentiment worker timed out/`. This complements AC 8 which covers the generic shape; AC 22 pins the timeout-specific underlying message.
- [ ] **AC 23 (transactional rollback on crash — F2): Given** a chunk whose `fork.flush()` (or counter UPDATE) throws an unhandled error mid-transaction, **when** the handler exits, **then** (a) no `SentimentResult` rows are committed for that chunk, (b) `completedChunks` is NOT incremented, (c) the error propagates to BullMQ triggering a standard retry, and (d) on retry the chunk replays cleanly either fully persisting + incrementing, or hitting `UniqueConstraintViolationException` from a prior committed transaction and emitting `duplicate-swallowed`.
- [ ] **AC 24 (malformed envelope in `onFailed` — F6): Given** a terminal job failure whose `job.data.metadata.pipelineId` is undefined, **when** `onFailed` fires, **then** an `error`-level log event `sentiment_chunk_malformed_envelope` is emitted with `jobId`, `queueName`, `attemptsMade`, and the underlying error, and `OnStageFailed` is NOT called (nothing to notify — the pipeline reference is missing).

## Review Notes

Adversarial review: 15 findings. Auto-fix applied (resolution approach: [F] Fix automatically).

**Fixed (6 real issues):**

- **F1 (critical)** — `tx.getConnection().execute()` now passes `tx.getTransactionContext()` as the 4th arg, guaranteeing the counter UPDATE runs inside the transaction. Verified against `@mikro-orm/knex/AbstractSqlConnection.js:129` signature `execute(query, params, method, ctx)`.
- **F2** — Run-completion writes (`status`/`workerVersion`/`completedAt`) folded INTO the `em.transactional` block; `OnSentimentComplete` moved outside. If a prior last-chunk tx committed but `OnSentimentComplete` failed, the retry's `duplicate-swallowed` path re-reads the counter and re-fires `OnSentimentComplete` when saturated. Closes the stranded-pipeline hazard.
- **F3** — `statusFork.findOneOrFail(AnalysisPipeline)` → `findOne` + null-check → `superseded` log with `reason: 'pipeline-missing'`. No retry budget / OpenAI tokens burned on soft-deleted pipelines.
- **F4** — `SupersededChunkError` no longer carries a conflated message. New `determineSupersedeReason` follow-up read discriminates `counter-saturated` / `run-soft-deleted` / `stale-run` / `run-missing` / `unknown` on the superseded log.
- **F9** — Mock worker now rotates through positive/neutral/negative score buckets per `submissionId` hash so smoke tests exercise all sentiment-gate branches.
- **F12** — `statusFork.findOne(SentimentRun, { id: runId, pipeline: pipelineId })` verifies run-to-pipeline ownership; mismatch emits `superseded` with `reason: 'run-missing-or-mismatched'`.

**F15 resolved by investigation:** Memory claimed #307 still open → verified closed via `gh issue view` → memory updated. The regenerated `.snapshot-faculytics_db.json` in this diff is safe to commit (only `expected_chunks`/`completed_chunks` columns and the partial-predicate removal).

**Skipped (documented):**

- F5, F10 (real-DB concurrency + cross-pipeline tests) — unit tests with mocked `execute` cover correctness per MikroORM contract; PR checklist still recommends `pg_locks` observation on first large staging deploy.
- F6 (`durationMs` semantic differences across status paths) — documented; not materially misleading.
- F7 (`.strict()` scope audit) — only caller is `dispatchSentiment`; downstream risk low.
- F8 (fork-sequence test fragility) — replaced with per-call fork factory returning cleanly-configured forks per test.
- F11, F13, F14 — cosmetic / observability-only; deferred.

Tests: **1068 pass / 93 suites** (4 new tests for F1/F2/F3/F4/F12 paths). `npm run build` + `npm run lint` clean.

## Additional Context

### Dependencies

- **No new npm packages**.
- **MikroORM migration**: one new file; two `ALTER TABLE ... ADD COLUMN` statements plus `DROP INDEX` / `CREATE UNIQUE INDEX` for the `sentiment_result` uniqueness widening; `ADD COLUMN ... DEFAULT 0` is metadata-only on PostgreSQL 11+, the index replacement holds a short `ACCESS EXCLUSIVE` lock (see Task 4 notes for the online-migration alternative if lock time is a concern).
- **New import in `sentiment.processor.ts`**: `import { UniqueConstraintViolationException } from '@mikro-orm/core';`. This import does not exist in the file today — Task 6 adds it. (The sibling class `dimensions.service.ts` imports the same symbol from `@mikro-orm/postgresql`; both re-export the same underlying class, but `@mikro-orm/core` is the canonical source and is what this spec locks in.)
- **Env plumbing**: `src/configurations/env/index.ts` needs no change — `bullmqEnvSchema.shape` spread picks up the new key automatically.
- **Worker contract**: zero changes to `sentiment.worker.temp.faculytics` — its input schema uses `.passthrough()` and tolerates the extra metadata fields.

### Testing Strategy

**Unit tests (co-located `*.spec.ts`):**

- `sentiment.processor.spec.ts` — new cases:
  - Chunk 1/1 happy path (backwards-compat, single-chunk behavior) — full transaction commits, counter reaches `expected`, `OnSentimentComplete` fires.
  - Chunk 2/3 non-last persist → counter increments, no `OnSentimentComplete`, chunk-log event `status: persisted` with `lastChunk: false`.
  - Chunk 3/3 last persist → counter reaches `expected`, `OnSentimentComplete` called once, chunk-log event has `lastChunk: true`.
  - Chunk retry after committed prior persist → `tx.flush()` throws `UniqueConstraintViolationException` inside the transaction lambda, lambda returns `{ kind: 'duplicate-swallowed' }`, counter NOT re-incremented, chunk-log `status: duplicate-swallowed`, no `OnSentimentComplete`.
  - Chunk arriving after pipeline in any terminal state (`FAILED`, `COMPLETED`, `CANCELLED`) → early return before opening the transaction, no writes, no counter change, chunk-log `status: superseded` with `reason: pipeline-terminal`.
  - Chunk from stale dispatch (sub-select rejects the row at UPDATE time) → counter UPDATE returns zero rows, `SupersededChunkError` thrown, transaction rolls back, no `SentimentResult` rows land, chunk-log `status: superseded`.
  - Retried last chunk against saturated counter → `completed_chunks < expected_chunks` guard rejects the UPDATE, zero rows, `SupersededChunkError`, transaction rolls back, chunk-log `status: superseded`.
  - **Transactional rollback on mid-persist crash (AC 23)**: simulate a `tx.flush()` throwing a non-unique error (e.g., FK violation) → `em.transactional` rolls back, no `SentimentResult` rows commit, counter unchanged, error propagates to BullMQ.
  - `onFailed` on terminal failure produces `chunk X/Y failed after N retries: ...` message (regex per AC 8), emits chunk-log `status: failed` with `durationMs` best-effort from `job.processedOn`.
  - `onFailed` with malformed envelope (missing `pipelineId`) → emits `error`-level `sentiment_chunk_malformed_envelope` log, does NOT call `OnStageFailed` (AC 24).
  - Worker returns `status: 'failed'` for one chunk → `OnStageFailed` called with chunk-aware message, chunk-log `status: failed`, return before opening transaction.
  - Worker returns empty `results` → same handling.
  - Chunk reports `result.version` differing from `SentimentRun.workerVersion` → `warn` log with both versions, persist proceeds.
  - `emitChunkLog` pino-native object shape: spy on `this.logger.log` / `this.logger.warn` with `expect.objectContaining({ event: 'sentiment_chunk', ...mandatory_fields })` for each terminal status path.
- `pipeline-orchestrator.chunking.spec.ts` (new or extending existing orchestrator spec):
  - 785 submissions → 16 chunks, `SentimentRun.expectedChunks = 16`, 16 `Queue.add` calls with correctly-padded jobIds.
  - 40 submissions → 1 chunk, jobId suffix `--sentiment--0000`.
  - Zero submissions → existing `failPipeline` path, no queue calls.
  - Envelope metadata includes `chunkIndex` and `chunkCount` — verified via `add` call arguments.
- `batch-analysis-job-message.dto.spec.ts` (add case, or inline in an existing DTO spec):
  - `batchAnalysisJobSchema.parse(envelopeWithChunkFields)` succeeds.
  - `batchAnalysisJobSchema.parse(envelopeWithoutChunkFields)` still succeeds (optional fields).

**Integration / manual tests:**

- **Precondition** (per Task 10 Action 2): confirm `mock-worker/server.ts` returns the full `sentimentResultItemSchema` shape. If the mock is a legacy flat-response implementation, it must be updated before the integration test is meaningful.
- `docker compose up` (Redis + mock sentiment worker) — trigger a USER pipeline against a seeded fixture of ≥500 comments. Observe: N BullMQ jobs visible in Redis (`KEYS bull:sentiment:*`), progress endpoint reports `current` climbing monotonically, `OnSentimentComplete` fires exactly once, pipeline advances to `SENTIMENT_GATE` then `TOPIC_MODELING`. Confirm structured chunk-log events appear in stdout with the mandatory field set and can be filtered via `| jq 'select(.event == "sentiment_chunk")'`.
- Simulate a chunk failure by temporarily setting the mock worker to return HTTP 500 for 20% of requests — verify fail-fast with an audit log entry containing `chunk X/Y failed` and a `status: failed` chunk-log event.
- **Frontend smoke (`app.faculytics`)** — with the same ≥500 comment pipeline running, open the pipeline-status view in the browser and verify the sentiment progress bar animates smoothly (incremental updates rather than a single 0→100% leap). This is a visual check only; no frontend code change is expected since the DTO shape is unchanged.

**Regression checks:**

- Existing tests in `sentiment.processor.spec.ts`, `pipeline-orchestrator.audit.spec.ts`, `pipeline-orchestrator.scheduler.spec.ts` must pass unchanged.
- `npm run lint` and `npm run build` clean.

### Notes

**Operational impact:**

- Operators gain richer audit logs: per-chunk failure messages via `PipelineFailureAudit` (message passed verbatim through `OnStageFailed`) plus structured `sentiment_chunk` log events per Decision 16. Dashboards can aggregate on `status`, `pipelineId`, `durationMs`, and `attemptsMade`.
- Redis memory footprint grows proportionally — 16 job records instead of 1 for a 785-comment run. Negligible at current scale.
- BullMQ `sentiment` queue throughput governed by `BULLMQ_SENTIMENT_CONCURRENCY=3` — 3 chunks in flight at a time, predictable OpenAI load from the worker side.

**Deploy & rollback runbook (include this in the PR description):**

1. **Forward (merge):** Ensure no large sentiment pipelines are actively dispatching at merge time — a pipeline crossing the deploy boundary may have some chunks on the old code and some on the new. In-flight chunks from the pre-deploy code are a single big-batch job; they'll complete (or 504) on the old timeout. New dispatches after deploy use the chunked path.
2. **Backward (rollback):** Before running `migration:down`, drain the sentiment queue — either wait for in-flight pipelines to terminate or manually mark them `FAILED`. The `down` migration drops `expected_chunks` / `completed_chunks` columns and re-adds the partial unique index. If any pipeline is mid-chunking when rollback runs, its in-flight BullMQ jobs will fail hard on missing columns. Document the drain step in the PR; it is the responsibility of the deploy engineer, not the code.

**PR description checklist (merge-time gates):**

- [ ] Confirm mock worker contract matches `sentimentResultItemSchema` (Task 10 Action 2) before integration smoke.
- [ ] Run `grep -rn 'run\.jobId\|\.jobId =' src/` and confirm no downstream consumer (admin tooling, audit query, dashboard) depends on the pre-change semantic of `SentimentRun.jobId`. If any is found, coordinate the change.
- [ ] On the first staging deploy of a large pipeline (≥500 comments), watch `pg_locks` for row-lock contention on `sentiment_run` during peak chunk concurrency. With `BULLMQ_SENTIMENT_CONCURRENCY=3` the worst case is 3 concurrent row locks — should be invisible. Flag the deploy engineer if anything beyond that shows up.
- [ ] Confirm `npm run build` passes under strict null checks (Task 7's early-return on missing `pipelineId` must be wired).
- [ ] Confirm structured log output in staging: tail `nestjs-pino` stdout, filter with `jq 'select(.event == "sentiment_chunk")'`, confirm flat top-level fields (not escaped string inside `msg`).

**Known limitations (accepted, documented):**

- Chunks arriving after pipeline cancellation or fail-fast still consume BullMQ retry budget before hitting the terminal-status guard in `Persist`. Cost breakdown at current scale:
  - **Single fail-fast** (one chunk triggers `OnStageFailed`, remaining chunks retry to exhaustion): with `BULLMQ_DEFAULT_ATTEMPTS=3`, chunk size 50, up to ~2-3 orphaned chunks × 50 items × ~$0.0001/item ≈ **$0.015 per failed pipeline**.
  - **Cascade scenario** (e.g., network burst failing pipelines across 20 campuses simultaneously) ≈ **$0.30 total**.
  - **Cancel-then-redispatch during a large run**: a 785-comment pipeline re-dispatched mid-flight can leave up to 16 chunks × 3 attempts = 48 orphan worker calls × ~$0.005 (50 items per call) ≈ **$0.25 per re-dispatch**. Each orphan call hits the stale-run guard and rolls back cleanly — no data corruption — but the OpenAI bill is real.
  - Active cancellation (queue drain via `Queue.remove` keyed on `${pipelineId}--sentiment--*`) is deferred to a follow-up ticket; at this loss magnitude the BullMQ integration cost is not justified.
- `workerVersion` and `completedAt` on `SentimentRun` reflect the last chunk's report only. The Decision 17 drift warning surfaces the rare mid-run worker upgrade case so operators can decide whether to re-run the pipeline. If mid-run upgrades become common, move `workerVersion` to per-`SentimentResult`.
- Hardcoded line-number citations in this spec (e.g., `pipeline-orchestrator.service.ts:1661-1717`) may drift as the file evolves. Acceptable for a quick-flow spec with a days-long lifespan; update if the spec is re-used for related tickets.

**Schema forward-compatibility (Decision 8 reinforcement — F3):**
The API-side `batchAnalysisJobSchema` is strict-by-default (no `.passthrough()`). Any _future_ field added here must be `.optional()` to remain backward-compatible with in-flight envelopes queued before the deploy. If a future field must be required, coordinate a worker-side update and a queue-drain deployment window.

**Future considerations (out of scope but worth tracking):**

- Apply the same chunking pattern to `dispatchTopicModeling` (src/modules/analysis/services/pipeline-orchestrator.service.ts:1719+). Payloads are heavier (include embeddings), so chunk size should be re-tuned — likely smaller than 50.
- Consider exposing `completedChunks / expectedChunks` alongside the item-level `progress.current / total` in the pipeline-status DTO for clearer ops dashboards. Minor UX polish, not blocking.
- Once the fine-tuned RunPod sentiment model ships, re-baseline `SENTIMENT_CHUNK_SIZE` by measuring median per-chunk latency against the new worker.
- Active cancellation of in-flight chunks on pipeline cancellation/fail-fast — a BullMQ `Queue.remove` pass keyed on `${pipelineId}--sentiment--*` — would eliminate the wasted-OpenAI-tokens concern entirely. Track as a backlog item.
- Observability follow-ups: Prometheus counter for per-status chunk events; p95 chunk duration histogram; dashboard panels grouped by `pipelineId`. Build these on top of the structured JSON logs, not the current ticket.
