---
title: 'Frontend Pipeline Polling'
slug: 'frontend-pipeline-polling'
created: '2026-03-31'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['NestJS', 'MikroORM', 'PostgreSQL', 'BullMQ', 'Zod', 'Jest', 'Passport JWT']
files_to_modify:
  - 'src/modules/analysis/dto/pipeline-status.dto.ts'
  - 'src/modules/analysis/services/pipeline-orchestrator.service.ts'
  - 'src/modules/analysis/services/pipeline-orchestrator.service.spec.ts'
  - 'src/modules/analysis/analysis.controller.spec.ts'
code_patterns:
  - 'PascalCase public service methods'
  - 'Zod schemas for response DTOs'
  - 'EntityManager.fork() for isolated DB context'
  - 'CustomBaseEntity provides id, createdAt, updatedAt, deletedAt'
test_patterns:
  - 'Test.createTestingModule with useValue mocks'
  - 'jest.fn() for service/repo method mocks'
  - 'makeMockPipeline() factory pattern for test data'
  - 'Tests co-located with source as .spec.ts'
---

# Tech-Spec: Frontend Pipeline Polling

**Created:** 2026-03-31

## Overview

### Problem Statement

The frontend has no way to track analysis pipeline progress in real-time. There is no existing pipeline status UI, and the current `GET /analysis/pipelines/:id/status` response isn't optimized for polling — it lacks consistent field presence, per-stage progress tracking, and a retryable flag for failed states.

### Solution

Reshape the existing status endpoint response into a lean, polling-friendly DTO with consistent field presence (`null` over omission), per-stage progress counts (real for sentiment, `null` for binary stages), and a top-level `retryable` flag. The frontend uses React Query's `refetchInterval` for 3-second polling that auto-stops on terminal states. No new endpoints, no WebSockets, no denormalization.

### Scope

**In Scope:**
- Reshape status endpoint response DTO for polling consistency
- Add `progress: { current, total } | null` per stage (sentiment gets real counts via result row count)
- Add `retryable: boolean` on pipeline-level failures
- Ensure `updatedAt` is always accurate on pipeline entity
- Document the frontend polling contract (React Query + Axios pattern)

**Out of Scope:**
- Frontend UI implementation (stepper component, animations)
- WebSocket/SSE infrastructure
- Batch multi-pipeline status endpoint
- Denormalization of stage status onto pipeline entity
- ETag / conditional request support

## Context for Development

### Codebase Patterns

- **Response DTOs use Zod schemas** — `pipeline-status.dto.ts` defines `pipelineStatusSchema` and `stageStatusSchema` with Zod, then exports inferred TypeScript types. Changes to the response shape must update both the Zod schema and the service that constructs the response.
- **PascalCase public methods** — `GetPipelineStatus()`, `CreatePipeline()`, etc.
- **EntityManager.fork()** — `GetPipelineStatus()` forks the EM at the start for an isolated DB context, then runs all queries on the fork.
- **Stage status derivation** — stage statuses are computed from run entity statuses (or defaulted to `'pending'` if no run exists). There is a private `getEmbeddingStageStatus()` method for embedding-specific logic.
- **Current `StageStatus` shape uses optional fields** — `total?`, `completed?`, `processed?`, `included?`, `excluded?`. These fields appear/disappear depending on the stage, which is the core polling consistency problem to fix.

### Enums

