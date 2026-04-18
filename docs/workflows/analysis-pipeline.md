# Analysis Pipeline Workflow

This document describes the end-to-end lifecycle of an analysis pipeline — from creation through completion.

## Overview

An analysis pipeline processes all qualitative feedback for a given scope (semester + optional filters) through four sequential AI stages, producing actionable recommendations.

## 1. Create Pipeline

**Endpoint:** `POST /analysis/pipelines`

The caller provides a scope using the canonical `{scopeType, scopeId}` pair. Only three tiers are supported — `FACULTY`, `DEPARTMENT`, `CAMPUS`.

| Parameter                | Required      | Description                                                                                       |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------- |
| `semesterId`             | Yes           | Target semester                                                                                   |
| `scopeType`              | Auto-fillable | One of `FACULTY`, `DEPARTMENT`, `CAMPUS`. Auto-filled for callers with exactly one assigned scope |
| `scopeId`                | Auto-fillable | UUID of the faculty/department/campus matching `scopeType`                                        |
| `questionnaireVersionId` | No            | Optional version pin; omitted means "all active versions in scope"                                |

> **Legacy bridge.** A transient preprocessor (`bridgeLegacyCreatePipelineInput`) maps the old multi-FK shape (`facultyId`/`departmentId`/`campusId`/`programId`/`courseId`/`questionnaireTypeCode`) onto the canonical pair and logs `deprecated_field_used`. PR-3 deletes this preprocessor and switches the schema to `.strict()` — clients must migrate before then.

The orchestrator:

1. **Deduplicates** — If an active (non-terminal) pipeline with the same scope exists, returns it instead of creating a new one.
2. **Computes coverage stats** — Counts submissions, comments, and enrollments within scope. Calculates response rate.
3. **Generates warnings** — Flags low response rate (< 25%), insufficient submissions (< 30), insufficient comments (< 10), or stale enrollment data (> 24h since last sync).
4. Returns the pipeline in `AWAITING_CONFIRMATION` status.

