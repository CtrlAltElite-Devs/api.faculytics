---
title: 'Sentiment worker vLLM-primary with OpenAI fallback'
slug: 'sentiment-worker-vllm-primary-openai-fallback'
created: '2026-04-18'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - 'NestJS 11 (worker + API)'
  - 'TypeScript 5'
  - 'Zod 4 (worker DTOs + API analysis DTOs)'
  - 'class-validator (API admin request DTOs)'
  - 'OpenAI SDK 6 (existing fallback path in worker)'
  - 'axios (new vLLM HTTP client in worker)'
  - 'BullMQ (job dispatch from API to worker)'
  - 'MikroORM 6 + SystemConfig entity (vLLM config persistence)'
  - 'React 19 + Vite + TanStack Query 5 (admin SPA)'
  - 'shadcn/ui + Tailwind 4 + sonner toasts + Zustand auth (admin SPA)'
files_to_modify:
  # Worker (sentiment.worker.temp.faculytics)
  - 'sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.ts'
  - 'sentiment.worker.temp.faculytics/src/sentiment/sentiment.controller.ts'
  - 'sentiment.worker.temp.faculytics/src/sentiment/sentiment.module.ts'
  - 'sentiment.worker.temp.faculytics/src/sentiment/dto/sentiment-request.dto.ts'
  - 'sentiment.worker.temp.faculytics/src/sentiment/dto/sentiment-response.dto.ts'
  - 'sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.spec.ts'
  - 'sentiment.worker.temp.faculytics/src/config/env.ts'
  - 'sentiment.worker.temp.faculytics/package.json'
  - 'sentiment.worker.temp.faculytics/CLAUDE.md'
  # Worker (new files)
  - 'sentiment.worker.temp.faculytics/src/sentiment/strategies/vllm-sentiment.strategy.ts (new)'
  - 'sentiment.worker.temp.faculytics/src/sentiment/strategies/vllm-sentiment.strategy.spec.ts (new)'
  - 'sentiment.worker.temp.faculytics/src/sentiment/strategies/vllm-rate-limiter.ts (new — process-wide concurrency cap, F9)'
  # API (api.faculytics)
  - 'api.faculytics/src/modules/analysis/dto/batch-analysis-job-message.dto.ts'
  - 'api.faculytics/src/modules/analysis/dto/sentiment-worker.dto.ts'
  - 'api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts'
  - 'api.faculytics/src/modules/analysis/analysis.module.ts'
  - 'api.faculytics/src/modules/audit/audit-action.enum.ts (extend with new dot-delimited key)'
  - 'api.faculytics/src/seeders/infrastructure/system-config.seeder.ts (add SENTIMENT_VLLM_CONFIG row, F8)'
  # API (new files)
  - 'api.faculytics/src/modules/analysis/services/sentiment-config.service.ts (new)'
  - 'api.faculytics/src/modules/analysis/services/sentiment-config.service.spec.ts (new)'
  - 'api.faculytics/src/modules/analysis/controllers/admin-sentiment-config.controller.ts (new)'
  - 'api.faculytics/src/modules/analysis/controllers/admin-sentiment-config.controller.spec.ts (new)'
  - 'api.faculytics/src/modules/analysis/dto/requests/update-sentiment-vllm-config.request.dto.ts (new)'
  - 'api.faculytics/src/modules/analysis/dto/responses/sentiment-vllm-config.response.dto.ts (new)'
  # Cross-boundary contract tests (F19)
  - 'api.faculytics/test/contracts/sentiment-worker-envelope.spec.ts (new)'
  - 'sentiment.worker.temp.faculytics/test/contracts/api-envelope.spec.ts (new)'
  # Pre-flight probe artifact (F10)
  - 'vllm.sentiment.smoke.test/test_logprobs_guided.js (new)'
  - 'vllm.sentiment.smoke.test/test_logprobs_guided.sample.json (new — captured probe output for traceability)'
  # Admin SPA (admin.faculytics)
  - 'admin.faculytics/src/types/api.ts'
  - 'admin.faculytics/src/features/settings/settings-page.tsx'
  # Admin SPA (new files)
  - 'admin.faculytics/src/features/sentiment-config/sentiment-config-card.tsx (new)'
  - 'admin.faculytics/src/features/sentiment-config/use-sentiment-config.ts (new)'
code_patterns:
  - 'API: SystemConfig key/value upsert via em.create({managed:false}) + em.upsert({onConflictFields:[key]}) — src/modules/analytics/processors/analytics-refresh.processor.ts:42-51 (NOTE: lives under modules/analytics, not modules/analysis — F1 fix)'
  - 'API: SystemConfigSeeder pattern (idempotent find-or-create via em.persist) — src/seeders/infrastructure/system-config.seeder.ts (canonical place to add new system config rows; F8 fix — do NOT use migrations for seed data)'
  - 'API: AuditAction is exported as `const AuditAction = {...} as const` (TypeScript const-assertion object, NOT a TS `enum`); naming convention is dot-delimited lowercase — src/modules/audit/audit-action.enum.ts (F2 fix)'
  - 'API: Admin endpoint via @UseJwtGuard(UserRole.SUPER_ADMIN) + @Audited({action,resource:"SystemConfig"}) + @UseInterceptors(MetaDataInterceptor, AuditInterceptor) — moodle-sync.controller.ts:208-223'
  - 'API: Request DTO uses class-validator decorators (@IsString, @IsBoolean, @IsUrl, @IsOptional) — update-sync-schedule.request.dto.ts'
  - 'API: BullMQ envelope built in pipeline-orchestrator.service.ts:1700-1714, NOT in sentiment.processor.ts — vllmConfig injection happens here'
  - 'API: sentimentWorkerRequestSchema is loose (Zod default-strip behavior, NOT .strict()) and already drifts from envelope (missing jobId/version/type/publishedAt) — F5 acknowledgement; verify consumer before using'
  - 'API: sentiment.processor.ts already does `rawResult: raw` against a passthrough result schema; new fields like servedBy flow through automatically without code change — F12 acknowledgement'
  - 'API: AnalysisModule.MikroOrmModule.forFeature does NOT currently include SystemConfig — must be added when SentimentConfigService is registered (F3 fix)'
  - 'Worker: NestJS Injectable() service with constructor injection (matches existing SentimentService)'
  - 'Worker: Per-item HTTP via axios with bounded concurrency (mirrors vllm.sentiment.smoke.test/classifier.js but inside Nest service)'
  - 'Worker: Result-shape parity preserved — return SentimentResultItem with positive/neutral/negative numbers; one-hot from label'
  - 'Admin SPA: Hook pair (use-X.ts + X-card.tsx) under src/features/<feature>/ — moodle-sync exemplar (NOTE: moodle-sync card is mounted in features/moodle-sync/sync-dashboard.tsx, NOT in settings-page.tsx — F11 clarification)'
  - 'Admin SPA: TanStack Query useQuery key shape ["resource", activeEnvId]; useMutation invalidates on success; sonner toast for feedback — use-sync-schedule.ts'
  - 'Admin SPA: Plain useState forms with inline manual validation (no react-hook-form, no Zod) — sync-schedule-card.tsx'
  - 'Admin SPA: Native fetch via apiClient<T>(path, options?, envId?) at src/lib/api-client.ts — auto-injects Bearer token from Zustand auth-store, performs ONE deduplicated silent refresh on 401 then retries; force-logs-out if refresh fails (F23 clarification)'
  - 'Admin SPA: Shared types in src/types/api.ts (no per-feature types files)'
  - 'Admin SPA: settings-page.tsx currently has ONE Card (Environments) inside a `<div className="space-y-6 max-w-2xl ...">` container; new card slots into that same container as a sibling sequential Card (F11 fix)'
test_patterns:
  - 'Worker: jest.mock("../config/env.js") + jest.mock("openai") with mockResolvedValue/mockResolvedValueOnce; TestingModule.compile() — sentiment.service.spec.ts:1-228'
  - 'API admin controller: Test.createTestingModule with overridden AuthGuard("jwt"), RolesGuard, CurrentUserInterceptor, MetaDataInterceptor; service mocked via jest.fn() with mockResolvedValue — admin.controller.spec.ts:1-80'
  - 'API admin DTO: instantiate via `new Dto(); dto.field = ...; await validate(dto)` (NOT plainToInstance) — moodle-sync.controller.spec.ts:239-269 (F22 fix)'
  - 'API processor/service: EntityManager fork mocks with findOne.mockImplementation(); chained mocks for transactional blocks (tx.flush, tx.getConnection().execute) — sentiment.processor.spec.ts'
  - 'Admin SPA: smoke-test against dev API; no formal frontend test framework wired in this feature dir today'
---

# Tech-Spec: Sentiment worker vLLM-primary with OpenAI fallback

**Created:** 2026-04-18

## Overview

### Problem Statement

The current sentiment analysis pipeline calls the OpenAI Chat Completions API for every chunk, incurring per-token cost on every submission processed. The team has access to a self-hosted vLLM deployment running a fine-tuned Gemma classifier (`unsloth/gemma-4-26B-A4B-it`) on Thunder Compute, exposed at a rotating subdomain like `https://nmn5qf9j-8000.thundercompute.net`. The vLLM URL changes every few days as cloud credits cycle, so any URL configuration must be runtime-rotatable without redeploying the worker.

Three additional constraints shape the design:

1. **Output-shape mismatch.** The vLLM classifier returns a single label string (`positive | negative | neutral`), while the API's `SentimentResult` entity and downstream aggregations consume three continuous scores (`positiveScore`, `neutralScore`, `negativeScore` as decimal 10,4). A reconciliation strategy is required.
2. **Confidence collapse.** Empirical probing of the vLLM endpoint showed the fine-tuned classifier produces top-1 logprob ≈ 0 (P ≈ 1.0) on every test sample (clearly positive, clearly negative, mixed-signal, factual neutral). Logprob-derived "soft" probabilities would be functionally identical to one-hot conversion, so logprobs offer no current signal value (though they remain useful raw data for future calibration work).
3. **OpenAI must remain available as a fallback.** When the vLLM endpoint is unreachable (URL rotated and not yet updated, instance restart, network failure) or returns unparseable output, the system must fall through to the existing OpenAI logic without losing the chunk.

### Solution

Inside `sentiment.worker.temp.faculytics`, introduce a `VllmSentimentStrategy` that becomes the primary code path inside `SentimentService`. For each item in a chunk, the worker fans out one HTTP call to vLLM's OpenAI-compatible `/v1/chat/completions` endpoint with concurrency 8 (vLLM's continuous batching handles GPU-side grouping server-side per the sentiment dev's guidance). Calls use `guided_choice: ["positive", "negative", "neutral"]`, `temperature: 0.0`, `max_tokens: 5`, `logprobs: true`, `top_logprobs: 5`. The returned label is mapped to a one-hot score tuple. Per-item failures (timeout, 5xx, missing/invalid label) are collected; if any items failed, the worker re-runs _only those failed `submissionId`s_ through the existing OpenAI `processChunk` logic in a single fallback batch. Each result is tagged `servedBy: 'vllm' | 'openai'` in the `rawResult` JSONB along with the raw vLLM payload (including logprobs) for future calibration.

The API stays the same single-endpoint contract (`POST /runsync`) but now sources `vllmUrl`, `vllmModel`, and `vllmEnabled` from a `SystemConfig` record at dispatch time and injects them into the RunPod envelope as `input.vllmConfig`. A new SuperAdmin-guarded API endpoint and a corresponding admin SPA card (mirroring the existing `moodle-sync` pattern) allow the operator to rotate the vLLM URL at runtime when the Thunder Compute instance cycles. No worker redeploy required.