- **`PipelineStatus`** (9 values): `AWAITING_CONFIRMATION`, `EMBEDDING_CHECK`, `SENTIMENT_ANALYSIS`, `SENTIMENT_GATE`, `TOPIC_MODELING`, `GENERATING_RECOMMENDATIONS`, `COMPLETED`, `FAILED`, `CANCELLED`
- **`RunStatus`** (4 values): `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
- Terminal statuses: `COMPLETED`, `FAILED`, `CANCELLED`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/modules/analysis/dto/pipeline-status.dto.ts` | Zod schema for status response — `pipelineStatusSchema`, `stageStatusSchema`, `PipelineStatusResponse` type |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts` | `GetPipelineStatus()` at ~line 438 — constructs response from pipeline + run entities (7 DB queries) |
| `src/modules/analysis/analysis.controller.ts` | Status endpoint at line 69 — `GET pipelines/:id/status`, delegates to orchestrator |
| `src/entities/analysis-pipeline.entity.ts` | Pipeline entity — has `updatedAt` (inherited from CustomBaseEntity), `status`, `commentCount`, `sentimentGateIncluded/Excluded` |
| `src/entities/sentiment-run.entity.ts` | SentimentRun — `status: RunStatus`, `submissionCount`, has `results` collection |
| `src/entities/sentiment-result.entity.ts` | Individual result per submission — COUNT of these gives sentiment progress |
| `src/entities/topic-model-run.entity.ts` | TopicModelRun — `status: RunStatus` |
| `src/entities/recommendation-run.entity.ts` | RecommendationRun — `status: RunStatus` |
| `src/modules/analysis/enums/pipeline-status.enum.ts` | `PipelineStatus` enum definition |
| `src/modules/analysis/enums/run-status.enum.ts` | `RunStatus` enum definition |
| `src/modules/analysis/services/pipeline-orchestrator.service.spec.ts` | Service tests — uses `makeMockPipeline()`, mocked EM fork |
| `src/modules/analysis/analysis.controller.spec.ts` | Controller tests — mocks orchestrator with `jest.fn()` |

### Technical Decisions

- **Single endpoint, no new routes** — reshape existing `GET /analysis/pipelines/:id/status` response rather than adding a separate polling endpoint. Avoids coordination complexity on the frontend.
- **No denormalization** — query run tables directly on each poll. With only a handful of privileged users polling concurrently, the join cost is negligible.
- **No WebSocket/SSE** — pipelines run for minutes. A 3-second REST polling interval via React Query is simpler, more resilient, and operationally trivial.
- **`null` over omission** — every field in the response is always present. Use `null` for absent optional values. This ensures React Query's referential comparison works correctly and avoids unnecessary re-renders from shape changes.
- **Sentiment gets real progress, others are binary** — derive sentiment `progress.current` from `SentimentResult` row count vs `progress.total` from pipeline comment count. Topic modeling and recommendations are single-batch, so progress is effectively `null` (binary processing/done).
- **`retryable` flag** — top-level boolean on failed pipelines so the frontend knows whether to show "Retry" vs "Contact admin".

## Implementation Plan

### Tasks

- [ ] Task 1: Reshape `stageStatusSchema` for consistent field presence
  - File: `src/modules/analysis/dto/pipeline-status.dto.ts`
  - Action: Replace all optional fields in `stageStatusSchema` with consistent, always-present fields using `null` for absent values:
    ```typescript
    const stageStatusSchema = z.object({
      status: z.enum(['pending', 'processing', 'completed', 'failed', 'skipped']),
      progress: z.object({
        current: z.number().int(),
        total: z.number().int(),
      }).nullable(),
      startedAt: z.string().datetime().nullable(),
      completedAt: z.string().datetime().nullable(),
    });
    ```
  - Notes: This removes the old `total`, `completed`, `processed`, `included`, `excluded` optional fields. The `progress` object is either fully present or `null`. `startedAt` and `completedAt` give the frontend elapsed-time signal.

- [ ] Task 2: Add `retryable` and `updatedAt` to `pipelineStatusSchema`
  - File: `src/modules/analysis/dto/pipeline-status.dto.ts`
  - Action: Add two fields to the top-level `pipelineStatusSchema`:
    - `retryable: z.boolean()` — after `errorMessage`
    - `updatedAt: z.string().datetime()` — after `createdAt`
  - Notes: `retryable` is `true` only when status is `FAILED`. `updatedAt` comes from `pipeline.updatedAt` (already on entity via `CustomBaseEntity`).

- [ ] Task 3: Add sentiment gate fields to `pipelineStatusSchema` stages
  - File: `src/modules/analysis/dto/pipeline-status.dto.ts`
  - Action: The sentiment gate's `included`/`excluded` counts no longer fit in the generic `stageStatusSchema` (which now uses `progress`). Add a dedicated `sentimentGate` schema:
    ```typescript
    const sentimentGateSchema = stageStatusSchema.extend({
      included: z.number().int().nullable(),
      excluded: z.number().int().nullable(),
    });
    ```
  - Update `stages` in `pipelineStatusSchema` to use `sentimentGateSchema` for the `sentimentGate` field.

- [ ] Task 4: Update `GetPipelineStatus()` — add sentiment progress count query
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action: After the existing `sentimentRun` query (~line 461), add a conditional `COUNT` query:
    ```typescript
    let sentimentCompleted = 0;
    if (sentimentRun && sentimentRun.status !== RunStatus.PENDING) {
      sentimentCompleted = await fork.count(SentimentResult, { run: sentimentRun });
    }
    ```
  - Notes: Only queries when a run exists and has started. Returns 0 when pending. This is a cheap indexed COUNT on `sentiment_result.run_id` (index confirmed on entity). If pipelines scale beyond ~5K comments, consider caching the count on `SentimentRun.completedCount` — out of scope for now.

- [ ] Task 5: Update `GetPipelineStatus()` — reshape return object to match new DTO
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action: Replace the `stageStatus` helper and reshape the return object. Key changes:
    1. Remove the `stageStatus()` and `getRunStageStatus()` helpers. Replace with a new helper:
       ```typescript
       const buildStage = (
         status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped',
         run: { createdAt: Date; completedAt?: Date } | null,
         progress: { current: number; total: number } | null = null,
       ) => ({
         status,
         progress,
         startedAt: run?.createdAt?.toISOString() ?? null,
         completedAt: run?.completedAt?.toISOString() ?? null,
       });
       ```
    2. Update each stage in the return block:
       - `embeddings`: `buildStage(embeddingStatus.status, null)` — no run entity, no progress
       - `sentiment`: `buildStage(getRunStatus(sentimentRun), sentimentRun, { current: sentimentCompleted, total: pipeline.commentCount })` — real progress
       - `sentimentGate`: `{ ...buildStage(gateStatus, null), included: pipeline.sentimentGateIncluded ?? null, excluded: pipeline.sentimentGateExcluded ?? null }`
       - `topicModeling`: `buildStage(getRunStatus(topicModelRun), topicModelRun)`
       - `recommendations`: `buildStage(getRunStatus(recommendationRun), recommendationRun)`
    3. Add to the top-level return: `updatedAt: pipeline.updatedAt.toISOString()` and `retryable: pipeline.status === PipelineStatus.FAILED`
  - Notes: `getRunStatus()` is a simple inline: `(run) => run ? run.status.toLowerCase() : 'pending'`. For `retryable`, all current failure modes are transient (worker timeouts, network errors), so `status === FAILED` is sufficient. Revisit if data validation failures become a distinct failure mode — may need an `errorCategory` field.
  - **Commit strategy**: Split this task into two commits for reviewability: (a) replace helpers + reshape return block, (b) add `updatedAt` + `retryable` top-level fields.

- [ ] Task 6: Update `getEmbeddingStageStatus()` return type
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action: The private method at line 937 currently returns `{ status }`. Since the `buildStage` helper in Task 5 only needs the status string, change the return type to just return the status string, or adapt the call site to destructure. Simplest: have it return just the status string and call `buildStage(this.getEmbeddingStageStatus(pipeline), null)`.

- [ ] Task 7: Update service tests for reshaped response
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.spec.ts`
  - Action: Update the `GetPipelineStatus` test cases:
    1. Add mock for `fork.count(SentimentResult, ...)` returning a number (e.g., `47`)
    2. Update expected response shape in assertions to match new DTO: `progress` objects instead of `total`/`completed`, `startedAt`/`completedAt` fields, `retryable`, `updatedAt`
    3. Add a test case for `retryable: true` when pipeline status is `FAILED`
    4. Add a test case for `retryable: false` when pipeline status is not `FAILED`
    5. Add a test case verifying sentiment `progress.current` equals the mocked count
    6. Add a test case for sentiment start: `sentimentRun` exists with status `PROCESSING` and zero results → `progress: { current: 0, total: N }`

