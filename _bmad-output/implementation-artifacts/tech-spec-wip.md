---
title: 'Frontend Pipeline Polling'
slug: 'frontend-pipeline-polling'
created: '2026-03-31'
status: 'in-progress'
stepsCompleted: [1, 2]
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

_To be filled in Step 3_

### Acceptance Criteria

_To be filled in Step 3_

## Additional Context

### Dependencies

- No new packages required. All changes use existing NestJS, MikroORM, and Zod infrastructure.
- Sentiment progress count requires a `COUNT` query on `SentimentResult` for the active run — this is a new query addition to `GetPipelineStatus()`.
- `AnalysisPipeline.updatedAt` already exists via `CustomBaseEntity` and is auto-managed by MikroORM's `onUpdate` hook — no entity changes needed.

### Testing Strategy

_To be filled in Step 3_

### Notes

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
