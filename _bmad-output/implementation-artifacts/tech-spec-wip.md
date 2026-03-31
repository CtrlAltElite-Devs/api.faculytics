---
title: 'Frontend Pipeline Polling'
slug: 'frontend-pipeline-polling'
created: '2026-03-31'
status: 'in-progress'
stepsCompleted: [1]
tech_stack: []
files_to_modify: []
code_patterns: []
test_patterns: []
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

_To be filled in Step 2_

### Files to Reference

| File | Purpose |
| ---- | ------- |

_To be filled in Step 2_

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

_To be filled in Step 2_

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