- [ ] Task 8 (low priority): Update controller tests for reshaped response
  - File: `src/modules/analysis/analysis.controller.spec.ts`
  - Action: Update the `GetPipelineStatus` test's `mockStatus` object to match the new response shape (add `retryable`, `updatedAt`, update stage shapes). The controller test is a pass-through, so this is mainly updating the mock data shape.
  - Notes: Low priority — the controller is a pure pass-through. This test only verifies delegation, not response correctness. Skip if time-constrained.

### Acceptance Criteria

- [ ] AC 1: Given a pipeline in `SENTIMENT_ANALYSIS` status with 120 comments and 47 sentiment results, when `GET /analysis/pipelines/:id/status` is called, then the response `stages.sentiment.progress` is `{ current: 47, total: 120 }` and `stages.sentiment.status` is `"processing"`.

- [ ] AC 2: Given a pipeline in `TOPIC_MODELING` status, when `GET /analysis/pipelines/:id/status` is called, then `stages.topicModeling.progress` is `null` and `stages.topicModeling.status` is `"processing"`.

- [ ] AC 3: Given a pipeline in `FAILED` status, when `GET /analysis/pipelines/:id/status` is called, then `retryable` is `true`.

- [ ] AC 4: Given a pipeline in `COMPLETED` status, when `GET /analysis/pipelines/:id/status` is called, then `retryable` is `false`.

