---
title: 'Analytics Metadata for Questionnaire Submissions'
slug: 'analytics-metadata-questionnaire-submissions'
created: '2026-03-13'
status: 'implementation-complete'
revised: '2026-03-13'
revision_notes: 'Adversarial review — 14 findings resolved'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'NestJS v11'
  - 'MikroORM v6.6 (PostgreSQL)'
  - 'BullMQ'
  - 'Zod v4'
  - 'pgvector (via pgvector/mikro-orm)'
  - 'Jest v30'
files_to_modify:
  - 'src/entities/submission-embedding.entity.ts (create)'
  - 'src/entities/sentiment-run.entity.ts (create)'
  - 'src/entities/sentiment-result.entity.ts (create)'
  - 'src/entities/topic-model-run.entity.ts (create)'
  - 'src/entities/topic.entity.ts (create)'
  - 'src/entities/topic-assignment.entity.ts (create)'
  - 'src/entities/recommendation-run.entity.ts (create)'
  - 'src/entities/recommended-action.entity.ts (create)'
  - 'src/entities/analysis-pipeline.entity.ts (create)'
  - 'src/entities/index.entity.ts (modify)'
  - 'src/repositories/ (create 9 repositories)'
  - 'src/modules/analysis/analysis.module.ts (modify)'
  - 'src/modules/analysis/analysis.service.ts (modify)'
  - 'src/modules/analysis/processors/base-batch.processor.ts (create)'
  - 'src/modules/analysis/processors/sentiment.processor.ts (modify)'
  - 'src/modules/analysis/processors/embedding.processor.ts (create)'
  - 'src/modules/analysis/processors/topic-model.processor.ts (create)'
  - 'src/modules/analysis/processors/recommendations.processor.ts (create)'
  - 'src/modules/analysis/services/pipeline-orchestrator.service.ts (create)'
  - 'src/modules/analysis/analysis.controller.ts (create)'
  - 'src/modules/analysis/dto/batch-analysis-job-message.dto.ts (create)'
  - 'src/modules/analysis/dto/batch-analysis-result-message.dto.ts (create)'
  - 'src/modules/analysis/dto/ (create worker contract schemas)'
  - 'src/modules/analysis/constants.ts (create — sentiment gate thresholds)'
  - 'src/modules/analysis/enums/ (create — pipeline status, run status, priority enums)'
  - 'src/configurations/env/bullmq.env.ts (modify)'
  - '.env.sample (modify)'
  - 'mikro-orm.config.ts (verify entity registration)'
  - 'src/migrations/Migration[timestamp].ts (create)'
  - 'package.json (add pgvector dependency)'
  - 'src/modules/questionnaires/services/questionnaire.service.ts (modify — embedding dispatch)'
  - 'src/modules/questionnaires/questionnaire.module.ts (modify — import AnalysisModule)'
  - 'docs/worker-contracts/sentiment-worker.md (create)'
  - 'docs/worker-contracts/topic-modeling-worker.md (create)'
  - 'docs/worker-contracts/recommendations-worker.md (create)'
code_patterns:
  - 'CustomBaseEntity inheritance (UUID PK, timestamps, soft delete)'
  - '@Entity({ repository: () => RepoClass }) custom repository binding'
  - 'Run-based pattern (SentimentRun/TopicModelRun/RecommendationRun → child entities)'
  - 'Pipeline orchestrator with sequential stage execution'
  - '@Processor decorator with concurrency and stalled interval config'
  - 'BaseAnalysisProcessor abstract class with GetWorkerUrl() and Persist() hooks (single-job pattern)'
  - 'BaseBatchProcessor abstract class for batch analysis stages (sentiment, topics, recommendations)'
  - 'Zod schema validation for worker request/response contracts'
  - 'UnitOfWork transaction wrapping for multi-entity persistence'
  - 'VectorType from pgvector/mikro-orm for embedding columns'
  - 'Deterministic BullMQ job IDs for deduplication'
test_patterns:
  - 'Jest mocks with TestingModule and { provide: Dep, useValue: { method: jest.fn() } }'
  - 'Queue mocks via getQueueToken("name")'
  - 'Fetch mocks via jest.spyOn(global, "fetch")'
  - 'Concrete test processor extending BaseAnalysisProcessor'
  - 'createMockJob() helper for typed job fixtures'
---

# Tech-Spec: Analytics Metadata for Questionnaire Submissions

**Created:** 2026-03-13

## Overview

### Problem Statement

The analysis infrastructure (BullMQ queues, processors, HTTP worker dispatch) exists but is completely disconnected from the submission flow. No database entities exist to persist analysis results (sentiment, topic models, embeddings, recommended actions). `SentimentProcessor.Persist()` is a no-op. There's no way to store or query analytics metadata tied to submissions.

### Solution

Design and wire the end-to-end pipeline: submission creation → embedding dispatch → on-demand batch analysis → result persistence. Create 9 database entities covering embeddings, sentiment, topic modeling, recommended actions, and a pipeline orchestrator. Only embeddings auto-dispatch at submission time; all other analyses are admin-triggered batch operations optimized for GPU workers (RunPod). An `AnalysisPipeline` orchestrator provides one-click full analysis with a two-step confirmation flow showing coverage stats and warnings. The pipeline executes sequentially: embeddings → sentiment → sentiment gate filter → topic modeling → recommendations.

### Scope

**In Scope:**

- 9 new database entities: `SubmissionEmbedding`, `SentimentRun`, `SentimentResult`, `TopicModelRun`, `Topic`, `TopicAssignment`, `RecommendationRun`, `RecommendedAction`, `AnalysisPipeline`
- pgvector extension for LaBSE 768-dim embedding storage (via `pgvector/mikro-orm` package)
- Auto-dispatch of embedding jobs on submission (when qualitative comment exists)
- On-demand batch endpoints for sentiment, topic modeling, and recommendations
- Pipeline orchestrator with two-step confirmation (coverage stats + warnings → confirm → execute)
- Sequential pipeline: sentiment → sentiment gate → topic modeling → recommendations
- Sentiment gate pre-filtering (exclude short positive comments from topic modeling corpus)
- Pipeline status endpoint with composable contract (transport-agnostic: polling now, SSE/WS later)
- Flexible pipeline scope (semester required, all other filters optional)
- Processor persistence layer (the `Persist()` implementations)
- Migrations for all new entities and pgvector extension
- Worker contract documentation (`docs/worker-contracts/`)
- Worker contract Zod schemas for request/response validation

**Out of Scope:**

