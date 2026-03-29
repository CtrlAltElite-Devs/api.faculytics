---
title: 'Per-Question Faculty Evaluation Report API'
slug: 'per-question-faculty-report'
created: '2026-03-27'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [NestJS, MikroORM, PostgreSQL, class-validator, class-transformer, Swagger]
files_to_modify:
  - src/modules/analytics/analytics.controller.ts
  - src/modules/analytics/analytics.service.ts
  - src/modules/analytics/dto/analytics-query.dto.ts
  - src/modules/analytics/dto/responses/faculty-report.response.dto.ts (new)
  - src/modules/analytics/dto/responses/faculty-report-comments.response.dto.ts (new)
  - src/modules/analytics/lib/interpretation.util.ts (new)
  - src/modules/analytics/analytics.controller.spec.ts
  - src/modules/analytics/analytics.service.spec.ts
  - src/modules/analytics/lib/interpretation.util.spec.ts (new)
code_patterns:
  - Raw SQL via em.getConnection().execute() for aggregation queries
  - ScopeResolverService.ResolveDepartmentIds() for role-based authorization
  - '@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.SUPER_ADMIN)'
  - class-validator decorators for query DTOs (IsUUID, IsString, IsOptional, Type)
  - '@ApiProperty() / @ApiPropertyOptional() for response DTOs'
  - PaginationQueryDto extends for paginated endpoints
  - PaginationMeta for pagination response metadata
  - Absolute imports (src/...) not relative
test_patterns:
  - NestJS TestingModule with jest.fn() mocks
  - Controller tests verify delegation to service
  - Service tests mock em.getConnection().execute() and verify SQL params
  - Pure function tests for utility functions
---

# Tech-Spec: Per-Question Faculty Evaluation Report API

**Created:** 2026-03-27

## Overview

### Problem Statement

No endpoint serves per-question score breakdowns grouped by questionnaire dimensions. Deans cannot generate the standard Faculty Evaluation Report that displays per-question averages, section scores, overall weighted rating, and interpretation labels. The existing materialized views (`mv_faculty_semester_stats`, `mv_faculty_trends`) only aggregate at the faculty+semester level with no per-question or per-dimension breakdown.

### Solution

Two new endpoints on the analytics controller:

1. **Report endpoint** — returns the scored report with sections, questions, per-question averages, section averages, overall weighted rating, and interpretation labels. Uses live SQL aggregation on `questionnaire_answer` with schema resolution from `QuestionnaireVersion.schemaSnapshot`.
2. **Comments endpoint** — returns paginated qualitative comments from `QuestionnaireSubmission.qualitativeComment`.

### Scope

**In Scope:**

- `GET /analytics/faculty/:facultyId/report` — scored report (sections, questions, averages, interpretations, overall weighted rating)
- `GET /analytics/faculty/:facultyId/report/comments` — paginated qualitative comments
- Query parameter DTOs with class-validator validation
- Response DTOs with Swagger decorators
- Interpretation scale utility (hardcoded 5-tier scale)
- Scope-based authorization via `ScopeResolverService`

**Out of Scope:**

- Materialized views / caching for per-question stats
- Response rate / enrollment count
- Comment sentiment enrichment or topic tags in report
- "N/A" / noise filtering logic for comments
- Per-version grouping (uses latest active version schema as canonical)

## Context for Development

### Codebase Patterns

1. **Raw SQL aggregation** — existing analytics service uses `this.em.getConnection().execute(sql, params)` for all mat view queries. Per-question aggregation follows the same pattern with a live `GROUP BY` on `questionnaire_answer`.
2. **Scope resolution** — `ScopeResolverService.ResolveDepartmentIds(semesterId)` returns `null` (super admin, unrestricted) or `string[]` (department UUIDs). Existing service converts these to department codes for SQL `WHERE` clauses. This feature needs to validate that `facultyId` belongs to an accessible department.
3. **Schema snapshot resolution** — `QuestionnaireVersion.schemaSnapshot` contains the full section/question hierarchy as `SectionNode[]` (recursive). Leaf sections have `weight` and `questions[]`. Non-leaf sections have nested `sections[]`. The service must flatten this tree to build a `questionId → {text, order, sectionId, sectionTitle, weight, dimensionCode}` lookup map. **Only leaf sections** (those with `questions[]`) appear in the report — parent sections are structural grouping only.
4. **Response DTOs** — nested DTO classes with `@ApiProperty()` decorators. Nullable fields use `@ApiPropertyOptional({ type: X, nullable: true })`. No validation decorators on response DTOs.
5. **Query DTOs** — class-validator decorators (`@IsUUID()`, `@IsString()`, `@IsOptional()`, `@Type(() => Number)`). Existing `PaginationQueryDto` in `src/modules/common/dto/pagination-query.dto.ts` provides `page` (default 1) and `limit` (default 10, max 100).
6. **Controller guards** — `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.SUPER_ADMIN)` on all analytics endpoints.