- [ ] AC 5: Given any pipeline status, when `GET /analysis/pipelines/:id/status` is called, then every stage object contains `status`, `progress`, `startedAt`, and `completedAt` fields (no missing keys — values may be `null`).

- [ ] AC 6: Given any pipeline status, when `GET /analysis/pipelines/:id/status` is called, then the response contains `updatedAt` as an ISO 8601 datetime string.

- [ ] AC 7: Given a pipeline in `SENTIMENT_ANALYSIS` status with a `SentimentRun` that has `createdAt` set, when the status is polled, then `stages.sentiment.startedAt` is the ISO 8601 representation of that run's `createdAt`.

- [ ] AC 8: Given a pipeline with completed sentiment gate (included=80, excluded=40), when `GET /analysis/pipelines/:id/status` is called, then `stages.sentimentGate.included` is `80`, `stages.sentimentGate.excluded` is `40`, and `stages.sentimentGate.status` is `"completed"`.

- [ ] AC 9: Given a pipeline that does not exist, when `GET /analysis/pipelines/:id/status` is called, then a `404 Not Found` is returned (existing behavior preserved).

## Additional Context

### Dependencies

- No new packages required. All changes use existing NestJS, MikroORM, and Zod infrastructure.
- Sentiment progress count requires a `COUNT` query on `SentimentResult` for the active run — this is a new query addition to `GetPipelineStatus()`.
- `AnalysisPipeline.updatedAt` already exists via `CustomBaseEntity` and is auto-managed by MikroORM's `onUpdate` hook — no entity changes needed.

### Testing Strategy

**Unit Tests (Jest):**
- `pipeline-orchestrator.service.spec.ts`:
  - Test reshaped response has all fields present (no undefined keys)
  - Test sentiment `progress.current` matches mocked `SentimentResult` count
  - Test sentiment `progress.total` matches `pipeline.commentCount`
  - Test binary stages (embedding, topicModeling, recommendations) have `progress: null`
  - Test `retryable: true` when `FAILED`, `false` otherwise
  - Test `updatedAt` is present and matches pipeline entity
  - Test `startedAt`/`completedAt` populated from run entities
  - Test sentiment gate `included`/`excluded` still present
- `analysis.controller.spec.ts`:
  - Update mock data shape to match new DTO
  - Verify pass-through behavior unchanged

**Manual Testing:**
- Start a pipeline via `POST /analysis/pipelines` + confirm
- Poll `GET /analysis/pipelines/:id/status` and verify response shape consistency across stage transitions
- Verify sentiment progress increments as results are processed
- **Transition test**: Poll across a stage transition (e.g., `SENTIMENT_ANALYSIS` → `SENTIMENT_GATE`) and verify that the previous stage flips to `completed` and the next stage updates correctly in the subsequent poll response

### Notes

- **Breaking change**: The response shape of `GET /analysis/pipelines/:id/status` changes. The old `total`, `completed`, `processed` fields on stages are replaced with a `progress: { current, total } | null` object, and `startedAt`/`completedAt` are added. **Atomic deploy recommended** — backend and frontend should deploy together to avoid runtime mismatches.
- **No migration needed**: No entity or database schema changes. All changes are in the DTO and service layer.
- **Frontend null-safety**: The frontend must null-check `progress` before accessing `.current`/`.total`. Consider sharing the Zod schema or generating OpenAPI types to keep the contract in sync.
- **Staleness detection (frontend concern)**: The frontend should compute staleness from `updatedAt` and `stages.*.startedAt` — e.g., if a stage has been `processing` for >10 minutes with no `updatedAt` change, display a "pipeline may be stuck" warning. No backend changes needed for this.
- **Future scaling**: If pipeline comment counts grow beyond ~5K, the per-poll `SentimentResult` COUNT query should be revisited (cache on `SentimentRun.completedCount`). Current volumes don't warrant this.
- Frontend polling pattern (for reference, not in backend scope):
  ```typescript
  const { data } = useQuery({
    queryKey: ['pipeline-status', pipelineId],
    queryFn: () => axios.get(`/analysis/pipelines/${pipelineId}/status`),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
      return isTerminal ? false : 3000;
    },
  });
  ```
