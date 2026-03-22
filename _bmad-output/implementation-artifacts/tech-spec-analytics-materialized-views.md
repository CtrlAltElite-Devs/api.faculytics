---
title: 'Analytics Infrastructure — Materialized Views & Query Endpoints'
slug: 'analytics-materialized-views'
created: '2026-03-22'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'PostgreSQL 17 (Neon) — materialized views, regr_slope, regr_r2, LATERAL joins, PERCENT_RANK, REFRESH CONCURRENTLY'
  - 'BullMQ on Redis — analytics refresh queue (decoupled from pipeline lifecycle)'
  - 'NestJS v11 — AnalyticsModule, AnalyticsService, AnalyticsController'
  - 'MikroORM v6 — raw SQL via em.getConnection().execute() and createQueryBuilder()'
  - 'Zod — DTO validation for query parameters'
  - 'class-validator + @nestjs/swagger — request validation and OpenAPI docs'
files_to_modify:
  - 'src/configurations/common/queue-names.ts — add ANALYTICS_REFRESH queue name'
  - 'src/modules/analysis/analysis.module.ts — register analytics refresh queue (producer side)'
  - 'src/modules/analysis/services/pipeline-orchestrator.service.ts — enqueue refresh job after COMPLETED'
  - 'src/migrations/MigrationXXX_analytics_matviews.ts — CREATE MATERIALIZED VIEW + unique indexes'
  - 'NEW: src/modules/analytics/analytics.module.ts — new module for analytics'
  - 'NEW: src/modules/analytics/analytics.controller.ts — scoped query endpoints'
  - 'NEW: src/modules/analytics/analytics.service.ts — query methods against matviews'
  - 'NEW: src/modules/analytics/processors/analytics-refresh.processor.ts — REFRESH MATERIALIZED VIEW processor'
  - 'NEW: src/modules/analytics/dto/ — query parameter DTOs and response DTOs'
  - 'src/modules/index.module.ts — register AnalyticsModule in ApplicationModules'
code_patterns:
  - 'PascalCase public methods on services and controllers'
  - 'CommonModule import for ScopeResolverService, CurrentUserService, UnitOfWork'
  - '@UseJwtGuard(UserRole.DEAN, UserRole.SUPER_ADMIN) for role-restricted endpoints'
  - '@UseInterceptors(CurrentUserInterceptor) for CLS user context'
  - 'Raw SQL via em.getConnection().execute(sql, params) — returns untyped rows, must cast'
  - 'Queue registration: BullModule.registerQueue({ name: QueueName.XXX })'
  - '@Processor(QueueName.XXX, { concurrency }) extending WorkerHost for non-HTTP processors'
  - 'Completion callback: processor calls orchestrator method after work completes'
  - 'ScopeResolverService returns null (unrestricted) or string[] (department UUIDs)'
  - 'Absolute imports from src/ prefix throughout codebase'
test_patterns:
  - 'Test.createTestingModule() with mocked dependencies via useValue'
  - 'EntityManager mock: { fork: jest.fn().mockReturnValue({ findOne, find, create, flush, ... }) }'
  - 'BullMQ queue mock: { provide: getQueueToken(QueueName.XXX), useValue: { add: jest.fn() } }'
  - 'Mock job factory functions with optional overrides parameter'
  - 'State mutation assertions on mock objects after async method calls'
  - 'Sequential mock returns via chained .mockResolvedValueOnce()'
  - 'ScopeResolverService mock: { ResolveDepartmentIds: jest.fn() } returning null or string[]'
  - 'expect().rejects.toThrow(ExceptionType) for error path testing'
---

# Tech-Spec: Analytics Infrastructure — Materialized Views & Query Endpoints

**Created:** 2026-03-22

## Overview

### Problem Statement

Faculytics processes student feedback through a multi-stage AI pipeline (sentiment analysis, topic modeling, embeddings, LLM-generated recommendations) and stores rich per-submission results in PostgreSQL. However, there is no analytical layer between these raw pipeline outputs and institutional stakeholders (deans, department heads, super admins). Deans cannot answer questions like "How did my department's sentiment shift from last semester?" or "Which faculty members are trending downward?" without manually querying the database.

### Solution

Introduce PostgreSQL materialized views as a pre-aggregated analytical layer between pipeline outputs and frontend dashboards. Views are materialized at the faculty-per-semester-per-department granularity (handling faculty who teach across multiple departments) and refreshed via a decoupled BullMQ job after pipeline completion. An AnalyticsService provides scoped query endpoints filtered by the existing ScopeResolverService.

### Scope

**In Scope:**

- Faculty Semester Stats materialized view (submission counts, avg scores, sentiment label distribution, topic counts, coverage tracking)
- Faculty Trends materialized view (longitudinal regression via `regr_slope`/`regr_r2` across all observed semesters)
- Analytics refresh BullMQ queue + processor (decoupled from pipeline status — fires after `COMPLETED`)
- AnalyticsService with scoped query methods for:
  1. Department overview — summary stats + sentiment distribution
  2. Attention list — faculty flagged by declining trends, quant-qual gap, low response rate
  3. Faculty comparison — percentile ranks within scope (`PERCENT_RANK()`)
  4. Semester deltas — current vs previous semester change indicators
- Frontend UI/UX consideration issue on `CtrlAltElite-Devs/app.faculytics`

**Out of Scope:**

- PDF/Excel reporting engine (future ticket)
- Topic distribution materialized view (future enhancement)
- New pipeline status enum values (refresh is decoupled)
- Real-time/streaming analytics
- Multi-university support or tenant isolation
- Pipeline scoping enforcement refactoring (separate concern)

## Context for Development

### Codebase Patterns

- **ScopeResolverService** (`src/modules/common/services/scope-resolver.service.ts`): Returns `null` for super admin (unrestricted) or `string[]` of department UUIDs for deans. Currently requires a `semesterId` parameter. The longitudinal trends view queries across all semesters — scope enforcement happens post-aggregation by filtering on department codes.
- **PipelineOrchestratorService** (`src/modules/analysis/services/pipeline-orchestrator.service.ts`): Manages the pipeline lifecycle. `OnRecommendationsComplete()` transitions to `COMPLETED`. The analytics refresh job is triggered _after_ this transition as a separate BullMQ job — not a new pipeline stage.
- **Materialized views as raw SQL**: MikroORM doesn't manage matviews. Views live as raw SQL in migrations. The AnalyticsService uses `em.getConnection().execute()` for queries, returning typed DTOs (not `@Entity()` wrappers).
- **Snapshot columns**: `questionnaire_submission` stores denormalized institutional snapshots (`department_code_snapshot`, `program_code_snapshot`, `campus_code_snapshot`, etc.). The materialized views use these for historically accurate grouping — not live FK relations.
- **Pipeline scope pattern**: Pipelines are expected to be scoped to `semester + faculty` in normal usage. The matview is resilient to wider scopes via per-submission LATERAL joins.

