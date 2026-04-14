# Analytics Module

The `AnalyticsModule` provides pre-computed faculty performance analytics via PostgreSQL materialized views. It serves dean and super admin dashboards with department overviews, attention lists, and trend analysis.

## Module Structure

```
src/modules/analytics/
  analytics.module.ts
  analytics.controller.ts
  analytics.service.ts
  dto/
    analytics-query.dto.ts
    responses/
      department-overview.response.dto.ts
      attention-list.response.dto.ts
      faculty-trends.response.dto.ts
  processors/
    analytics-refresh.processor.ts
```

**Dependencies:** `CommonModule` (for `ScopeResolverService`), `DataLoaderModule` (for `CurrentUserInterceptor`), BullMQ (`analytics-refresh` queue).

## Materialized Views

Two materialized views pre-aggregate submission, sentiment, and topic data for fast dashboard queries. Both support `REFRESH CONCURRENTLY` via unique indexes.

### `mv_faculty_semester_stats`

One row per `(faculty_id, semester_id, department_code_snapshot)`. Aggregates:

| Column                            | Source                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `submission_count`                | `COUNT(DISTINCT submission)` per faculty/semester                                                               |
| `comment_count`                   | Submissions with non-null `qualitative_comment`                                                                 |
| `avg_normalized_score`            | `AVG(normalized_score)` rounded to 4 decimals                                                                   |
| `positive/negative/neutral_count` | Sentiment labels from the latest completed pipeline's `SentimentResult`                                         |
| `analyzed_count`                  | Submissions with a sentiment label                                                                              |
| `distinct_topic_count`            | Distinct dominant topic assignments from completed pipelines (CTE)                                              |
| Snapshot fields                   | `faculty_name`, `department_name`, `semester_code`, `academic_year`, `program_code`, `campus_code` via `MODE()` |

The sentiment label is resolved via a `LATERAL` subquery that picks the most recent `sentiment_result` from a completed pipeline, using the `idx_sr_submission_processed` covering index.

Topic counts use a separate CTE (`topic_counts`) joined back to the main query to avoid `LATERAL` fan-out inflating `AVG()`.

### `mv_faculty_trends`

One row per `(faculty_id, department_code_snapshot)` across all semesters. Computes linear regression over time:

| Column                             | Description                                              |
| ---------------------------------- | -------------------------------------------------------- |
| `semester_count`                   | Number of semesters with data                            |
| `latest_avg_normalized_score`      | Most recent semester's score                             |
| `latest_positive_rate`             | Most recent semester's positive ratio                    |
| `score_slope` / `score_r2`         | Linear regression of `avg_normalized_score` over ordinal |
| `sentiment_slope` / `sentiment_r2` | Linear regression of `positive_rate` over ordinal        |

Ordinal is computed via `ROW_NUMBER()` partitioned by faculty+department, ordered by `semester.created_at`. The view depends on `mv_faculty_semester_stats`.

## Refresh Mechanism

Materialized views are refreshed asynchronously after each analysis pipeline completes:

```
Pipeline COMPLETED → PipelineOrchestratorService.OnRecommendationsComplete()
                   → enqueue 'analytics-refresh' job (best-effort)
                   → AnalyticsRefreshProcessor
                     1. REFRESH CONCURRENTLY mv_faculty_semester_stats
                     2. REFRESH CONCURRENTLY mv_faculty_trends
                     3. Upsert 'analytics_last_refreshed_at' in system_config
```

The refresh is **decoupled from the pipeline lifecycle** — the pipeline is marked `COMPLETED` before the refresh job is enqueued. If the refresh job fails (e.g., Redis down), the pipeline status is unaffected. The refresh job uses a fixed `jobId` (`{pipelineId}--analytics-refresh`) for deduplication, with 3 retry attempts and exponential backoff.

All responses include `lastRefreshedAt` so the frontend can display data freshness.

## REST Endpoints

All endpoints require `DEAN` or `SUPER_ADMIN` role. Dean scope is enforced via `ScopeResolverService` (resolved to department codes).

| Method | Path                   | Query Params                           | Description                                       |
| ------ | ---------------------- | -------------------------------------- | ------------------------------------------------- |
| GET    | `/analytics/overview`  | `semesterId` (required), `programCode` | Department overview with per-faculty stats        |
| GET    | `/analytics/attention` | `semesterId` (required), `programCode` | Faculty flagged for review with attention flags   |
| GET    | `/analytics/trends`    | `semesterId`, `minSemesters`, `minR2`  | Faculty trend data with linear regression results |

`programCode` on both `overview` and `attention` is trimmed, required non-empty, and capped at 20 characters.

### Department Overview (`/analytics/overview`)

Returns per-faculty stats for a semester with computed fields:

- `percentileRank` — within-department percentile via `PERCENT_RANK()` window function
- `scoreDelta` — difference from previous semester's `avg_normalized_score`
- `sentimentDelta` — difference in positive rate from previous semester
- `summary` — aggregate counts across all faculty in scope

Previous semester is determined by `campus_id` match and `created_at` ordering.

### Attention List (`/analytics/attention`)

Identifies faculty requiring review based on three flag types:

| Flag Type         | Trigger                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `declining_trend` | Negative `score_slope` or `sentiment_slope` with R^2 >= 0.5 over >= 3 semesters                                           |
| `quant_qual_gap`  | Divergence > 0.2 between normalized score (quantitative) and positive rate (qualitative), with >= 10 analyzed submissions |
| `low_coverage`    | Less than 50% of submissions have sentiment analysis results                                                              |

A faculty member can have multiple flags. Thresholds are defined in `ATTENTION_THRESHOLDS` constants.

### Faculty Trends (`/analytics/trends`)

Returns faculty with sufficient data for trend analysis, ordered by `score_slope` ascending (worst trends first). Each item includes a computed `trendDirection` (`improving`, `declining`, `stable`) based on slope sign and R^2 significance.

Falls back to the latest semester for scope resolution when `semesterId` is omitted.

## Scope Resolution

Unlike `FacultyModule` and `CurriculumModule` which resolve to department UUIDs, the `AnalyticsService` resolves to **department codes** (via `ResolveDepartmentCodes()`). This is because the materialized views use `department_code_snapshot` (a string snapshot from submission time) rather than foreign key references to the live department table.

### Program-Level Scope Check

When callers pass `programCode` on `overview` or `attention`, the service validates it against `ScopeResolverService.ResolveProgramCodes(semesterId)`:

- `null` (super admin / dean) — any `programCode` accepted.
- `string[]` (chairperson) — `programCode` must be in the list.
- Out-of-scope requests **do not 403**. They short-circuit and return a well-formed empty payload with `lastRefreshedAt` populated.

The silent short-circuit avoids leaking existence information (a 403 tells the caller "that program exists but you can't see it"; an empty result does not). Chairpersons already cannot enumerate programs outside their scope via `/curriculum/programs` — that endpoint applies the same `ResolveProgramIds` filter.

`GetAttentionList` adds `AND program_code_snapshot = ?` to the `mv_faculty_semester_stats` source of the consistency-gap and skipped-signals subqueries. The trend-based signal joins `mv_faculty_trends` against `mv_faculty_semester_stats` on `(faculty_id, department_code_snapshot)` so trend rows can be filtered by the per-semester program snapshot — trend rows are not scoped to a single program by themselves.
