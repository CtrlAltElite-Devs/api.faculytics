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

## Faculty Report Endpoints

A separate set of endpoints serves the per-faculty evaluation report — they read live submission/answer data rather than the materialized views and are the only analytics endpoints that allow the FACULTY role.

| Method | Path                                                | Required query                                                                                         | Description                                                                                                           |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/analytics/faculty/:facultyId/report`              | `semesterId`, `questionnaireTypeCode` (+ optional `courseId`)                                          | Per-section/question averages, dimension averages, overall rating                                                     |
| GET    | `/analytics/faculty/:facultyId/report/comments`     | `semesterId`, `questionnaireTypeCode` (+ optional `courseId`, `page`, `limit`, `sentiment`, `themeId`) | Paginated qualitative comments with sentiment and theme annotations                                                   |
| GET    | `/analytics/faculty/:facultyId/overview`            | `semesterId` (+ optional `courseId`)                                                                   | Composite overall rating across all 3 questionnaire types (50/25/25) with per-track contributions and coverage status |
| GET    | `/analytics/faculty/:facultyId/qualitative-summary` | `semesterId`, `questionnaireTypeCode` (+ optional `courseId`)                                          | Aggregated sentiment distribution + ranked themes with sample quotes                                                  |
| GET    | `/analytics/faculty/:facultyId/questionnaire-types` | `semesterId`                                                                                           | Questionnaire types that have submissions for this faculty/semester                                                   |

### Faculty Self-View Authorization

Class-level `@UseJwtGuard(DEAN, CHAIRPERSON, CAMPUS_HEAD, SUPER_ADMIN)` restricts the controller, but each faculty endpoint widens with a method-level `@UseJwtGuard(... , FACULTY)` and then calls `assertFacultySelfScope(currentUser, facultyId)`. FACULTY may only request their own `facultyId` — any other id throws `ForbiddenException`. Non-FACULTY roles are unaffected by the helper.

### Composite Overall Rating

`GET /api/v1/analytics/faculty/:facultyId/overview?semesterId=X[&courseId=Z]` returns a single composite rating that weights the three faculty questionnaire types:

| Code                       | Weight |
| -------------------------- | ------ |
| `FACULTY_FEEDBACK`         | 0.50   |
| `FACULTY_OUT_OF_CLASSROOM` | 0.25   |
| `FACULTY_IN_CLASSROOM`     | 0.25   |

Roles: `DEAN`, `CHAIRPERSON`, `CAMPUS_HEAD`, `SUPER_ADMIN`, and `FACULTY` (self-only via `assertFacultySelfScope`). Example URLs:

```
GET /api/v1/analytics/faculty/<facultyId>/overview?semesterId=<semesterId>
GET /api/v1/analytics/faculty/<facultyId>/overview?semesterId=<semesterId>&courseId=<courseId>
```

**Computation** — the composite reuses `AnalyticsService.GetFacultyReportUnscoped()` once per canonical questionnaire type inside a single `em.transactional()` block so per-type ratings are snapshot-consistent and numerically identical to what `/report` returns. There is no duplicate aggregation path.

**Formula (non-null composite cases)**:

```
composite.rating = round2(Σ non-null contribution[i])
contribution[i]  = round2(rating[i] × effectiveWeight[i])
effectiveWeight  = weight (FULL) or weight / coverageWeight (PARTIAL / FEEDBACK_ONLY)
```

`round2` is the shared 2-decimal rounding util in `lib/composite-rating.constants.ts`. `BuildFacultyReportData` uses the same util so composite and per-type numbers never drift by rounding.

**Coverage status** — keyed on `rating !== null` per type (not `submissionCount`). `presentTypes = {t : rating(t) !== null}`, `coverageWeight = Σ weight(t) for t ∈ presentTypes`:

| `coverageStatus`      | Condition                                                          | Composite                    |
| --------------------- | ------------------------------------------------------------------ | ---------------------------- |
| `FULL`                | All three types present (coverageWeight = 1.00)                    | `round2(Σ contribution[i])`  |
| `PARTIAL`             | FEEDBACK + ≥1 of {IN, OUT} but not all three (coverageWeight 0.75) | `round2(Σ contribution[i])`  |
| `PARTIAL_NO_FEEDBACK` | IN + OUT present, FEEDBACK missing (coverageWeight 0.50)           | **`null`** (Dean-respecting) |
| `FEEDBACK_ONLY`       | Only FEEDBACK present (coverageWeight 0.50)                        | `round2(rating_FEEDBACK)`    |
| `INSUFFICIENT`        | Only one of {IN, OUT} present (coverageWeight 0.25)                | `null`                       |
| `NO_DATA`             | No type has `rating !== null`                                      | `null`                       |

`PARTIAL_NO_FEEDBACK` returns `null` because replacing the Dean-specified 50% FEEDBACK weighting with `mean(r_IN, r_OUT)` would silently invert the approved weighting scheme. The popover still shows IN + OUT ratings for transparency and the coverage banner explains the gap.

**`courseId` propagation** — when `?courseId=` is passed, the composite forwards it into every per-type `GetFacultyReportUnscoped` call so the composite and the per-type `/report` strip always reflect the same scope filter on the same page.

**Chain-of-rounding invariant**: `composite.rating === round2(Σ non-null contribution[i])`. The popover's visible sum equals the visible composite. An asserting parity unit test (`analytics.service.spec.ts`) fails CI if this invariant drifts or if any per-type rating diverges from `GetFacultyReportUnscoped.overallRating`.

**Response shape** — see `FacultyOverviewResponseDto` in `dto/responses/faculty-overview.response.dto.ts`. `contributions` is always length 3 in canonical order (FEEDBACK, OUT, IN). Missing types appear with `rating: null, effectiveWeight: 0, contribution: null` and `submissionCount` preserved (frontend uses `submissionCount > 0 && rating === null` to display `"No scored data"` rather than `"No submissions"`).

**Known limitation (V1)**: PDF exports still show per-track ratings only — the dashboard button carries a tooltip noting this. Adding the composite block to PDF is tracked as a named fast-follow.

### Quantitative Distributions

`GET /analytics/faculty/:facultyId/report` returns three quantitative shapes computed in-memory from a single per-question aggregation query:

- `sections[].questions[].ratingCounts: Record<string, number>` — counts keyed by raw numeric value (`"1".."5"` for Likert-5, `"0"/"1"` for YES_NO). Bucketed by raw value, not by interpretation label.
- `sections[].responseCount` — total answered responses summed across the section's questions.
- `dimensions[]: { code, displayName, average, responseCount, interpretation }` — response-count-weighted averages grouped by the schema's `dimensionCode`. Display names resolve against the `Dimension` registry.

Dimension display names come from the registry rather than the schema so that a future questionnaire revision keeps the same dimension labels (and the registry is the canonical source for dimension copy).

### Qualitative Summary

`GET /analytics/faculty/:facultyId/qualitative-summary` returns:

```typescript
{
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  }
  themes: Array<{
    themeId: string;
    label: string;
    count: number;
    sentimentSplit: { positive; neutral; negative };
    sampleQuotes?: string[]; // up to 3, PII-scrubbed, length-capped
  }>;
}
```

Sample quotes are truncated to ~280 characters and run through name redaction before being returned. Themes are ranked by `count` desc.

### Comments Filtering

`GET /analytics/faculty/:facultyId/report/comments` accepts optional `sentiment` (`positive | neutral | negative`) and `themeId` filters. Each row in the response is annotated with its `sentiment` label and `themeIds[]`. The `themeId` filter matches on the comment's **dominant** theme assignment.

## Voice Breakdown & Facet Tagging

When a pipeline aggregates multiple questionnaire types into one analysis (DEPARTMENT or CAMPUS scope), each `RecommendedAction` is tagged with a `facet` to help readers attribute the recommendation back to a primary questionnaire dimension.

| Questionnaire code         | Facet             |
| -------------------------- | ----------------- |
| `FACULTY_FEEDBACK`         | `facultyFeedback` |
| `FACULTY_IN_CLASSROOM`     | `inClassroom`     |
| `FACULTY_OUT_OF_CLASSROOM` | `outOfClassroom`  |
| anything else / mixed      | `overall`         |

`RecommendationGenerationService.deriveFacetFromTypeCodeCounts()` counts how many of an action's contributing submissions came from each primary questionnaire-type code. The top code is assigned only when its share is `≥ FACET_DOMINANCE_THRESHOLD` (currently `0.6`); below that, the action falls back to `overall`. The threshold is intentionally a code constant (no env flag) — tuning it is a code-review decision because it changes evidence semantics.

Pipeline status responses also surface a per-facet `voiceBreakdown` (counts of contributing submissions per questionnaire code) so the frontend can render attribution alongside the action list.

### Faculty Self-View Redaction

`AnalysisAccessService.RedactIfFacultySelfView()` strips `sampleQuotes[]` from every `TopicSource` in `recommendations.actions[].supportingEvidence.sources` when the requester is a FACULTY user reading their **own** pipeline. Non-faculty roles see the full payload; ownership is determined by `pipeline.faculty.id === requester.id`. Adding any new endpoint that returns verbatim student text must call this helper or implement equivalent redaction.