### Files to Reference

| File                                                                 | Purpose                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts`     | Pipeline lifecycle — hook point at `OnRecommendationsComplete()` (line 405) to enqueue refresh                   |
| `src/modules/common/services/scope-resolver.service.ts`              | Returns `null` (super admin) or `string[]` (dean department UUIDs) — use for query scoping                       |
| `src/entities/questionnaire-submission.entity.ts`                    | Submission entity with snapshot columns and composite indexes on `(faculty, semester)`, `(department, semester)` |
| `src/modules/analysis/enums/pipeline-status.enum.ts`                 | Pipeline status enum — `COMPLETED` remains terminal, no new statuses                                             |
| `src/configurations/common/queue-names.ts`                           | Queue name constants — add `ANALYTICS_REFRESH: 'analytics-refresh'`                                              |
| `src/modules/analysis/analysis.module.ts`                            | Existing queue registration pattern — reference for new queue setup                                              |
| `src/modules/analysis/processors/recommendations.processor.ts`       | Reference for non-HTTP processor pattern (extends `WorkerHost` directly, does in-process work)                   |
| `src/modules/analysis/analysis.service.ts`                           | Queue injection pattern via `@InjectQueue()`, job dispatch via `queue.add()`                                     |
| `src/modules/common/common.module.ts`                                | Exports `ScopeResolverService`, `CurrentUserService`, `UnitOfWork` — import via `CommonModule`                   |
| `src/modules/common/cls/current-user.service.ts`                     | CLS-based user context — `getOrFail()` returns authenticated user                                                |
| `src/modules/common/interceptors/current-user.interceptor.ts`        | Loads full User entity into CLS — use with `@UseInterceptors(CurrentUserInterceptor)`                            |
| `src/modules/faculty/services/faculty.service.ts`                    | Reference for raw SQL pattern: `em.getConnection().execute(sql, params)`                                         |
| `src/modules/analysis/services/recommendation-generation.service.ts` | Reference for `createQueryBuilder()` with `raw()` SQL expressions                                                |
| `src/modules/index.module.ts`                                        | Application module registration — add `AnalyticsModule` to `ApplicationModules` array                            |
| `src/configurations/env/bullmq.env.ts`                               | BullMQ env vars — add `ANALYTICS_REFRESH_CONCURRENCY` if needed                                                  |
| `src/modules/analysis/analysis.controller.ts`                        | Reference for controller decorator stack: `@ApiTags`, `@UseJwtGuard()`, `@UseInterceptors`                       |

### Technical Decisions

**1. Decoupled refresh (separate BullMQ job, not a pipeline stage)**
Pipeline `COMPLETED` status remains terminal. A Postgres transient error during matview refresh should not mark a pipeline as `FAILED`. The refresh job retries independently on its own queue.

**2. Raw SQL migrations for views, typed DTOs for queries**
Materialized views are DDL artifacts managed in MikroORM migrations as raw SQL. Query results are typed via TypeScript interfaces, not `@Entity()` decorators. Clean boundary: ORM for entities, raw SQL for the analytical read path.

**3. LATERAL joins for scope-proof sentiment/topic resolution**
Per-submission `LATERAL` subqueries pick the latest `sentiment_result` and `topic_assignment` across all completed pipelines. This correctly handles overlapping pipeline scopes (e.g., a semester-wide pipeline followed by a faculty-specific re-analysis).

**4. Snapshot columns for historical accuracy**
Materialized views group by `department_code_snapshot` — not live FK joins. `program_code_snapshot` and `campus_code_snapshot` are `MODE()` aggregates (most common value per group), not GROUP BY columns. This preserves historically accurate department labels when organizational structure changes between semesters.

**5. Regression over all semesters, scope filtered post-aggregation**
`regr_slope`/`regr_r2` compute over all observed semesters to maintain statistical validity. Role-based scope enforcement filters the result set after aggregation, not before.

**6. Coverage tracking in the view**
The view exposes `analyzed_count` alongside `submission_count` so stakeholders can see sentiment/topic coverage gaps without needing to understand pipeline internals.

**7. Separate AnalyticsModule (not inside AnalysisModule)**
The analytics read layer is a distinct concern from the analysis pipeline. A new `AnalyticsModule` in `src/modules/analytics/` keeps the boundary clean. It imports `CommonModule` for `ScopeResolverService` and registers its own BullMQ queue. The `AnalysisModule` only needs to enqueue the refresh job — it doesn't need to know about matviews.

**8. Analytics refresh processor extends WorkerHost directly**
Unlike sentiment/topic/embedding processors that dispatch HTTP requests to external workers, the analytics refresh processor runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` directly against the database. It follows the `RecommendationsProcessor` pattern — extends `WorkerHost`, does in-process work, no external HTTP call.

**9. Enqueue pattern: PipelineOrchestratorService injects analytics refresh queue**
The orchestrator already injects sentiment, topic model, and recommendations queues. Add `@InjectQueue(QueueName.ANALYTICS_REFRESH)` and call `queue.add()` at the end of `OnRecommendationsComplete()`. The refresh processor lives in `AnalyticsModule` but the queue is registered in `AnalysisModule` (where the producer lives).

**10. Raw SQL for matview queries**
Use `em.getConnection().execute(sql, params)` (pattern from `FacultyService`) for matview queries. Results are untyped — cast to typed interfaces. Do not use `@Entity()` decorators or `em.find()` against views.

### Verified on Live Database (Neon PG17)