### Files to Reference

| File                                                    | Purpose                                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/modules/analytics/analytics.controller.ts`         | Add 2 new endpoint methods                                                                   |
| `src/modules/analytics/analytics.service.ts`            | Add report + comments service methods                                                        |
| `src/modules/analytics/dto/analytics-query.dto.ts`      | Add FacultyReportQueryDto, FacultyReportCommentsQueryDto                                     |
| `src/modules/analytics/dto/responses/`                  | Existing response DTOs — pattern reference                                                   |
| `src/entities/questionnaire-answer.entity.ts`           | Source table: questionId, sectionId, dimensionCode, numericValue                             |
| `src/entities/questionnaire-submission.entity.ts`       | Join table: faculty, semester, course, questionnaireVersion, qualitativeComment, submittedAt |
| `src/entities/questionnaire-version.entity.ts`          | Schema source: schemaSnapshot JSON                                                           |
| `src/modules/questionnaires/lib/questionnaire.types.ts` | TypeScript interfaces: QuestionnaireSchemaSnapshot, SectionNode, QuestionNode                |
| `src/entities/user.entity.ts`                           | Faculty scope check: user.department_id FK                                                   |
| `src/entities/semester.entity.ts`                       | Metadata query: code, label, academic_year                                                   |
| `src/modules/common/services/scope-resolver.service.ts` | Authorization: ResolveDepartmentIds()                                                        |
| `src/modules/common/dto/pagination-query.dto.ts`        | Reusable pagination: page, limit with class-validator                                        |
| `src/modules/common/dto/pagination.dto.ts`              | PaginationMeta response class                                                                |

### Technical Decisions

1. **Live query over materialized view** — submission counts are bounded per faculty/semester (~hundreds of rows). Live `GROUP BY` is sufficient. Note: `questionnaire_answer` currently has no secondary indexes (`submission_id`, `question_id`, `section_id` are all unindexed). The `questionnaire_submission` table has a composite index on `(faculty_id, semester_id)` which will be used for the join filter. For the bounded cardinality expected (~hundreds of answers per faculty/semester), the query will perform acceptably without answer-table indexes. If performance becomes an issue at scale, add indexes on `questionnaire_answer(submission_id)` via migration.
2. **Highest version number as canonical schema** — mid-semester versioning is rare. Question IDs are stable keys. Among all ACTIVE or DEPRECATED versions with submissions for the target faculty+semester, the one with the highest `version_number` is used as the canonical schema for display. DRAFT and ARCHIVED versions are excluded (DRAFT may have incomplete schemas; ARCHIVED versions are retired). Answers with orphaned `questionId`s (from prior versions) won't match the canonical schema and are excluded.
3. **Hardcoded interpretation scale** — the university's 5-tier scale maps to their accreditation framework and changes rarely. A utility function with a simple range check. No database configuration needed.
4. **Raw `qualitativeComment`** — `cleanedComment` is NLP-preprocessed for sentiment analysis, not meant for human display. Deans expect verbatim student remarks.
5. **`ScopeResolverService` for authorization** — same pattern as existing analytics endpoints. Deans see their department only, super admins see all.
6. **Separate comments endpoint** — different access patterns (fixed-size report vs unbounded paginated comments), different tables, different refresh rates. No coupling.
7. **Schema flattening in service layer** — parse `schemaSnapshot.sections` recursively to build a flat `Map<questionId, QuestionMeta>` lookup. This runs once per request on a small JSON structure (~50 questions). No caching needed.
8. **Faculty scope validation** — query the `user` table for the target `facultyId` and check `user.department_id IN (scopedDepartmentIds)`. This validates scope via the user's department assignment, not via submissions — so a faculty member with zero submissions is still accessible (returns empty report) rather than getting a 403. If `ScopeResolverService` returns `null` (super admin), skip the check entirely.

## Implementation Plan

### Tasks

Tasks are ordered by dependency — lowest-level building blocks first, then composition.

- [x] **Task 1: Create interpretation scale utility**
  - File: `src/modules/analytics/lib/interpretation.util.ts` (new)
  - Action: Create a pure function `getInterpretation(average: number): string` that maps a numeric average to an interpretation label based on the university's 5-tier scale:
    - `4.50 – 5.00` → `"EXCELLENT PERFORMANCE"`
    - `3.50 – 4.49` → `"VERY SATISFACTORY PERFORMANCE"`
    - `2.50 – 3.49` → `"SATISFACTORY PERFORMANCE"`
    - `1.50 – 2.49` → `"FAIR PERFORMANCE"`
    - `1.00 – 1.49` → `"NEEDS IMPROVEMENT"`
  - Notes: Export the scale ranges as a const array for testability. Handle edge case of values outside 1.00–5.00 gracefully (clamp to nearest tier).

- [x] **Task 2: Create interpretation utility tests**
  - File: `src/modules/analytics/lib/interpretation.util.spec.ts` (new)
  - Action: Test all 5 tiers, boundary values (4.50 exactly, 4.49 exactly, 3.50, 3.49, etc.), and edge cases (1.00, 5.00, values below 1.00, values above 5.00).

- [x] **Task 3: Create response DTOs for faculty report**
  - File: `src/modules/analytics/dto/responses/faculty-report.response.dto.ts` (new)
  - Action: Create the following DTO classes with `@ApiProperty()` decorators:
    - `ReportFacultyDto` — `id: string`, `name: string`
    - `ReportSemesterDto` — `id: string`, `code: string`, `label: string`, `academicYear: string`
    - `ReportQuestionnaireTypeDto` — `code: string`, `name: string`
    - `ReportCourseFilterDto` — `id: string`, `code: string`, `title: string`
    - `ReportQuestionDto` — `questionId: string`, `order: number`, `text: string`, `average: number`, `responseCount: number`, `interpretation: string`
    - `ReportSectionDto` — `sectionId: string`, `title: string`, `order: number`, `weight: number`, `questions: ReportQuestionDto[]`, `sectionAverage: number`, `sectionInterpretation: string`
    - `FacultyReportResponseDto` — `faculty: ReportFacultyDto`, `semester: ReportSemesterDto`, `questionnaireType: ReportQuestionnaireTypeDto`, `courseFilter: ReportCourseFilterDto | null`, `submissionCount: number`, `sections: ReportSectionDto[]`, `overallRating: number | null`, `overallInterpretation: string | null`
  - Notes: Use `@ApiPropertyOptional({ type: ReportCourseFilterDto, nullable: true })` for `courseFilter`.

- [x] **Task 4: Create response DTOs for faculty report comments**
  - File: `src/modules/analytics/dto/responses/faculty-report-comments.response.dto.ts` (new)
  - Action: Create the following DTO classes:
    - `ReportCommentDto` — `text: string`, `submittedAt: string`
    - `FacultyReportCommentsResponseDto` — `items: ReportCommentDto[]`, `meta: PaginationMeta`
  - Notes: Import and reuse `PaginationMeta` from `src/modules/common/dto/pagination.dto`. The `submittedAt` field is an ISO 8601 string.

- [x] **Task 5: Create query DTOs**
  - File: `src/modules/analytics/dto/analytics-query.dto.ts` (append to existing file)
  - Action: Add two new DTO classes:
    - `BaseFacultyReportQueryDto` (shared base class):
      - `semesterId: string` — `@IsUUID()`, required
      - `questionnaireTypeCode: string` — `@IsString()`, required
      - `courseId?: string` — `@IsUUID()`, `@IsOptional()`
    - `FacultyReportQueryDto`:
      - Extends `BaseFacultyReportQueryDto` (no additional fields)
    - `FacultyReportCommentsQueryDto`:
      - Extends `BaseFacultyReportQueryDto` and manually adds `page` and `limit` fields with the same decorators as `PaginationQueryDto`: `@IsInt()`, `@Min(1)`, `@Max(100)` (limit only), `@IsOptional()`, `@Type(() => Number)`, with defaults `page = 1`, `limit = 10`. This avoids multiple inheritance while keeping `class-transformer`'s `@Type()` decorator — which is critical for query string coercion of numeric params.
  - Notes: Import `class-transformer`'s `@Type` with absolute path. Use `@ApiQuery()` decorators on the controller methods for Swagger documentation (matching existing analytics endpoint pattern), NOT `@ApiProperty()` on the query DTO fields — query DTOs use `@ApiQuery()` at the method level to avoid duplicate Swagger entries.

- [x] **Task 6: Create shared private helpers in service**
  - File: `src/modules/analytics/analytics.service.ts`
  - Action: Create three private helpers that will be used by both `GetFacultyReport` and `GetFacultyReportComments`:
    - `private async validateFacultyScope(facultyId: string, semesterId: string): Promise<void>` — resolves department scope and throws `ForbiddenException` if faculty is not accessible. SQL:
      ```sql
      SELECT u.id, u.department_id
      FROM "user" u
      WHERE u.id = $1
        AND u.deleted_at IS NULL
      ```
      If no user found, throw `NotFoundException`. If `ScopeResolverService.ResolveDepartmentIds(semesterId)` returns `null` (super admin), skip scope check. Otherwise, verify `user.department_id IN (scopedDepartmentIds)` — throw `ForbiddenException` if not.
    - `private async resolveVersionIds(facultyId: string, semesterId: string, questionnaireTypeCode: string): Promise<{ versionIds: string[], canonicalSchema: QuestionnaireSchemaSnapshot | null, questionnaireTypeName: string }>` — two-phase validation:
      **(Phase 1)** Verify `questionnaireTypeCode` exists:
      ```sql
      SELECT qt.id, qt.name
      FROM questionnaire_type qt
      WHERE qt.code = $1
        AND qt.deleted_at IS NULL
      ```
      Throw `NotFoundException` if no row returned.
      **(Phase 2)** Find versions that have submissions for this faculty+semester:
      ```sql
      SELECT DISTINCT qv.id, qv.version_number, qv.schema_snapshot
      FROM questionnaire_version qv
      JOIN questionnaire q ON q.id = qv.questionnaire_id
      JOIN questionnaire_submission qs ON qs.questionnaire_version_id = qv.id
      WHERE q.type_id = $1
        AND qs.faculty_id = $2
        AND qs.semester_id = $3
        AND qv.status IN ('ACTIVE', 'DEPRECATED')
        AND qv.deleted_at IS NULL
        AND q.deleted_at IS NULL
        AND qs.deleted_at IS NULL
      ORDER BY qv.version_number DESC
      ```
      Return all matching version IDs. Use the first row's `schema_snapshot` (highest `version_number`) as canonical. Return empty `versionIds` array if no rows found (callers handle empty gracefully). The `questionnaireTypeName` comes from phase 1's `qt.name`.
    - `private flattenSchema(sections: SectionNode[]): { questionMap: Map<string, QuestionMeta>, sectionMap: Map<string, SectionMeta> }` — recursively flattens the schema snapshot into lookup maps. Only leaf sections (those with `questions[]`) produce entries.
  - Notes: `QuestionMeta` (`{ text, order, sectionId, sectionTitle, sectionOrder, weight, dimensionCode }`) and `SectionMeta` (`{ title, order, weight }`) are internal interfaces (not exported). Define them at the top of the service file or in a local types file.

- [x] **Task 7: Implement `GetFacultyReport` service method**
  - File: `src/modules/analytics/analytics.service.ts`
  - Action: Add a new method `async GetFacultyReport(facultyId: string, query: FacultyReportQueryDto): Promise<FacultyReportResponseDto>` that:
    1. **Resolve scope** — call `validateFacultyScope(facultyId, query.semesterId)`.
    2. **Load metadata** — query faculty name and semester details for the response header, independent of submissions:
       ```sql
       SELECT u.first_name, u.last_name FROM "user" u WHERE u.id = $1 AND u.deleted_at IS NULL
       ```
       ```sql
       SELECT s.id, s.code, s.label, s.academic_year FROM semester s WHERE s.id = $1 AND s.deleted_at IS NULL
       ```
       These queries provide `faculty.name`, `semester.code/label/academicYear` for the response DTO regardless of whether submissions exist.
    3. **Find questionnaire versions** — call `resolveVersionIds(facultyId, query.semesterId, query.questionnaireTypeCode)`. **If `versionIds` is empty, return the empty report structure immediately** using metadata from step 2: `submissionCount: 0`, `sections: []`, `overallRating: null`, `overallInterpretation: null`, with `faculty`, `semester`, and `questionnaireType` populated from steps 2 and 3 (type name from `resolveVersionIds`).
    4. **Flatten schema** — call `flattenSchema(canonicalSchema.sections)`.
    5. **Aggregate scores** — execute raw SQL:
       ```sql
       SELECT qa.question_id, qa.section_id,
              ROUND(AVG(qa.numeric_value), 2) AS average,
              COUNT(*) AS response_count
       FROM questionnaire_answer qa
       JOIN questionnaire_submission qs ON qs.id = qa.submission_id
       WHERE qs.faculty_id = $1
         AND qs.semester_id = $2
         AND qs.questionnaire_version_id = ANY($3)
         AND qs.deleted_at IS NULL
         AND qa.deleted_at IS NULL
         [AND qs.course_id = $4]  -- optional courseId filter
       GROUP BY qa.question_id, qa.section_id
       ```
       Note: if the same `question_id` appears with different `section_id` values across versions, the GROUP BY produces multiple rows. Only the row matching the canonical schema's `sectionId` for that question is used — others are discarded during assembly.
    6. **Get submission count** — execute raw SQL:
       ```sql
       SELECT COUNT(DISTINCT qs.id) AS count
       FROM questionnaire_submission qs
       WHERE qs.faculty_id = $1
         AND qs.semester_id = $2
         AND qs.questionnaire_version_id = ANY($3)
         AND qs.deleted_at IS NULL
         [AND qs.course_id = $4]
       ```
    7. **Assemble response** — for each section in the schema (ordered by `sectionOrder`):
       - Map question averages from SQL results using `questionId` lookup (match on both `questionId` and `sectionId` from canonical schema)
       - Apply `getInterpretation()` to each question average. Note: `YES_NO` questions (values 0/1) will produce averages below the 1.00-5.00 scale — the interpretation utility clamps these to the nearest tier ("NEEDS IMPROVEMENT"). This is acceptable because the university's standard evaluation questionnaire uses only Likert scales; `YES_NO` is a supported type but not used in evaluation instruments. If `YES_NO` questions are introduced in future, the interpretation scale should be revisited.
       - Compute `sectionAverage = mean(question averages within section)`, rounded to 2 decimals. **Denominator is the number of questions with data**, not total questions in the schema — questions without SQL results are excluded from both the list and the average calculation
       - Apply `getInterpretation()` to section average
       - Questions without SQL results (orphaned from prior versions) are excluded
    8. **Compute overall rating** — `SUM(sectionWeight * sectionAverage) / SUM(sectionWeight)`, rounded to 2 decimals. Apply `getInterpretation()`. **The denominator uses only the weights of sections that have data.** If some sections have no data (all questions orphaned), their weight drops out. This means the weighted average is computed over available sections only. This is the correct behavior: a partial report should reflect only the data present, and the `responseCount` per question makes gaps visible to the dean.
    9. **Build metadata** — faculty name from step 2, semester details from step 2, questionnaire type code from `query.questionnaireTypeCode` (the authoritative value the client passed, not the snapshot `meta.questionnaireType` which could be stale) and name from `questionnaireTypeName` returned by `resolveVersionIds`. If `courseId` was provided, include `courseFilter` with `id` from `query.courseId` and `code`/`title` from submission snapshot (`courseCodeSnapshot`, `courseTitleSnapshot`) of any matching submission.
    10. **Return** `FacultyReportResponseDto`.
  - Notes: Use `deleted_at IS NULL` on all tables in raw SQL to respect soft deletes (MikroORM's global filter doesn't apply to raw queries). The questionnaire version IDs array parameter uses `= ANY($N)` for PostgreSQL array binding.

- [x] **Task 8: Implement `GetFacultyReportComments` service method**
  - File: `src/modules/analytics/analytics.service.ts`
  - Action: Add a new method `async GetFacultyReportComments(facultyId: string, query: FacultyReportCommentsQueryDto): Promise<FacultyReportCommentsResponseDto>` that:
    1. **Resolve scope** — call `validateFacultyScope(facultyId, query.semesterId)`.
    2. **Find version IDs** — call `resolveVersionIds(facultyId, query.semesterId, query.questionnaireTypeCode)`. **If `versionIds` is empty, return immediately** with `items: []` and `PaginationMeta` with `totalItems: 0`.
    3. **Count total comments** — execute raw SQL:
       ```sql
       SELECT COUNT(*) AS total
       FROM questionnaire_submission qs
       WHERE qs.faculty_id = $1
         AND qs.semester_id = $2
         AND qs.questionnaire_version_id = ANY($3)
         AND qs.qualitative_comment IS NOT NULL
         AND TRIM(qs.qualitative_comment) != ''
         AND qs.deleted_at IS NULL
         [AND qs.course_id = $4]
       ```
    4. **Fetch paginated comments** — execute raw SQL:
       ```sql
       SELECT qs.qualitative_comment AS text, qs.submitted_at
       FROM questionnaire_submission qs
       WHERE qs.faculty_id = $1
         AND qs.semester_id = $2
         AND qs.questionnaire_version_id = ANY($3)
         AND qs.qualitative_comment IS NOT NULL
         AND TRIM(qs.qualitative_comment) != ''
         AND qs.deleted_at IS NULL
         [AND qs.course_id = $4]
       ORDER BY qs.submitted_at DESC
       LIMIT $5 OFFSET $6
       ```
    5. **Assemble response** — map rows to `ReportCommentDto[]`, build `PaginationMeta` (totalItems, itemCount, itemsPerPage, totalPages, currentPage).
    6. **Return** `FacultyReportCommentsResponseDto`.
  - Notes: Filter out null and empty-string comments in SQL. Order by `submitted_at DESC` so newest comments appear first. Offset = `(page - 1) * limit`. **Important:** extract the shared `WHERE` clause (null/empty filter + soft delete + faculty/semester/version/course filters) into a SQL fragment constant or builder within the method so the count query and the paginated query use identical filters — prevents count/data mismatch bugs.

- [x] **Task 9: Add controller endpoints**
  - File: `src/modules/analytics/analytics.controller.ts`
  - Action: Add two new endpoint methods:
    - `@Get('faculty/:facultyId/report')` with `@ApiQuery()` decorators for `semesterId`, `questionnaireTypeCode`, `courseId?` and `@ApiResponse({ status: 200, type: FacultyReportResponseDto })`. Param: `@Param('facultyId', ParseUUIDPipe) facultyId: string`, `@Query() query: FacultyReportQueryDto`. Returns `Promise<FacultyReportResponseDto>`. Delegates to `this.analyticsService.GetFacultyReport(facultyId, query)`.
    - `@Get('faculty/:facultyId/report/comments')` with `@ApiQuery()` decorators for `semesterId`, `questionnaireTypeCode`, `courseId?`, `page?`, `limit?` and `@ApiResponse({ status: 200, type: FacultyReportCommentsResponseDto })`. Param: `@Param('facultyId', ParseUUIDPipe) facultyId: string`, `@Query() query: FacultyReportCommentsQueryDto`. Returns `Promise<FacultyReportCommentsResponseDto>`. Delegates to `this.analyticsService.GetFacultyReportComments(facultyId, query)`.
  - Notes: Both endpoints inherit the existing `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.SUPER_ADMIN)` applied at controller level. Use `ParseUUIDPipe` for the `facultyId` path param to validate UUID format. Include `@ApiResponse()` decorators for Swagger consistency with existing endpoints.

- [x] **Task 10: Add controller tests**
  - File: `src/modules/analytics/analytics.controller.spec.ts`
  - Action: Add test cases for both new endpoints following the existing pattern:
    - `GetFacultyReport` — verify `facultyId` and query params are passed to service, verify return value.
    - `GetFacultyReportComments` — verify `facultyId` and query params (including pagination) are passed to service, verify return value.
  - Notes: Follow the existing test structure — mock `AnalyticsService` methods as `jest.fn()`, assert delegation.

- [x] **Task 11: Add service tests**
  - File: `src/modules/analytics/analytics.service.spec.ts`
  - Action: Add test cases for both new service methods:
    - **GetFacultyReport tests:**
      - Super admin can access any faculty (scope returns null)
      - Dean can access faculty in their department
      - Dean cannot access faculty outside their department (403)
      - Correct SQL aggregation query structure and param binding
      - Schema flattening produces correct question-to-section mapping
      - Section averages calculated correctly from question averages (denominator = questions with data only)
      - Overall weighted rating calculated correctly from section averages and weights
      - Interpretation labels applied correctly to questions, sections, and overall rating
      - Optional courseId filter included in SQL when provided
      - No submissions found returns empty sections with `overallRating: null` and `overallInterpretation: null`
      - Invalid questionnaireTypeCode returns 404
    - **GetFacultyReportComments tests:**
      - Paginated results with correct offset/limit
      - Null and empty comments filtered out
      - Total count matches non-empty comments
      - PaginationMeta computed correctly (totalPages, currentPage, etc.)
      - Same scope check as report endpoint
      - Empty versionIds returns empty items with totalItems: 0
  - Notes: Mock `em.getConnection().execute()` to return canned row arrays. Mock `ScopeResolverService.ResolveDepartmentIds()`. The `GetFacultyReport` method makes sequential `execute()` calls in this order: (1) user scope query, (2) phase-1 type validation, (3) phase-2 version resolution, (4) faculty/semester metadata queries, (5) aggregation query, (6) submission count query. Set up `mockExecute.mockResolvedValueOnce()` in this exact sequence. For super admin (scope returns null), the user scope query is skipped (no execute call for step 1). `GetFacultyReportComments` follows the same pattern for steps 1-4, then count query, then paginated select.

- [x] **Task 12: Add schema flattening tests**
  - File: `src/modules/analytics/analytics.service.spec.ts`
  - Action: Add a dedicated describe block for schema flattening (tested indirectly through `GetFacultyReport`):
    - Test with a simple flat schema (sections with questions, no nesting)
    - Test with nested sections (parent → child sections with questions)
    - Test that only leaf sections with questions produce entries
    - Test that weights are correctly propagated from leaf sections
  - Notes: Since `flattenSchema` is private, test it indirectly by providing different `schemaSnapshot` shapes in the mock data and verifying the assembled response structure.

### Acceptance Criteria

- [ ] **AC 1:** Given a dean with access to department X, when they call `GET /analytics/faculty/:facultyId/report?semesterId=...&questionnaireTypeCode=...` for a faculty in department X, then they receive a 200 response with sections containing per-question averages, section averages, overall weighted rating, and interpretation labels.

- [ ] **AC 2:** Given a dean with access to department X, when they call `GET /analytics/faculty/:facultyId/report` for a faculty in department Y, then they receive a 403 Forbidden response.

- [ ] **AC 3:** Given a super admin, when they call `GET /analytics/faculty/:facultyId/report` for any faculty, then they receive a 200 response regardless of department.

- [ ] **AC 4:** Given a valid report request with `courseId` query param, when the endpoint is called, then only submissions for that specific course are aggregated in the response.

- [ ] **AC 5:** Given a valid report request without `courseId`, when the endpoint is called, then submissions across all courses for that faculty+semester are aggregated.

- [ ] **AC 6:** Given a report response, when section averages are computed, then each `sectionAverage` equals the arithmetic mean of its `questions[].average` values, rounded to 2 decimal places.

- [ ] **AC 7:** Given a report response, when the overall rating is computed, then `overallRating` equals the weighted average `SUM(weight * sectionAverage) / SUM(weight)` across all sections, rounded to 2 decimal places.

- [ ] **AC 8:** Given any numeric average in the response (question, section, or overall), when interpretation is applied, then the label matches the 5-tier scale: 4.50-5.00 = EXCELLENT PERFORMANCE, 3.50-4.49 = VERY SATISFACTORY PERFORMANCE, 2.50-3.49 = SATISFACTORY PERFORMANCE, 1.50-2.49 = FAIR PERFORMANCE, 1.00-1.49 = NEEDS IMPROVEMENT.

- [ ] **AC 9:** Given a valid request, when `GET /analytics/faculty/:facultyId/report/comments` is called, then paginated qualitative comments are returned with correct `PaginationMeta` (totalItems, totalPages, currentPage, itemCount, itemsPerPage).

- [ ] **AC 10:** Given submissions with null or empty `qualitativeComment`, when comments are fetched, then those submissions are excluded from both the items list and the total count.

- [ ] **AC 11:** Given a comments request with `page=2&limit=10`, when the endpoint is called, then the response contains at most 10 items starting from offset 10, ordered by `submittedAt` descending.

- [ ] **AC 12:** Given a request with an invalid `facultyId` (not a UUID), when either endpoint is called, then a 400 Bad Request is returned (via `ParseUUIDPipe`).

- [ ] **AC 13:** Given a request from an unauthenticated user or a user with role STUDENT or FACULTY, when either endpoint is called, then a 401/403 is returned.

- [ ] **AC 14:** Given a faculty+semester combination with no submissions for a valid questionnaire type, when the report endpoint is called, then the response returns `submissionCount: 0`, empty `sections: []`, `overallRating: null`, and `overallInterpretation: null`.

- [ ] **AC 15:** Given an invalid `questionnaireTypeCode` that doesn't exist in the `questionnaire_type` table, when either endpoint is called, then a 404 Not Found is returned with a clear error message.

- [ ] **AC 16:** Given a faculty with submissions across multiple questionnaire versions in the same semester, when the report is generated, then each question includes a `responseCount` field showing how many responses contributed to that question's average, making cross-version data gaps visible.

## Additional Context

### Dependencies

- No new npm packages required
- Reuses existing `PaginationQueryDto` and `PaginationMeta` from common module
- Reuses existing `ScopeResolverService` from common module
- Depends on `questionnaire_answer` and `questionnaire_submission` tables being populated (ingestion pipeline must have run)
- Depends on `questionnaire_version.schema_snapshot` containing valid JSON conforming to `QuestionnaireSchemaSnapshot` interface
- Depends on `questionnaire_type.code` matching the `questionnaireTypeCode` query parameter

### Testing Strategy

- **Unit tests for interpretation utility** (`interpretation.util.spec.ts`) — pure function, test all 5 tiers + boundary values (4.50, 4.49, 3.50, 3.49, 2.50, 2.49, 1.50, 1.49, 1.00, 5.00) + edge cases (below 1.00, above 5.00)
- **Unit tests for service methods** (`analytics.service.spec.ts`) — mock `em.getConnection().execute()` with canned SQL result rows, mock `ScopeResolverService`, verify SQL param binding, verify schema flattening, verify arithmetic (section averages, weighted overall rating)
- **Unit tests for controller** (`analytics.controller.spec.ts`) — verify delegation to service with correct `facultyId` and query params, verify return type
- **Schema flattening** — tested indirectly through service tests with different `schemaSnapshot` structures (flat, nested)
- **No E2E tests** — consistent with existing analytics module (no E2E tests exist for analytics endpoints)

### Notes

- The `SectionNode` tree is recursive but bounded (university questionnaires have 2 levels max: top-level sections with questions). The flattening logic should handle arbitrary depth for correctness but can assume shallow nesting in practice.
- `QuestionnaireAnswer.numericValue` is `decimal(10,2)` — SQL `AVG()` will return precise decimals. Round to 2 decimal places in the response using `ROUND()` in SQL.
- The `submittedAt` timestamp on comments comes from `QuestionnaireSubmission.submittedAt`, not a separate comment timestamp. Format as ISO 8601 string in the response.
- Weighted overall rating: `SUM(section_weight * section_average) / SUM(section_weight)`. Section weights from schema snapshot sum to 100 by constraint, but **the formula uses only sections with data** in both numerator and denominator. If a section has no data (all questions orphaned from prior versions), its weight drops out. This means the denominator may be less than 100. This is intentional — partial data should produce a weighted average over available sections, not be penalized by missing sections. The `responseCount` per question and the visible section structure make gaps transparent.
- Raw SQL must include `AND qs.deleted_at IS NULL` to respect soft deletes — MikroORM's global soft-delete filter does not apply to raw queries.
- The `questionnaireTypeCode` filter requires joining through `questionnaire_version → questionnaire → questionnaire_type` to resolve the type code to version IDs. Exact FK columns: `questionnaire_version.questionnaire_id → questionnaire.id`, `questionnaire.type_id → questionnaire_type.id`. This join is done once to resolve version IDs, then the main aggregation query uses `questionnaire_version_id = ANY($N)`.
- Version resolution uses two-phase validation: (1) `NotFoundException` if `questionnaireTypeCode` doesn't exist in `questionnaire_type` (query must include `AND qt.deleted_at IS NULL` to avoid matching soft-deleted records); (2) empty array if type exists but no submissions match — callers return empty report/comments gracefully (no 404).
- The `questionnaireType.code` in the response DTO should use the `query.questionnaireTypeCode` parameter (the authoritative value the client passed), not `meta.questionnaireType` from the schema snapshot (which could be stale if the type code was ever renamed after the snapshot was created).
- Version resolution filters by `qv.status IN ('ACTIVE', 'DEPRECATED')` — DRAFT versions (never published, potentially incomplete schemas) and ARCHIVED versions are excluded. A version may have been ACTIVE when submissions were created, then later DEPRECATED — those submissions are still valid data.
- `YES_NO` question type (values 0/1) will produce averages below the 1.00-5.00 interpretation scale. The current university evaluation questionnaire uses only Likert scales, so this is not an active concern. The interpretation utility clamps out-of-range values to the nearest tier. If `YES_NO` questions are introduced in evaluation instruments in future, revisit the interpretation scale.
- **Raw SQL column naming:** always use PostgreSQL snake_case column names (`question_id`, `section_id`, `faculty_id`, `questionnaire_version_id`, `type_id`), not MikroORM camelCase property names (`questionId`, `sectionId`, `faculty`, `questionnaireVersion`, `type`).

## Review Notes

- Adversarial review completed
- Findings: 8 real, 3 noise/undecided
- Fixed: F1 (division by zero guard), F3 (IsNotEmpty validation), F5 (missing test coverage), F6 (redundant DB query), F8 (input sanitization in error message)
- Skipped (noise/undecided): F2 (by-design multi-version behavior), F4 (test mock ordering — matches existing codebase pattern), F7 (timezone — pg driver returns Date objects)
- Resolution approach: auto-fix
