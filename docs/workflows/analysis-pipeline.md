# Analysis Pipeline Workflow

This document describes the end-to-end lifecycle of an analysis pipeline — from creation through completion.

## Overview

An analysis pipeline processes all qualitative feedback for a given scope (semester + optional filters) through four sequential AI stages, producing actionable recommendations.

## 1. Create Pipeline

**Endpoint:** `POST /analysis/pipelines`

The caller provides a scope:

| Parameter                | Required | Description                         |
| ------------------------ | -------- | ----------------------------------- |
| `semesterId`             | Yes      | Target semester                     |
| `facultyId`              | No       | Filter to a specific faculty member |
| `questionnaireVersionId` | No       | Filter to a specific version        |
| `departmentId`           | No       | Filter to a department              |
| `programId`              | No       | Filter to a program                 |
| `campusId`               | No       | Filter to a campus                  |
| `courseId`               | No       | Filter to a course                  |

The orchestrator:

1. **Deduplicates** — If an active (non-terminal) pipeline with the same scope exists, returns it instead of creating a new one.
2. **Computes coverage stats** — Counts submissions, comments, and enrollments within scope. Calculates response rate.
3. **Generates warnings** — Flags low response rate (< 25%), insufficient submissions (< 30), insufficient comments (< 10), or stale enrollment data (> 24h since last sync).
4. Returns the pipeline in `AWAITING_CONFIRMATION` status.

## 2. Confirm Pipeline

**Endpoint:** `POST /analysis/pipelines/:id/confirm`

The orchestrator:

1. Validates the pipeline is in `AWAITING_CONFIRMATION` status.
2. Checks that `SENTIMENT_WORKER_URL` is configured.
3. **Embedding backfill (best-effort):** If `EMBEDDINGS_WORKER_URL` is configured and some submissions with `cleanedComment` lack embeddings, enqueues individual embedding jobs using the cleaned text. These run alongside sentiment analysis.
4. Creates a `SentimentRun` entity and dispatches a batch job to the sentiment queue.
5. Advances pipeline to `SENTIMENT_ANALYSIS`.

## 3. Sentiment Analysis

The `SentimentProcessor`:

1. Sends all `cleanedComment` texts as a batch HTTP POST to the sentiment worker.
2. Validates each result item against `sentimentResultItemSchema`.
3. Determines the dominant label (positive/neutral/negative) from scores.
4. Creates `SentimentResult` entities.
5. Marks the `SentimentRun` as `COMPLETED`.
6. Calls `OnSentimentComplete()` to advance the pipeline.

## 4. Sentiment Gate

The orchestrator applies an in-memory filter:

- **Always include:** Negative and neutral comments (most actionable).
- **Conditionally include:** Positive comments with ≥ 10 words.
- **Exclude:** Short positive comments (noise for topic modeling).

Gate results are persisted via bulk `nativeUpdate` on `SentimentResult.passedTopicGate`. Statistics are stored on the pipeline (`sentimentGateIncluded`, `sentimentGateExcluded`).

If the post-gate corpus is < 30 submissions, a warning is appended.

## 5. Topic Modeling

The orchestrator:

1. Fetches gate-passing submissions with their embeddings from `SubmissionEmbedding`.
2. Skips submissions without embeddings (logs a warning if some are missing).
3. Creates a `TopicModelRun` and dispatches a batch job with text + embedding vectors.

The `TopicModelProcessor`:

1. Validates the response against `topicModelWorkerResponseSchema`.
2. Creates `Topic` entities for each discovered cluster.
3. Filters assignments by probability > 0.01.
4. Computes `isDominant` per submission (highest probability assignment).
5. Persists `TopicAssignment` entities in chunks of 500.
6. Updates run metadata (topic count, outlier count, quality metrics).
7. Calls `OnTopicModelComplete()`.

## 6. Topic Labeling

After topic modeling completes and before recommendations are dispatched, the orchestrator runs an inline enrichment step:

1. Fetches the latest `TopicModelRun` and all its `Topic` entities.
2. Calls `TopicLabelService.generateLabels(topics)`, which sends topics (raw labels + keywords) to OpenAI `gpt-4o-mini`.
3. The LLM returns short, human-readable labels (2-4 words, title case) via Zod-validated structured output.
4. Labels are written to `Topic.label` and flushed to the database.

**Fallback:** If the LLM call fails, topics keep their BERTopic-generated `rawLabel`. This step is non-blocking.

## 7. Recommendations

The orchestrator aggregates data from previous stages:

- Sentiment label counts (positive/neutral/negative)
- Top 10 topics with keywords and document counts (using `topic.label` when available, falling back to `topic.rawLabel`)
- Coverage metadata

Creates a `RecommendationRun` and dispatches to the recommendations queue.

The `RecommendationsProcessor`:

1. Validates against `recommendationsWorkerResponseSchema`.
2. Creates `RecommendedAction` entities with category, priority (HIGH/MEDIUM/LOW), action text, and supporting evidence (JSONB).
3. Calls `OnRecommendationsComplete()`.

## 8. Completion

Pipeline status moves to `COMPLETED` with `completedAt` timestamp.

## Error Handling

- **Stage failure:** Any processor can call `OnStageFailed()`, which sets pipeline status to `FAILED` with an error message identifying the stage.
- **Exhausted retries:** After all BullMQ retry attempts are exhausted, the processor's `onFailed` handler calls `OnStageFailed()`.
- **Missing worker URL:** Pipeline fails immediately with a descriptive error.
- **Empty corpus:** If no submissions have comments or no submissions pass the sentiment gate, the pipeline fails gracefully.

## Cancellation

**Endpoint:** `POST /analysis/pipelines/:id/cancel`

Sets pipeline to `CANCELLED`. Only works on non-terminal pipelines. In-flight BullMQ jobs will still complete but their callbacks detect the terminal status and no-op.

## Status Inspection

**Endpoint:** `GET /analysis/pipelines/:id/status`

Returns a structured response with:

- Pipeline status and scope
- Coverage stats (totalEnrolled, submissionCount, commentCount, responseRate)
- Per-stage status (pending/processing/completed/failed/skipped)
- Sentiment gate statistics
- Warnings and error messages
- Timestamps (created, confirmed, completed)