| Feature                                                                        | Status                                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `regr_slope()` / `regr_r2()`                                                   | Confirmed working                                                     |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY`                                       | Confirmed working                                                     |
| `COUNT() FILTER (WHERE ...)`                                                   | Confirmed working                                                     |
| `PERCENT_RANK()` window function                                               | Available in PG17                                                     |
| LATERAL join path: submission -> sentiment_result -> sentiment_run -> pipeline | Validated — correct 50 submissions returned                           |
| LATERAL join path: submission -> topic_assignment                              | Validated — 8 distinct topics returned                                |
| Cross-product inflation fix                                                    | `COUNT(DISTINCT qs.id)` resolves the sentiment x topic join inflation |

### Prototype Query (Faculty Semester Stats)

**Granularity:** One row per `(faculty, semester, department)`. A faculty teaching across multiple departments (e.g., English across CCS and Engineering) produces separate rows per department — each dean sees only their department's evaluations. All non-key columns are `MODE()` aggregates to prevent unique index violations from snapshot value changes.

```sql
SELECT
  qs.faculty_id,
  qs.semester_id,
  qs.department_code_snapshot,
  -- All non-key columns as MODE() aggregates (F2/F3 fix)
  MODE() WITHIN GROUP (ORDER BY qs.department_name_snapshot) AS department_name_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.faculty_name_snapshot) AS faculty_name_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.semester_code_snapshot) AS semester_code_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.academic_year_snapshot) AS academic_year_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.program_code_snapshot) AS program_code_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.campus_code_snapshot) AS campus_code_snapshot,
  COUNT(DISTINCT qs.id) AS submission_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE qs.qualitative_comment IS NOT NULL) AS comment_count,
  ROUND(AVG(qs.normalized_score), 4) AS avg_normalized_score,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'positive') AS positive_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'negative') AS negative_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'neutral') AS neutral_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label IS NOT NULL) AS analyzed_count,
  COUNT(DISTINCT ta.topic_id) AS distinct_topic_count
FROM questionnaire_submission qs
LEFT JOIN LATERAL (
  SELECT sr2.label
  FROM sentiment_result sr2
  JOIN sentiment_run srun ON srun.id = sr2.run_id
  JOIN analysis_pipeline ap ON ap.id = srun.pipeline_id
  WHERE sr2.submission_id = qs.id
    AND sr2.deleted_at IS NULL
    AND srun.status = 'COMPLETED'
    AND srun.deleted_at IS NULL
    AND ap.status = 'COMPLETED'
    AND ap.deleted_at IS NULL
  ORDER BY sr2.processed_at DESC
  LIMIT 1
) sr ON true
-- F1 fix: LATERAL join for topic_assignment through completed pipeline chain
LEFT JOIN LATERAL (
  SELECT ta2.topic_id
  FROM topic_assignment ta2
  JOIN topic t ON t.id = ta2.topic_id
  JOIN topic_model_run tmr ON tmr.id = t.run_id
  JOIN analysis_pipeline ap ON ap.id = tmr.pipeline_id
  WHERE ta2.submission_id = qs.id
    AND ta2.deleted_at IS NULL
    AND ta2.is_dominant = true
    AND tmr.status = 'COMPLETED'
    AND tmr.deleted_at IS NULL
    AND ap.status = 'COMPLETED'
    AND ap.deleted_at IS NULL
) ta ON true
WHERE qs.deleted_at IS NULL
GROUP BY
  qs.faculty_id, qs.semester_id,
  qs.department_code_snapshot;
```

## Implementation Plan

### Tasks

#### Phase A: Database Infrastructure (no app dependencies)

- [x] **Task 1: Create materialized views migration**
  - File: `src/migrations/MigrationXXXXXXXXXXXX_analytics_matviews.ts`
  - Action: Create a MikroORM migration with raw SQL that:
    1. Creates covering index for LATERAL join performance: `CREATE INDEX idx_sr_submission_processed ON sentiment_result (submission_id, processed_at DESC) WHERE deleted_at IS NULL`
    2. Creates `mv_faculty_semester_stats` materialized view using the prototype query (with LATERAL joins for scope-proof sentiment/topic resolution). Granularity: one row per `(faculty, semester, department)`. `program_code_snapshot` and `campus_code_snapshot` are `MODE()` aggregates, not GROUP BY columns.
    3. Creates unique index `uq_mv_faculty_semester_stats` on `(faculty_id, semester_id, department_code_snapshot)` — required for `REFRESH CONCURRENTLY`. Composite key handles faculty teaching across multiple departments.
    4. Creates `mv_faculty_trends` materialized view that derives from `mv_faculty_semester_stats`:
       - JOINs to `semester` table and assigns ordinals via `ROW_NUMBER() OVER (PARTITION BY faculty_id, department_code_snapshot ORDER BY s.created_at)` — uses `semester.created_at` for chronological ordering instead of code string sorting
       - Computes `regr_slope(avg_normalized_score, ordinal)` and `regr_r2(avg_normalized_score, ordinal)` for quantitative trend
       - Computes `regr_slope(positive_rate, ordinal)` and `regr_r2(positive_rate, ordinal)` for sentiment trend (where `positive_rate = positive_count::float / NULLIF(analyzed_count, 0)`)
       - Includes `semester_count`, `latest_avg_normalized_score`, `latest_positive_rate`
       - Groups by `(faculty_id, department_code_snapshot)` — trends are per-faculty-per-department. `faculty_name_snapshot` is a `MODE()` aggregate (AR-2 fix)
    5. Creates unique index `uq_mv_faculty_trends` on `(faculty_id, department_code_snapshot)` — required for `REFRESH CONCURRENTLY`
    6. Creates indexes on `mv_faculty_semester_stats`: `(department_code_snapshot, semester_id)`
    7. Creates index on `mv_faculty_trends`: `(department_code_snapshot)`
    8. Down migration: `DROP MATERIALIZED VIEW IF EXISTS mv_faculty_trends; DROP MATERIALIZED VIEW IF EXISTS mv_faculty_semester_stats; DROP INDEX IF EXISTS idx_sr_submission_processed;`
  - Notes: `mv_faculty_trends` depends on `mv_faculty_semester_stats` — must be created after, dropped before. Refresh order: stats first, then trends.

#### Phase B: Queue Infrastructure

- [x] **Task 2: Add analytics refresh queue name constant**
  - File: `src/configurations/common/queue-names.ts`
  - Action: Add `ANALYTICS_REFRESH: 'analytics-refresh'` to the `QueueName` object

- [x] **Task 3: Register queue in AnalysisModule**
  - File: `src/modules/analysis/analysis.module.ts`
  - Action: Add `{ name: QueueName.ANALYTICS_REFRESH }` to the `BullModule.registerQueue()` call

- [x] **Task 4: Hook PipelineOrchestratorService to enqueue refresh after completion**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action:
    1. Add `@InjectQueue(QueueName.ANALYTICS_REFRESH) private readonly analyticsRefreshQueue: Queue` to constructor
    2. In `OnRecommendationsComplete()`, after setting `COMPLETED` status and flushing, add:
       ```typescript
       await this.analyticsRefreshQueue.add(
         QueueName.ANALYTICS_REFRESH,
         { pipelineId },
         {
           jobId: `${pipelineId}--analytics-refresh`,
           attempts: 3,
           backoff: { type: 'exponential', delay: 5000 },
         },
       );
       ```
    3. Wrap in try/catch — log warning on failure but do NOT fail the pipeline (refresh is best-effort)

- [x] **Task 5: Update PipelineOrchestratorService tests**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.spec.ts`
  - Action:
    1. Add mock for analytics refresh queue: `{ provide: getQueueToken(QueueName.ANALYTICS_REFRESH), useValue: { add: jest.fn() } }`
    2. Add test: "should enqueue analytics refresh job after recommendations complete"
    3. Add test: "should not fail pipeline if refresh enqueue fails" (mock `queue.add` to reject)