Empirical validation: with the canonical classifier system prompt + a deliberately long (~280-word) code-switched mixed-signal student feedback, total prompt token usage was 554/1024, leaving ~470 tokens of headroom. The current vLLM `--max-model-len 1024` deployment is therefore acceptable for v1; the worker logs a WARN if any item's input exceeds ~900 tokens (90% of cap) so we have a leading indicator before any silent truncation occurs. We ask the sentiment dev for a `--max-model-len` bump only if those warnings appear in dev/staging.

### Scope

**In Scope:**

_Worker (`sentiment.worker.temp.faculytics`)_

- New `VllmSentimentStrategy` class implementing per-item HTTP fan-out at bounded concurrency, with `guided_choice`, retries, and timeout.
- Refactored `SentimentService` orchestrator: vLLM-first per-item attempt → collect failed `submissionId`s → OpenAI fallback for failed items only (never the whole chunk).
- Label-to-one-hot score mapping: `positive → {1, 0, 0}`, `neutral → {0, 1, 0}`, `negative → {0, 0, 1}`.
- Per-item `rawResult.servedBy: 'vllm' | 'openai'` tag plus raw vLLM payload (incl. logprobs) preserved.
- `vllmConfig` read from envelope `input.vllmConfig`; if absent or `enabled=false`, skip vLLM and run OpenAI-only (preserves existing behavior for any caller not yet updated).
- Input-length guardrail: WARN when any item's prompt token estimate exceeds ~900 tokens.
- New env vars: `VLLM_PER_CHUNK_CONCURRENCY` (default 8), `VLLM_TIMEOUT_MS` (default 30000), `VLLM_MAX_RETRIES` (default 2).
- Unit tests: `VllmSentimentStrategy` in isolation; orchestrator's item-level fallback handoff; mocked HTTP end-to-end.

_API (`api.faculytics`)_

- New `SystemConfig` keys: `sentiment.vllm.url`, `sentiment.vllm.model`, `sentiment.vllm.enabled` (default `enabled=false` for cautious rollout).
- DTO update: `BatchAnalysisJobMessage` adds optional `vllmConfig: { url: string, model: string, enabled: boolean }`.
- `sentiment.processor.ts` reads `SystemConfig` at dispatch time and injects `vllmConfig` into the envelope sent to the worker.
- Admin endpoint: `PUT /admin/sentiment/vllm-config` (SuperAdmin-guarded), pattern mirrors `MoodleSyncSchedule` runtime config. Body: `{ url?: string, model?: string, enabled?: boolean }`. Validates URL shape via Zod.
- Admin endpoint: `GET /admin/sentiment/vllm-config` returning the current config (for the admin UI to display).
- Migration: seed default rows.
- Unit tests: SystemConfig read + envelope injection in `sentiment.processor.spec.ts`; admin endpoint validation + auth guard.

_Admin frontend (`admin.faculytics`)_

- New feature directory `src/features/sentiment-config/`:
  - `sentiment-config-card.tsx` — form fields (vLLM URL input, model name input, enabled switch), save mutation with toast feedback, current-config read-only display.
  - `use-sentiment-config.ts` — TanStack Query hook (read query + update mutation), follows the `use-sync-schedule.ts` pattern.
- Surface inside existing `settings-page.tsx` as a new section/tab.

_Coordination_

- No vLLM redeploy required for v1.
- Document the 900-token warning behavior and rotation procedure in `sentiment.worker.temp.faculytics` README.

**Out of Scope:**