- Specific analysis worker implementations (sentiment inference, topic model training, embedding generation, recommendation engine)
- Frontend/dashboard for analytics results
- Query endpoints for analytics data (separate spec)
- Analysis comparison logic (read-time concern, data model supports it)
- Mock worker updates
- Formal evaluation period lifecycle (open/close states)
- SSE or WebSocket transport for status updates (future enhancement)
- Auto-split runs by questionnaire version (future enhancement — not needed since qualitative prompts are identical across versions)
- Retry-from-stage on failed pipelines (future enhancement — data model supports it; failed pipelines don't block new pipeline creation for the same scope)
- Auto-timeout for pipeline stages (future enhancement — `PIPELINE_STAGE_TIMEOUT_MS` constant defined but not enforced; use cancel endpoint instead)

## Context for Development

### Codebase Patterns

- **AnalysisModule** exists at `src/modules/analysis/` with BullMQ queue infrastructure, `AnalysisService` for job dispatch, and `BaseAnalysisProcessor` abstract class for HTTP worker communication
- **BaseAnalysisProcessor** processes **one job at a time** — each `process()` call handles a single `AnalysisJobMessage` with one `text` field. It does NOT support batch payloads. Batch analysis stages (sentiment, topics, recommendations) require a new `BaseBatchProcessor` abstract class that uses `BatchAnalysisJobMessage` (array of items) and `BatchAnalysisResultMessage` (array of results)
- **SentimentProcessor** is the only concrete processor — its `Persist()` method is a no-op (logs only)
- **QuestionnaireSubmission** entity has `qualitativeComment` (text, nullable) — the primary input for sentiment and embedding analysis
- **Submission flow** in `QuestionnaireService.submitQuestionnaire()` does NOT dispatch any analysis jobs currently
- All entities extend `CustomBaseEntity` with UUID PK (`varchar(255)`), `createdAt`, `updatedAt`, `deletedAt` (soft delete)
- Soft delete globally enforced via MikroORM filter in `mikro-orm.config.ts` (`{ deletedAt: null }`)
- Repositories extend `EntityRepository<T>` with custom methods, bound via `@Entity({ repository: () => RepoClass })`
- Entity barrel file `src/entities/index.entity.ts` exports all entities as named exports and a flat `entities` array
- Enums use `@Enum(() => EnumClass)` with string values, mapped to CHECK constraints in migrations
- Decimal columns use `@Property({ type: 'decimal', precision: 10, scale: 2 })`
- JSONB columns use `@Property({ type: 'jsonb' })`
- String arrays use `@Property({ type: 'array' })` → PostgreSQL `text[]`
- Migrations follow naming convention: `Migration[YYYYMMDDHHMMSS].ts` with `up()` and `down()` methods
- BullMQ queues registered via `BullModule.registerQueue({ name: 'queueName' })` in module imports
- Queue injection via `@InjectQueue('queueName')` in services
- Job IDs are deterministic: `${submissionId}:${type}` for deduplication
- `UnitOfWork` wraps `em.transactional()` for multi-entity persistence
- Modules registered in `ApplicationModules` array in `src/modules/index.module.ts`
- Env config via Zod schemas in `src/configurations/env/`, merged in `index.ts`, parsed once at startup as `env` singleton

### Files to Reference

| File                                                                | Purpose                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/entities/base.entity.ts`                                       | CustomBaseEntity — UUID PK, timestamps, soft delete            |
| `src/entities/index.entity.ts`                                      | Entity barrel — must add new entities here                     |
| `src/entities/questionnaire-submission.entity.ts`                   | Submission entity — analysis metadata target                   |
| `src/entities/questionnaire-answer.entity.ts`                       | Answer entity — numericValue for score aggregation             |
| `src/entities/enrollment.entity.ts`                                 | Enrollment — user+course, used for totalEnrolled coverage      |
| `src/entities/user.entity.ts`                                       | User entity — faculty/respondent/triggeredBy references        |
| `src/entities/questionnaire-version.entity.ts`                      | Version with schemaSnapshot — optional pipeline scope          |
| `src/entities/semester.entity.ts`                                   | Semester — required pipeline scope field                       |
| `src/entities/department.entity.ts`                                 | Department — optional pipeline scope                           |
| `src/entities/program.entity.ts`                                    | Program — optional pipeline scope                              |
| `src/entities/campus.entity.ts`                                     | Campus — optional pipeline scope                               |
| `src/entities/course.entity.ts`                                     | Course — optional pipeline scope                               |
| `src/modules/analysis/analysis.module.ts`                           | Module — register new queues, import MikroOrmModule.forFeature |
| `src/modules/analysis/analysis.service.ts`                          | Job dispatch — EnqueueJob(), EnqueueBatch()                    |
| `src/modules/analysis/processors/base.processor.ts`                 | Abstract processor — GetWorkerUrl(), Persist()                 |
| `src/modules/analysis/processors/sentiment.processor.ts`            | Sentiment processor — Persist() is no-op                       |
| `src/modules/analysis/dto/analysis-job-message.dto.ts`              | Zod schema for job envelope                                    |
| `src/modules/analysis/dto/analysis-result-message.dto.ts`           | Zod schema for result envelope                                 |
| `src/modules/questionnaires/services/questionnaire.service.ts`      | Submission flow — wire embedding dispatch after flush          |
| `src/modules/questionnaires/questionnaire.module.ts`                | Module — import AnalysisModule                                 |
| `src/configurations/env/bullmq.env.ts`                              | BullMQ env — add new worker URLs, concurrency                  |
| `src/configurations/env/index.ts`                                   | Env merge — verify bullmq schema included                      |
| `src/modules/index.module.ts`                                       | App modules — AnalysisModule already registered                |
| `src/modules/common/unit-of-work/index.ts`                          | UnitOfWork — transactional persistence                         |
| `mikro-orm.config.ts`                                               | ORM config — entities array, soft delete filter                |
| [External] `github.com/CtrlAltElite-Devs/topic-modeling.faculytics` | BERTopic + LaBSE topic modeling pipeline                       |

### Technical Decisions

**Resolved in Party Mode sessions (2026-03-13):**

1. **Separate entities per analysis type** — not polymorphic JSONB. Each analysis type has fundamentally different fields; a single JSONB table would lose type safety, indexability, and pgvector support.

2. **LaBSE 768-dim embeddings only** — not OpenAI. LaBSE is already used by the topic modeling pipeline for multilingual (Cebuano/Tagalog/English) semantic similarity. Same embedding model means stored vectors feed directly to topic model worker. OpenAI can be added later.

3. **Qualitative comment only** for embedding target text — no concatenated context. Mixing metadata into embeddings pollutes the semantic space. Context captured in entity relationships.

4. **Soft topic assignments** — store probability distributions per submission per topic (from BERTopic's `probs`), threshold-filtered on persistence (probability > 0.01). Enables analytics like "72% about pace, 15% about materials."

5. **Run-based pattern** for sentiment, topics, and recommendations — supports regeneration, audit trail, batch optimization. Runs reference parent `AnalysisPipeline` for scope (no scope duplication).

6. **Sentiment is on-demand batch** — optimized for RunPod GPU. Admin triggers batch sentiment for a scope, one GPU session processes all comments.

7. **SentimentResult has typed columns + JSONB overflow** — `positiveScore`, `neutralScore`, `negativeScore` (decimal), `label` (derived), plus `rawResult` JSONB for full worker response. Worker confirmed to return positive/neutral/negative scores.

8. **Sequential pipeline (not parallel)** — sentiment must complete before topic modeling due to sentiment gate pre-filtering. Flow: embeddings → sentiment → gate → topics → recommendations.

9. **Sentiment gate pre-filtering** — excludes short positive comments from topic modeling corpus. Rule: negative + neutral always included; positive only if >= 10 words. Removes ~35% noise. Thresholds stored as constants (hardcoded, not env vars).

10. **Flexible pipeline scope** — `semester` is required, all other scope fields (`faculty`, `questionnaireVersion`, `department`, `program`, `campus`, `course`) are optional nullable filters. Runs inherit scope from parent pipeline.

11. **questionnaireVersion is optional** — all qualitative feedback prompts are identical across versions (generic "do you have anything to add"). Analysis is version-agnostic for this institution. Version serves as a narrowing filter, not a correctness requirement.

12. **Coverage warnings before confirmation** — response rate < 25%, submissions < 30, comments < 10 generate informational warnings. Admin can always proceed. Warnings persisted on pipeline.

13. **Pipeline status contract is transport-agnostic** — same JSON shape for polling, SSE, or WebSocket. Start with polling.

14. **pgvector via `pgvector/mikro-orm`** — `VectorType` for entity column type, `cosineDistance` for similarity queries. npm package `pgvector` required. Neon.tech supports pgvector natively.

15. **Worker contract documentation** — `docs/worker-contracts/` with one markdown file per worker (sentiment, topic modeling, recommendations). Zod schemas in codebase are source of truth.

16. **Worker version tracking** — `workerVersion` string on run entities, populated from worker response. Supports provenance tracking and comparison across model updates.

17. **Comparison is read-time** — pipeline scope fields + run metadata provide all data needed for comparison. No new entities. Topic alignment across runs (semantic keyword matching) is a future feature.

**Resolved in Adversarial Review (2026-03-13):**

19. **`BaseBatchProcessor` for batch analysis stages** — `BaseAnalysisProcessor` processes one job at a time (single `text` field). Batch stages (sentiment, topic modeling, recommendations) use a new `BaseBatchProcessor` abstract class with `BatchAnalysisJobMessage` (array of `{ submissionId, text }`) and `BatchAnalysisResultMessage`. One BullMQ job per stage = one HTTP call = one completion event. No aggregation/tracking complexity. Embedding stays on single-job `BaseAnalysisProcessor`.

20. **Embedding dispatch guarded by env var** — per-submission auto-dispatch preserved (correct end-state), but conditional on `EMBEDDINGS_WORKER_URL` being configured. If absent, skip silently. Deterministic job IDs (`${submissionId}:embedding`) already prevent duplicates. `SubmissionEmbedding` uses upsert with unique constraint on `submission` for idempotency.

21. **Cancel endpoint instead of auto-timeout** — `POST /analysis/pipelines/:id/cancel` transitions any non-terminal pipeline to `failed`. Simpler than auto-timeout (no delayed jobs, no cron). `PIPELINE_STAGE_TIMEOUT_MS` constant retained for future auto-timeout implementation.

22. **OneToMany collections on Pipeline (not circular ManyToOne)** — `AnalysisPipeline` uses `sentimentRuns`, `topicModelRuns`, `recommendationRuns` as OneToMany collections. Runs reference pipeline via ManyToOne. No circular FK, no insertion order problem, no nullable ManyToOne that gets populated later. Latest run per type resolved via query.

23. **Coverage computation via dedicated repository method** — `AnalysisPipelineRepository.ComputeCoverageStats(scope)` builds dynamic queries based on non-null scope fields, joining through Course → Program → Department → Semester hierarchy. Two queries: submission/comment counts + enrollment counts. `MAX(enrollment.updatedAt)` used as staleness indicator for sync warning (no new entity needed).

24. **Sentiment gate as bulk UPDATE** — `OnSentimentComplete()` loads all `SentimentResult` for the run, applies gate logic in-memory, then bulk-updates `passedTopicGate` via two `em.nativeUpdate()` calls (one for true, one for false) filtered by entity IDs. Not individual load-modify-flush.

25. **Worker URL validation before stage dispatch** — orchestrator verifies corresponding worker URL is configured before transitioning to each stage. If unset, pipeline fails with clear message (e.g., "EMBEDDINGS_WORKER_URL not configured") rather than silently queuing jobs that will fail.

26. **Compound unique constraints on result entities** — `SentimentResult(run, submission)` and `TopicAssignment(topic, submission)` have partial unique indexes (`WHERE deleted_at IS NULL`) to prevent duplicate results from retry/re-processing edge cases.

### Architecture: Entity Map

| Entity                | Purpose                                  | Cardinality              | Trigger        |
| --------------------- | ---------------------------------------- | ------------------------ | -------------- |
| `SubmissionEmbedding` | LaBSE 768-dim vector                     | 1:1 with submission      | Auto on submit |
| `SentimentRun`        | Batch sentiment execution record         | Per pipeline             | On-demand      |
| `SentimentResult`     | Per-submission sentiment within a run    | N per run                | On-demand      |
| `TopicModelRun`       | Batch topic modeling execution record    | Per pipeline             | On-demand      |
| `Topic`               | Discovered themes within a run           | N per run                | On-demand      |
| `TopicAssignment`     | Soft per-submission topic probabilities  | M per submission per run | On-demand      |
| `RecommendationRun`   | Batch recommendation execution record    | Per pipeline             | On-demand      |
| `RecommendedAction`   | Individual action items per run          | N per run                | On-demand      |
| `AnalysisPipeline`    | Orchestrator — chains all analysis types | Per scope per trigger    | On-demand      |

### Architecture: Entity Detail

**`SubmissionEmbedding`**

- `id` (UUID, CustomBaseEntity)
- `submission` → ManyToOne QuestionnaireSubmission
- `embedding` → vector(768) via `VectorType` from `pgvector/mikro-orm`
- `modelName` — string (e.g., "LaBSE")
- Constraints: Partial unique index on `(submission)` WHERE `deleted_at IS NULL`. Use upsert on conflict for idempotent embedding persistence.

**`SentimentRun`**

- `id` (UUID)
- `pipeline` → ManyToOne AnalysisPipeline
- `submissionCount` — int
- `workerVersion` — string, nullable
- `jobId` — string, nullable (BullMQ job ID)
- `status` — enum: pending, processing, completed, failed
- `completedAt` — datetime, nullable
- `results` → OneToMany SentimentResult

**`SentimentResult`**

- `id` (UUID)
- `run` → ManyToOne SentimentRun
- `submission` → ManyToOne QuestionnaireSubmission
- `positiveScore` — decimal(10,4)
- `neutralScore` — decimal(10,4)
- `negativeScore` — decimal(10,4)
- `label` — string (derived: highest score class)
- `rawResult` — JSONB (full worker response)
- `passedTopicGate` — boolean, default false (set via bulk UPDATE during gate step, not on insert)
- `processedAt` — datetime
- Constraints: Partial unique index on `(run, submission)` WHERE `deleted_at IS NULL`

**`TopicModelRun`**

- `id` (UUID)
- `pipeline` → ManyToOne AnalysisPipeline
- `submissionCount` — int (submissions in filtered corpus)
- `topicCount` — int
- `outlierCount` — int
- `modelParams` — JSONB: { min_topic_size, nr_topics, umap_n_neighbors, umap_n_components }
- `metrics` — JSONB: { npmi_coherence, topic_diversity, outlier_ratio, silhouette_score, embedding_coherence }
- `workerVersion` — string, nullable
- `jobId` — string, nullable
- `status` — enum: pending, processing, completed, failed
- `completedAt` — datetime, nullable
- `topics` → OneToMany Topic

**`Topic`**

- `id` (UUID)
- `run` → ManyToOne TopicModelRun
- `topicIndex` — int (BERTopic topic_id: 0, 1, 2...)
- `rawLabel` — string (BERTopic auto-label: "0_fast_rushed_pace")
- `label` — string, nullable (human-readable, AI-generated later)
- `keywords` — string[] (top 10 from c-TF-IDF)
- `docCount` — int

**`TopicAssignment`**

- `id` (UUID)
- `topic` → ManyToOne Topic
- `submission` → ManyToOne QuestionnaireSubmission
- `probability` — decimal(10,4) (soft assignment weight, 0.0–1.0)
- `isDominant` — boolean (highest probability topic for this submission)
- Constraints: Partial unique index on `(topic, submission)` WHERE `deleted_at IS NULL`

**`RecommendationRun`**

- `id` (UUID)
- `pipeline` → ManyToOne AnalysisPipeline
- `submissionCount` — int
- `sentimentCoverage` — int
- `topicCoverage` — int
- `workerVersion` — string, nullable
- `jobId` — string, nullable
- `status` — enum: pending, processing, completed, failed
- `completedAt` — datetime, nullable
- `actions` → OneToMany RecommendedAction

**`RecommendedAction`**

- `id` (UUID)
- `run` → ManyToOne RecommendationRun
- `category` — string (e.g., "teaching_pace", "engagement", "materials")
- `actionText` — text
- `priority` — enum: high, medium, low
- `supportingEvidence` — JSONB (references to data points)

**`AnalysisPipeline`**

- `id` (UUID)
- `semester` → ManyToOne Semester (REQUIRED)
- `faculty` → ManyToOne User, nullable
- `questionnaireVersion` → ManyToOne QuestionnaireVersion, nullable
- `department` → ManyToOne Department, nullable
- `program` → ManyToOne Program, nullable
- `campus` → ManyToOne Campus, nullable
- `course` → ManyToOne Course, nullable
- `triggeredBy` → ManyToOne User
- `totalEnrolled` — int
- `submissionCount` — int
- `commentCount` — int
- `responseRate` — decimal(10,4)
- `warnings` — string[]
- `sentimentGateIncluded` — int, nullable (populated after gate)
- `sentimentGateExcluded` — int, nullable (populated after gate)
- `status` — enum: awaiting_confirmation, embedding_check, sentiment_analysis, sentiment_gate, topic_modeling, generating_recommendations, completed, failed, cancelled
- `confirmedAt` — datetime, nullable
- `completedAt` — datetime, nullable
- `sentimentRuns` → OneToMany SentimentRun (inverse side — no FK column on pipeline)
- `topicModelRuns` → OneToMany TopicModelRun (inverse side)
- `recommendationRuns` → OneToMany RecommendationRun (inverse side)
- Notes: Runs reference pipeline via their own ManyToOne. No circular FK. Latest run per type resolved via `ORDER BY createdAt DESC LIMIT 1`.

### Architecture: Dispatch Flow

```
Submit → if qualitativeComment AND EMBEDDINGS_WORKER_URL configured: enqueue(embedding)
  Note: Deterministic job ID (${submissionId}:embedding) prevents duplicate dispatch.
  Fire-and-forget — wrap in try/catch, log warning on failure.

Admin triggers "Run Analysis" (POST /analysis/pipelines):
  0. Check for active pipeline with overlapping scope (status not completed/failed/cancelled)
     → if found, return existing pipeline (prevent duplicates)

  1. Create AnalysisPipeline (awaiting_confirmation)
     → call AnalysisPipelineRepository.ComputeCoverageStats(scope):
       - Dynamic multi-join query based on non-null scope fields
       - Join through Course → Program → Department → Semester hierarchy
       - Two queries: submission/comment counts + enrollment counts
       - Staleness: MAX(enrollment.updatedAt) for the scope (warn if > 24h stale)
     → generate warnings (response rate < 25%, submissions < 30, comments < 10, stale sync)
     → return pipeline with coverage + warnings

  2. Admin confirms (POST /analysis/pipelines/:id/confirm)
     → verify SENTIMENT_WORKER_URL configured (fail with clear message if not)
     → check embedding coverage, enqueue single backfill batch job if gaps exist
     → status: embedding_check (or skip to sentiment_analysis if all embedded)

  3. Embeddings ready → dispatch sentiment as SINGLE BATCH JOB
     → one BullMQ job with BatchAnalysisJobMessage payload (array of { submissionId, text })
     → one HTTP call to sentiment worker → one BatchAnalysisResultMessage response
     → SentimentBatchProcessor.Persist() creates all SentimentResult entities in one transaction
     → status: sentiment_analysis

  4. Sentiment complete → apply sentiment gate filter
     → load all SentimentResult for run
     → apply gate logic in-memory (SENTIMENT_GATE constants)
     → bulk UPDATE passedTopicGate via two em.nativeUpdate() calls:
       - SET passedTopicGate=true WHERE id IN (passing IDs)
       - SET passedTopicGate=false WHERE id IN (failing IDs)
     → persist sentimentGateIncluded / sentimentGateExcluded
     → post-gate validation: if filtered corpus < 30, add warning
     → status: sentiment_gate

  5. Gate complete → verify TOPIC_MODEL_WORKER_URL configured
     → dispatch topic modeling as SINGLE BATCH JOB on filtered corpus
     → status: topic_modeling
     → chunk TopicAssignment inserts using TOPIC_ASSIGNMENT_BATCH_SIZE constant

  6. Topic modeling complete → verify RECOMMENDATIONS_WORKER_URL configured
     → dispatch recommendations as SINGLE BATCH JOB
     → status: generating_recommendations

  7. Recommendations complete → pipeline status: completed

  Admin cancels (POST /analysis/pipelines/:id/cancel):
  → transitions any non-terminal pipeline to cancelled
  → admin can create a new pipeline for the same scope afterward

  Error handling:
  - @OnWorkerEvent('failed') after max retries → update pipeline status to failed
  - Worker URL not configured → fail pipeline with descriptive message before dispatch
  - Zod validation failure → log raw response body, mark run as failed
  - Failed/cancelled pipelines do NOT block new pipeline creation for the same scope
```

### Architecture: Pipeline Status Contract

```json
{
  "id": "uuid",
  "status": "sentiment_analysis",
  "scope": {
    "semester": "2nd Semester 2025-2026",
    "department": "CCS",
    "faculty": null,
    "questionnaireVersion": null,
    "program": null,
    "campus": null,
    "course": null
  },
  "coverage": {
    "totalEnrolled": 1200,
    "submissionCount": 847,
    "commentCount": 612,
    "responseRate": 0.71,
    "lastEnrollmentSyncAt": "2026-03-13T08:00:00Z"
  },
  "stages": {
    "embeddings": { "status": "completed", "total": 612, "completed": 612 },
    "sentiment": { "status": "processing", "total": 612, "processed": 340 },
    "sentimentGate": {
      "status": "pending",
      "included": null,
      "excluded": null
    },
    "topicModeling": { "status": "pending" },
    "recommendations": { "status": "pending" }
  },
  "warnings": [],
  "createdAt": "...",
  "confirmedAt": "...",
  "completedAt": null
}
```

Transport: polling endpoint initially (`GET /analysis/pipelines/:id/status`). Same contract supports SSE or WebSocket later without backend changes.

Note: `lastEnrollmentSyncAt` is derived from `MAX(enrollment.updatedAt)` for the pipeline scope — no dedicated sync tracking entity needed.

### Architecture: Worker Contracts (Baseline)

**Sentiment Worker:**

- Input: batch of `{ submissionId, text }` items
- Output: per-submission `{ submissionId, positive, neutral, negative }` scores
- Deployed on RunPod (serverless GPU)

**Topic Modeling Worker:**

- Input: filtered submissions with `{ submissionId, text, embedding[768] }` + model params
- Output: discovered topics with keywords + per-submission soft assignments with probabilities + evaluation metrics
- Based on `CtrlAltElite-Devs/topic-modeling.faculytics` (BERTopic + LaBSE + UMAP + HDBSCAN)

**Recommendations Worker:**

- Input: scope context + aggregated data (score distributions, sentiment summary, top topics with avg sentiment, sample comments)
- Output: prioritized action items with category, text, priority, and supporting evidence

Full contracts documented in `docs/worker-contracts/`.

### Architecture: Batch Processing Pattern

The existing `BaseAnalysisProcessor` processes one job at a time (`AnalysisJobMessage` with single `text` field). Batch analysis stages need a different pattern:

**`BaseBatchProcessor`** (new abstract class):

- Extends `WorkerHost` (same as `BaseAnalysisProcessor`)
- Uses `BatchAnalysisJobMessage` instead of `AnalysisJobMessage`
- Makes one HTTP call per BullMQ job (the job IS the batch)
- Validates response with `BatchAnalysisResultMessage` schema
- Abstract `GetWorkerUrl()` and `Persist()` hooks (same pattern)

**`BatchAnalysisJobMessage`** Zod schema:

```typescript
export const batchAnalysisJobSchema = z.object({
  jobId: z.string().uuid(),
  version: z.string(),
  type: z.string(),
  items: z.array(
    z.object({
      submissionId: z.string(),
      text: z.string().min(1),
    }),
  ),
  metadata: z.object({
    pipelineId: z.string(),
    runId: z.string(),
  }),
  publishedAt: z.string().datetime(),
});
```

**`BatchAnalysisResultMessage`** Zod schema:

```typescript
export const batchAnalysisResultSchema = z.object({
  jobId: z.string().uuid(),
  version: z.string(),
  status: z.enum(['completed', 'failed']),
  results: z.array(z.record(z.string(), z.unknown())).optional(),
  error: z.string().optional(),
  completedAt: z.string().datetime(),
});
```

**Usage:** Sentiment, topic modeling, and recommendations processors extend `BaseBatchProcessor`. Embedding processor extends `BaseAnalysisProcessor` (single-job pattern). One BullMQ job per analysis stage = one completion event = orchestrator callback triggered directly from `Persist()`.

### Architecture: Sentiment Gate Constants

```typescript
// src/modules/analysis/constants.ts
export const SENTIMENT_GATE = {
  /** Minimum word count for positive comments to pass the topic modeling gate */
  POSITIVE_MIN_WORD_COUNT: 10,
  /** Sentiment labels that always pass the gate */
  ALWAYS_INCLUDE_LABELS: ['negative', 'neutral'] as const,
} as const;
```

## Implementation Plan

**Phase dependency:** Phases are sequential. Each phase depends on all prior phases being complete. Do not implement a later phase before completing all earlier phases.

### Tasks

#### Phase 1: Foundation (Dependencies, Enums, Constants)

- [x] Task 1: Install pgvector dependency
  - File: `package.json`
  - Action: `npm install pgvector`
  - Notes: Provides `VectorType` and `cosineDistance` for MikroORM integration

- [x] Task 2: Create analysis enums
  - File: `src/modules/analysis/enums/pipeline-status.enum.ts` (create)
  - File: `src/modules/analysis/enums/run-status.enum.ts` (create)
  - File: `src/modules/analysis/enums/action-priority.enum.ts` (create)
  - File: `src/modules/analysis/enums/index.ts` (create — barrel)
  - Action: Define `PipelineStatus` enum: `AWAITING_CONFIRMATION`, `EMBEDDING_CHECK`, `SENTIMENT_ANALYSIS`, `SENTIMENT_GATE`, `TOPIC_MODELING`, `GENERATING_RECOMMENDATIONS`, `COMPLETED`, `FAILED`, `CANCELLED`
  - Action: Define `RunStatus` enum: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
  - Action: Define `ActionPriority` enum: `HIGH`, `MEDIUM`, `LOW`
  - Notes: Use string enums matching existing codebase pattern (e.g., `QuestionnaireStatus`)

- [x] Task 3: Create sentiment gate constants
  - File: `src/modules/analysis/constants.ts` (create)
  - Action: Define `SENTIMENT_GATE` constant with `POSITIVE_MIN_WORD_COUNT: 10` and `ALWAYS_INCLUDE_LABELS: ['negative', 'neutral']`
  - Action: Define `PIPELINE_STAGE_TIMEOUT_MS: 1_800_000` (30 minutes default)
  - Action: Define `TOPIC_ASSIGNMENT_BATCH_SIZE: 500` for chunked inserts
  - Action: Define `COVERAGE_WARNINGS` thresholds: `MIN_RESPONSE_RATE: 0.25`, `MIN_SUBMISSIONS: 30`, `MIN_COMMENTS: 10`, `MIN_POST_GATE_CORPUS: 30`, `STALE_SYNC_HOURS: 24`

- [x] Task 4: Update environment configuration
  - File: `src/configurations/env/bullmq.env.ts` (modify)
  - Action: Add `EMBEDDINGS_WORKER_URL: z.url().optional()`, `EMBEDDINGS_CONCURRENCY: z.coerce.number().default(3)`, `TOPIC_MODEL_WORKER_URL: z.url().optional()`, `TOPIC_MODEL_CONCURRENCY: z.coerce.number().default(1)`, `RECOMMENDATIONS_WORKER_URL: z.url().optional()`, `RECOMMENDATIONS_CONCURRENCY: z.coerce.number().default(1)`
  - File: `.env.sample` (modify)
  - Action: Add the new env vars with comments

#### Phase 2: Entities & Repositories

- [x] Task 5: Create SubmissionEmbedding entity and repository
  - File: `src/entities/submission-embedding.entity.ts` (create)
  - File: `src/repositories/submission-embedding.repository.ts` (create)
  - Action: Entity extends `CustomBaseEntity` with: `submission` (ManyToOne QuestionnaireSubmission), `embedding` (VectorType from pgvector/mikro-orm), `modelName` (string)
  - Notes: Import `VectorType` from `pgvector/mikro-orm`. Add `@Index()` on `submission`. Add partial unique index on `(submission)` WHERE `deleted_at IS NULL` in migration (use upsert on conflict for idempotent persistence).

- [x] Task 6: Create AnalysisPipeline entity and repository
  - File: `src/entities/analysis-pipeline.entity.ts` (create)
  - File: `src/repositories/analysis-pipeline.repository.ts` (create)
  - Action: Entity extends `CustomBaseEntity` with all fields from Entity Detail section. `semester` is required ManyToOne, all other scope fields nullable. `status` uses `@Enum(() => PipelineStatus)`. `warnings` uses `@Property({ type: 'array' })`. `responseRate` uses `decimal(10,4)`.
  - Notes: `sentimentRuns`, `topicModelRuns`, `recommendationRuns` are OneToMany collections (inverse side — no FK column on pipeline table). Runs reference pipeline via their own ManyToOne. Latest run per type resolved via `ORDER BY createdAt DESC LIMIT 1`. Add `@Index({ properties: ['semester', 'status'] })` for active pipeline duplicate check. Include `CANCELLED` in `PipelineStatus` enum. Add `ComputeCoverageStats(scope)` method to repository for dynamic multi-join coverage queries.

- [x] Task 7: Create SentimentRun and SentimentResult entities and repositories
  - File: `src/entities/sentiment-run.entity.ts` (create)
  - File: `src/entities/sentiment-result.entity.ts` (create)
  - File: `src/repositories/sentiment-run.repository.ts` (create)
  - File: `src/repositories/sentiment-result.repository.ts` (create)
  - Action: `SentimentRun` — `pipeline` (ManyToOne AnalysisPipeline), `submissionCount` (int), `workerVersion` (string, nullable), `jobId` (string, nullable), `status` (RunStatus enum), `completedAt` (Date, nullable), `results` (OneToMany SentimentResult)
  - Action: `SentimentResult` — `run` (ManyToOne SentimentRun), `submission` (ManyToOne QuestionnaireSubmission), `positiveScore`/`neutralScore`/`negativeScore` (decimal 10,4), `label` (string), `rawResult` (jsonb), `passedTopicGate` (boolean), `processedAt` (Date)
  - Notes: Add `@Index({ properties: ['run'] })` on SentimentResult. Add `@Index({ properties: ['submission'] })` for cross-run lookups. Add partial unique index on `(run, submission)` WHERE `deleted_at IS NULL` in migration. `passedTopicGate` defaults to `false` — set via bulk `em.nativeUpdate()` during gate step, not on insert.

- [x] Task 8: Create TopicModelRun, Topic, and TopicAssignment entities and repositories
  - File: `src/entities/topic-model-run.entity.ts` (create)
  - File: `src/entities/topic.entity.ts` (create)
  - File: `src/entities/topic-assignment.entity.ts` (create)
  - File: `src/repositories/topic-model-run.repository.ts` (create)
  - File: `src/repositories/topic.repository.ts` (create)
  - File: `src/repositories/topic-assignment.repository.ts` (create)
  - Action: `TopicModelRun` — `pipeline` (ManyToOne), `submissionCount`, `topicCount`, `outlierCount` (int), `modelParams` (jsonb), `metrics` (jsonb), `workerVersion`, `jobId`, `status`, `completedAt`, `topics` (OneToMany Topic)
  - Action: `Topic` — `run` (ManyToOne TopicModelRun), `topicIndex` (int), `rawLabel` (string), `label` (string, nullable), `keywords` (text[]), `docCount` (int)
  - Action: `TopicAssignment` — `topic` (ManyToOne Topic), `submission` (ManyToOne QuestionnaireSubmission), `probability` (decimal 10,4), `isDominant` (boolean)
  - Notes: Add `@Index({ properties: ['submission'] })` on TopicAssignment for per-submission lookups. Add partial unique index on `(topic, submission)` WHERE `deleted_at IS NULL` in migration.

- [x] Task 9: Create RecommendationRun and RecommendedAction entities and repositories
  - File: `src/entities/recommendation-run.entity.ts` (create)
  - File: `src/entities/recommended-action.entity.ts` (create)
  - File: `src/repositories/recommendation-run.repository.ts` (create)
  - File: `src/repositories/recommended-action.repository.ts` (create)
  - Action: `RecommendationRun` — `pipeline` (ManyToOne), `submissionCount`, `sentimentCoverage`, `topicCoverage` (int), `workerVersion`, `jobId`, `status`, `completedAt`, `actions` (OneToMany RecommendedAction)
  - Action: `RecommendedAction` — `run` (ManyToOne RecommendationRun), `category` (string), `actionText` (text), `priority` (ActionPriority enum), `supportingEvidence` (jsonb)

- [x] Task 10: Update entity barrel file
  - File: `src/entities/index.entity.ts` (modify)
  - Action: Add all 9 new entity imports and include them in the `entities` array export
  - Notes: Order alphabetically within the existing list for consistency

#### Phase 3: Database Migration

- [x] Task 11: Create migration for all new entities and pgvector
  - File: `src/migrations/Migration[timestamp].ts` (create via `npx mikro-orm migration:create`)
  - Action: Verify migration includes:
    1. `CREATE EXTENSION IF NOT EXISTS vector` (pgvector)
    2. All 9 new tables with correct column types, foreign keys, indexes
    3. CHECK constraints for all enum columns
    4. `vector(768)` column type for `submission_embedding.embedding`
    5. Composite indexes as defined on entities
    6. Partial unique indexes: `submission_embedding(submission_id) WHERE deleted_at IS NULL`, `sentiment_result(run_id, submission_id) WHERE deleted_at IS NULL`, `topic_assignment(topic_id, submission_id) WHERE deleted_at IS NULL`
  - Action: Verify `down()` drops tables in reverse dependency order and drops extension
  - Notes: Pre-mortem #5 — add comment that pgvector extension must be pre-enabled on Neon.tech dashboard before running this migration

#### Phase 4: Worker Contract Schemas & Documentation

- [x] Task 12: Create worker contract Zod schemas
  - File: `src/modules/analysis/dto/sentiment-worker.dto.ts` (create)
  - File: `src/modules/analysis/dto/topic-model-worker.dto.ts` (create)
  - File: `src/modules/analysis/dto/recommendations-worker.dto.ts` (create)
  - Action: Define request and response Zod schemas for each worker type per the Architecture: Worker Contracts section
  - Action: Export inferred TypeScript types from each schema
  - Notes: These are the source of truth. Worker contract docs are generated from these.

- [x] Task 13: Create pipeline status DTO
  - File: `src/modules/analysis/dto/pipeline-status.dto.ts` (create)
  - File: `src/modules/analysis/dto/create-pipeline.dto.ts` (create)
  - Action: Define Zod schema for pipeline status response per the Pipeline Status Contract section
  - Action: Define request DTO for pipeline creation: `semesterId` (required), `facultyId`, `questionnaireVersionId`, `departmentId`, `programId`, `campusId`, `courseId` (all optional)

- [x] Task 14: Create worker contract documentation
  - File: `docs/worker-contracts/sentiment-worker.md` (create)
  - File: `docs/worker-contracts/topic-modeling-worker.md` (create)
  - File: `docs/worker-contracts/recommendations-worker.md` (create)
  - Action: Document each worker's endpoint, request schema, response schema, error format, and example payloads
  - Notes: Reference the Zod schemas as source of truth. Include versioning strategy notes.

#### Phase 4B: Batch Processing Infrastructure

- [x] Task 14B: Create batch analysis DTOs
  - File: `src/modules/analysis/dto/batch-analysis-job-message.dto.ts` (create)
  - File: `src/modules/analysis/dto/batch-analysis-result-message.dto.ts` (create)
  - Action: Define `batchAnalysisJobSchema` with `items: z.array(z.object({ submissionId, text }))` and `metadata: z.object({ pipelineId, runId })` — see Architecture: Batch Processing Pattern section for full schema
  - Action: Define `batchAnalysisResultSchema` with `results: z.array(z.record(z.string(), z.unknown()))` — array of per-item results
  - Action: Export inferred TypeScript types: `BatchAnalysisJobMessage`, `BatchAnalysisResultMessage`

- [x] Task 14C: Create BaseBatchProcessor abstract class
  - File: `src/modules/analysis/processors/base-batch.processor.ts` (create)
  - Action: Extend `WorkerHost`. Mirror `BaseAnalysisProcessor` pattern but use `BatchAnalysisJobMessage` and `BatchAnalysisResultMessage` schemas. Same hooks: abstract `GetWorkerUrl()` and `Persist()`. Same HTTP dispatch pattern (fetch to worker URL). Same Zod validation of response. Same error handling (`@OnWorkerEvent('failed')`).
  - Notes: One BullMQ job = one batch = one HTTP call = one completion event. The `Persist()` hook receives the full batch result. Each concrete processor re-parses the `results` array with its own typed Zod schema inside `Persist()`.

#### Phase 5: Processors

- [x] Task 15: Create EmbeddingProcessor
  - File: `src/modules/analysis/processors/embedding.processor.ts` (create)
  - Action: Extend `BaseAnalysisProcessor`. `GetWorkerUrl()` returns `env.EMBEDDINGS_WORKER_URL`. `Persist()` creates or updates `SubmissionEmbedding` entity via `UnitOfWork`.
  - Notes: Embedding processor handles both per-submission dispatch (auto on submit) and batch backfill (pipeline embedding check). Use `@Processor('embedding', { concurrency: env.EMBEDDINGS_CONCURRENCY })`.

- [x] Task 16: Update SentimentProcessor to extend BaseBatchProcessor
  - File: `src/modules/analysis/processors/sentiment.processor.ts` (modify)
  - Action: Change parent class from `BaseAnalysisProcessor` to `BaseBatchProcessor`. Replace no-op `Persist()` with real implementation: re-parse `results` array with typed `sentimentResultSchema` (per-item), create `SentimentResult` entities with typed scores (`positiveScore`, `neutralScore`, `negativeScore`), derive `label` from highest score, store `rawResult` JSONB per item, persist all in one `UnitOfWork` transaction
  - Action: Inject `EntityManager` and repositories
  - Action: In `Persist()`, after creating all results: update `SentimentRun.status` to `completed` and call `PipelineOrchestratorService.OnSentimentComplete(pipelineId)` — pipelineId from job metadata
  - Action: On failure after max retries (`@OnWorkerEvent('failed')`), update run and pipeline status to `failed`, log raw response body (pre-mortem #6)
  - Notes: Pre-mortem #1 — ensure pipeline transitions to `failed` on processor failure. One BullMQ job = entire sentiment batch = one completion callback.

- [x] Task 17: Create TopicModelProcessor
  - File: `src/modules/analysis/processors/topic-model.processor.ts` (create)
  - Action: Extend `BaseBatchProcessor`. `GetWorkerUrl()` returns `env.TOPIC_MODEL_WORKER_URL`. `Persist()` re-parses results with typed topic model schema, creates `Topic` entities → `TopicAssignment` entities in `UnitOfWork` transaction. Updates `TopicModelRun` with `topicCount`, `outlierCount`, `metrics`.
  - Action: Chunk `TopicAssignment` inserts using `TOPIC_ASSIGNMENT_BATCH_SIZE` constant (pre-mortem #7)
  - Action: In `Persist()`, after creating all entities: call `PipelineOrchestratorService.OnTopicModelComplete(pipelineId)`
  - Notes: Use `@Processor('topic-model', { concurrency: env.TOPIC_MODEL_CONCURRENCY })`. Filter assignments by probability > 0.01 threshold. Set `isDominant` on highest-probability assignment per submission.

- [x] Task 18: Create RecommendationsProcessor
  - File: `src/modules/analysis/processors/recommendations.processor.ts` (create)
  - Action: Extend `BaseBatchProcessor`. `GetWorkerUrl()` returns `env.RECOMMENDATIONS_WORKER_URL`. `Persist()` re-parses results with typed recommendations schema, creates `RecommendedAction` entities via `UnitOfWork`. Updates `RecommendationRun` with `sentimentCoverage`, `topicCoverage`.
  - Action: In `Persist()`, after creating all entities: call `PipelineOrchestratorService.OnRecommendationsComplete(pipelineId)`
  - Notes: Use `@Processor('recommendations', { concurrency: env.RECOMMENDATIONS_CONCURRENCY })`

#### Phase 6: Pipeline Orchestrator & Controller

- [x] Task 19: Create PipelineOrchestratorService
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts` (create)
  - Action: Implement methods:
    - `CreatePipeline(dto)` — check for active duplicate (status not completed/failed/cancelled, pre-mortem #8), call `AnalysisPipelineRepository.ComputeCoverageStats(scope)` for coverage (dynamic multi-join query based on non-null scope fields, staleness via `MAX(enrollment.updatedAt)`), generate warnings (including stale sync check), create `AnalysisPipeline` with `AWAITING_CONFIRMATION` status, return pipeline with coverage
    - `ConfirmPipeline(pipelineId)` — verify status is `AWAITING_CONFIRMATION`, **validate `SENTIMENT_WORKER_URL` is configured** (fail with descriptive message if not), check embedding coverage, enqueue single backfill batch if gaps, transition to `EMBEDDING_CHECK` or `SENTIMENT_ANALYSIS`
    - `OnEmbeddingsComplete(pipelineId)` — transition to `SENTIMENT_ANALYSIS`, create `SentimentRun`, build `BatchAnalysisJobMessage` with all submission texts, enqueue single batch job to sentiment queue
    - `OnSentimentComplete(pipelineId)` — apply sentiment gate filter: load all `SentimentResult` for run, apply `SENTIMENT_GATE` constants in-memory, **bulk UPDATE `passedTopicGate` via two `em.nativeUpdate()` calls** (one for passing IDs → true, one for failing IDs → false), update pipeline `sentimentGateIncluded`/`sentimentGateExcluded`, post-gate validation warning if < 30 (pre-mortem #4), **validate `TOPIC_MODEL_WORKER_URL` configured**, transition to `TOPIC_MODELING`, create `TopicModelRun`, build batch job with filtered submission IDs + embeddings
    - `OnTopicModelComplete(pipelineId)` — **validate `RECOMMENDATIONS_WORKER_URL` configured**, transition to `GENERATING_RECOMMENDATIONS`, create `RecommendationRun`, enqueue batch recommendations job with aggregated data
    - `OnRecommendationsComplete(pipelineId)` — transition to `COMPLETED`, set `completedAt`
    - `GetPipelineStatus(pipelineId)` — compose status response from pipeline + child run collections (latest run per type via `ORDER BY createdAt DESC`) + BullMQ job progress
    - `CancelPipeline(pipelineId)` — verify status is not terminal (completed/failed/cancelled), transition to `CANCELLED`
    - `OnStageFailed(pipelineId, stage, error)` — transition to `FAILED`, log error
  - Notes: Inject `AnalysisService` for job dispatch, `UnitOfWork` for transactions, `EntityManager` for queries, all relevant repositories. Worker URL validation prevents silently queuing jobs that will fail.

- [x] Task 20: Create AnalysisController
  - File: `src/modules/analysis/analysis.controller.ts` (create)
  - Action: Protected with `@UseJwtGuard()`. Endpoints:
    - `POST /analysis/pipelines` — create pipeline, accepts `CreatePipelineDto`, returns pipeline with coverage stats
    - `POST /analysis/pipelines/:id/confirm` — confirm pipeline, kicks off execution
    - `POST /analysis/pipelines/:id/cancel` — cancel a non-terminal pipeline, transitions to `cancelled`
    - `GET /analysis/pipelines/:id/status` — get pipeline status (transport-agnostic contract)
  - Notes: All endpoints require authentication. The controller delegates entirely to `PipelineOrchestratorService`.

#### Phase 7: Module Wiring

- [x] Task 21: Update AnalysisModule
  - File: `src/modules/analysis/analysis.module.ts` (modify)
  - Action: Register new BullMQ queues: `BullModule.registerQueue({ name: 'embedding' }, { name: 'topic-model' }, { name: 'recommendations' })`
  - Action: Import `MikroOrmModule.forFeature([...all 9 new entities])` for repository injection
  - Action: Add new providers: `EmbeddingProcessor`, `SentimentProcessor` (already exists), `TopicModelProcessor`, `RecommendationsProcessor`, `PipelineOrchestratorService`
  - Action: Add `AnalysisController` to controllers
  - Action: Export `AnalysisService` and `PipelineOrchestratorService`
  - Notes: Import `CommonModule` for UnitOfWork access

- [x] Task 22: Wire embedding dispatch in submission flow
  - File: `src/modules/questionnaires/questionnaire.module.ts` (modify)
  - Action: Add `AnalysisModule` to imports array
  - File: `src/modules/questionnaires/services/questionnaire.service.ts` (modify)
  - Action: Inject `AnalysisService`. After `em.flush()` in `submitQuestionnaire()`, if `submission.qualitativeComment` exists **AND** `env.EMBEDDINGS_WORKER_URL` is configured, call `analysisService.EnqueueJob('embedding', submission.qualitativeComment, { submissionId: submission.id, facultyId: data.facultyId, versionId: data.versionId })`
  - Notes: Embedding dispatch is fire-and-forget — don't await. Wrap in try/catch to prevent embedding failure from blocking submission. Log warning on failure. **Guard with `EMBEDDINGS_WORKER_URL` check** — if env var is absent, skip dispatch silently (worker doesn't exist yet). Deterministic job IDs (`${submissionId}:embedding`) already prevent duplicate dispatch via BullMQ deduplication.

#### Phase 8: Tests

- [x] Task 23: Unit tests for entities and enums
  - File: `src/modules/analysis/enums/*.spec.ts` (create if needed)
  - Action: Verify enum values match expected strings for database CHECK constraints

- [x] Task 23B: Unit tests for BaseBatchProcessor
  - File: `src/modules/analysis/processors/base-batch.processor.spec.ts` (create)
  - Action: Create concrete test class extending `BaseBatchProcessor`. Test that `process()` sends HTTP request with `BatchAnalysisJobMessage` body, validates response with `batchAnalysisResultSchema`, calls `Persist()` with parsed batch result.
  - Action: Test Zod validation failure logs raw response body
  - Action: Test `@OnWorkerEvent('failed')` handler is wired
  - Notes: Mirror existing `base.processor.spec.ts` pattern but with batch schemas.

- [x] Task 24: Unit tests for PipelineOrchestratorService
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.spec.ts` (create)
  - Action: Test `CreatePipeline` — coverage computation via `ComputeCoverageStats()`, warning generation, duplicate pipeline check (active = not completed/failed/cancelled), stale sync detection via `MAX(updatedAt)`
  - Action: Test `ConfirmPipeline` — status transition, embedding backfill dispatch, **worker URL validation failure** (SENTIMENT_WORKER_URL not set → fail with message)
  - Action: Test `OnSentimentComplete` — sentiment gate filtering (negative always passes, positive <10 words excluded, positive >=10 words passes), **bulk UPDATE passedTopicGate**, post-gate warning when corpus too small, **worker URL validation for TOPIC_MODEL_WORKER_URL**
  - Action: Test `CancelPipeline` — transitions non-terminal to cancelled, rejects already-terminal pipelines
  - Action: Test stage transitions and failure handling
  - Notes: Mock repositories, AnalysisService, EntityManager. Use TestingModule pattern.

- [x] Task 25: Unit tests for updated SentimentProcessor
  - File: `src/modules/analysis/processors/sentiment.processor.spec.ts` (modify)
  - Action: Test `Persist()` creates SentimentResult entities from batch result array with correct typed scores, derived label, rawResult JSONB
  - Action: Test failure handler updates pipeline status
  - Action: Test raw response logging on Zod validation failure
  - Notes: Now extends `BaseBatchProcessor` — test with `BatchAnalysisJobMessage` and `BatchAnalysisResultMessage`

- [x] Task 26: Unit tests for new processors
  - File: `src/modules/analysis/processors/embedding.processor.spec.ts` (create)
  - File: `src/modules/analysis/processors/topic-model.processor.spec.ts` (create)
  - File: `src/modules/analysis/processors/recommendations.processor.spec.ts` (create)
  - Action: Test `GetWorkerUrl()` returns correct env var
  - Action: Test `Persist()` creates correct entities with proper relationships
  - Action: Test TopicModelProcessor chunks TopicAssignment inserts
  - Action: Test each processor calls appropriate PipelineOrchestrator callback on completion

- [x] Task 27: Unit tests for AnalysisController
  - File: `src/modules/analysis/analysis.controller.spec.ts` (create)
  - Action: Test pipeline creation endpoint returns coverage stats
  - Action: Test confirm endpoint transitions status
  - Action: Test status endpoint returns composed pipeline status
  - Notes: Mock PipelineOrchestratorService

- [x] Task 28: Integration test for embedding dispatch on submission
  - File: `src/modules/questionnaires/services/questionnaire.service.spec.ts` (modify)
  - Action: Add test: given a submission with qualitativeComment, when submitQuestionnaire completes, then AnalysisService.EnqueueJob is called with type 'embedding'
  - Action: Add test: given a submission without qualitativeComment, then no embedding job is enqueued
  - Action: Add test: given embedding dispatch fails, then submission still succeeds (fire-and-forget)

### Acceptance Criteria

- [x] AC1: Embedding Auto-Dispatch
  - Given a submission with a qualitativeComment AND `EMBEDDINGS_WORKER_URL` is configured, when `submitQuestionnaire()` completes successfully, then an embedding job is enqueued via `AnalysisService.EnqueueJob('embedding', ...)` with the submission's qualitative comment text and metadata.

- [x] AC1B: Embedding Skip When Worker URL Not Configured
  - Given a submission with a qualitativeComment but `EMBEDDINGS_WORKER_URL` is NOT configured, when `submitQuestionnaire()` completes, then no embedding job is enqueued and no error is thrown.

- [x] AC2: Embedding Skip on No Comment
  - Given a submission without a qualitativeComment (null), when `submitQuestionnaire()` completes, then no embedding job is enqueued.

- [x] AC3: Pipeline Creation with Coverage Stats
  - Given a semester with 150 enrolled students and 47 submissions (43 with comments), when an admin creates a pipeline for that semester, then the response includes `totalEnrolled: 150`, `submissionCount: 47`, `commentCount: 43`, `responseRate: 0.31`, and appropriate warnings.

- [x] AC4: Pipeline Duplicate Prevention
  - Given an active pipeline (status not completed/failed) for semester S1 + department CCS, when an admin attempts to create a new pipeline with the same scope, then the API returns the existing active pipeline instead of creating a duplicate.

- [x] AC5: Pipeline Confirmation and Execution
  - Given a pipeline in `awaiting_confirmation` status, when the admin confirms it, then the pipeline transitions through stages sequentially: `embedding_check` → `sentiment_analysis` → `sentiment_gate` → `topic_modeling` → `generating_recommendations` → `completed`.

- [x] AC6: Sentiment Gate Filtering
  - Given sentiment results where submission A is "negative" (3 words), submission B is "positive" (5 words), and submission C is "positive" (15 words), when the sentiment gate is applied, then A passes (negative always included), B is excluded (positive < 10 words), and C passes (positive >= 10 words).

- [x] AC7: Sentiment Result Persistence
  - Given a completed sentiment batch job, when the processor persists results, then each `SentimentResult` has typed `positiveScore`, `neutralScore`, `negativeScore` columns, a derived `label`, and the full `rawResult` JSONB.

- [x] AC8: Topic Model Persistence with Soft Assignments
  - Given a completed topic modeling job with 5 topics and 50 submissions, when the processor persists results, then a `TopicModelRun` is created with `topicCount: 5`, 5 `Topic` entities with keywords and labels, and `TopicAssignment` entries for each submission-topic pair where probability > 0.01, with `isDominant` set on the highest-probability assignment per submission.

- [x] AC9: Recommendation Persistence
  - Given a completed recommendations job, when the processor persists results, then a `RecommendationRun` is created with `sentimentCoverage` and `topicCoverage` counts, and `RecommendedAction` entities with `category`, `actionText`, `priority`, and `supportingEvidence`.

- [x] AC10: Pipeline Status Endpoint
  - Given a pipeline in `sentiment_analysis` stage, when the status endpoint is called, then the response includes the scope, coverage stats, per-stage status (embeddings: completed, sentiment: processing with progress, sentimentGate/topicModeling/recommendations: pending), and any warnings.

- [x] AC11: Pipeline Failure Handling
  - Given a sentiment batch job that fails after max retries, when the `@OnWorkerEvent('failed')` handler fires, then the `SentimentRun` status is set to `failed`, the `AnalysisPipeline` status transitions to `failed`, and the raw error is logged.

- [x] AC11B: Pipeline Cancel
  - Given a pipeline in `sentiment_analysis` status, when the admin calls `POST /analysis/pipelines/:id/cancel`, then the pipeline status transitions to `cancelled`. A new pipeline for the same scope can be created afterward.

- [x] AC11C: Worker URL Validation
  - Given `TOPIC_MODEL_WORKER_URL` is not configured, when the orchestrator attempts to transition to topic_modeling stage, then the pipeline transitions to `failed` with a descriptive error message "TOPIC_MODEL_WORKER_URL not configured" rather than silently queuing a job that will fail.

- [x] AC12: Coverage Warning — Stale Enrollment
  - Given the last enrollment sync was 48 hours ago, when a pipeline is created, then the warnings array includes "Enrollment data may be stale (last synced 2 days ago)."

- [x] AC13: Post-Gate Warning — Small Corpus
  - Given the sentiment gate reduces the corpus to 15 submissions (below the 30 threshold), when the gate stage completes, then a warning is added to the pipeline: "Sentiment gate reduced corpus to 15 submissions. Topic modeling results may be unreliable."

- [x] AC14: pgvector Embedding Storage
  - Given a completed embedding job for a submission, when the processor persists the result, then a `SubmissionEmbedding` entity is created with a 768-dimensional vector stored via pgvector's `VectorType` and `modelName: "LaBSE"`.

- [x] AC15: Worker Contract Documentation
  - Given the three worker contract docs exist in `docs/worker-contracts/`, when a worker developer reads the sentiment contract, then the doc includes endpoint URL pattern, request schema with field descriptions, response schema, error format, and example payloads matching the Zod schema in `src/modules/analysis/dto/sentiment-worker.dto.ts`.

## Review Notes

- Adversarial review completed (implementation review)
- Findings: 14 total, 12 fixed, 2 acknowledged (no role guard pattern exists in codebase for F10; code deduplication F14 deferred)
- Resolution approach: auto-fix
- Key fixes: batch result schema passthrough (F8), topic model payload merge (F1), embedding backfill via AnalysisService (F2/F9), class-validator decorators (F3), sentiment gate N+1 elimination (F4), enrollment scoping (F5/F6), recommendations aggregated payload (F7), embedding stage status for terminal pipelines (F11), flaky test fix (F12), misleading error message (F13)

## Additional Context

### Dependencies

- `pgvector` npm package (provides `VectorType`, `cosineDistance` for MikroORM)
- pgvector PostgreSQL extension (must be pre-enabled on Neon.tech dashboard before migration)
- LaBSE sentence-transformers model (768-dim, multilingual) — used by embedding worker
- Existing BullMQ + Redis infrastructure (FAC-44)
- Existing submission flow (finalization spec)
- External topic modeling pipeline: `github.com/CtrlAltElite-Devs/topic-modeling.faculytics`

### Prerequisites & Worker Dependencies

Each pipeline stage requires its corresponding worker URL to be configured. The orchestrator validates this before dispatching:

| Stage                                | Required Env Var             | Worker Status                                                             |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| Embedding (auto-dispatch + backfill) | `EMBEDDINGS_WORKER_URL`      | Not yet implemented — auto-dispatch skipped silently if unset             |
| Sentiment Analysis                   | `SENTIMENT_WORKER_URL`       | Baseline contract available — RunPod deployment pending                   |
| Topic Modeling                       | `TOPIC_MODEL_WORKER_URL`     | Reference implementation in `CtrlAltElite-Devs/topic-modeling.faculytics` |
| Recommendations                      | `RECOMMENDATIONS_WORKER_URL` | Architecture undefined — LLM-based, rule-based, or hybrid TBD             |

Processors gracefully fail if worker URL is unset. Pipeline transitions to `failed` with a clear message. No silent job queue failures.

### Testing Strategy

**Unit Tests:**

- Enum value validation (Task 23)
- `PipelineOrchestratorService` — coverage computation, warning generation, duplicate check, stage transitions, sentiment gate logic, failure handling (Task 24)
- `SentimentProcessor.Persist()` — typed score extraction, label derivation, JSONB storage (Task 25)
- `EmbeddingProcessor`, `TopicModelProcessor`, `RecommendationsProcessor` — entity creation, chunked inserts, pipeline callbacks (Task 26)
- `AnalysisController` — endpoint delegation (Task 27)

**Integration Tests:**

- Embedding dispatch on submission — enqueue on comment present, skip on null, fire-and-forget resilience (Task 28)

**Manual Testing:**

- Verify pgvector extension creation in migration on local PostgreSQL
- Verify Neon.tech compatibility (extension pre-enabled)
- End-to-end pipeline flow with mock workers (create → confirm → stages → complete)

### Notes

**All open questions resolved in Party Mode sessions (2026-03-13):**

1. Storage architecture → separate entities per type (not polymorphic JSONB)
2. Embedding target text → qualitative comment only
3. Embedding model → LaBSE 768-dim (not OpenAI) — dual-purpose: similarity + topic input
4. Topic model result shape → TopicModelRun → Topic → TopicAssignment, soft assignments, informed by BERTopic repo
5. Recommended actions → run-based, scoped via parent pipeline, on-demand
6. Sentiment → on-demand batch (RunPod optimized), typed columns + JSONB overflow
7. Dispatch model → only embeddings auto-dispatch; sentiment/topics/recommendations are admin-triggered
8. Pipeline orchestrator → sequential (not parallel) due to sentiment gate dependency
9. Sentiment gate → exclude short positive comments from topic modeling corpus (~35% noise reduction)
10. Flexible scope → semester required, all other filters optional, runs inherit from pipeline
11. Version agnostic → qualitative prompts identical across versions for this institution
12. Coverage warnings → inform admin before confirming, persist on pipeline
13. Status contract → transport-agnostic, polling initially, SSE/WS extensible
14. pgvector integration → `pgvector/mikro-orm` package with `VectorType` and `cosineDistance`
15. Worker contracts → documented in `docs/worker-contracts/`, Zod schemas as source of truth
16. Worker version tracking → `workerVersion` on run entities for provenance
17. Comparison → read-time concern, data model supports it, no new entities needed
18. Sentiment gate thresholds → hardcoded constants in `src/modules/analysis/constants.ts`

**Adversarial review resolutions (2026-03-13):** 19. Batch processing → `BaseBatchProcessor` abstract class, one BullMQ job per stage, batch payload/response schemas 20. Embedding dispatch → guarded by `EMBEDDINGS_WORKER_URL` env var, deterministic job IDs prevent duplicates 21. Cancel endpoint → `POST /pipelines/:id/cancel` instead of auto-timeout, constant retained for future 22. Pipeline-Run relationship → OneToMany collections (not circular ManyToOne), no FK on pipeline table 23. Coverage computation → dedicated `ComputeCoverageStats()` repository method with dynamic scope filtering 24. Sentiment gate timing → bulk UPDATE via `em.nativeUpdate()`, not individual entity load-modify-flush 25. Worker URL validation → orchestrator validates before each stage dispatch, fails with descriptive message 26. Unique constraints → partial unique indexes on `SentimentResult(run, submission)`, `TopicAssignment(topic, submission)`, `SubmissionEmbedding(submission)`

### Failure Prevention (Pre-mortem Analysis)

| #   | Failure Mode                                                                            | Prevention                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pipeline stuck in state (job fails silently, pipeline never transitions)                | `@OnWorkerEvent('failed')` handler must explicitly update pipeline status after max retries. Manual recovery via `POST /pipelines/:id/cancel` endpoint. Auto-timeout deferred (constant defined at `PIPELINE_STAGE_TIMEOUT_MS` for future implementation).                                          |
| 2   | Embedding backfill tracking (20 missing embeddings, pipeline can't track N jobs)        | Single batch "embedding backfill" job that processes all gaps and reports completion as one unit. Pipeline waits for one job, not N individual jobs.                                                                                                                                                |
| 3   | Stale enrollment data (coverage stats based on out-of-date Moodle sync)                 | Use `MAX(enrollment.updatedAt)` for the pipeline scope as staleness indicator. If > 24 hours stale, add warning: "Enrollment data may be stale." No new entity needed — computed from existing Enrollment records.                                                                                  |
| 4   | Sentiment gate over-filtering (gate removes 90% of corpus, topic model on too few docs) | Post-gate validation: if filtered corpus < 30 submissions, add warning to pipeline. Don't block, but inform.                                                                                                                                                                                        |
| 5   | pgvector migration on Neon.tech (extension must be pre-enabled via dashboard)           | Document that pgvector must be pre-enabled on Neon.tech. Add migration guard that verifies extension exists before creating embedding table.                                                                                                                                                        |
| 6   | Worker contract drift (field name mismatch causes entire batch to fail)                 | On Zod validation failure, log the **raw response body** for debugging. Worker contract docs + integration tests validate sample responses against schemas.                                                                                                                                         |
| 7   | Large transaction on batch persist (12,000 TopicAssignment rows in one transaction)     | Chunk `TopicAssignment` inserts (e.g., 500 at a time) within the transaction. Use `em.insertMany()` for bulk inserts.                                                                                                                                                                               |
| 8   | Duplicate pipeline runs (admin triggers same scope twice, wasting GPU compute)          | Before creating new pipeline, check for active pipeline (status not `completed`/`failed`/`cancelled`) with overlapping scope. If found, return existing pipeline or warn. Failed/cancelled pipelines do NOT block new pipeline creation.                                                            |
| 9   | Worker URL not configured (jobs queued to non-existent worker)                          | Orchestrator validates worker URL env var before each stage dispatch. If unset, pipeline transitions to `failed` with descriptive message (e.g., "SENTIMENT_WORKER_URL not configured"). Embedding dispatch in submission flow guarded by `EMBEDDINGS_WORKER_URL` check — skips silently if absent. |
| 10  | Duplicate result rows from retry/re-processing                                          | Partial unique indexes on `SentimentResult(run, submission)`, `TopicAssignment(topic, submission)`, and `SubmissionEmbedding(submission)` — all with `WHERE deleted_at IS NULL`. Embedding processor uses upsert on conflict.                                                                       |