#### Phase C: Analytics Refresh Processor

- [x] **Task 6: Create AnalyticsRefreshProcessor**
  - File: `NEW: src/modules/analytics/processors/analytics-refresh.processor.ts`
  - Action: Create processor that:
    1. Extends `WorkerHost` (non-HTTP pattern, like RecommendationsProcessor)
    2. Decorated with `@Processor(QueueName.ANALYTICS_REFRESH, { concurrency: 1 })` — concurrency 1 to avoid concurrent refreshes (Postgres does not support concurrent `REFRESH CONCURRENTLY` on the same view)
    3. Injects `EntityManager`
    4. `process()` method executes in sequence:
       - `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats`
       - `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_trends` (must run after stats, since it derives from stats)
       - After both succeed, upsert `system_config` with key `analytics_last_refreshed_at` using MikroORM's `em.upsert(SystemConfig, { key: 'analytics_last_refreshed_at', value: new Date().toISOString() }, { onConflictFields: ['key'] })` — not raw SQL, since `SystemConfig` is a managed entity (F11 fix)
    5. Uses `em.getConnection().execute()` for raw SQL
    6. Logs refresh duration (measure start/end time)
    7. `@OnWorkerEvent('failed')` handler logs errors (does NOT call orchestrator — fully decoupled)
    8. If stats refresh fails, do NOT attempt trends refresh (stale data is better than inconsistent data)