- Changing the `SentimentResult` DB schema (no `servedBy` column — JSONB only).
- Health probe or circuit breaker for vLLM (fail-open by design).
- Automated vLLM URL rotation / Thunder Compute API integration.
- Calibration of vLLM logprobs into soft scores (raw logprobs preserved in `rawResult` for future).
- Cost dashboards or per-strategy metrics.
- Multi-item batching to vLLM (unnecessary — vLLM continuous-batches concurrent calls server-side per sentiment dev's guidance).
- Frontend SPA work in `app.faculytics` (faculty/dean/student app) — admin-only UI for v1.
- Asking sentiment dev to bump `--max-model-len` proactively (deferred until 900-token warnings appear).

## Context for Development

### Codebase Patterns

#### API (`api.faculytics`)

- **SystemConfig storage** — `src/entities/system-config.entity.ts` is a simple key/value/description table. Reads use `em.findOne(SystemConfig, { key })` (no caching). Writes follow the analytics-refresh idempotent pattern: `em.create(SystemConfig, {...}, { managed: false })` → `em.upsert(SystemConfig, config, { onConflictFields: ['key'] })` → `em.flush()` (`src/modules/analytics/processors/analytics-refresh.processor.ts:42-51` — NOTE the path is under `modules/analytics`, not `modules/analysis`; F1 fix). The MoodleSyncScheduler uses a slightly older find-then-create pattern (`src/modules/moodle/schedulers/moodle-sync.scheduler.ts:65-79`); we'll follow the upsert pattern for new code at write time.

- **SystemConfig SEED rows** — Default rows are added via `src/seeders/infrastructure/system-config.seeder.ts` (NOT migrations). The seeder iterates an array of `{key, value, description}` and uses idempotent find-then-`em.persist(new SystemConfig())`. Existing entries: `APP_NAME`, `MAINTENANCE_MODE`, `MOODLE_SYNC_INTERVAL_MINUTES`. Add new keys here to follow the pattern (F8 fix — replaces my original "create migration" instruction).

- **AuditAction shape** — `src/modules/audit/audit-action.enum.ts` exports `AuditAction` as a `const ... as const` object (NOT a TypeScript `enum`), with a derived type alias. Keys are dot-delimited lowercase strings (e.g., `'admin.sync-schedule.update'`, `'admin.user.create'`, `'analysis.pipeline.fail'`). The new entry must follow this convention: `'admin.sentiment-vllm-config.update'` (F2 fix).

- **Admin endpoint reference** — `PUT /moodle/sync/schedule` at `src/modules/moodle/controllers/moodle-sync.controller.ts:208-223` is the canonical pattern. Decorators on the route handler:
  - `@UseJwtGuard(UserRole.SUPER_ADMIN)` — auth + role
  - `@Audited({ action: AuditAction.<X>, resource: 'SystemConfig' })` — audit trail
  - `@UseInterceptors(MetaDataInterceptor, AuditInterceptor)` — wires audit context
  - Request DTO uses `class-validator` decorators (`@IsInt()`, `@Min()`, etc.), parsed via Nest's `ValidationPipe`.

- **Envelope construction (CRITICAL — corrects Step 1 assumption)** — The BullMQ envelope is built in `src/modules/analysis/services/pipeline-orchestrator.service.ts:1700-1714`, NOT in `sentiment.processor.ts`. The processor (`SentimentProcessor`) is the BullMQ result consumer that persists `SentimentResult` rows; HTTP dispatch to the worker URL happens in `BaseBatchProcessor.handle()` against the envelope built by the orchestrator. So `vllmConfig` injection lives in the orchestrator's chunk-building loop.

- **DTO mode (corrected per F5)** — `BatchAnalysisJobMessage` (`src/modules/analysis/dto/batch-analysis-job-message.dto.ts:3-22`) is `.strict()`. `sentimentWorkerRequestSchema` (`src/modules/analysis/dto/sentiment-worker.dto.ts:5-16`) is **NOT** `.strict()` — it uses Zod's default-strip behavior. The schema is also **already drifting** from the actual envelope (missing `jobId`, `version`, `type`, `publishedAt`). Pre-existing tech debt; we add `vllmConfig` as `.optional()` and verify the schema's actual consumer in Task 23a.

- **`rawResult` JSONB passthrough (per F12)** — `sentiment.processor.ts` already does `rawResult: raw` on the unparsed worker payload (the result schema for the array wrapper uses `.passthrough()`). Any new field the worker emits — including `servedBy` — flows into `rawResult` automatically. We do still extend `sentimentResultItemSchema` (Task 23) so the typed parsed view matches; otherwise the parsed view strips `servedBy` even though the JSONB save side is unaffected.

- **Module boundary for the new admin endpoint** — Following the Moodle precedent (admin endpoints live next to their domain logic, not in `AdminModule`), the new `PUT /admin/sentiment/vllm-config` endpoint lives in `AnalysisModule` via a new `AdminSentimentConfigController`. `AnalysisModule` already imports MikroORM repos, the auth guards, and the audit interceptor — but it does **NOT** currently include `SystemConfig` in `MikroOrmModule.forFeature([...])`. Task 21 must add it (F3 fix).

#### Worker (`sentiment.worker.temp.faculytics`)

- **Single-module structure** — `AppModule` only imports `SentimentModule` (`src/app.module.ts`). All sentiment logic is colocated. New `VllmSentimentStrategy` registers as a provider in `SentimentModule` and is injected into `SentimentService`.

- **Existing service shape** — `SentimentService.analyzeBatch(items)` chunks via `OPENAI_BATCH_SIZE` and processes chunks with bounded concurrency (`src/sentiment/sentiment.service.ts:39-54`). The new orchestration: try vLLM per-item with concurrency cap → collect failed `submissionId`s → run failed items through a new private `processOpenAIFallback(items)` helper which **re-chunks at `OPENAI_BATCH_SIZE` before calling `processChunk`** (F6 fix — preserves the existing OpenAI batch contract regardless of how many items fall back) → merge and **sort by original input index** (F13 fix) → return.

- **HTTP body limit** — `main.ts:14-15` raises Express body limit to 50mb to handle large pipeline batches. Already accommodates the worker-side per-chunk processing — no change needed.

- **Result shape parity** — vLLM strategy must return `SentimentResultItem[]` (defined in `src/sentiment/dto/sentiment-response.dto.ts:3-10`) with `positive`, `neutral`, `negative` numbers in [0,1]. One-hot mapping satisfies this contract.

- **Domain-vs-infra error split** — The controller (`src/sentiment/sentiment.controller.ts:106-124`) classifies errors. Domain errors return HTTP 200 with `status: "failed"` (no BullMQ retry); infra errors throw 500 (BullMQ retries). New vLLM strategy errors are classified the same way: a vLLM HTTP 5xx after retries is _not_ an error to surface — it's swallowed by the per-item fallback. Only if both vLLM and OpenAI fallbacks fail does it bubble.

#### Admin SPA (`admin.faculytics`)

- **Feature directory pattern** — `src/features/<feature>/` colocates the card component and its hook. `moodle-sync` is the canonical reference: `sync-schedule-card.tsx` + `use-sync-schedule.ts`.

- **Hook pattern** — Two exports per feature: `useX()` (read via `useQuery`, queryKey `['resource', activeEnvId]`, refetchInterval ~60s) and `useUpdateX()` (write via `useMutation`, fires `toast.success`/`toast.error` from sonner, invalidates the read query on success). No optimistic updates.

- **Form pattern** — Plain `useState`, manual inline validation, no react-hook-form, no Zod. shadcn primitives: `Card`, `CardHeader` / `CardContent` (sometimes used; `sync-schedule-card.tsx` actually uses raw `<Card><div className="p-5">...</div></Card>` instead — both idioms coexist and either is acceptable, F21), `Button`, `Input`, `Label`, optional `Switch` (for the enabled toggle), `Dialog` (controlled, for the edit form). Loading state: `mutation.isPending` disables the button and shows a spinner.

- **HTTP client (corrected per F23)** — `src/lib/api-client.ts` exposes `apiClient<T>(path, options?, envId?)`. URL is auto-prefixed with the env's `baseUrl + /api/v1/`. Bearer token auto-injected from Zustand `useAuthStore.getState().getToken(envId)`. 401 triggers ONE deduplicated silent refresh and a single retry of the original request — if refresh fails, the user is force-logged-out (in-flight edits are lost across the navigation, which AC 13 acknowledges). Hooks call it like:

  ```typescript
  apiClient<SentimentVllmConfigResponse>('/admin/sentiment/vllm-config');
  apiClient<SentimentVllmConfigResponse>('/admin/sentiment/vllm-config', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  ```

- **Shared types** — All API types live in `src/types/api.ts` (623 lines today). No per-feature types files. Add `SentimentVllmConfigResponse` and `UpdateSentimentVllmConfigRequest` here.

- **Settings page integration (corrected per F11)** — `src/features/settings/settings-page.tsx` (252 lines) currently has exactly **one** `<Card>` (Environments) inside a `<div className="space-y-6 max-w-2xl dashboard-stagger">` container. The new sentiment-config-card slots in as a sibling Card inside that same container. Already routed at `/settings` — no `routes.tsx` change. (Note: the moodle-sync card the spec uses as exemplar is mounted in `features/moodle-sync/sync-dashboard.tsx`, not in settings-page.tsx — the "follow moodle-sync" guidance applies to the hook+card structure, not the mount location.)

- **Toast** — `import { toast } from 'sonner'`. Shadcn-themed `Toaster` already mounted via `src/components/ui/sonner.tsx`.

### Files to Reference

| File                                                                                            | Purpose                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.faculytics/src/entities/system-config.entity.ts`                                           | SystemConfig schema (key/value/description). Storage target for vLLM config row.                                                                                                                                                                                                                                                  |
| `api.faculytics/src/modules/analytics/processors/analytics-refresh.processor.ts:42-51`          | Canonical SystemConfig idempotent upsert pattern (em.create + em.upsert with onConflictFields). **Path lives under `modules/analytics`, NOT `modules/analysis`** (F1 fix).                                                                                                                                                        |
| `api.faculytics/src/seeders/infrastructure/system-config.seeder.ts`                             | Add new seed row here (NOT via migration). Existing keys: APP_NAME, MAINTENANCE_MODE, MOODLE_SYNC_INTERVAL_MINUTES. Use the existing find-then-`em.persist(new SystemConfig())` pattern (F8).                                                                                                                                     |
| `api.faculytics/src/modules/audit/audit-action.enum.ts`                                         | Add new key. `AuditAction` is `const ... as const` (NOT a TS enum); keys are dot-delimited lowercase (`'admin.sentiment-vllm-config.update'`) (F2).                                                                                                                                                                               |
| `api.faculytics/src/modules/moodle/controllers/moodle-sync.controller.ts:208-223`               | Reference admin endpoint (decorators, guard, audit, interceptors).                                                                                                                                                                                                                                                                |
| `api.faculytics/src/modules/moodle/schedulers/moodle-sync.scheduler.ts:65-79`                   | Older SystemConfig find-then-update pattern; reference only — use the upsert pattern for new code.                                                                                                                                                                                                                                |
| `api.faculytics/src/modules/moodle/dto/requests/update-sync-schedule.request.dto.ts`            | Reference class-validator request DTO pattern.                                                                                                                                                                                                                                                                                    |
| `api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts:1700-1714`       | Envelope construction site for sentiment chunks. `vllmConfig` injection point.                                                                                                                                                                                                                                                    |
| `api.faculytics/src/modules/analysis/dto/batch-analysis-job-message.dto.ts:3-22`                | Add optional `vllmConfig` field; keep schema strict.                                                                                                                                                                                                                                                                              |
| `api.faculytics/src/modules/analysis/dto/sentiment-worker.dto.ts:5-16`                          | Worker request schema (Zod default-strip, NOT `.strict()`); already drifts from envelope. Add `vllmConfig` as optional + verify consumer (F5).                                                                                                                                                                                    |
| `api.faculytics/src/modules/analysis/processors/sentiment.processor.ts`                         | BullMQ result consumer. Already does `rawResult: raw` against passthrough schema; new fields (incl. `servedBy`) flow into JSONB automatically (F12). NOT the dispatch site — typically no code change.                                                                                                                            |
| `api.faculytics/src/modules/analysis/processors/sentiment.processor.spec.ts`                    | Reference test pattern: EntityManager fork mocks, transactional block chaining.                                                                                                                                                                                                                                                   |
| `api.faculytics/src/modules/analysis/services/__tests__/pipeline-orchestrator.chunking.spec.ts` | Existing dispatch-path tests for the orchestrator. Extend here to cover `vllmConfig` injection (F7 fix — replaces my original `pipeline-orchestrator.service.spec.ts` reference, which doesn't exist).                                                                                                                            |
| `api.faculytics/src/modules/analysis/processors/base-batch.processor.ts:55-60`                  | HTTP POST dispatch to worker URL. No change needed; envelope passes through.                                                                                                                                                                                                                                                      |
| `api.faculytics/src/modules/admin/admin.controller.spec.ts:1-80`                                | Reference admin controller test setup (guard overrides, service mocks).                                                                                                                                                                                                                                                           |
| `api.faculytics/src/modules/moodle/controllers/moodle-sync.controller.spec.ts:239-269`          | Reference DTO validation test pattern: `new Dto(); dto.field = ...; await validate(dto);` (NOT `plainToInstance` — F22).                                                                                                                                                                                                          |
| `api.faculytics/src/modules/analysis/analysis.module.ts`                                        | Register new controller + service. **MUST also add `SystemConfig` to `MikroOrmModule.forFeature([...])`** (F3).                                                                                                                                                                                                                   |
| `api.faculytics/src/entities/sentiment-result.entity.ts`                                        | Confirms downstream contract: `positiveScore`/`neutralScore`/`negativeScore` decimal(10,4) + derived `label` (argmax) + `rawResult` JSONB (where `servedBy` lives). NO schema change.                                                                                                                                             |
| `sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.ts`                           | Refactor target. Add vLLM-first orchestration; keep `processChunk` as the OpenAI fallback path.                                                                                                                                                                                                                                   |
| `sentiment.worker.temp.faculytics/src/sentiment/sentiment.controller.ts:42-97`                  | Reads `runsync` envelope → service. Pass `vllmConfig` from envelope into `analyzeBatch`.                                                                                                                                                                                                                                          |
| `sentiment.worker.temp.faculytics/src/sentiment/dto/sentiment-request.dto.ts`                   | Schema is `.passthrough()` — already accepts unknown fields, but add explicit `vllmConfig` for type safety + Swagger.                                                                                                                                                                                                             |
| `sentiment.worker.temp.faculytics/src/sentiment/dto/sentiment-response.dto.ts`                  | Extend `sentimentResultItemSchema` with optional `servedBy: 'vllm' \| 'openai'` (decision locked). The full vLLM raw payload (logprobs etc.) is NOT in this schema — it's stashed internally by the worker into `rawResult` via the API-side passthrough behavior.                                                                |
| `sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.spec.ts`                      | Reference jest mock patterns (jest.mock for env + openai, TestingModule).                                                                                                                                                                                                                                                         |
| `sentiment.worker.temp.faculytics/src/config/env.ts`                                            | Add `VLLM_PER_CHUNK_CONCURRENCY` (default 8), `VLLM_TIMEOUT_MS` (default 10000 — lowered from 30000 per F4), `VLLM_MAX_RETRIES` (default 1 — lowered from 2 per F4), `VLLM_GLOBAL_CONCURRENCY` (default 16 — process-wide cap, F9), `VLLM_CIRCUIT_BREAKER_THRESHOLD` (default 3 — consecutive failures before short-circuit, F4). |
| `sentiment.worker.temp.faculytics/package.json`                                                 | Add `axios` to dependencies (worker doesn't have it today; OpenAI SDK uses node fetch under the hood).                                                                                                                                                                                                                            |
| `vllm.sentiment.smoke.test/classifier.js`                                                       | Reference for vLLM call mechanics (URL, model, prompt, max_tokens, temperature). System prompt = canonical classifier prompt.                                                                                                                                                                                                     |
| `vllm.sentiment.smoke.test/server.js:34-54`                                                     | Reference for batch concurrency control approach (mirror in NestJS-flavored TS).                                                                                                                                                                                                                                                  |
| `admin.faculytics/src/features/moodle-sync/use-sync-schedule.ts`                                | Hook reference (read query + update mutation, queryKey shape, sonner toast, invalidation).                                                                                                                                                                                                                                        |
| `admin.faculytics/src/features/moodle-sync/sync-schedule-card.tsx`                              | Card UI reference (useState forms, manual validation, shadcn primitives).                                                                                                                                                                                                                                                         |
| `admin.faculytics/src/features/settings/settings-page.tsx`                                      | Insertion point for the new sentiment-config-card.                                                                                                                                                                                                                                                                                |
| `admin.faculytics/src/lib/api-client.ts`                                                        | HTTP wrapper used by all admin hooks.                                                                                                                                                                                                                                                                                             |
| `admin.faculytics/src/types/api.ts`                                                             | Add `SentimentVllmConfigResponse` + `UpdateSentimentVllmConfigRequest`.                                                                                                                                                                                                                                                           |
| `admin.faculytics/src/components/ui/sonner.tsx`                                                 | Confirms toast library (`sonner`); no need to install.                                                                                                                                                                                                                                                                            |

### Technical Decisions

- **Output shape**: Label → one-hot conversion (`positive → {1,0,0}` etc.), not logprobs-derived soft scores. Justification: empirical probing showed the fine-tuned classifier collapses to P ≈ 1.0 on every sample, making logprobs functionally equivalent to one-hot for live data. Raw logprobs preserved in `rawResult` JSONB for future calibration work.
- **Fallback granularity**: Per-item, not per-chunk. Justification: avoids paying OpenAI for items vLLM successfully handled. Bookkeeping: collect failed `submissionId`s, route through `processOpenAIFallback(items)` which re-chunks at `OPENAI_BATCH_SIZE` before calling `processChunk` (preserves the OpenAI batch contract regardless of fallback volume; F6 fix).
- **Per-chunk circuit breaker (F4)**: After `VLLM_CIRCUIT_BREAKER_THRESHOLD` (default 3) consecutive vLLM failures within a single chunk, short-circuit — push remaining unprocessed items directly to OpenAI fallback without attempting vLLM. Justification: with `VLLM_TIMEOUT_MS=10000` and `VLLM_MAX_RETRIES=1`, the worst-case wall time before the breaker fires is `3 × 10000 × 2 = 60s`, well under `BULLMQ_HTTP_TIMEOUT_MS=90000`. Without the breaker, a fully-down vLLM endpoint with 50 items at concurrency 8 would burn `7 × 20s = 140s`, blowing the BullMQ envelope before fallback writes happen.
- **Process-wide vLLM concurrency cap (F9)**: `VllmRateLimiter` singleton service in the worker enforces a process-wide semaphore of size `VLLM_GLOBAL_CONCURRENCY` (default 16). All `VllmSentimentStrategy.classifyOne` calls acquire the semaphore. Justification: with `BULLMQ_SENTIMENT_CONCURRENCY=3` × `VLLM_PER_CHUNK_CONCURRENCY=8`, naïve fan-out is up to 24 in-flight requests per worker process — the smoke test only validated single-batch concurrency 8. Cap = 16 keeps multi-chunk parallel processing safely under the smoke-test-validated regime.
- **Health probing**: None (fail-open). Justification: any pre-flight call adds latency to every chunk; the cost of a failed first attempt + automatic OpenAI fallback is bounded by the circuit breaker and observable via `servedBy` rates.
- **vLLM URL rotation source of truth**: API-side `SystemConfig`, injected into the BullMQ envelope per-job at `pipeline-orchestrator.service.ts:1700-1714`. Justification: API holds existing config tooling; worker stays stateless; new URLs propagate to the next dispatched job without restart.
- **SystemConfig storage shape**: ONE row, key `SENTIMENT_VLLM_CONFIG`, value = JSON string `{ "url": string, "model": string, "enabled": boolean }`. Justification: atomic update, fewer queries, easier to extend with future fields. (Alternative: 3 rows — rejected as more queries with no real gain.)
- **Concurrency**: 8 per chunk (`VLLM_PER_CHUNK_CONCURRENCY=8`), matches the sentiment dev's smoke test (`vllm.sentiment.smoke.test/server.js`). vLLM's server-side continuous batching means we don't need app-side multi-item batching.
- **`max_model_len: 1024` deferral**: Empirical test (canonical prompt + 280-word code-switched feedback = 554 tokens reported by vLLM) confirms 1024 is sufficient for realistic input. Worker emits WARN logs when any item's estimated prompt token count exceeds 900 tokens as a leading indicator; ops asks the sentiment dev for a `--max-model-len` bump only if those warnings appear in dev/staging.
- **Token estimation strategy (corrected per F14)**: Approximate prompt size as `Math.ceil(text.length / 3.5) + SYSTEM_PROMPT_TOKEN_ESTIMATE`, where `SYSTEM_PROMPT_TOKEN_ESTIMATE = 150` (derived from probe data: prompt_tokens=554 minus user-message portion `1500 / 3.5 ≈ 428` ≈ 126 tokens for system prompt + chat formatting; plus 24 token safety margin). Threshold = 900 tokens, leaving ~120 tokens of headroom from the 1024 cap. Cheap, no tokenizer dependency, accurate enough for a leading-indicator warning.
- **`guided_choice` over free-text parsing**: vLLM's `guided_choice` parameter constrains output to one of the three labels at the decoding layer. Eliminates the smoke test's "find label substring" heuristic and removes the `unknown` failure mode. Fall back to substring matching only if a future vLLM version drops `guided_choice` support.
- **`enabled=false` default in seeder (corrected per F8)**: Cautious rollout. Operator flips it to `true` via the admin UI when ready. Worker behavior with `enabled=false` (or missing `vllmConfig` in envelope) is identical to today (OpenAI-only). This also makes existing test envelopes pass without modification. Seeded via `SystemConfigSeeder` (NOT a migration).
- **Production rollout gate (F16)**: `enabled=true` in `NODE_ENV==='production'` requires `env.ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD === true`. The PUT handler enforces this — a SuperAdmin clicking the toggle in prod without the env var set receives HTTP 400 with a clear message. Justification: prevents accidental 100%-traffic flip in production via a single admin click. Percentage-based canary deferred to future work.
- **Cross-field validation (F17)**: `enabled=true` with empty `url` is rejected at the service-write boundary in `SentimentConfigService.updateConfig` with `BadRequestException`. Justification: avoids the silently-falls-back-to-OpenAI confusion that would happen if the worker just treated empty URL as a skip.
- **Module boundary for admin endpoint**: New `AdminSentimentConfigController` lives in `AnalysisModule` (next to its domain logic), not `AdminModule`. Mirrors the Moodle precedent: `MoodleSyncController` is in `MoodleModule`, not `AdminModule`.
- **Orchestrator dependency injection (F26 ADR)**: We inject `SentimentConfigService` directly into `PipelineOrchestratorService`, accepting that the constructor reaches 12 dependencies. Alternatives considered: (a) push the read into `SentimentProcessor` — wrong layer, processor consumes results not dispatches; (b) introduce a shared `RuntimeConfigService` cache — premature abstraction without other consumers. Decision: accept the 12th dep for v1; revisit when at least one other module needs similar runtime config and absorb into a shared service then.
- **Extend `SentimentResultItem` with `servedBy`**: Yes. Justification: surfacing `servedBy` per-item in the worker → API contract enables logging dispatch-vs-fallback ratios and persisting them in `rawResult.servedBy` JSONB without schema change. The `sentimentWorkerRequestSchema` and `sentimentResultItemSchema` get an optional `servedBy: 'vllm' | 'openai'` field. API stores it as-is in `rawResult` (already passes through unchanged due to API-side passthrough behavior on the result-array wrapper, F12).
- **Test framework for admin SPA**: No formal frontend tests in the existing feature dirs. The new feature follows that — manual smoke-test against dev API. (Out of scope to introduce Vitest/RTL here.)
- **Audit action for the new admin endpoint**: Add a new entry `ADMIN_SENTIMENT_VLLM_CONFIG_UPDATE: 'admin.sentiment-vllm-config.update'` to the `AuditAction` const-as-const object (F2). Followed up in the task list.
- **Audit before/after capture (F18)**: The standard `@Audited()` interceptor records action + actor but not request body or previous value. The PUT handler explicitly invokes `auditService.record(...)` with `{previous, next}` payload before returning, so URL rotations are forensically traceable.

## Implementation Plan

### Tasks

Tasks are ordered by dependency: pre-flight probe artifact, then foundational types and contracts, then worker behavior, then API runtime config and dispatch, then admin UI, then end-to-end smoke. Each task is self-contained and names the file(s) to touch.

#### Phase 0 — Pre-flight artifact (F10)

- [x] **Task 0: Commit a vLLM probe script that exercises `guided_choice` + `logprobs`**
  - File: `vllm.sentiment.smoke.test/test_logprobs_guided.js` (new)
  - Action: Standalone Node script using axios. POST to the configured vLLM URL with `guided_choice: ['positive','negative','neutral']`, `logprobs: true, top_logprobs: 5`, `temperature: 0`, `max_tokens: 5`. Print full response. Run against 3-4 sample inputs (clearly positive, clearly negative, mixed, factual neutral). Save output to `vllm.sentiment.smoke.test/test_logprobs_guided.sample.json`.
  - Notes: gives the dev (and future maintainers) a traceable evidence artifact that vLLM-side `guided_choice` and `logprobs` work on the deployment. Without this, the spec's "verified" claim is in-conversation only.

#### Phase 1 — Worker contract changes (foundational)

- [x] **Task 1: Add `axios` to worker dependencies**
  - File: `sentiment.worker.temp.faculytics/package.json`
  - Action: `npm install axios` (will add to `dependencies`). Worker doesn't currently bundle axios — OpenAI SDK uses node-fetch internally.
  - Notes: Pin to caret on a stable major (e.g. `^1.7.x`).

- [x] **Task 2: Add vLLM env vars (revised per F4 + F9)**
  - File: `sentiment.worker.temp.faculytics/src/config/env.ts`
  - Action: Extend the Zod env schema with five new entries:
    ```
    VLLM_PER_CHUNK_CONCURRENCY: z.coerce.number().int().positive().default(8),
    VLLM_GLOBAL_CONCURRENCY: z.coerce.number().int().positive().default(16),
    VLLM_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    VLLM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(1),
    VLLM_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(3),
    ```
  - Notes: Tighter timeout (10s vs original 30s) and lower retries (1 vs 2) keep worst-case per-item burn at 20s. Global concurrency cap (16) bounds peak load when multiple BullMQ jobs run in parallel. Circuit breaker threshold (3 consecutive failures) bounds chunk-level vLLM-attempt time before short-circuit to OpenAI fallback. URL/model/enabled are NOT here — they come per-job from the envelope.

- [x] **Task 3: Extend worker request DTO with optional `vllmConfig`**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/dto/sentiment-request.dto.ts`
  - Action: Add `vllmConfig: z.object({ url: z.string().url(), model: z.string().min(1), enabled: z.boolean() }).optional()` to `sentimentRequestSchema`. Keep the schema's `.passthrough()`.
  - Notes: Optional preserves backward compat with envelopes from older API versions.

- [x] **Task 4: Extend worker response item DTO with optional `servedBy`**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/dto/sentiment-response.dto.ts`
  - Action: Add `servedBy: z.enum(['vllm', 'openai']).optional()` to `sentimentResultItemSchema`. Optional so older deployments without the new shape still validate.
  - Notes: This is the per-item observability tag the API will store in `rawResult` JSONB.

#### Phase 2 — Worker vLLM strategy implementation

- [x] **Task 5: Create `VllmSentimentStrategy` class**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/strategies/vllm-sentiment.strategy.ts` (new)
  - Action: NestJS `@Injectable()` class. Public method `classifyOne(text: string, config: { url, model }): Promise<{ label: 'positive' | 'negative' | 'neutral', raw: unknown }>`. Internally:
    - axios POST to `${config.url}/v1/chat/completions`
    - Body: `{ model: config.model, messages: [{role:'system', content: SYSTEM_PROMPT}, {role:'user', content: 'Student feedback: ' + text}], max_tokens: 5, temperature: 0, logprobs: true, top_logprobs: 5, guided_choice: ['positive','negative','neutral'] }`
    - Timeout: `env.VLLM_TIMEOUT_MS`
    - Retries: `env.VLLM_MAX_RETRIES` with linear backoff (`1000ms * attempt`)
    - Read `response.data.choices[0].message.content.trim().toLowerCase()`. Validate it is one of the 3 labels (since `guided_choice` should guarantee this; defensive). If not, throw a `VllmInvalidLabelError`.
    - Return `{ label, raw: response.data }` so caller can stash full payload (incl. logprobs) in `rawResult`.
  - Notes: Constant `SYSTEM_PROMPT` is the canonical classifier prompt — copy verbatim from `vllm.sentiment.smoke.test/classifier.js:7-26`.

- [x] **Task 6: Write `VllmSentimentStrategy` unit spec**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/strategies/vllm-sentiment.strategy.spec.ts` (new)
  - Action: Mock axios. Test: payload shape (model, messages, guided_choice, max_tokens=5, temperature=0, logprobs=true, top_logprobs=5), label→return mapping for each of 3 labels, retry on 5xx then succeed, timeout, invalid label throws `VllmInvalidLabelError`, returns `raw` payload alongside label.
  - Notes: Follow `sentiment.service.spec.ts:1-228` pattern for jest.mock + TestingModule.

- [x] **Task 7: Register `VllmSentimentStrategy` provider**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/sentiment.module.ts`
  - Action: Add `VllmSentimentStrategy` to `providers` array.

- [x] **Task 8: Refactor `SentimentService.analyzeBatch` for vLLM-first orchestration (revised per F6, F13)**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.ts`
  - Action: Change signature to `analyzeBatch(items: FeedbackItem[], vllmConfig?: { url: string, model: string, enabled: boolean }): Promise<SentimentResultItem[]>`. New orchestration:
    1. If `!vllmConfig?.enabled || !vllmConfig.url`: skip to OpenAI path via `processOpenAIFallback(items)`, tag every result `servedBy: 'openai'`. Return.
    2. Else: build vLLM tasks, run with bounded concurrency `env.VLLM_PER_CHUNK_CONCURRENCY` (use inline queue+inFlight pattern matching `vllm.sentiment.smoke.test/classifier.js:108-116` to avoid a `p-limit` dep). Each call goes through `VllmRateLimiter.acquire()` (Task 8b) to respect process-wide cap.
    3. For each item: on success → produce result with one-hot scores + `servedBy: 'vllm'` + raw payload as internal extras. On failure → push `submissionId` to `failedItems`.
    4. **Circuit breaker (Task 8a)**: track consecutive failures. After `VLLM_CIRCUIT_BREAKER_THRESHOLD` consecutive failures, mark all remaining unprocessed items as failed without attempting vLLM.
    5. If `failedItems.length > 0`: extract corresponding `FeedbackItem`s by `submissionId` (preserve mapping via a `Map<submissionId, FeedbackItem>`), pass to a new private method `processOpenAIFallback(items: FeedbackItem[])` that re-chunks at `env.OPENAI_BATCH_SIZE` and calls `processChunk` for each sub-chunk (preserves existing OpenAI batch contract regardless of fallback volume).
    6. Tag OpenAI fallback results `servedBy: 'openai'`.
    7. Merge vLLM + OpenAI results, then **explicitly sort by original input index** (build `Map<submissionId, index>` from the original `items` array, sort merged results by that index). Return.
  - Notes: `processOpenAIFallback(items)` is a new private method extracted from the existing OpenAI path. The original `processChunk(items)` stays unchanged — it's now called via either `analyzeBatch` (vllm-disabled path) or `processOpenAIFallback` (per-item-fallback path).

- [x] **Task 8a: Per-chunk circuit breaker (F4)**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.ts`
  - Action: Within `analyzeBatch`'s vLLM loop, maintain a `consecutiveFailures` counter. Reset to 0 on each success. On failure, increment. If `consecutiveFailures >= env.VLLM_CIRCUIT_BREAKER_THRESHOLD`, abort the remaining vLLM dispatch — push every still-unprocessed `submissionId` into `failedItems` and proceed to OpenAI fallback. Log a WARN: "vLLM circuit breaker tripped after N consecutive failures, routing M remaining items to OpenAI."
  - Notes: Bounds the worst-case vLLM-attempt time when the endpoint is fully down to roughly `THRESHOLD × VLLM_TIMEOUT_MS × (VLLM_MAX_RETRIES + 1)` = `3 × 10s × 2 = 60s`, leaving 30s of BullMQ-envelope budget for the OpenAI fallback. Without this, a 50-item chunk vs a dead vLLM at concurrency 8 burns 140+s and busts the 90s envelope.

- [x] **Task 8b: `VllmRateLimiter` provider for process-wide concurrency cap (F9)**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/strategies/vllm-rate-limiter.ts` (new)
  - Action: NestJS `@Injectable({ scope: Scope.DEFAULT })` singleton. Internal state: a counter and a wait queue. Public methods: `async acquire(): Promise<void>` (waits for a slot if at cap), `release(): void` (releases a slot, wakes one waiter). Cap = `env.VLLM_GLOBAL_CONCURRENCY`. `VllmSentimentStrategy.classifyOne` wraps the HTTP call in `acquire()` / `release()` (use `try/finally`).
  - Notes: Implement with a simple `Promise`-based semaphore, no external dep needed. Bounds peak load to 16 in-flight requests per worker process regardless of how many BullMQ chunks are processed concurrently.

- [x] **Task 9: Update `SentimentService.spec.ts` for new orchestration paths**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.spec.ts`
  - Action: Add test cases:
    - vllmConfig absent → OpenAI-only (existing behavior, all results `servedBy: 'openai'`).
    - vllmConfig.enabled=false → OpenAI-only.
    - vllmConfig.enabled=true, all items succeed via vLLM → all results `servedBy: 'vllm'`, no OpenAI calls.
    - vllmConfig.enabled=true, some items fail vLLM → failed items go through OpenAI; servedBy tags reflect the source per item.
    - vllmConfig.enabled=true, ALL items fail vLLM → full chunk falls back to OpenAI, all `servedBy: 'openai'`.
    - **Input order preservation (F13)**: pass items in a known order with mixed pass/fail outcomes; assert the returned array's `submissionId`s match the input order exactly.
    - **Circuit breaker (F4 / Task 8a)**: simulate `VLLM_CIRCUIT_BREAKER_THRESHOLD` consecutive failures, assert remaining items skip vLLM and go straight to OpenAI fallback.
    - **OpenAI sub-batching in fallback (F6 / Task 8)**: when N failed items > `OPENAI_BATCH_SIZE`, assert `processChunk` is called `Math.ceil(N / OPENAI_BATCH_SIZE)` times (each with ≤ batch-size items).
  - Notes: Mock `VllmSentimentStrategy` injection and `VllmRateLimiter`; reuse the existing OpenAI mock pattern.

- [x] **Task 10: Update `SentimentController.runsync` to pass `vllmConfig` through**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/sentiment.controller.ts`
  - Action: After `parseResult.data`, extract `request.vllmConfig` and call `this.sentimentService.analyzeBatch(request.items, request.vllmConfig)`.
  - Notes: Schema validation already covers vllmConfig shape (Task 3). No new error handling needed.

#### Phase 3 — Worker observability + docs

- [x] **Task 11: Add 900-token guardrail WARN log (math corrected per F14)**
  - File: `sentiment.worker.temp.faculytics/src/sentiment/sentiment.service.ts`
  - Action: Constant `SYSTEM_PROMPT_TOKEN_ESTIMATE = 150` (derived from probe data: prompt_tokens=554 minus user-message portion `1500 / 3.5 ≈ 428` tokens ≈ 126 tokens for system prompt + chat overhead; +24 safety margin). Before each vLLM call, compute `Math.ceil(item.text.length / 3.5) + SYSTEM_PROMPT_TOKEN_ESTIMATE`. If `> 900`, `this.logger.warn('Item {submissionId} estimated at {N} prompt tokens, approaching vLLM max_model_len cap (1024)')`.
  - Notes: Non-fatal; call still proceeds. Goal is leading indicator, not enforcement. If WARNs appear in dev/staging logs, ops asks the sentiment dev to bump `--max-model-len` to 2048.

- [x] **Task 12: Update worker `CLAUDE.md`**
  - File: `sentiment.worker.temp.faculytics/CLAUDE.md`
  - Action: Add sections: (a) new env vars list, (b) vLLM rotation procedure (point ops at the admin SPA card), (c) the 900-token WARN behavior + what to do (ask sentiment dev for `--max-model-len 2048` bump), (d) note that `servedBy` is now in the response.

#### Phase 4 — API SystemConfig service + audit

- [x] **Task 13: Add audit action key (corrected per F2)**
  - File: `api.faculytics/src/modules/audit/audit-action.enum.ts`
  - Action: This file exports `AuditAction` as a `const ... as const` object (NOT a TypeScript `enum` — searching for `enum AuditAction` will return nothing). Add a new property: `ADMIN_SENTIMENT_VLLM_CONFIG_UPDATE: 'admin.sentiment-vllm-config.update'`. The value follows the existing dot-delimited lowercase convention (compare `ADMIN_SYNC_SCHEDULE_UPDATE: 'admin.sync-schedule.update'`).
  - Notes: The derived `type AuditAction` alias updates automatically because of the `as const` trick.

- [x] **Task 14: Create `SentimentConfigService` (with cross-field validation per F17)**
  - File: `api.faculytics/src/modules/analysis/services/sentiment-config.service.ts` (new)
  - Action: NestJS `@Injectable()` service. Public methods:
    - `async readConfig(): Promise<{ url: string, model: string, enabled: boolean }>` — `em.findOne(SystemConfig, { key: 'SENTIMENT_VLLM_CONFIG' })`. If null, return `{ url: '', model: '', enabled: false }`. Else `JSON.parse(row.value)`.
    - `async updateConfig(patch: Partial<{ url, model, enabled }>): Promise<{ url, model, enabled }>` — read current, merge, **validate cross-field**: if `merged.enabled === true && (!merged.url || merged.url.trim() === '')` throw `BadRequestException('Cannot enable vLLM with empty URL')` (F17). Otherwise JSON.stringify, upsert via `em.create(SystemConfig, {...}, { managed: false })` + `em.upsert(SystemConfig, config, { onConflictFields: ['key'] })`, `em.flush()`. Return merged config.
  - Notes: Storage = ONE row, key `SENTIMENT_VLLM_CONFIG`, value = JSON string. Cross-field validation lives here (not in the DTO) because it depends on merged state (existing + patch).

- [x] **Task 15: Write `SentimentConfigService` spec**
  - File: `api.faculytics/src/modules/analysis/services/sentiment-config.service.spec.ts` (new)
  - Action: Mock EntityManager. Tests:
    - `readConfig` returns defaults when row missing.
    - `readConfig` parses JSON value when row exists.
    - `updateConfig` upserts with merged value.
    - `updateConfig` preserves untouched fields (e.g., updating only `enabled` keeps existing `url`/`model`).
  - Notes: Follow `analytics-refresh.processor.spec.ts` patterns.

- [x] **Task 16: Add `SENTIMENT_VLLM_CONFIG` seed entry (revised per F8 — seeder, not migration)**
  - File: `api.faculytics/src/seeders/infrastructure/system-config.seeder.ts`
  - Action: Append a new entry to the `configs` array following the existing pattern:
    ```typescript
    {
      key: 'SENTIMENT_VLLM_CONFIG',
      value: JSON.stringify({ url: '', model: '', enabled: false }),
      description: 'vLLM-primary sentiment classifier runtime config (URL, model, enabled).',
    },
    ```
  - Notes: SystemConfigSeeder is the established place for seed data — reusing it avoids dual sources of truth and the `migration:check` drift risk that a one-off migration would introduce. The seeder's existing find-then-`em.persist(new SystemConfig())` loop is idempotent. `enabled=false` default = cautious rollout. Operator flips it on via the admin UI when ready.

#### Phase 5 — API admin controller

- [x] **Task 17: Create request DTO**
  - File: `api.faculytics/src/modules/analysis/dto/requests/update-sentiment-vllm-config.request.dto.ts` (new)
  - Action:
    ```typescript
    export class UpdateSentimentVllmConfigRequestDto {
      @IsOptional() @IsString() @IsUrl({ require_protocol: true }) url?: string;
      @IsOptional() @IsString() @MinLength(1) model?: string;
      @IsOptional() @IsBoolean() enabled?: boolean;
    }
    ```
  - Notes: Add `@ApiProperty({ required: false })` decorators for Swagger.

- [x] **Task 18: Create response DTO**
  - File: `api.faculytics/src/modules/analysis/dto/responses/sentiment-vllm-config.response.dto.ts` (new)
  - Action:
    ```typescript
    export class SentimentVllmConfigResponseDto {
      @ApiProperty() url: string;
      @ApiProperty() model: string;
      @ApiProperty() enabled: boolean;
    }
    ```

- [x] **Task 19: Create `AdminSentimentConfigController` (with prod gate per F16, before/after audit per F18)**
  - File: `api.faculytics/src/modules/analysis/controllers/admin-sentiment-config.controller.ts` (new)
  - Action:
    - `@Controller('admin/sentiment/vllm-config')`
    - `@UseInterceptors(MetaDataInterceptor, AuditInterceptor)` at class level
    - `@Get()` `@UseJwtGuard(UserRole.SUPER_ADMIN)` → `getConfig()` returns `SentimentVllmConfigResponseDto` from service.
    - `@Put()` `@HttpCode(200)` `@UseJwtGuard(UserRole.SUPER_ADMIN)` `@Audited({ action: AuditAction.ADMIN_SENTIMENT_VLLM_CONFIG_UPDATE, resource: 'SystemConfig' })` → handler:
      1. Read `previous = await sentimentConfigService.readConfig()`.
      2. **Production gate (F16)**: if `dto.enabled === true && env.NODE_ENV === 'production' && env.ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD !== true`, throw `BadRequestException('Enabling vLLM in production requires ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true')`.
      3. `next = await sentimentConfigService.updateConfig(dto)` (which itself enforces cross-field rules from F17).
      4. **Before/after audit (F18)**: explicitly call `auditService.record({ action, resource, payload: { previous, next } })` so URL rotations have full traceability. (`@Audited()` decorator alone records action+actor only.)
      5. Return `next`.
    - Swagger `@ApiTags('Admin / Sentiment')`, `@ApiOperation`, `@ApiResponse`.
  - Notes: Mirror `moodle-sync.controller.ts:208-223` decorator stack; the prod-gate + before/after-audit logic lives in the handler body, not the decorator.

- [x] **Task 20: Write `AdminSentimentConfigController` spec (per-role coverage per F25, gate coverage per F16)**
  - File: `api.faculytics/src/modules/analysis/controllers/admin-sentiment-config.controller.spec.ts` (new)
  - Action: TestingModule with mocked `SentimentConfigService` + `AuditService`, override `AuthGuard('jwt')` + `RolesGuard` + `MetaDataInterceptor` + `AuditInterceptor`. Tests:
    - GET returns current config from service.
    - PUT with valid body calls `updateConfig` and returns merged result.
    - DTO validation: invalid URL → throws `BadRequestException` (use `new Dto(); dto.field = ...; await validate(dto);` per the moodle-sync pattern, F22).
    - DTO validation: empty model → throws.
    - **Per-role 403 (F25)**: 4 separate test cases for `FACULTY`, `DEAN`, `STUDENT`, `ADMIN` — each overrides `RolesGuard.canActivate` to return false and asserts the controller method throws `ForbiddenException`.
    - **Production gate (F16)**: PUT `{enabled: true}` with `NODE_ENV='production'` and `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=undefined` → throws `BadRequestException`. Same with the env var set to `true` → succeeds.
    - **Before/after audit (F18)**: PUT calls `auditService.record` with `{previous, next}` payload. Spy on the mocked AuditService.
  - Notes: Follow `admin.controller.spec.ts:1-80` setup pattern.

- [x] **Task 21: Register controller + service in `AnalysisModule` (with SystemConfig forFeature per F3)**
  - File: `api.faculytics/src/modules/analysis/analysis.module.ts`
  - Action:
    1. Import `SystemConfig` from `src/entities/system-config.entity.ts` and append it to the `MikroOrmModule.forFeature([...])` array (currently lists `AnalysisPipeline, SentimentRun, SentimentResult, TopicModelRun, Topic, TopicAssignment, RecommendationRun, RecommendedAction, SubmissionEmbedding, User`). Without this, `SentimentConfigService.em.findOne(SystemConfig, ...)` will fail at runtime — `SystemConfig` is NOT registered in this module today.
    2. Add `AdminSentimentConfigController` to `controllers`.
    3. Add `SentimentConfigService` to `providers`.
    4. Add `SentimentConfigService` to `exports` (the orchestrator reads it, and the orchestrator is already exported from this module — but the service must be exported for cross-module DI).
  - Notes: F3 fix. Verified by direct read of `analysis.module.ts:39-54` — SystemConfig genuinely missing.

#### Phase 6 — API DTO + orchestrator integration

- [x] **Task 22: Extend `BatchAnalysisJobMessage` with optional `vllmConfig`**
  - File: `api.faculytics/src/modules/analysis/dto/batch-analysis-job-message.dto.ts`
  - Action: Add `vllmConfig: z.object({ url: z.string().url(), model: z.string().min(1), enabled: z.boolean() }).optional()` to the schema. Keep `.strict()`.
  - Notes: Optional means existing job dispatchers (topic-model, embeddings) don't need to change.

- [x] **Task 23: Extend API-side worker contract DTOs**
  - File: `api.faculytics/src/modules/analysis/dto/sentiment-worker.dto.ts`
  - Action:
    - Add `vllmConfig: z.object({ url, model, enabled }).optional()` to `sentimentWorkerRequestSchema`.
    - Add `servedBy: z.enum(['vllm', 'openai']).optional()` to `sentimentResultItemSchema`.
  - Notes: Both optional. Schema is loose by Zod default (NOT `.strict()`). Without extending `sentimentResultItemSchema`, `safeParse` would strip `servedBy` from the typed parsed view — but `rawResult: raw` (against the passthrough wrapper) still saves it to JSONB. Extending makes the typed view match reality and keeps the contract honest.

- [x] **Task 23a: Verify whether `sentimentWorkerRequestSchema` is actually consumed (per F5)**
  - File: `api.faculytics/src/modules/analysis/dto/sentiment-worker.dto.ts` + `grep -rn 'sentimentWorkerRequestSchema' api.faculytics/src/`
  - Action: Search for all consumers. If unused, file a follow-up issue to delete the schema (it's already drifting from the actual envelope — missing `jobId`, `version`, `type`, `publishedAt`). If used, document the consumer in this spec and align the schema with the envelope before adding `vllmConfig`. Either way, the new optional field gets added.
  - Notes: Reviewer flagged that the schema doesn't match the envelope and may be dead code. Don't compound the drift.

- [x] **Task 24: Inject `vllmConfig` into envelope at orchestrator dispatch**
  - File: `api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action: Around line 1700-1714 (sentiment chunk envelope construction), inject the orchestrator's constructor with `SentimentConfigService`. Before building envelopes for the chunk batch, call `await sentimentConfigService.readConfig()` ONCE per dispatch (not per chunk). If `config.enabled && config.url`, set `vllmConfig: config` on each chunk's envelope. Else omit the field.
  - Notes: Single read per dispatch (not per chunk) avoids N queries; the config snapshot stays consistent across the batch.

- [ ] ~~**Task 25**~~ — **DELETED per F12.** `sentiment.processor.ts:235` already does `rawResult: raw` against a `.passthrough()` result-array schema, so `servedBy` round-trips into JSONB without any code change. The original task was a no-op. Documentation of this fact is captured in Codebase Patterns.

- [x] **Task 26: Update orchestrator + processor specs (correct file path per F7)**
  - File: `api.faculytics/src/modules/analysis/services/__tests__/pipeline-orchestrator.chunking.spec.ts` (extend)
  - File: `api.faculytics/src/modules/analysis/processors/sentiment.processor.spec.ts` (extend)
  - Action:
    - Orchestrator (chunking spec): mock `SentimentConfigService.readConfig` returning enabled/disabled scenarios; assert each chunk envelope contains `vllmConfig` ONLY when `enabled === true && url` is non-empty; assert config is read once per dispatch (not per chunk).
    - Processor: assert `servedBy` round-trips into `rawResult` when worker returns it; assert no error when worker omits it (backward compat).
  - Notes: Original spec referenced `pipeline-orchestrator.service.spec.ts` which does not exist; the orchestrator's specs are split across `__tests__/{audit,chunking,scheduler}.spec.ts`. Dispatch-path coverage lives in `chunking.spec.ts`.

#### Phase 7 — Admin SPA UI

- [x] **Task 27: Add types to `src/types/api.ts`**
  - File: `admin.faculytics/src/types/api.ts`
  - Action: Add:
    ```typescript
    export interface SentimentVllmConfigResponse {
      url: string;
      model: string;
      enabled: boolean;
    }
    export interface UpdateSentimentVllmConfigRequest {
      url?: string;
      model?: string;
      enabled?: boolean;
    }
    ```

- [x] **Task 28: Create `use-sentiment-config.ts` hook**
  - File: `admin.faculytics/src/features/sentiment-config/use-sentiment-config.ts` (new)
  - Action: Two exports following `use-sync-schedule.ts` exactly:
    - `useSentimentConfig()` — `useQuery<SentimentVllmConfigResponse>` with queryKey `['sentiment-vllm-config', activeEnvId]`, queryFn `apiClient<SentimentVllmConfigResponse>('/admin/sentiment/vllm-config')`, `enabled: !!activeEnvId && isAuth`, `refetchInterval: 60000`.
    - `useUpdateSentimentConfig()` — `useMutation` with mutationFn `apiClient<SentimentVllmConfigResponse>('/admin/sentiment/vllm-config', { method: 'PUT', body: JSON.stringify(payload) })`, `onSuccess` fires `toast.success('vLLM configuration updated')` + `queryClient.invalidateQueries({ queryKey: ['sentiment-vllm-config', activeEnvId] })`, `onError` fires `toast.error(<message>)`.
  - Notes: Mirror the existing hook's structure 1:1 — same imports, same query key shape pattern.

- [x] **Task 29: Create `sentiment-config-card.tsx` (Card pattern flexible per F21)**
  - File: `admin.faculytics/src/features/sentiment-config/sentiment-config-card.tsx` (new)
  - Action: Named export `SentimentConfigCard()`. Card with:
    - Header: "Sentiment vLLM Configuration" + short description.
    - Body (loading state): skeleton or "Loading..." text.
    - Body (loaded): read-only display of current url, model, enabled state + an "Edit" button.
    - Edit dialog (controlled): Input for URL, Input for Model, Switch for Enabled. Manual validation: URL non-empty + parsed via `new URL(...)` with `protocol === 'http:' | 'https:'` (matches the existing settings-page validation pattern at lines 64-72), model non-empty. Save button disabled while `mutation.isPending` and shows spinner. On save → call `useUpdateSentimentConfig().mutateAsync(payload)`.
    - Error state: inline error text from `useSentimentConfig().error`.
  - Notes: shadcn primitives — Card structure is flexible: settings-page.tsx uses `<Card><CardHeader><CardTitle/><CardDescription/></CardHeader><CardContent/></Card>` while sync-schedule-card.tsx uses raw `<Card><div className="p-5">...</div></Card>`. Either is acceptable; recommend the `CardHeader/CardContent` form for consistency with the neighboring Environments card on the same page (F21). No react-hook-form.

- [x] **Task 30: Insert `SentimentConfigCard` into settings page (corrected per F11)**
  - File: `admin.faculytics/src/features/settings/settings-page.tsx`
  - Action: Inside the existing `<div className="space-y-6 max-w-2xl dashboard-stagger">` container at line 97, append `<SentimentConfigCard />` as a sibling immediately after the existing `</Card>` closing tag at line 179. Import from `@/features/sentiment-config/sentiment-config-card`.
  - Notes: settings-page.tsx currently has exactly ONE Card (Environments); the new card becomes the second sibling. The `space-y-6` container provides vertical spacing automatically. No route changes. Note: the moodle-sync card cited as exemplar lives in `features/moodle-sync/sync-dashboard.tsx` (NOT settings-page.tsx) — copy the hook+card structure, but place this card on the settings page per the user's request.

#### Phase 8 — End-to-end validation

- [x] **Task 31: Manual smoke test plan (documented; executed during PR review — corrected action string per F2)**
  - File: PR description / manual checklist (no file change)
  - Action: Document the following manual e2e flow:
    1. Run `SystemConfigSeeder` → confirm new `SENTIMENT_VLLM_CONFIG` row present in DB with `enabled=false` and empty url/model.
    2. Open admin SPA `/settings` → confirm Sentiment vLLM Config card visible below Environments, shows blank URL/model + disabled toggle.
    3. Edit card: paste current vLLM URL (`https://nmn5qf9j-8000.thundercompute.net`), model `unsloth/gemma-4-26B-A4B-it`, enable toggle → Save → confirm sonner success + card refreshes.
    4. Submit a test pipeline (small batch, e.g., 5 submissions) → confirm worker logs show vLLM calls → confirm `SentimentResult` rows have `rawResult.servedBy='vllm'`.
    5. Update card with bogus URL (`https://invalid.example`) → submit another pipeline → confirm worker falls back per-item to OpenAI within ~60s (circuit breaker engages after 3 consecutive failures) → confirm rows have `rawResult.servedBy='openai'`. No items lost. No BullMQ envelope timeout.
    6. Disable via toggle → submit pipeline → confirm envelope has no vllmConfig (or enabled=false) → worker runs OpenAI-only.
    7. Test cross-field validation (F17): in dev, attempt to set `enabled=true` while clearing URL → confirm 400 error.
    8. Test prod gate (F16): in a staging/prod-like env without `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true`, attempt enable → confirm 400 error with the gating message.
    9. Confirm audit log table contains rows for each Save action with `action='admin.sentiment-vllm-config.update'` and `payload.previous` + `payload.next` populated.

- [x] **Task 31a: Cross-boundary contract test (F19)**
  - File: `api.faculytics/test/contracts/sentiment-worker-envelope.spec.ts` (new)
  - File: `sentiment.worker.temp.faculytics/test/contracts/api-envelope.spec.ts` (new)
  - Action: Construct a representative envelope using the API's `batchAnalysisJobMessageSchema` with `vllmConfig` populated. Validate it against the worker's `sentimentRequestSchema`. Both must accept the same payload. Run in CI for both repos.
  - Notes: Given the existing schema drift between API and worker (F5 — missing `jobId`, `version`, `type`, `publishedAt`), skipping this for `vllmConfig` would invite a repeat. The test fixture also doubles as living documentation of the envelope shape.

- [x] **Task 32: Enumerate downstream score-aggregation queries (F15)**
  - File: written analysis attached to PR description (no source change required for the audit step itself; gating decisions may add follow-up tasks)
  - Action:
    1. Run `grep -rn 'positiveScore\|neutralScore\|negativeScore' api.faculytics/src/` to find all TS-side uses.
    2. Run `grep -rn 'positive_score\|neutral_score\|negative_score' api.faculytics/src/migrations/` to find all SQL-side uses (materialized views, raw queries).
    3. For each occurrence, document:
       - File + line
       - Aggregation type (AVG, SUM, STDDEV, COUNT WHERE label = X, etc.)
       - One-line judgment: does mixing one-hot (vLLM) and continuous (OpenAI) score rows distort this metric? (e.g., AVG over scores: distortion is benign — averages still represent per-class proportions; STDDEV: distortion is real — variance shifts; COUNT by label: unaffected since label is argmax either way)
    4. For metrics flagged as distorted: add a follow-up task (per metric) to either gate by `rawResult->>'servedBy'` or accept the distortion with explicit documentation.
  - Notes: This is a discovery + decisioning task. Output is an enumerated table inserted into the PR description and (where action-required) a follow-up issue. Run BEFORE flipping `enabled=true` in production.

### Acceptance Criteria

- [x] **AC 1 — Happy path (vLLM-primary)**
  - **Given** SystemConfig `SENTIMENT_VLLM_CONFIG` is `{enabled:true, url:<reachable>, model:<valid>}` and the vLLM endpoint is healthy
  - **When** the API enqueues a sentiment chunk of N items
  - **Then** the worker invokes vLLM `/v1/chat/completions` once per item with `guided_choice: ['positive','negative','neutral']`, `temperature: 0`, `max_tokens: 5`, `logprobs: true, top_logprobs: 5`
  - **And** every result is mapped to one-hot scores (positive→{1,0,0}, neutral→{0,1,0}, negative→{0,0,1})
  - **And** every persisted `SentimentResult` has `rawResult.servedBy === 'vllm'`
  - **And** the worker makes zero OpenAI API calls during the chunk

- [x] **AC 2 — Per-item fallback to OpenAI**
  - **Given** vLLM is reachable but the call for a subset of items fails (timeout, 5xx after retries, or invalid label)
  - **When** the worker processes the chunk
  - **Then** items that succeeded on vLLM keep one-hot scores tagged `servedBy: 'vllm'`
  - **And** failed items are passed (in a single `processChunk` call) through the existing OpenAI logic
  - **And** OpenAI-served items have continuous scores tagged `servedBy: 'openai'`
  - **And** the merged result preserves the original input order

- [x] **AC 3 — Full-chunk fallback (vLLM unreachable)**
  - **Given** `vllmConfig.url` points to an unreachable host
  - **When** the worker processes a chunk of N items
  - **Then** every item's vLLM call fails after `VLLM_MAX_RETRIES` attempts
  - **And** the entire chunk is processed via the OpenAI fallback path
  - **And** no items are lost
  - **And** every persisted result has `rawResult.servedBy === 'openai'`

- [x] **AC 4 — Feature flag off (vLLM disabled)**
  - **Given** SystemConfig `SENTIMENT_VLLM_CONFIG.enabled === false`
  - **When** the API dispatches a sentiment chunk
  - **Then** the orchestrator omits `vllmConfig` from the envelope (or sets `enabled: false`)
  - **And** the worker runs OpenAI-only, identical to pre-feature behavior
  - **And** every persisted result has `rawResult.servedBy === 'openai'`

- [x] **AC 5 — Backward-compatible envelope (missing `vllmConfig`)**
  - **Given** an envelope arrives at the worker with no `vllmConfig` field at all (older API version or external caller)
  - **When** the worker validates and processes the envelope
  - **Then** validation succeeds (the field is optional)
  - **And** the worker falls back to OpenAI-only processing without error

- [x] **AC 6 — URL rotation propagates to next dispatch (action string corrected per F2)**
  - **Given** an authenticated SuperAdmin in a non-production environment (or with `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true`)
  - **When** they `PUT /admin/sentiment/vllm-config` with body `{url:'https://new.url', enabled:true}`
  - **Then** the SystemConfig row is upserted with the merged value
  - **And** an audit log row is written with `action === 'admin.sentiment-vllm-config.update'` and `payload.previous` + `payload.next` populated
  - **And** the next sentiment chunk dispatched by the orchestrator carries `vllmConfig.url === 'https://new.url'` in its envelope

- [x] **AC 7 — Admin auth gate**
  - **Given** a user with role other than `SUPER_ADMIN` (e.g., FACULTY, DEAN, STUDENT, ADMIN)
  - **When** they call `GET` or `PUT /admin/sentiment/vllm-config`
  - **Then** they receive HTTP 403 Forbidden
  - **And** no SystemConfig change is made

- [x] **AC 8 — Admin DTO validation**
  - **Given** an authenticated SuperAdmin
  - **When** they `PUT` with body `{url:'not-a-url'}` or `{model:''}`
  - **Then** they receive HTTP 400 with a class-validator error message identifying the bad field
  - **And** no SystemConfig change is made

- [x] **AC 9 — 900-token guardrail WARN**
  - **Given** an item whose `Math.ceil(text.length / 3.5) + 250` (estimated total prompt tokens) exceeds 900
  - **When** the worker prepares the vLLM call for that item
  - **Then** a WARN-level log entry is emitted including the `submissionId` and the estimated token count
  - **And** the call still proceeds (the warning does not abort processing)

- [x] **AC 10 — Concurrency bound respected**
  - **Given** a chunk of 50 items and `VLLM_PER_CHUNK_CONCURRENCY === 8`
  - **When** the worker processes the chunk
  - **Then** at no point are more than 8 vLLM HTTP calls in flight simultaneously
  - **And** the chunk completes once all items have results (vLLM-served or OpenAI-fallback)

- [x] **AC 11 — Result shape integrity (downstream contract)**
  - **Given** any persisted `SentimentResult` row produced via either vLLM or OpenAI path
  - **When** read by downstream aggregations
  - **Then** `positiveScore`, `neutralScore`, `negativeScore` are each finite numbers in `[0,1]`
  - **And** `label` equals the argmax of the three scores (existing behavior preserved)
  - **And** `rawResult` is valid JSON containing at minimum a `servedBy` field

- [x] **AC 12 — Admin SPA — read & display**
  - **Given** a SuperAdmin opens `/settings` in the admin SPA
  - **When** the page renders
  - **Then** a "Sentiment vLLM Configuration" card appears below the Environments card
  - **And** the card displays the current `url`, `model`, and `enabled` values fetched from `GET /admin/sentiment/vllm-config`
  - **And** during fetch a loading state is shown (no flash of empty form)

- [x] **AC 13 — Admin SPA — update flow (401 path clarified per F23)**
  - **Given** a SuperAdmin edits the URL, model, or enabled toggle and clicks Save
  - **When** the mutation succeeds (HTTP 200)
  - **Then** a sonner success toast appears
  - **And** the card re-fetches and re-renders with the new values via query invalidation
  - **When** the mutation fails with HTTP 400 (validation) or 403 (auth)
  - **Then** a sonner error toast appears with a message describing the failure
  - **And** the card retains the user's edits in the dialog (does not reset)
  - **When** the mutation fails with HTTP 401 (token expired)
  - **Then** the apiClient performs a single deduplicated silent refresh and retries the request; on refresh success the user sees the success toast normally
  - **And** if refresh fails the user is force-logged-out via the existing apiClient flow (in-flight edits lost across the navigation — recovering edits is out of scope for v1)

- [x] **AC 14 — Timeout cap (F4)**
  - **Given** vLLM is unreachable (config URL points to a down/invalid host)
  - **When** a chunk of 50 items is processed at concurrency 8
  - **Then** the per-chunk circuit breaker fires after `VLLM_CIRCUIT_BREAKER_THRESHOLD=3` consecutive failures
  - **And** total wall time is bounded by `(3 × VLLM_TIMEOUT_MS × (VLLM_MAX_RETRIES + 1)) + OpenAI_chunk_time` ≈ `(3 × 10s × 2) + ~10s = ~70s`
  - **And** total wall time stays under `BULLMQ_HTTP_TIMEOUT_MS = 90s`
  - **And** every item is persisted with `rawResult.servedBy === 'openai'`

- [x] **AC 15 — Production rollout gate (F16)**
  - **Given** `NODE_ENV === 'production'` and `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD` is unset or not `'true'`
  - **When** an authenticated SuperAdmin PUTs `{enabled: true}` to the admin endpoint
  - **Then** the request returns HTTP 400 with a message naming the missing env var
  - **And** the SystemConfig row is NOT updated
  - **And** no audit row is written for the rejected attempt (the `@Audited` decorator only records successful calls)

- [x] **AC 16 — Cross-field validation: enabled=true with empty URL (F17)**
  - **Given** the current SystemConfig has `url=''`
  - **When** a SuperAdmin PUTs `{enabled: true}` (without supplying a URL)
  - **Then** the merged config would have `enabled=true` and `url=''`
  - **And** `SentimentConfigService.updateConfig` throws `BadRequestException('Cannot enable vLLM with empty URL')`
  - **And** the request returns HTTP 400
  - **And** the SystemConfig row is NOT updated

## Additional Context

### Dependencies

**External services**

- vLLM endpoint hosted on Thunder Compute. URL rotates every few days as credits cycle (current: `https://nmn5qf9j-8000.thundercompute.net`, model `unsloth/gemma-4-26B-A4B-it`, no auth, `max_model_len: 1024`).
- OpenAI API (existing). Worker requires `OPENAI_API_KEY` for the fallback path.

**Internal API surfaces**

- `SystemConfig` entity (existing) — vLLM config storage row.
- `AuditAction` enum (extending) — new value for the admin endpoint audit trail.
- `AuditInterceptor` + `MetaDataInterceptor` (existing) — wired by the new admin controller.
- `@UseJwtGuard(UserRole.SUPER_ADMIN)` + Passport JWT strategy (existing).
- BullMQ envelope + `BaseBatchProcessor` HTTP dispatch (existing) — passes `vllmConfig` through transparently.
- `SentimentResult` entity (existing) — `rawResult` JSONB stores `servedBy` without schema change.

**Internal frontend surfaces**

- `apiClient<T>(path, options?, envId?)` from `admin.faculytics/src/lib/api-client.ts` — handles auth, refresh, base URL.
- Zustand `useAuthStore` — token source.
- TanStack Query 5 + sonner + shadcn/ui Card/Input/Switch/Dialog primitives (all existing).
- `src/types/api.ts` central type registry (extending).

**New dependencies**

- `axios` in `sentiment.worker.temp.faculytics` (currently absent — OpenAI SDK uses node-fetch internally; vLLM strategy needs an HTTP client). No other new packages.

### Testing Strategy

**Unit tests (Jest, NestJS `TestingModule`)**

_Worker (`sentiment.worker.temp.faculytics`)_

- `VllmSentimentStrategy.spec.ts` (new) — Tasks 5/6: payload assertion (`guided_choice`, `logprobs`, `temperature`, `max_tokens`), label→one-hot mapping, retry/timeout (`VLLM_TIMEOUT_MS=10000`, `VLLM_MAX_RETRIES=1`), raw payload preserved, `VllmInvalidLabelError` on out-of-set labels.
- `vllm-rate-limiter.spec.ts` (new — supports Task 8b/F9): semaphore acquires up to `VLLM_GLOBAL_CONCURRENCY` slots, queues additional waiters, releases wake one waiter at a time; concurrent acquire/release stress test.
- `SentimentService.spec.ts` (extended) — Task 9: 8 scenarios — vllmConfig absent, disabled, all-success, partial-fallback, all-fallback, input-order preservation (F13), circuit breaker engages (F4), OpenAI sub-batching during fallback (F6). Mock `VllmSentimentStrategy`, `VllmRateLimiter`, and the existing OpenAI client.

_API (`api.faculytics`)_

- `SentimentConfigService.spec.ts` (new) — Task 15: read default + read existing + update merge + idempotent upsert + cross-field validation rejects `enabled=true` with empty URL (F17).
- `AdminSentimentConfigController.spec.ts` (new) — Task 20: auth guard override, GET returns config, PUT calls service, DTO validation rejects bad URL/empty model, **per-role 403 for FACULTY/DEAN/STUDENT/ADMIN (F25)**, **production gate accepts/rejects based on env var (F16)**, **before/after audit payload (F18)**.
- `pipeline-orchestrator.chunking.spec.ts` (extended — corrected file path per F7) — Task 26: envelope includes `vllmConfig` when enabled+url present, omits otherwise; reads config once per dispatch (not per chunk).
- `sentiment.processor.spec.ts` (extended) — Task 26: `servedBy` round-trips into `rawResult` JSONB; missing `servedBy` does not error.

**Integration tests**

- API: extend the existing e2e harness (`test/`) with a round-trip test of `PUT /admin/sentiment/vllm-config` then `GET` to confirm persistence.
- Worker: extend `runsync` controller test with a payload containing `vllmConfig` and a mocked HTTP server (axios-mock-adapter is the lightest fit; or msw). Confirm `servedBy` tags appear in the response per item.
- **Cross-boundary contract tests (Task 31a / F19)**: `api.faculytics/test/contracts/sentiment-worker-envelope.spec.ts` and `sentiment.worker.temp.faculytics/test/contracts/api-envelope.spec.ts` validate the same envelope payload against both schemas. Mandatory in CI for both repos.

**Pre-flight artifact (Task 0 / F10)**

- `vllm.sentiment.smoke.test/test_logprobs_guided.js` + `.sample.json` — committed evidence that `guided_choice` + `logprobs` work on the deployed vLLM endpoint.

**Manual smoke (deployed to dev — see Task 31)**

- vLLM enabled / URL bogus / disabled flows; verify circuit breaker (~60s) bounds latency under unreachable endpoint.
- Audit log row appearance with `payload.previous` + `payload.next` after URL rotation.
- Worker logs show 900-token WARN on a deliberately long sample.
- Production-gate rejection in staging environment without `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD`.

**Downstream-aggregation audit (Task 32 / F15)**

- Manual enumeration of all SQL/MikroORM uses of `positiveScore` / `neutralScore` / `negativeScore`. Output documented in PR description with per-occurrence judgment of one-hot-vs-continuous distortion. Run BEFORE flipping `enabled=true` in production.

### Notes

**High-risk items (pre-mortem) — updated post-adversarial-review**

- **Mixed score shapes per pipeline run.** vLLM-served rows have one-hot scores; OpenAI-served rows have continuous scores. Argmax-derived `label` is unambiguous either way, so any aggregation that filters/buckets by label is unaffected. But aggregations that compute _means or distributions_ over `positiveScore` / `neutralScore` / `negativeScore` will see different shapes for different rows. **Mitigation (F15)**: Task 32 enumerates every aggregation site, judges per-occurrence whether one-hot distorts the metric, and creates follow-up tasks for the distorted ones. Run BEFORE flipping `enabled=true` in production.

- **Stale URL → latency tax on every chunk.** If the vLLM URL is stale (instance rotated, config not yet updated), every item pays vLLM-attempt latency before falling back to OpenAI. **Mitigation (F4)**: lowered `VLLM_TIMEOUT_MS=10000` and `VLLM_MAX_RETRIES=1` (worst case 20s per item), plus per-chunk circuit breaker that short-circuits remaining items after `VLLM_CIRCUIT_BREAKER_THRESHOLD=3` consecutive failures (worst case ~60s per chunk vs 90s BULLMQ envelope). Combined: a fully-down vLLM endpoint produces a one-time ~60s latency tax per chunk, not a complete failure. Ops still monitors `servedBy: 'openai'` rate; if elevated, rotate the URL via the admin UI.

- **vLLM throughput saturation under multi-chunk concurrency.** With `BULLMQ_SENTIMENT_CONCURRENCY=3` and `VLLM_PER_CHUNK_CONCURRENCY=8`, naïve fan-out is up to 24 in-flight requests per worker. The smoke test only validated single-batch concurrency 8. **Mitigation (F9)**: `VllmRateLimiter` singleton enforces a process-wide cap of `VLLM_GLOBAL_CONCURRENCY=16`, keeping multi-chunk parallel processing under the smoke-test-validated regime. Both knobs are env-tunable for production tuning.

- **`max_model_len: 1024` regression.** Empirical test (554/1024 on a long sample) says we're fine, but real-world feedback may skew longer. The 900-token WARN guardrail (corrected estimator math: `Math.ceil(text.length / 3.5) + 150`, F14) is the leading indicator. If those warnings appear in dev/staging logs, ops asks the sentiment dev to bump to 2048 — no spec change needed.

- **Single-click 100%-traffic flip in production.** A single SuperAdmin click could route all sentiment traffic through vLLM. **Mitigation (F16)**: prod gate via `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD` env var — must be set to `true` for the PUT to accept `enabled=true` in production. Percentage-based canary deferred to future work.

- **Stale URL detected only reactively.** No upstream notification when the vLLM endpoint becomes unreachable; ops must spot it via `servedBy: 'openai'` rate spikes after submissions process. **Acknowledged but not mitigated in v1**; a "Test connection" button + `lastKnownReachableAt` field is in Future Considerations (F24).

**Known limitations**

- No automated vLLM URL rotation. Manual via admin UI when Thunder Compute credits cycle.
- No upstream health probe — fail-open by design. Per-chunk circuit breaker (F4) bounds the worst-case latency tax of a fully-down endpoint.
- No multi-item batching to vLLM — per sentiment dev's guidance, vLLM continuous-batches concurrent calls server-side.
- Admin SPA has no formal tests for the new feature (matches existing feature dirs' conventions).
- `servedBy` lives in `rawResult` JSONB only, not as a typed column. SQL aggregations on dispatch source would require a future migration.
- Pipeline-level "% of items served by vLLM" not surfaced in the admin SPA in v1. Logs + `rawResult.servedBy` JSONB inspection only.
- Cross-boundary contract test (Task 31a) doesn't currently catch pre-existing API-side `sentimentWorkerRequestSchema` drift (missing `jobId`, `version`, `type`, `publishedAt`). It only validates the `vllmConfig` field round-trip. Aligning the legacy schema with the envelope is out of scope.

**Future considerations (explicitly deferred)**

- Calibration of vLLM logprobs into soft scores. Raw logprobs already preserved in `rawResult.raw` for this future option.
- Cost dashboard: per-pipeline-run breakdown of vLLM vs OpenAI items × estimated cost.
- Multi-instance vLLM rotation (if Thunder Compute scales out): `vllmConfig` could become a list of URLs with weighted round-robin.
- A typed `servedBy` column on `SentimentResult` if SQL aggregations need it.
- Frontend (`app.faculytics`, the faculty/dean/student SPA) surfacing — none planned; admin SPA covers all config needs.
- **"Test connection" button on the sentiment-config-card (F24)**: synchronously pings the configured vLLM URL via a new `POST /admin/sentiment/vllm-config/test` endpoint. Would also enable a `lastKnownReachableAt` SystemConfig field for proactive rotation alerts. Reduces silent-degradation window between rotation and admin update.
- **Percentage-based canary rollout**: extend `vllmConfig` with `dispatchPercent: 0-100`; orchestrator only injects vllmConfig for `dispatchPercent`% of items. More granular than the binary `enabled` flag, useful for gradual production exposure beyond v1's "off vs on" toggle.

**Empirical context**

- Logprobs probing: 4 samples (clearly positive, clearly negative, borderline mixed, factual neutral) — top-1 logprob ≈ 0 (P ≈ 1.0) on every sample. This is what drove the one-hot decision over logprobs softmax: the classifier is too confident for soft scores to add information. Probe artifact committed at `vllm.sentiment.smoke.test/test_logprobs_guided.js` + `.sample.json` (Task 0, F10) for traceability.
- Long-feedback test: canonical classifier system prompt + 280-word code-switched mixed-signal student feedback returned `prompt_tokens: 554` on the live endpoint. Predicted `neutral` correctly (per the system prompt's "praise + criticism = neutral" rule). This justified deferring the `--max-model-len` bump. The 554-token result also calibrated the token estimator constants (F14).
- Sentiment dev's batching guidance: per-item HTTP at concurrency 8 is the recommended client pattern; vLLM's GPU-level continuous batching makes app-side multi-item batching unnecessary. Current smoke test (`vllm.sentiment.smoke.test/server.js`) uses `concurrency = 8` as default.

**Adversarial review trail**

- 26 findings raised against the original spec (4 Critical, 7 High, 9 Medium, 5 Low, 1 Undecided). All applied via Advanced Elicitation — see commit history of this spec file for the diff. F26 (orchestrator 12-dep DI) explicitly accepted with documented rationale rather than refactored.

## Review Notes (Post-Implementation)

- Adversarial review completed against the implementation diff (baseline `839918a`) — 32 findings raised (3 Critical, 14 High, 11 Medium, 4 Low).
- Resolution approach: Auto-fix (option `F`).
- Fixed (22 findings): **F2** rate-limiter race (direct-handoff pattern, locked in by regression test), **F6+F14** SSRF surface (DTO + Zod schemas now https-only), **F10** double-audit (removed `@Audited` decorator; manual Emit is the single source), **F1** slot held during backoff (release before sleep), **F3** shutdown drain (OnModuleDestroy rejects queued waiters), **F4** totalFailures counter replaces fragile "consecutive" semantics, **F8** TOCTOU (service now returns `{previous, next}` from single read), **F9** description no longer overwritten on update, **F11** verified AnalysisController base path (`/analysis`) doesn't conflict with admin endpoint, **F12** cross-field validation for empty model, **F13** URL validators aligned (https-only on both sides), **F17** circuit-breaker test assertion tightened to `≤ threshold + concurrency - 1`, **F18** commented as defense-in-depth, **F20** worker metadata schema accepts chunkIndex/chunkCount, **F24** upgraded warn to error on JSON parse failure, **F25** submissionId correlation in retry warn logs, **F26** `servedBy` removed from OpenAI-facing schema (split into `openaiSentimentScoreItemSchema` + extended response-item schema), **F31** `VllmInvalidLabelError` added to domain-error list.
- Accepted (10 findings, documented in place of fix): **F5** no actual duplicate bug path exists today, **F7** stale URL on BullMQ retry is bounded by worker-side circuit breaker and OpenAI fallback — acceptable as-is, **F15** `.default(false)` is dead but matches existing env-var idioms, **F16** `Object.create(Proto)` mocking is a pre-existing codebase pattern, **F19** cross-boundary contract enforcement would require CI wiring across two repos — deferred, **F21** role-based 403 tests are theater but kept for audit trail, **F22** no `readConfig` cache needed at current scale, **F23** strategy/limiter coupling is acceptable single-consumer design, **F27** smoke-test localhost default is ops-ergonomic, **F28** frontend can't observe NODE_ENV, **F29** optimistic switch-state is minor UX, **F30** pre-existing argmax tie-break behavior, **F32** URL-in-audit-metadata is desired for rotation traceability.
- Builds green in all four workspaces; test totals: API 1107 passed / 1 todo, worker 28 passed (up from 25 after adding 3 direct-handoff + shutdown regression tests).