The `AnalysisPipeline.trigger` column records how the pipeline was created — `USER` for human-initiated calls (default for any HTTP-driven create) and `SCHEDULER` for tiered-scheduler firings (see [§ Tiered Scheduler](#tiered-scheduler)).

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

The orchestrator creates a `RecommendationRun` and dispatches a lightweight job to the recommendations queue (containing only pipeline and run IDs).

The `RecommendationsProcessor` calls `RecommendationGenerationService.Generate(pipelineId)`, which:

1. Loads the pipeline with all scope relations.
2. Aggregates dimension scores via SQL (`AVG(numeric_value) GROUP BY dimension_code`).
3. Loads the top 10 topics and computes per-topic sentiment breakdowns by cross-referencing topic assignments with sentiment results.
4. Selects sample quotes from dominant topic assignments (sorted by sentiment strength).
5. Selects up to 20 sample comments proportionally across sentiment labels.
6. Constructs a system + user prompt and calls OpenAI with `zodResponseFormat` for structured output.
7. The LLM returns 3-7 recommendations split between STRENGTH (positive patterns) and IMPROVEMENT (areas to work on).
8. Each recommendation is enriched with supporting evidence:
   - Topic-level sources (label, comment count, sentiment breakdown, sample quotes)
   - Dimension score sources (dimension code + average score pairs)
   - Computed confidence level (HIGH/MEDIUM/LOW based on comment count and sentiment agreement)

The processor then:

1. Creates `RecommendedAction` entities with category, headline, description, actionPlan, priority, and supportingEvidence (JSONB).
2. Marks the `RecommendationRun` as `COMPLETED`.
3. Calls `OnRecommendationsComplete()`.

### Retrieving Recommendations

**Endpoint:** `GET /analysis/pipelines/:id/recommendations`

Returns the latest `RecommendationRun` for the pipeline with all actions. If the run is still processing, returns an empty actions array with the current run status.

## 8. Completion

Pipeline status moves to `COMPLETED` with `completedAt` timestamp.

After marking the pipeline complete, the orchestrator enqueues a best-effort `analytics-refresh` job. This refreshes the `mv_faculty_semester_stats` and `mv_faculty_trends` materialized views so dashboard queries reflect the latest analysis results. The refresh is decoupled from the pipeline — if it fails, the pipeline status is unaffected. See [Analytics Module](../architecture/analytics.md) for details.

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

The `scope` object returns **both IDs and display values** side-by-side (e.g., `{ semesterId, semesterCode, departmentId, departmentCode, facultyId, facultyName, ... }`). IDs are used by the frontend for cache keys and lookups; display values are used for rendering. See FAC-132 TD-9 for the contract.

## Discovery

**Endpoint:** `GET /analysis/pipelines`

Returns the 10 most recent pipelines matching the query, ordered by `createdAt DESC`. Query parameters:

| Parameter                | Required | Description                         |
| ------------------------ | -------- | ----------------------------------- |
| `semesterId`             | Yes      | Target semester                     |
| `facultyId`              | No       | Filter to a specific faculty member |
| `departmentId`           | No       | Filter to a department              |
| `programId`              | No       | Filter to a program                 |
| `campusId`               | No       | Filter to a campus                  |
| `courseId`               | No       | Filter to a course                  |
| `questionnaireVersionId` | No       | Filter to a specific version        |

Scope-filling behavior per role is documented in [Access Control](#access-control).

## Access Control

Authorization for every `/analysis/*` endpoint is enforced at two layers:

1. **Role guard (`@UseJwtGuard` + `RolesGuard`)** — class-level allowlist plus per-method widening. Roles outside the allowlist get `403 Forbidden` before the service runs.
2. **Service-layer scope check** — `PipelineOrchestratorService` validates the caller's institutional scope against the pipeline's scope fields via `ScopeResolverService`. Belt-and-braces against guard misconfiguration.

### Role allowlist per endpoint

| Endpoint                                       | Allowed roles                                        |
| ---------------------------------------------- | ---------------------------------------------------- |
| `POST /analysis/pipelines`                     | SUPER_ADMIN, DEAN, CHAIRPERSON, CAMPUS_HEAD          |
| `POST /analysis/pipelines/:id/confirm`         | SUPER_ADMIN, DEAN, CHAIRPERSON, CAMPUS_HEAD          |
| `POST /analysis/pipelines/:id/cancel`          | SUPER_ADMIN, DEAN, CHAIRPERSON, CAMPUS_HEAD          |
| `GET  /analysis/pipelines`                     | SUPER_ADMIN, DEAN, CHAIRPERSON, CAMPUS_HEAD, FACULTY |
| `GET  /analysis/pipelines/:id/status`          | SUPER_ADMIN, DEAN, CHAIRPERSON, CAMPUS_HEAD, FACULTY |
| `GET  /analysis/pipelines/:id/recommendations` | SUPER_ADMIN, DEAN, CHAIRPERSON, CAMPUS_HEAD, FACULTY |

STUDENT and ADMIN are never in the allowlist. STUDENT is end-user; ADMIN is reserved for admin-console operations (not analytics).

### Create / Confirm / Cancel / Read-by-id scope matrix

These operations require an **explicit scope filter** on the axis appropriate to the caller's role. Absence of the filter returns `400 Bad Request` with `"scope filter required for your role"`. A filter outside the caller's resolved set returns `403 Forbidden` with `"scope not in your assigned access"`.

| Role        | Required on create           | Validation against                          |
| ----------- | ---------------------------- | ------------------------------------------- |
| SUPER_ADMIN | None (`semesterId` only OK)  | — (unrestricted)                            |
| DEAN        | `departmentId`               | `ResolveDepartmentIds(semesterId)`          |
| CHAIRPERSON | `programId`                  | `ResolveProgramIds(semesterId)`             |
| CAMPUS_HEAD | `campusId` OR `departmentId` | `ResolveCampusIds` / `ResolveDepartmentIds` |
| FACULTY     | _(blocked at guard — 403)_   | —                                           |
| STUDENT     | _(blocked at guard — 403)_   | —                                           |

**Read-by-id additional rules:**

- FACULTY may read `GET /:id/status` or `GET /:id/recommendations` only when `pipeline.faculty.id === user.id`. Department-scoped pipelines (null `faculty` FK) are 403 for FACULTY.
- A pipeline with a **null** scope field on the caller's axis (e.g., `pipeline.department === null` for a DEAN) is 403 for all scoped roles — null means "no filter", i.e., broader-than-role access, reserved for SUPER_ADMIN.
- Pipelines not found return `404 Not Found` **before** the scope check, so 404 takes precedence over 403. This exposes a minor existence-oracle for scoped roles who know a foreign UUID. Bounded by UUID opacity and the fact that FACULTY never learns foreign UUIDs (see list auto-override below).

### List scope-filling

`GET /analysis/pipelines` fills in the caller's resolved scope when the corresponding query parameter is omitted — this differs from create, which 400s on absence. Rationale: the dean dashboard can call `listPipelines({ semesterId })` without needing to enumerate department UUIDs on the client.

| Role        | Behavior                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPER_ADMIN | Query unchanged.                                                                                                                            |
| DEAN        | If `departmentId` omitted, service fills an IN-filter with `ResolveDepartmentIds(semesterId)`. If provided, verify ∈ resolved set else 403. |
| CHAIRPERSON | Same with `programId` and `ResolveProgramIds(semesterId)`.                                                                                  |
| CAMPUS_HEAD | Same with `campusId` and `ResolveCampusIds(semesterId)`.                                                                                    |
| FACULTY     | `facultyId` is silently overridden to the caller's own user id. Any foreign `facultyId` in the query is dropped.                            |
| STUDENT     | 403.                                                                                                                                        |

The FACULTY auto-override prevents enumeration of other faculty's pipelines and ensures FACULTY never learns foreign pipeline UUIDs.

### Population requirement for ownership checks

`ConfirmPipeline`, `CancelPipeline`, `GetPipelineStatus`, and `GetRecommendations` populate `['faculty', 'department', 'program', 'campus']` on the pipeline before running `assertCanAccessPipeline`. Reading `pipeline.faculty?.id` through an unpopulated reference proxy is fragile — explicit populate is load-bearing.

### Scope check ordering for side-effecting endpoints

For `ConfirmPipeline` and `CancelPipeline`, the scope check runs **before** any `fork.flush()`, status mutation, or queue enqueue. A foreign caller must never cause side effects — even when an unrelated check (e.g., worker URL misconfiguration) would otherwise fail the pipeline.

### Unique-scope invariant

A partial unique index (`uq_analysis_pipeline_active_scope`) enforces one active pipeline per `(semester, scope tuple)` at the DB level. Concurrent creates with identical scope produce `UniqueConstraintViolationException`; the orchestrator catches it and re-fetches the winner so both callers see the same pipeline id (idempotent).

### Scope drift mid-pipeline

A DEAN who triggers a pipeline and is then reassigned to a different department mid-execution loses read access to their own pipeline. This mirrors `/analytics/*` behavior and is intentional — the scope check evaluates against current assignments, not historical ones.

## Tiered Scheduler

`TieredPipelineSchedulerJob` (`src/crons/jobs/analysis-jobs/tiered-pipeline-scheduler.job.ts`) auto-enqueues pipelines for active scopes that have new submissions since the last completed run. It runs three independent tiers, each with its own `@Cron` decorator and its own `isRunning` flag:

| Tier         | Cron expression | Cron name                                      |
| ------------ | --------------- | ---------------------------------------------- |
| `FACULTY`    | `0 1 * * 0`     | `TieredPipelineSchedulerJob.RunFacultyTier`    |
| `DEPARTMENT` | `0 2 * * 0`     | `TieredPipelineSchedulerJob.RunDepartmentTier` |
| `CAMPUS`     | `0 3 * * 0`     | `TieredPipelineSchedulerJob.RunCampusTier`     |

Cron names and expressions are exported from `tiered-scheduler.constants.ts` so the orchestrator can introspect the next firing without a circular import.

### Per-tier flow

For each scope returned by `orchestrator.FindActiveScopesForTier(tier)`:

1. **Skip-check** — `submissionRepository.FindChangedSince(scopeFilter, lastPipelineCompletedAt)` counts submissions created after the previous completed pipeline. Zero new submissions ⇒ skip (logged at `debug`).
2. **Enqueue** — Otherwise, `orchestrator.CreateAndConfirmPipeline({...scope, triggeredById: systemUserId})` bypasses the human gate and dispatches sentiment immediately. The pipeline is tagged `trigger=SCHEDULER`.
3. **Per-tier exclusion** — `running[tier]` short-circuits the next firing if the previous one is still in progress. Tiers are independent so a long faculty run does not block the department or campus tier that follows an hour later.

If a scheduler-driven pipeline cannot satisfy coverage requirements at firing time, it still completes (rather than failing) but persists `warnings: ['insufficient_coverage_at_schedule_time']` for transparency.

### System-user attribution

Scheduler-driven pipelines need an `actorId` for audit metadata. `resolveSystemUserId()` looks up the seeded SUPER_ADMIN by `env.SUPER_ADMIN_USERNAME` and uses its UUID. If the lookup fails, the tier returns `failed` and emits an error log — no pipelines are enqueued, since attribution would otherwise be lost.

### Next-run surfacing

`GET /analysis/pipelines/:id/status` returns `nextScheduledRunAt` (ISO 8601 UTC) so the frontend can render "next refresh in N hours" copy. The value is computed by `getNextScheduledRunAt(tier)` via `SchedulerRegistry` + `cron-parser`, falling back to a parsed cron expression when the registry has not yet registered the job (e.g., during boot).