- [x] **Task 7: Create AnalyticsRefreshProcessor tests**
  - File: `NEW: src/modules/analytics/processors/analytics-refresh.processor.spec.ts`
  - Action:
    1. Mock `EntityManager.getConnection().execute()`
    2. Test: "should refresh both materialized views in order"
    3. Test: "should refresh stats view before trends view" (verify call order)
    4. Test: "should propagate Postgres errors for BullMQ retry" (let errors throw, don't swallow)
    5. Test: "should upsert system_config with analytics_last_refreshed_at after successful refresh"
    6. Test: "should not attempt trends refresh if stats refresh fails"

#### Phase D: AnalyticsService (Query Layer)

- [x] **Task 8: Create analytics query DTOs**
  - File: `NEW: src/modules/analytics/dto/analytics-query.dto.ts`
  - Action: Create request DTOs with class-validator + Swagger decorators:
    - `DepartmentOverviewQueryDto`: `semesterId` (required UUID), `programCode` (optional string filter)
    - `AttentionListQueryDto`: `semesterId` (required UUID)
    - `FacultyTrendsQueryDto`: `semesterId` (optional UUID — used for scope resolution, falls back to latest semester if omitted), `minSemesters` (optional, default 3), `minR2` (optional, default 0.5)
  - File: `NEW: src/modules/analytics/dto/responses/department-overview.response.dto.ts`
  - Action: Create response DTOs:
    - `DepartmentOverviewResponseDto`: `summary` (totals, sentiment distribution), `faculty` (array of per-faculty stats with percentile ranks and semester deltas), `lastRefreshedAt` (string | null — from system_config)
    - `FacultySemesterStatsDto`: `facultyId`, `facultyName`, `departmentCode`, `submissionCount`, `commentCount`, `avgNormalizedScore`, `positiveCount`, `negativeCount`, `neutralCount`, `analyzedCount`, `topicCount`, `percentileRank`, `scoreDelta` (current `avg_normalized_score` minus previous semester's, null if no previous), `sentimentDelta` (current `positive_rate` minus previous semester's `positive_rate`, where `positive_rate = positive_count / analyzed_count`, null if no previous)
  - File: `NEW: src/modules/analytics/dto/responses/attention-list.response.dto.ts`
  - Action: Create response DTO:
    - `AttentionListResponseDto`: `items` (array of `AttentionItemDto`), `lastRefreshedAt` (string | null)
    - `AttentionItemDto`: `facultyId`, `facultyName`, `departmentCode`, `flags` (array of `AttentionFlagDto`), where each `AttentionFlagDto` contains: `type` ("declining_trend" | "quant_qual_gap" | "low_coverage"), `description` (human-readable string), `metrics` (object with flag-specific numbers — e.g., `{ scoreSlope: -0.3, scoreR2: 0.7 }` for declining_trend, `{ normalizedScore: 85, positiveRate: 0.4, divergence: 0.45 }` for quant_qual_gap, `{ analyzedCount: 5, submissionCount: 40, coverageRate: 0.125 }` for low_coverage)
  - File: `NEW: src/modules/analytics/dto/responses/faculty-trends.response.dto.ts`
  - Action: Create response DTO:
    - `FacultyTrendsResponseDto`: `items` (array of `FacultyTrendDto`), `lastRefreshedAt` (string | null)
    - `FacultyTrendDto`: `facultyId`, `facultyName`, `departmentCode`, `semesterCount`, `scoreSlope`, `scoreR2`, `sentimentSlope`, `sentimentR2`, `trendDirection` ("improving" | "declining" | "stable")

- [x] **Task 9: Create AnalyticsService**
  - File: `NEW: src/modules/analytics/analytics.service.ts`
  - Action: Create injectable service with:
    1. Constructor injects `EntityManager` and `ScopeResolverService`
    2. Define `ATTENTION_THRESHOLDS` constant:
       ```typescript
       const ATTENTION_THRESHOLDS = {
         MIN_ANALYZED_FOR_GAP: 10,
         QUANT_QUAL_DIVERGENCE: 0.2,
         MIN_SEMESTERS_FOR_TREND: 3,
         MIN_R2_FOR_TREND: 0.5,
       } as const;
       ```
    3. Private helper `GetLastRefreshedAt()`: queries `system_config` for key `analytics_last_refreshed_at`, returns `string | null`
    4. Private helper `ResolveDepartmentCodes(semesterId: string): Promise<string[] | null>` (F5 fix):
       - Calls `scopeResolver.ResolveDepartmentIds(semesterId)` to get UUIDs
       - If `null` (super admin), returns `null`
       - If `string[]`, queries: `SELECT DISTINCT code FROM department WHERE id = ANY($1) AND deleted_at IS NULL`
       - Returns `string[]` of department codes for use in matview `WHERE department_code_snapshot = ANY($N)`
    5. `GetDepartmentOverview(semesterId: string, query: DepartmentOverviewQueryDto)`:
       - Call `ResolveDepartmentCodes(semesterId)` for scope
       - Query `mv_faculty_semester_stats` with `WHERE semester_id = $1` + optional department code / program code filters
       - Compute `PERCENT_RANK() OVER (PARTITION BY department_code_snapshot ORDER BY avg_normalized_score)` at query time (not in the view)
       - Compute semester deltas by self-joining on `(faculty_id, department_code_snapshot)` with the previous semester. Previous semester determined by (F6 fix):
         ```sql
         LEFT JOIN mv_faculty_semester_stats prev
           ON prev.faculty_id = curr.faculty_id
           AND prev.department_code_snapshot = curr.department_code_snapshot
           AND prev.semester_id = (
             SELECT s2.id FROM semester s2
             WHERE s2.campus_id = (SELECT s1.campus_id FROM semester s1 WHERE s1.id = curr.semester_id)
               AND s2.created_at < (SELECT s1.created_at FROM semester s1 WHERE s1.id = curr.semester_id)
               AND s2.deleted_at IS NULL
             ORDER BY s2.created_at DESC LIMIT 1
           )
         ```
       - Aggregate summary: total faculty, total submissions, total analyzed, overall sentiment distribution
       - Include `lastRefreshedAt` from `GetLastRefreshedAt()`
       - Return `DepartmentOverviewResponseDto`
    6. `GetAttentionList(semesterId: string)`:
       - Call `ResolveDepartmentCodes(semesterId)` for scope
       - Query `mv_faculty_trends` for declining trends (`score_slope < 0` or `sentiment_slope < 0`) where `semester_count >= ATTENTION_THRESHOLDS.MIN_SEMESTERS_FOR_TREND` and `score_r2 >= ATTENTION_THRESHOLDS.MIN_R2_FOR_TREND`
       - Query `mv_faculty_semester_stats` for quant-qual gap: only for faculty with `analyzed_count >= ATTENTION_THRESHOLDS.MIN_ANALYZED_FOR_GAP`. Compute `(avg_normalized_score / 100.0) - (positive_count::float / NULLIF(analyzed_count, 0))` (F4 fix: `normalized_score` is 0-100 scale, divide by 100 to normalize to 0-1), flag if absolute divergence exceeds `ATTENTION_THRESHOLDS.QUANT_QUAL_DIVERGENCE`
       - Query `mv_faculty_semester_stats` for low coverage: `analyzed_count / submission_count < 0.5`
       - Merge and deduplicate faculty across flag types
       - Include `lastRefreshedAt`
       - Return `AttentionListResponseDto`
    7. `GetFacultyTrends(query: FacultyTrendsQueryDto)`:
       - Call `ResolveDepartmentCodes()` using `query.semesterId` if provided, otherwise fall back to latest semester: `SELECT id FROM semester ORDER BY created_at DESC LIMIT 1`
       - Query `mv_faculty_trends` with `WHERE semester_count >= $1 AND score_r2 >= $2` + department scope via `department_code_snapshot = ANY($N)`
       - Derive `trendDirection` from slope sign and R2 threshold
       - Include `lastRefreshedAt`
       - Return `FacultyTrendsResponseDto`
  - Notes: All queries use parameterized SQL via `em.getConnection().execute(sql, [params])`. Scope filtering uses the `ResolveDepartmentCodes()` helper which converts department UUIDs from `ScopeResolverService` to department code strings matching the matview's `department_code_snapshot` column.

- [x] **Task 10: Create AnalyticsService tests**
  - File: `NEW: src/modules/analytics/analytics.service.spec.ts`
  - Action:
    1. Mock `EntityManager` with `getConnection().execute()` returning shaped rows
    2. Mock `ScopeResolverService` — test `null` (super admin sees all) and `['dept-1']` (dean sees scoped)
    3. Test `GetDepartmentOverview`: correct SQL parameters, summary aggregation, percentile ranking, delta computation
    4. Test `GetAttentionList`: declining trends flagged, quant-qual gap flagged, low coverage flagged, deduplication
    5. Test `GetFacultyTrends`: minimum semester filter, R2 threshold, trend direction derivation
    6. Test edge cases: empty results (no data for semester), single semester (no deltas), dean with empty scope (returns empty)

#### Phase E: Controller & Module Wiring

- [x] **Task 11: Create AnalyticsController**
  - File: `NEW: src/modules/analytics/analytics.controller.ts`
  - Action: Create controller with:
    1. `@ApiTags('Analytics')`, `@Controller('analytics')`
    2. `@UseJwtGuard(UserRole.DEAN, UserRole.SUPER_ADMIN)`, `@UseInterceptors(CurrentUserInterceptor)`
    3. `GET /analytics/overview?semesterId=X&programCode=Y` → `GetDepartmentOverview`
    4. `GET /analytics/attention?semesterId=X` → `GetAttentionList`
    5. `GET /analytics/trends?minSemesters=3&minR2=0.5` → `GetFacultyTrends`
    6. All endpoints decorated with `@ApiOperation`, `@ApiResponse`, `@ApiQuery`

- [x] **Task 12: Create AnalyticsController tests**
  - File: `NEW: src/modules/analytics/analytics.controller.spec.ts`
  - Action: Mock `AnalyticsService`, verify delegation, DTO mapping, query parameter handling

- [x] **Task 13: Create AnalyticsModule**
  - File: `NEW: src/modules/analytics/analytics.module.ts`
  - Action:
    1. Import `CommonModule` (for `ScopeResolverService`)
    2. Import `BullModule.registerQueue({ name: QueueName.ANALYTICS_REFRESH })` — consumer side registration
    3. Register providers: `AnalyticsService`, `AnalyticsRefreshProcessor`
    4. Register controller: `AnalyticsController`

- [x] **Task 14: Register AnalyticsModule in application**
  - File: `src/modules/index.module.ts`
  - Action: Add `AnalyticsModule` to the `ApplicationModules` array

#### Phase F: Frontend Coordination

- [x] **Task 15: Create frontend UI/UX GitHub issue**
  - Repo: `CtrlAltElite-Devs/app.faculytics`
  - Action: Create issue with title "Analytics Dashboard — UI/UX Requirements from Backend Spec" containing:
    - Pipeline trigger placement (inline on faculty page + batch from department overview)
    - Confirmation UX pattern (lightweight inline with coverage warnings)
    - Attention-based dashboard layout (outliers first, not flat list)
    - API endpoints available: `/analytics/overview`, `/analytics/attention`, `/analytics/trends`
    - Response DTO shapes for frontend integration
    - Coverage gap visibility patterns

### Acceptance Criteria

#### Materialized Views

- [x] **AC 1:** Given the migration has been applied, when querying `mv_faculty_semester_stats`, then it returns one row per (faculty, semester, department) with correct submission_count, comment_count, avg_normalized_score, positive_count, negative_count, neutral_count, analyzed_count, and distinct_topic_count. A faculty teaching across multiple departments produces separate rows per department.

- [x] **AC 2:** Given submissions exist with sentiment results from multiple completed pipelines (different scopes), when the stats view is refreshed, then each submission's sentiment label is taken from its latest `processed_at` result via the LATERAL join — not from a single pipeline run.

- [x] **AC 3:** Given a faculty has data across 3+ semesters in `mv_faculty_semester_stats`, when `mv_faculty_trends` is refreshed, then it returns `regr_slope` and `regr_r2` values for both quantitative score and sentiment positive rate, with `semester_count >= 3`.

- [x] **AC 4:** Given `mv_faculty_trends` has a faculty with only 1-2 semesters of data, when queried, then `regr_slope` and `regr_r2` return NULL (Postgres behavior for insufficient data points).

- [x] **AC 5:** Given both materialized views exist with unique indexes, when `REFRESH MATERIALIZED VIEW CONCURRENTLY` is executed, then the refresh completes without blocking concurrent reads.

#### Analytics Refresh Queue

- [x] **AC 6:** Given a pipeline transitions to `COMPLETED` in `OnRecommendationsComplete()`, when the method finishes, then a job is enqueued on the `analytics-refresh` queue with `{ pipelineId }` payload and exponential backoff retry config.

- [x] **AC 7:** Given the analytics refresh queue add fails (Redis error), when `OnRecommendationsComplete()` runs, then the pipeline still transitions to `COMPLETED` — the refresh failure is logged as a warning, not propagated as a pipeline error.

- [x] **AC 8:** Given the AnalyticsRefreshProcessor receives a job, when it processes, then it executes `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats` followed by `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_trends` in that order.

- [x] **AC 9:** Given a Postgres transient error during view refresh, when the processor encounters it, then the error propagates to BullMQ for automatic retry (up to 3 attempts with exponential backoff).

#### Analytics Endpoints

- [x] **AC 10:** Given a dean user with CLS-resolved department scope, when `GET /analytics/overview?semesterId=X` is called, then the response includes only faculty within the dean's departments, with summary stats (total faculty, total submissions, sentiment distribution) and per-faculty rows with percentile ranks.

- [x] **AC 11:** Given a super admin user, when `GET /analytics/overview?semesterId=X` is called, then the response includes all faculty across all departments (no scope filtering).

- [x] **AC 12:** Given a dean user, when `GET /analytics/attention?semesterId=X` is called, then the response lists faculty flagged for: declining sentiment/score trends (slope < 0 with sufficient R2), quantitative-qualitative gap (high Likert but negative sentiment, only for faculty with `analyzed_count >= 10`), or low analysis coverage — each with human-readable flag descriptions.

- [x] **AC 13:** Given a faculty member with 3+ semesters of data and a negative `score_slope` with `score_r2 >= 0.5`, when `GET /analytics/trends` is called, then that faculty appears with `trendDirection: "declining"`.

- [x] **AC 14:** Given a user without DEAN or SUPER_ADMIN role, when any analytics endpoint is called, then a 403 Forbidden response is returned.

- [x] **AC 15:** Given no submissions exist for a semester, when `GET /analytics/overview?semesterId=X` is called, then the response returns empty arrays and zero-valued summary stats — not an error.

#### Semester Deltas

- [x] **AC 16:** Given a faculty has stats in both current and previous semester, when `GET /analytics/overview` returns per-faculty rows, then each row includes `scoreDelta` and `sentimentDelta` computed as (current - previous) values.

- [x] **AC 17:** Given a faculty has stats in only one semester (no previous), when `GET /analytics/overview` returns that faculty's row, then `scoreDelta` and `sentimentDelta` are null.

#### Data Freshness & Scope Resolution

- [x] **AC 18:** Given the analytics refresh processor has completed successfully, when any analytics endpoint is called, then the response includes `lastRefreshedAt` as a non-null ISO 8601 timestamp string sourced from the `system_config` table key `analytics_last_refreshed_at`.

- [x] **AC 19:** Given a dean user whose `ScopeResolverService.ResolveDepartmentIds()` returns department UUIDs, when any analytics endpoint is called, then the service resolves those UUIDs to `department.code` values via `SELECT DISTINCT code FROM department WHERE id = ANY($1)` and filters matview results by `department_code_snapshot = ANY(codes)`.

## Additional Context

### Dependencies

- Phase 3 (AI Pipeline) must be complete — materialized views aggregate pipeline outputs (`sentiment_result`, `topic_assignment`, `analysis_pipeline` tables must be populated).
- `ScopeResolverService` (ADR #21) already provides interim role-based filtering.
- No new npm packages required — `bullmq`, `@nestjs/bullmq`, `@mikro-orm/postgresql` already installed.
- Redis must be running for BullMQ queue operations (existing dependency).

### Frontend UI/UX Consideration

A GitHub issue will be created on `CtrlAltElite-Devs/app.faculytics` (Task 15) capturing the following UX decisions from the design discussion:

- **Pipeline trigger placement:** Inline on faculty drill-down page ("No analysis available. [Run Analysis]") + batch trigger from department overview ("3 of 15 faculty analyzed. [Analyze Remaining]")
- **Confirmation UX:** Lightweight inline confirmation showing coverage stats and warnings — no separate pipeline management page
- **Coverage visibility:** Department dashboard surfaces analyzed vs total faculty count
- **No dedicated pipeline management page** for deans — that's a super admin debugging tool if ever built
- **Attention-based dashboard:** Surface outliers first (declining trends, quant-qual gaps) rather than flat faculty lists

### Materialized View SQL Reference

#### Covering index for LATERAL join performance

```sql
-- F4: Prevents LATERAL subquery from scanning sentiment_result table repeatedly
CREATE INDEX idx_sr_submission_processed
  ON sentiment_result (submission_id, processed_at DESC)
  WHERE deleted_at IS NULL;
```

#### mv_faculty_semester_stats

```sql
-- Granularity: one row per (faculty, semester, department)
-- GROUP BY only contains key columns; all others are MODE() aggregates (F2/F3 fix)
-- topic_assignment uses LATERAL join through completed pipeline chain (F1 fix)
CREATE MATERIALIZED VIEW mv_faculty_semester_stats AS
SELECT
  qs.faculty_id,
  qs.semester_id,
  qs.department_code_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.department_name_snapshot) AS department_name_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.faculty_name_snapshot) AS faculty_name_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.semester_code_snapshot) AS semester_code_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.academic_year_snapshot) AS academic_year_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.program_code_snapshot) AS program_code_snapshot,
  MODE() WITHIN GROUP (ORDER BY qs.campus_code_snapshot) AS campus_code_snapshot,
  COUNT(DISTINCT qs.id) AS submission_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE qs.qualitative_comment IS NOT NULL) AS comment_count,
  ROUND(AVG(qs.normalized_score), 4) AS avg_normalized_score,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'positive') AS positive_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'negative') AS negative_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'neutral') AS neutral_count,
  COUNT(DISTINCT qs.id) FILTER (WHERE sr.label IS NOT NULL) AS analyzed_count,
  COUNT(DISTINCT ta.topic_id) AS distinct_topic_count
FROM questionnaire_submission qs
LEFT JOIN LATERAL (
  SELECT sr2.label
  FROM sentiment_result sr2
  JOIN sentiment_run srun ON srun.id = sr2.run_id
  JOIN analysis_pipeline ap ON ap.id = srun.pipeline_id
  WHERE sr2.submission_id = qs.id
    AND sr2.deleted_at IS NULL
    AND srun.status = 'COMPLETED'
    AND srun.deleted_at IS NULL
    AND ap.status = 'COMPLETED'
    AND ap.deleted_at IS NULL
  ORDER BY sr2.processed_at DESC
  LIMIT 1
) sr ON true
LEFT JOIN LATERAL (
  SELECT ta2.topic_id
  FROM topic_assignment ta2
  JOIN topic t ON t.id = ta2.topic_id
  JOIN topic_model_run tmr ON tmr.id = t.run_id
  JOIN analysis_pipeline ap ON ap.id = tmr.pipeline_id
  WHERE ta2.submission_id = qs.id
    AND ta2.deleted_at IS NULL
    AND ta2.is_dominant = true
    AND tmr.status = 'COMPLETED'
    AND tmr.deleted_at IS NULL
    AND ap.status = 'COMPLETED'
    AND ap.deleted_at IS NULL
) ta ON true
WHERE qs.deleted_at IS NULL
GROUP BY
  qs.faculty_id, qs.semester_id,
  qs.department_code_snapshot;

-- F1: Composite key handles faculty teaching across multiple departments
CREATE UNIQUE INDEX uq_mv_faculty_semester_stats
  ON mv_faculty_semester_stats (faculty_id, semester_id, department_code_snapshot);
CREATE INDEX idx_mv_fss_dept_semester
  ON mv_faculty_semester_stats (department_code_snapshot, semester_id);
```

#### mv_faculty_trends

```sql
-- F7: Uses semester.created_at for chronological ordering instead of code string sorting
-- Granularity: one row per (faculty, department) — trends computed across all semesters
CREATE MATERIALIZED VIEW mv_faculty_trends AS
SELECT
  sub.faculty_id,
  sub.department_code_snapshot,
  -- F2 fix: faculty_name_snapshot as MODE() to prevent unique index violation on name changes
  MODE() WITHIN GROUP (ORDER BY sub.faculty_name_snapshot) AS faculty_name_snapshot,
  COUNT(*) AS semester_count,
  (array_agg(sub.avg_normalized_score ORDER BY sub.ordinal DESC))[1] AS latest_avg_normalized_score,
  (array_agg(sub.positive_rate ORDER BY sub.ordinal DESC))[1] AS latest_positive_rate,
  regr_slope(sub.avg_normalized_score, sub.ordinal) AS score_slope,
  regr_r2(sub.avg_normalized_score, sub.ordinal) AS score_r2,
  regr_slope(sub.positive_rate, sub.ordinal) AS sentiment_slope,
  regr_r2(sub.positive_rate, sub.ordinal) AS sentiment_r2
FROM (
  SELECT
    fss.faculty_id,
    fss.department_code_snapshot,
    fss.faculty_name_snapshot,
    fss.avg_normalized_score,
    fss.positive_count::float / NULLIF(fss.analyzed_count, 0) AS positive_rate,
    ROW_NUMBER() OVER (
      PARTITION BY fss.faculty_id, fss.department_code_snapshot
      ORDER BY s.created_at
    ) AS ordinal
  FROM mv_faculty_semester_stats fss
  -- F10 fix: exclude soft-deleted semesters from trend computation
  JOIN semester s ON s.id = fss.semester_id AND s.deleted_at IS NULL
) sub
GROUP BY sub.faculty_id, sub.department_code_snapshot;

-- F1: Trends are per-faculty-per-department
CREATE UNIQUE INDEX uq_mv_faculty_trends
  ON mv_faculty_trends (faculty_id, department_code_snapshot);
CREATE INDEX idx_mv_ft_dept
  ON mv_faculty_trends (department_code_snapshot);
```

### Testing Strategy

**AnalyticsRefreshProcessor tests** (`analytics-refresh.processor.spec.ts`):

- Mock `EntityManager.getConnection().execute()` to verify correct SQL is called
- Test: refreshes stats view before trends view (call order assertion)
- Test: Postgres transient errors propagate for BullMQ retry
- Pattern: `useFactory` with direct instantiation (like `recommendations.processor.spec.ts`)

**AnalyticsService tests** (`analytics.service.spec.ts`):

- Mock `em.getConnection().execute()` to return pre-shaped row data
- Mock `ScopeResolverService.ResolveDepartmentIds()` — test `null` (super admin) and `string[]` (dean)
- Verify SQL parameterization (no string interpolation for scope filters)
- Test each method: `GetDepartmentOverview`, `GetAttentionList`, `GetFacultyTrends`
- Edge cases: empty results, single semester, dean with empty scope

**AnalyticsController tests** (`analytics.controller.spec.ts`):

- Mock `AnalyticsService` methods
- Verify delegation, DTO mapping, query parameter handling
- Pattern: follows `analysis.controller.spec.ts`

**PipelineOrchestratorService test update** (`pipeline-orchestrator.service.spec.ts`):

- Add mock for analytics refresh queue via `getQueueToken(QueueName.ANALYTICS_REFRESH)`
- Test: refresh enqueued after `OnRecommendationsComplete()`
- Test: pipeline not failed if refresh enqueue errors

### Notes

- **Refresh order matters:** `mv_faculty_trends` derives from `mv_faculty_semester_stats`. The processor must refresh stats first, then trends. If stats refresh fails, trends should not be refreshed (stale data is better than inconsistent data).
- **Semester ordering (F7 fix):** Trends view uses `semester.created_at` via JOIN instead of sorting `semester_code_snapshot` strings. This is robust against different campus code formats.
- **Concurrency 1 for refresh processor:** Prevents concurrent `REFRESH CONCURRENTLY` on the same view, which Postgres does not support and would error.
- **No new pipeline statuses:** `PipelineStatus` enum and the `analysis_pipeline.status` CHECK constraint remain unchanged.
- **Multi-department faculty (F1 fix):** Faculty teaching common subjects (English, PE) across departments produce separate stats rows per department. This is intentional — each dean sees only their department's evaluations. The unique index is `(faculty_id, semester_id, department_code_snapshot)`.
- **Scope resolution for trends (F2 fix):** The trends endpoint accepts an optional `semesterId` for scope resolution. If omitted, it falls back to the latest semester. No new `ScopeResolverService` method needed.
- **Attention thresholds (F5 fix):** All thresholds are consolidated in a single `ATTENTION_THRESHOLDS` constant in `AnalyticsService`. The quant-qual gap check requires a minimum of 10 analyzed submissions to avoid false positives from small sample sizes.
- **Staleness tracking (F3/F6 fix):** The refresh processor upserts `system_config` with `analytics_last_refreshed_at` after successful refresh. All response DTOs include `lastRefreshedAt` so the frontend can display data freshness. On first deploy with no data, this is `null`.
- **LATERAL join performance (F4 fix):** A covering index `(submission_id, processed_at DESC) WHERE deleted_at IS NULL` on `sentiment_result` ensures the LATERAL subquery is an index-only scan.
- **Dual queue registration (F7):** The `ANALYTICS_REFRESH` queue is registered in both `AnalysisModule` (producer — PipelineOrchestratorService enqueues) and `AnalyticsModule` (consumer — AnalyticsRefreshProcessor processes). This is intentional and standard for NestJS BullMQ producer/consumer separation. `BullModule.registerQueue()` is idempotent; both modules share the same Redis connection from `BullModule.forRoot()` in `index.module.ts`.
- **No pagination for v1 (F9):** Analytics endpoints return unbounded arrays. This is acceptable for UC's scale: deans see 10-30 faculty per department (naturally bounded by scope). Super admins see all faculty (~100-200 for a single university). If response sizes become a concern, add `limit`/`offset` query params in a follow-up. Not blocking for v1.
- **Future enhancement:** Topic distribution view (per-faculty topic frequency + sentiment breakdown) can be added as a third materialized view without changing the existing infrastructure.

### Pre-Mortem Findings Applied

| ID  | Severity | Finding                                                                                                           | Resolution                                                                                                                                                                                                             |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | CRITICAL | Unique index `(faculty_id, semester_id)` conflicts with multi-department faculty (English, PE across departments) | Composite key `(faculty_id, semester_id, department_code_snapshot)`. `program_code_snapshot` and `campus_code_snapshot` changed to `MODE()` aggregates. Trends view keyed on `(faculty_id, department_code_snapshot)`. |
| F2  | HIGH     | `ScopeResolverService` has no cross-semester method for trends endpoint                                           | Trends endpoint accepts optional `semesterId`, falls back to latest semester for scope resolution                                                                                                                      |
| F3  | HIGH     | Empty views on first deploy — blank dashboards                                                                    | `lastRefreshedAt` field added to all response DTOs, sourced from `system_config`                                                                                                                                       |
| F4  | MEDIUM   | LATERAL join performance degrades as data grows                                                                   | Covering index on `sentiment_result(submission_id, processed_at DESC)` in migration                                                                                                                                    |
| F5  | MEDIUM   | Quant-qual gap false positives with low sample sizes                                                              | `ATTENTION_THRESHOLDS.MIN_ANALYZED_FOR_GAP = 10` minimum before computing gap                                                                                                                                          |
| F6  | MEDIUM   | Refresh job silent failure — stale data goes unnoticed                                                            | Merged with F3 — refresh processor upserts `system_config` timestamp after success                                                                                                                                     |
| F7  | LOW      | `semester_code_snapshot` string sorting may not be chronological                                                  | Trends view uses `semester.created_at` JOIN for ordinal assignment                                                                                                                                                     |

### Adversarial Review Findings Applied

| ID    | Severity | Validity | Finding                                                                                | Resolution                                                                                                                    |
| ----- | -------- | -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| AR-1  | Critical | Real     | `topic_assignment` JOIN not scope-proofed — includes topics from failed pipelines      | Added LATERAL join through `topic_assignment -> topic -> topic_model_run -> analysis_pipeline` filtering by completed status  |
| AR-2  | High     | Real     | `faculty_name_snapshot` in trends GROUP BY breaks unique index on name changes         | Changed to `MODE()` aggregate; GROUP BY reduced to `(faculty_id, department_code_snapshot)`                                   |
| AR-3  | Medium   | Real     | `department_name_snapshot` + other snapshot columns in stats GROUP BY create same risk | All non-key columns changed to `MODE()` aggregates; GROUP BY reduced to `(faculty_id, semester_id, department_code_snapshot)` |
| AR-4  | High     | Real     | `max_possible_score` undefined in quant-qual gap formula                               | Replaced with literal `100.0` — `normalized_score` confirmed as 0-100 scale                                                   |
| AR-5  | High     | Real     | Department UUID-to-code mapping hand-waved                                             | Added explicit `ResolveDepartmentCodes()` helper method with concrete SQL                                                     |
| AR-6  | Medium   | Real     | "Previous semester" ordering undefined; campus-scoped semesters complicate it          | Added campus-scoped self-join SQL pattern using `semester.created_at` ordering                                                |
| AR-7  | Medium   | Noise    | Cross-module queue registration unprecedented                                          | Documented as intentional NestJS BullMQ pattern in Notes                                                                      |
| AR-8  | Low      | Noise    | `deleted_at` varchar type confusing                                                    | No change — works correctly, purely cosmetic                                                                                  |
| AR-9  | Medium   | Real     | No pagination on endpoints                                                             | Documented as acceptable for UC scale; defer pagination to follow-up                                                          |
| AR-10 | Low      | Real     | `semester.deleted_at` filter missing from trends view JOIN                             | Added `AND s.deleted_at IS NULL` to JOIN condition                                                                            |
| AR-11 | Low      | Real     | `system_config` upsert SQL not provided                                                | Changed to MikroORM `em.upsert()` since `SystemConfig` is a managed entity                                                    |
