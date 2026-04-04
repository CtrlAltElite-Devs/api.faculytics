---
title: 'CSV Test Submission Generator'
slug: 'csv-test-submission-generator'
created: '2026-04-04'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS',
    'MikroORM',
    'PostgreSQL',
    'OpenAI SDK',
    'BullMQ',
    'Zod',
    'Jest',
    'React 19',
    'Vite',
    'TanStack Query v5',
    'Zustand',
    'shadcn/ui',
    'Tailwind CSS 4',
  ]
files_to_modify:
  - 'api: src/modules/admin/admin.module.ts'
  - 'api: src/modules/admin/admin-filters.controller.ts'
  - 'api: src/modules/admin/services/admin-filters.service.ts'
  - 'api: src/modules/admin/admin-generate.controller.ts (NEW)'
  - 'api: src/modules/admin/services/admin-generate.service.ts (NEW)'
  - 'api: src/modules/admin/services/comment-generator.service.ts (NEW)'
  - 'api: src/modules/admin/lib/question-flattener.ts (NEW)'
  - 'api: src/modules/admin/dto/ (NEW DTOs)'
  - 'admin: src/features/submission-generator/generator-page.tsx (NEW)'
  - 'admin: src/features/submission-generator/components/selection-form.tsx (NEW)'
  - 'admin: src/features/submission-generator/components/preview-panel.tsx (NEW)'
  - 'admin: src/features/submission-generator/components/commit-result-dialog.tsx (NEW)'
  - 'admin: src/features/submission-generator/use-generator-filters.ts (NEW)'
  - 'admin: src/features/submission-generator/use-generate-submissions.ts (NEW)'
  - 'admin: src/types/api.ts'
  - 'admin: src/routes.tsx'
  - 'admin: src/components/layout/app-shell.tsx'
code_patterns:
  - 'EntityManager direct injection (admin services)'
  - 'FilterOptionResponseDto for filter endpoints'
  - '@UseJwtGuard(UserRole.SUPER_ADMIN) on all admin endpoints'
  - 'MikroOrmModule.forFeature() for entity registration'
  - 'OpenAI client: new OpenAI({ apiKey: env.OPENAI_API_KEY })'
  - 'EnrollmentRole enum: STUDENT, EDITING_TEACHER'
  - 'Admin console: feature-based folders with co-located hooks (use-*.ts)'
  - 'Admin console: native fetch via apiClient() wrapper, no Axios'
  - 'Admin console: React Query with 5-min staleTime, enabled flag for dependent queries'
  - 'Admin console: shadcn/ui components, Lucide icons, sonner toasts'
  - 'Admin console: useState for form state, no form library'
test_patterns:
  - 'Mock EntityManager with jest.fn() methods'
  - 'NestJS TestingModule with useValue mocks'
  - 'Test files: *.spec.ts or __tests__/*.spec.ts'
  - 'Admin console: no test runner configured'
---

# Tech-Spec: CSV Test Submission Generator

**Created:** 2026-04-04

## Overview

### Problem Statement

Manually constructing CSV files with realistic submission data for questionnaire ingestion is too slow for rapid analytics testing. The team needs volume (up to ~50 submissions per course) with realistic, multilingual qualitative feedback to properly exercise analytics dashboards (sentiment analysis, topic modeling, etc.).

### Solution

Backend APIs that generate realistic test submissions for a given questionnaire version — pulling real identities from the DB (faculty, students, courses), generating varied numeric answers, and calling the OpenAI API to produce code-switched student feedback in Cebuano/Tagalog/English (English-heavy distribution). Two-phase flow: preview all available student submissions, then commit by calling `QuestionnaireService.submitQuestionnaire()` directly per row (bypassing the ingestion pipeline to avoid complex cross-module dependency chains). An admin console UI provides a builder flow for selecting the generation context and reviewing results before committing.

### Scope

**In Scope:**

- 4 new filter endpoints for the admin console builder flow
- 2 new action endpoints (preview + commit) for submission generation
- Pull valid faculty, courses, students from enrollment data
- Answer generation with interesting distributions (not uniform random)
- OpenAI integration for multilingual comment generation (Cebuano, Tagalog, English, mixed — weighted English)
- Auto-count: generate for ALL available students (enrolled minus already submitted)
- Preview-then-commit flow: generate full preview → user reviews → commit all
- Commit via direct `QuestionnaireService.submitQuestionnaire()` calls (no ingestion pipeline dependency)
- Admin console UI: builder page with two-track selection, preview table, commit action

**Out of Scope:**

- Partial generation (subset of available students)
- Non-questionnaire data generation
- Semester selection (auto-derived from course hierarchy)

## Context for Development

### Codebase Patterns

**Admin Module Pattern (API — `api.faculytics`):**

- Controllers use `@UseJwtGuard(UserRole.SUPER_ADMIN)` for all endpoints
- Services inject `EntityManager` directly (not custom repositories)
- Filter endpoints return `FilterOptionResponseDto[]` with typed Query DTOs
- Module registers entities via `MikroOrmModule.forFeature([...])`
- Existing entities in admin module: Campus, Course, Department, Enrollment, Program, Semester, User

**Admin Console Pattern (Frontend — `admin.faculytics`):**

- Feature-based folder structure: `src/features/<feature-name>/` with co-located components + hooks
- API calls via `apiClient<T>(path, options)` — native fetch wrapper, auto-prefixes `/api/v1`, injects Bearer token, handles 401 refresh
- React Query hooks with `queryKey` including `activeEnvId`, `enabled` flag for dependent/cascading queries, 5-min staleTime
- Forms use raw `useState` — no form library (React Hook Form, Formik, etc.)
- UI: shadcn/ui (new-york style), Lucide icons, sonner toasts
- Mutations: `useMutation` with `onSuccess` → `toast.success()` + `queryClient.invalidateQueries()`, `onError` → `toast.error()`
- Cascading dropdowns pattern: parent selection resets child values, child queries use `enabled: !!parentValue`
- Data tables: shadcn `Table` components with optional pagination
- Detail views: shadcn `Sheet` (slide-over panel)

**OpenAI Integration Pattern (from analysis module):**

```typescript
constructor() {
  this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
}
```

- Models in use: `gpt-5` (ChatKit), `gpt-4o-mini` (topic labels)
- For comment generation: `gpt-4o-mini` is appropriate (cheap, fast, sufficient quality)

**submitQuestionnaire() — Direct Call Pattern:**
The commit path bypasses the ingestion pipeline (IngestionEngine, IngestionMapperService, SourceAdapters) entirely. Instead, it calls `QuestionnaireService.submitQuestionnaire()` directly per row. This avoids a deep transitive dependency chain (`IngestionEngine → IngestionMapperService → IngestionMappingLoader (REQUEST-scoped) → DataLoaderModule`) that would cause NestJS DI scope-resolution errors in the singleton AdminModule.

`submitQuestionnaire()` validates: version active, enrollments exist (STUDENT + EDITING_TEACHER), unique constraint, answers in range `[1, maxScore]`, qualitative comment if required by schema. It also handles post-submission side effects: analysis job enqueuing (sentiment, embeddings), cache invalidation, score calculation.

**Critical Constraint — Unique Submission:**

```
UNIQUE(respondent, faculty, questionnaireVersion, semester, course)
```

- Generator must exclude students who already have submissions for the given version+faculty+course+semester combo
- Available students = enrolled STUDENT users - already submitted users

**Enrollment Query Patterns:**

```typescript
// Faculty's courses
em.find(
  Enrollment,
  { user: facultyId, role: 'editingteacher', isActive: true },
  { populate: ['course'] },
);

// Course's students
em.find(
  Enrollment,
  { course: courseId, role: 'student', isActive: true },
  { populate: ['user'] },
);
```

**Questionnaire Types:**

- Existing endpoint: `GET /questionnaire-types` with optional `isSystem` filter
- Can reuse via `QuestionnaireTypeService.FindAll()` or query directly
- Three system types: FACULTY_IN_CLASSROOM, FACULTY_OUT_OF_CLASSROOM, FACULTY_FEEDBACK

**submitQuestionnaire() Parameters** (called via `QuestionnaireService`):

- `versionId: string` — questionnaire version UUID
- `respondentId: string` — student user UUID
- `facultyId: string` — faculty user UUID
- `semesterId: string` — semester UUID (resolved from course hierarchy)
- `courseId?: string` — course UUID (optional)
- `answers: Record<string, number>` — `{ [questionId]: numericValue }`, all questions must be present, values in `[1, maxScore]`
- `qualitativeComment?: string` — must be non-empty if `schema.qualitativeFeedback.required === true`
- Returns: `SubmitQuestionnaireResponse { id: string }`
- Throws: `ConflictException` on unique constraint violation (caught per-row in commit loop)

**GetAllQuestions() utility** is a method on `QuestionnaireService`. Recursively flattens `QuestionNode` instances from nested `schemaSnapshot.sections`. Returns `QuestionNode[]` with `{ id, text, type, dimensionCode, required, order }`. **Note: does NOT include sectionName** — a modified traversal is needed for the preview that tracks parent `SectionNode.title`.

**qualitativeFeedback schema field:**

```typescript
schema.qualitativeFeedback?: { enabled: boolean, required: boolean, maxLength: number }
```

- Comment generation should be conditional on `qualitativeFeedback.enabled === true`
- If `required === true`, fallback comments must be non-empty strings
- If not enabled, skip comment generation entirely (save OpenAI cost)

### Files to Reference

**API (`api.faculytics`):**

| File                                                                   | Purpose                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/modules/admin/admin.module.ts`                                    | Admin module registration — add new entities/services/controllers here                     |
| `src/modules/admin/admin-filters.controller.ts`                        | Existing filter endpoints — pattern to follow for new filters                              |
| `src/modules/admin/services/admin-filters.service.ts`                  | Existing filter service — pattern to follow                                                |
| `src/modules/questionnaires/questionnaire.controller.ts:331-480`       | Existing csv-template + ingest endpoints                                                   |
| `src/modules/questionnaires/questionnaires.module.ts`                  | QuestionnaireModule — exports `QuestionnaireService`; import this module in AdminModule    |
| `src/modules/questionnaires/services/questionnaire.service.ts:577+`    | `submitQuestionnaire()` — full validation chain, called directly per row                   |
| `src/modules/questionnaires/services/questionnaire.service.ts:867-881` | `GetAllQuestions()` — schema flattening utility (returns `QuestionNode[]`, no sectionName) |
| `src/entities/questionnaire-version.entity.ts`                         | Version entity with schemaSnapshot                                                         |
| `src/entities/questionnaire-submission.entity.ts`                      | Submission entity — unique constraint, required fields                                     |
| `src/entities/enrollment.entity.ts`                                    | Enrollment entity — user+course+role+isActive                                              |
| `src/modules/questionnaires/lib/questionnaire.types.ts`                | EnrollmentRole enum, RespondentRole enum                                                   |
| `src/modules/questionnaires/services/questionnaire-type.service.ts`    | QuestionnaireType queries                                                                  |
| `src/modules/analysis/services/topic-label.service.ts`                 | OpenAI usage pattern to follow                                                             |
| `src/configurations/env/openai.env.ts`                                 | OpenAI API key env config                                                                  |
| `src/modules/questionnaires/ingestion/dto/raw-submission-data.dto.ts`  | `RawSubmissionData` + `RawAnswerData` DTOs                                                 |

**Admin Console (`../admin.faculytics`):**

| File                                              | Purpose                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/api-client.ts`                           | Fetch wrapper — use `apiClient<T>(path, options)` for all API calls |
| `src/features/admin/users-page.tsx:147-242`       | Cascading dropdown pattern (campus → department → program)          |
| `src/features/admin/use-admin-filters.ts`         | React Query hooks for filter endpoints — pattern to replicate       |
| `src/features/admin/role-action-dialog.tsx`       | Multi-field form + preview summary pattern                          |
| `src/features/moodle-sync/sync-history-table.tsx` | Data table with pagination pattern                                  |
| `src/features/admin/use-institutional-roles.ts`   | `useMutation` with toast + query invalidation pattern               |
| `src/types/api.ts`                                | Shared API type definitions — add new types here                    |
| `src/routes.tsx`                                  | React Router config — add new route here                            |
| `src/components/layout/app-shell.tsx`             | Main layout with sidebar — add nav item                             |

### Technical Decisions

- **OpenAI over Anthropic**: Reuse existing `OPENAI_API_KEY` env var; `gpt-4o-mini` for comment generation (cheap, fast)
- **Language distribution**: ~60% English, ~15% Tagalog, ~15% Cebuano, ~10% mixed/code-switched
- **Auto-count**: Generate for all available students (enrolled - already submitted), no manual count parameter in MVP
- **Preview all, commit all**: No partial generation — frontend holds full preview, sends back for commit
- **No server-side state**: Preview returns JSON rows, frontend POSTs them back for commit
- **Direct submitQuestionnaire() over ingestion pipeline**: Commit endpoint calls `QuestionnaireService.submitQuestionnaire()` directly per row in a loop with forked EntityManager. This avoids importing `IngestionEngine`/`IngestionMapperService` which have deep transitive dependencies (request-scoped `IngestionMappingLoader`, `DataLoaderModule`) that cause NestJS DI scope conflicts. Faculty/course/semester lookups are done once upfront; only student lookup varies per row. Results are aggregated manually into the same `CommitResultDto` shape.
- **Import QuestionnaireModule**: `QuestionnaireModule` exports `QuestionnaireService` and `QuestionnaireTypeService`. Import the whole module in `AdminModule` to get both services cleanly.
- **Semester auto-derived**: From course.program.department.semester — no user selection needed
- **Two-track builder flow**: Identity (faculty → course) + Instrument (type → version) are independent selections
- **Answer distribution**: Per-student tendency approach — pick a base tendency scaled to `[1, maxScore]` (e.g., `tendency = 1 + Math.random() * (maxScore - 1) * 0.6 + (maxScore - 1) * 0.3`), add noise per question, clamp to `[1, maxScore]`. Produces realistic inter-student variation with intra-student consistency. Works correctly for any maxScore (3, 4, 5, etc.).
- **Conditional comment generation**: Only generate comments if `schema.qualitativeFeedback.enabled === true`. If `required === true`, ensure fallback comments are non-empty. Skip OpenAI call entirely if not enabled.
- **Modified question flattener**: The existing `GetAllQuestions()` returns `QuestionNode[]` without section names. A local `GetAllQuestionsWithSections()` helper tracks parent `SectionNode.title` during traversal to return `{ ...QuestionNode, sectionName: string }[]`. This is not code duplication — it's an extension that adds sectionName tracking the original does not provide.

### API Surface

**Filter Endpoints (AdminFiltersController):**

| Method | Path                                    | Query Params                 | Returns                             |
| ------ | --------------------------------------- | ---------------------------- | ----------------------------------- |
| GET    | `/admin/filters/faculty`                | —                            | `{ id, username, fullName }[]`      |
| GET    | `/admin/filters/courses`                | `facultyUsername` (required) | `{ id, shortname, fullname }[]`     |
| GET    | `/admin/filters/questionnaire-types`    | —                            | `{ id, name, code }[]`              |
| GET    | `/admin/filters/questionnaire-versions` | `typeId` (required)          | `{ id, versionNumber, isActive }[]` |

**Generator Endpoints (new AdminGenerateController):**

| Method | Path                                  | Body                                              | Returns                                        |
| ------ | ------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| POST   | `/admin/generate-submissions/preview` | `{ versionId, facultyUsername, courseShortname }` | Preview response (metadata + questions + rows) |
| POST   | `/admin/generate-submissions/commit`  | `{ versionId, rows }`                             | `CommitResultDto`                              |

**Preview Response Shape:**

```typescript
{
  metadata: {
    faculty: { username: string, fullName: string },
    course: { shortname: string, fullname: string },
    semester: { code: string, label: string, academicYear: string },
    version: { id: string, versionNumber: number },
    maxScore: number,
    totalEnrolled: number,
    alreadySubmitted: number,
    availableStudents: number,
    generatingCount: number,
  },
  questions: [{ id: string, text: string, sectionName: string }],
  rows: [{
    externalId: string,
    username: string,
    facultyUsername: string,
    courseShortname: string,
    answers: Record<string, number>,
    comment?: string,
  }],
}
```

**Commit Request Shape:**

```typescript
{
  versionId: string,
  rows: [{
    externalId: string,
    username: string,
    facultyUsername: string,
    courseShortname: string,
    answers: Record<string, number>,
    comment?: string,
  }],
}
```

## Implementation Plan

### Tasks

#### Phase 1: API Backend

- [ ] **Task 1: Create DTOs for generator endpoints**
  - File: `api.faculytics/src/modules/admin/dto/generate-submissions.dto.ts` (NEW)
  - Action: Create request/response DTOs:
    - `GeneratePreviewRequestDto` — `{ versionId: string, facultyUsername: string, courseShortname: string }` with class-validator decorators
    - `GeneratePreviewResponseDto` — metadata, questions, and rows as described in API Surface
    - `GenerateCommitRequestDto` — `{ versionId: string, rows: GeneratedRowDto[] }` with nested validation
    - `GeneratedRowDto` — `{ externalId, username, facultyUsername, courseShortname, answers: Record<string, number>, comment?: string }`
    - `CommitResultDto` — `{ commitId: string, total: number, successes: number, failures: number, dryRun: boolean, records: CommitRecordResult[] }`. This is a standalone DTO in the admin module — NOT imported from the ingestion pipeline's `IngestionResultDto`. Same shape but decoupled to avoid cross-module file coupling.
    - `CommitRecordResult` — `{ externalId: string, success: boolean, error?: string, internalId?: string }`
  - File: `api.faculytics/src/modules/admin/dto/filter-faculty.dto.ts` (NEW)
  - Action: Create `FilterFacultyResponseDto` with `{ id, username, fullName }` and static `Map()` method. Create `FilterCoursesQueryDto` with required `facultyUsername` param. Create `FilterCourseResponseDto` with `{ id, shortname, fullname }`. Create `FilterQuestionnaireVersionsQueryDto` with required `typeId` param. Create `FilterVersionResponseDto` with `{ id, versionNumber }` and static `Map()` method.
  - Notes: Follow existing `FilterOptionResponseDto` pattern with static `Map()` factory method. Use `@IsUUID()`, `@IsString()`, `@IsNotEmpty()` validators. For `GenerateCommitRequestDto.rows[].answers` (`Record<string, number>`): use `@IsObject()` for basic shape validation — per-question answer validation is handled inside `submitQuestionnaire()`, so the DTO does not need to validate individual keys/values.

- [ ] **Task 2: Create GetAllQuestionsWithSections helper**
  - File: `api.faculytics/src/modules/admin/lib/question-flattener.ts` (NEW)
  - Action: Create a standalone helper function that extends the `GetAllQuestions()` pattern from `QuestionnaireService` (line 867-881):
    ```typescript
    interface QuestionWithSection {
      id: string;
      text: string;
      type: string;
      dimensionCode: string;
      required: boolean;
      order: number;
      sectionName: string;
    }
    export function GetAllQuestionsWithSections(
      schema: QuestionnaireSchemaSnapshot,
    ): QuestionWithSection[];
    ```

    - Use the same stack-based depth-first traversal as the original
    - Track the current `SectionNode.title` as the stack is processed
    - Each yielded question includes `sectionName` from its parent section
    - Import `QuestionnaireSchemaSnapshot`, `SectionNode`, `QuestionNode` types from `src/modules/questionnaires/lib/questionnaire.types.ts`
  - Notes: This is NOT duplication of `GetAllQuestions()` — it's an extension that adds sectionName tracking the original does not provide. The original returns `QuestionNode[]` without section context, which is insufficient for the preview response.

- [ ] **Task 3: Create CommentGeneratorService**
  - File: `api.faculytics/src/modules/admin/services/comment-generator.service.ts` (NEW)
  - Action: Create `@Injectable()` service that wraps OpenAI API for generating multilingual student feedback comments.
    - Constructor: instantiate `new OpenAI({ apiKey: env.OPENAI_API_KEY })` following the pattern in `topic-label.service.ts`
    - Method: `async GenerateComments(count: number, context: { courseName: string, facultyName: string, maxScore: number, maxLength?: number }): Promise<string[]>`
    - Single API call to `gpt-4o-mini` with a structured prompt requesting a JSON array of `count` student feedback comments
    - Prompt should specify language distribution: ~60% English, ~15% Tagalog, ~15% Cebuano, ~10% mixed/code-switched
    - Prompt should include course/faculty context for realistic feedback
    - If `maxLength` is provided, include it in the prompt as a constraint (e.g., "each comment must be under {maxLength} characters")
    - Parse response as `JSON.parse()` on the content, validate it's a string array of length `count`
    - **Safety net**: After parsing, truncate any comment that exceeds `maxLength` (OpenAI may not always respect the constraint). `submitQuestionnaire()` validates `comment.length > maxLength` and throws `BadRequestException` if exceeded — truncation prevents silent commit failures.
    - Fallback: if OpenAI call fails, times out, or returns invalid data, return array of generic fallback comments (e.g., `"Good teaching."`, `"Helpful instructor."`, varied — all under maxLength) so preview still works without error
  - Notes: Use `response_format: { type: 'json_object' }` for reliable JSON output. Set a 60-second timeout.

- [ ] **Task 4: Create AdminGenerateService**
  - File: `api.faculytics/src/modules/admin/services/admin-generate.service.ts` (NEW)
  - Action: Create `@Injectable()` service with two methods: `GeneratePreview()` and `CommitSubmissions()`.
  - Inject: `EntityManager`, `CommentGeneratorService`, `QuestionnaireService` (from imported `QuestionnaireModule`).

  **`GeneratePreview(dto: GeneratePreviewRequestDto): Promise<GeneratePreviewResponseDto>`**
  1. Load version by `dto.versionId` with populate `['questionnaire.type']`. Throw `NotFoundException` if not found, `BadRequestException` if not active.
  2. Load faculty user by `dto.facultyUsername` (exact match on `userName`). Throw `NotFoundException` if not found.
  3. Load course by `dto.courseShortname` (exact match on `shortname`) with populate `['program.department.semester']`. Throw `NotFoundException` if not found.
  4. Verify faculty has active `EDITING_TEACHER` enrollment in the course. Throw `BadRequestException` if not.
  5. Resolve semester from `course.program.department.semester`. Throw `BadRequestException` if hierarchy is incomplete.
  6. Query all active `STUDENT` enrollments for the course, populate `['user']`.
  7. Query existing submissions for this `(faculty, version, course, semester)` combo to get already-submitted respondent IDs.
  8. Compute available students = enrolled students minus already-submitted students.
  9. If `availableStudents === 0`, throw `BadRequestException` with descriptive message.
  10. Extract questions using `GetAllQuestionsWithSections(version.schemaSnapshot)` from the local helper (Task 2). This returns `QuestionWithSection[]` with `sectionName` included.
  11. Read `maxScore` from `version.schemaSnapshot.meta.maxScore`.
  12. Generate answers using per-student tendency **scaled to maxScore**: for each student, pick a base tendency (e.g., `tendency = 1 + Math.random() * (maxScore - 1) * 0.6 + (maxScore - 1) * 0.3` — biases toward upper range), then for each question produce `Math.round(clamp(tendency + (Math.random() - 0.5) * 2, 1, maxScore))`. This works correctly for any maxScore (3, 4, 5, etc.).
  13. Check `version.schemaSnapshot.qualitativeFeedback?.enabled`. If enabled, call `CommentGeneratorService.GenerateComments(availableStudents, { courseName, facultyName, maxScore, maxLength: schema.qualitativeFeedback.maxLength })`. If not enabled, skip comment generation (set all comments to `undefined`). If enabled AND `required === true`, ensure fallback comments are non-empty strings.
  14. Build rows array: for each available student, create a `GeneratedRowDto` with `externalId` = `gen_{studentUsername}_{Date.now()}_{index}` (index prevents collision within batch), their username, faculty username, course shortname, generated answers, and assigned comment.
  15. Return `GeneratePreviewResponseDto` with metadata (counts, faculty/course/semester/version info, `maxScore`), questions (id + text + sectionName), and rows.

  **`CommitSubmissions(dto: GenerateCommitRequestDto): Promise<CommitResultDto>`**
  1. Load version by `dto.versionId` with populate `['questionnaire.type']`. Throw `NotFoundException` if not found, `BadRequestException` if not active.
  2. Load faculty by finding the first row's `facultyUsername` (all rows share the same faculty). **Store `faculty.id` as a plain string** — not the entity reference. Throw `NotFoundException` if not found.
  3. Load course by finding the first row's `courseShortname` (all rows share the same course) with populate `['program.department.semester']`. **Store `course.id` and `semester.id` as plain strings.** Throw `NotFoundException` if not found.
  4. Resolve semester from `course.program.department.semester`. Throw `BadRequestException` if hierarchy incomplete.
  5. Loop over `dto.rows`, for each row:
     a. Look up student user by `row.username` (exact match on `userName`). If not found, record as failure and continue.
     b. Call `this.questionnaireService.submitQuestionnaire({ versionId: dto.versionId, respondentId: student.id, facultyId, semesterId, courseId, answers: row.answers, qualitativeComment: row.comment })`.
     - **Note**: `submitQuestionnaire()` signature is `submitQuestionnaire(data: {...}, options?: { skipAnalysis?: boolean })` — it does NOT accept an EntityManager parameter. It uses `this.em` internally and does its own `findOneOrFail()` lookups + `em.persist()` + `em.flush()` per call.
     - **Note on field mapping**: The preview row uses `comment`, but `submitQuestionnaire` expects `qualitativeComment`. Map explicitly: `qualitativeComment: row.comment`.
     - **Note on answers format**: `submitQuestionnaire` accepts `answers: Record<string, number>` — the preview row already uses this format, no conversion needed.
       c. On success: record `{ externalId: row.externalId, success: true, internalId: response.id }`
       d. On any `HttpException` (`ConflictException`, `ForbiddenException`, `BadRequestException`, `NotFoundException`):
     - Record `{ externalId: row.externalId, success: false, error: err.message }`
     - **Call `this.em.clear()`** to discard dirty EM state from the failed `flush()`. This is critical — MikroORM's EM enters an inconsistent state after a failed flush, and subsequent calls would re-attempt the failed entities. Since we pass IDs (not entity references), `em.clear()` is safe — `submitQuestionnaire()` re-fetches everything by ID internally on the next iteration.
       e. On unexpected errors: record failure with `err.message`, call `this.em.clear()`.
  6. Aggregate results into `CommitResultDto` shape: `{ commitId: randomUUID(), total, successes, failures, dryRun: false, records }`.
  7. Return the result.
  - Notes: No IngestionEngine, no ArrayAdapter, no IngestionMapperService. `submitQuestionnaire()` manages its own EM operations internally — we do NOT fork the EM or pass it as a parameter. On failure, `em.clear()` resets dirty state so the next row starts clean. All validation (enrollment checks, unique constraints, answer range, qualitative comment) is handled by `submitQuestionnaire()` itself. Post-submission side effects (analysis jobs, cache invalidation) also fire normally.

- [ ] **Task 5: Add filter endpoints to AdminFiltersController**
  - File: `api.faculytics/src/modules/admin/admin-filters.controller.ts`
  - Action: Add 4 new endpoints following the existing pattern:
    - `GET /admin/filters/faculty` — delegates to `AdminFiltersService.GetFaculty()`
    - `GET /admin/filters/courses` — accepts `FilterCoursesQueryDto` (required `facultyUsername`), delegates to `AdminFiltersService.GetCoursesForFaculty(facultyUsername)`
    - `GET /admin/filters/questionnaire-types` — delegates to `AdminFiltersService.GetQuestionnaireTypes()`
    - `GET /admin/filters/questionnaire-versions` — accepts `FilterQuestionnaireVersionsQueryDto` (required `typeId`), delegates to `AdminFiltersService.GetQuestionnaireVersions(typeId)`
  - Notes: Each endpoint gets `@Get()`, `@ApiOperation()`, `@ApiResponse()`, and `@ApiQuery()` decorators matching the existing pattern. All inherit the class-level `@UseJwtGuard(UserRole.SUPER_ADMIN)`.

- [ ] **Task 6: Add filter service methods to AdminFiltersService**
  - File: `api.faculytics/src/modules/admin/services/admin-filters.service.ts`
  - Action: Add 4 new methods:
    - `GetFaculty(): Promise<FilterFacultyResponseDto[]>` — Query distinct users who have at least one active `EDITING_TEACHER` enrollment. Return `{ id, username: user.userName, fullName: user.firstName + ' ' + user.lastName }`. Order by `fullName ASC`.
    - `GetCoursesForFaculty(facultyUsername: string): Promise<FilterCourseResponseDto[]>` — Find user by `userName`, then query active `EDITING_TEACHER` enrollments for that user, populate `['course']`. Map to `{ id: course.id, shortname: course.shortname, fullname: course.fullname }`. Throw `NotFoundException` if user not found.
    - `GetQuestionnaireTypes(): Promise<FilterOptionResponseDto[]>` — Query all `QuestionnaireType` entities, map via `FilterOptionResponseDto.Map()`. Order by `code ASC`. Note: `FilterOptionResponseDto.name` is `string | null` — the frontend `QuestionnaireTypeOption.name` is `string`; handle null safely in the Map method or ensure types always have names.
    - `GetQuestionnaireVersions(typeId: string): Promise<FilterVersionResponseDto[]>` — Query `QuestionnaireVersion` where `questionnaire.type.id = typeId` and `isActive = true`. Map via `FilterVersionResponseDto.Map()`. Throw `NotFoundException` if type not found.
  - Notes: Import `QuestionnaireType` and `QuestionnaireVersion` entities. These need to be added to `MikroOrmModule.forFeature()` in the admin module (Task 8).

- [ ] **Task 7: Create AdminGenerateController**
  - File: `api.faculytics/src/modules/admin/admin-generate.controller.ts` (NEW)
  - Action: Create controller with prefix `admin/generate-submissions`, class-level `@UseJwtGuard(UserRole.SUPER_ADMIN)` and `@ApiBearerAuth()`:
    - `POST /admin/generate-submissions/preview` — accepts `@Body() dto: GeneratePreviewRequestDto`, delegates to `AdminGenerateService.GeneratePreview(dto)`, returns `GeneratePreviewResponseDto`
    - `POST /admin/generate-submissions/commit` — accepts `@Body() dto: GenerateCommitRequestDto`, delegates to `AdminGenerateService.CommitSubmissions(dto)`, returns `CommitResultDto`
  - Notes: Add Swagger decorators (`@ApiTags('Admin')`, `@ApiOperation()`, `@ApiResponse()`). The commit endpoint may take time due to ingestion processing — document that the client should expect latency.

- [ ] **Task 8: Register new services and controllers in AdminModule**
  - File: `api.faculytics/src/modules/admin/admin.module.ts`
  - Action:
    - Add `QuestionnaireModule` to the `imports` array — this provides `QuestionnaireService` and `QuestionnaireTypeService`
    - Add `QuestionnaireType`, `QuestionnaireVersion`, `QuestionnaireSubmission` to the `MikroOrmModule.forFeature([...])` array
    - Add `AdminGenerateController` to the `controllers` array
    - Add `AdminGenerateService`, `CommentGeneratorService` to the `providers` array
  - Notes: `QuestionnaireModule` already exports `QuestionnaireService` (needed for `submitQuestionnaire()`) and `QuestionnaireTypeService`. No need to import `IngestionEngine` or `IngestionMapperService` — we bypass the ingestion pipeline entirely.
  - **Scope safety note**: `QuestionnaireModule` imports `DataLoaderModule` which provides `IngestionMappingLoader` (`Scope.REQUEST`). However, NestJS scope propagation follows the **injection graph**, not the module graph. `QuestionnaireService` does NOT inject `IngestionMappingLoader` — that's only injected by `IngestionMapperService`. Since `AdminGenerateService` only injects `QuestionnaireService`, the request-scoped chain does not propagate. The import is safe for singleton-scoped consumers.

- [ ] **Task 9: Unit tests for CommentGeneratorService**
  - File: `api.faculytics/src/modules/admin/services/__tests__/comment-generator.service.spec.ts` (NEW)
  - Action: Test:
    - Successful generation: mock OpenAI to return valid JSON array of strings, verify count matches
    - Fallback on API error: mock OpenAI to throw, verify fallback comments returned (not an error)
    - Fallback on invalid JSON: mock OpenAI to return non-array, verify fallback
    - Context passed to prompt: verify course/faculty name appear in the prompt sent to OpenAI
  - Notes: Mock OpenAI client with `jest.fn()`. Don't test actual API calls.

- [ ] **Task 10: Unit tests for AdminGenerateService**
  - File: `api.faculytics/src/modules/admin/services/__tests__/admin-generate.service.spec.ts` (NEW)
  - Action: Test `GeneratePreview()`:
    - Happy path: mock version (active), faculty, course (with semester hierarchy), enrollments (3 students), no existing submissions, mock comment generator. Verify response has 3 rows, correct metadata counts, all questions have answers in valid range.
    - No available students: mock all students already submitted. Verify `BadRequestException`.
    - Version not active: verify `BadRequestException`.
    - Faculty not enrolled as EDITING_TEACHER: verify `BadRequestException`.
    - Missing semester hierarchy: verify `BadRequestException`.
  - Action: Test `CommitSubmissions()`:
    - Happy path: mock version (active), faculty, course (with semester), student lookups. Verify `questionnaireService.submitQuestionnaire()` called once per row with correct args (especially `qualitativeComment` mapped from `comment`). Verify result aggregation (successes/failures counts).
    - Partial failure (ConflictException): mock one row throwing `ConflictException`. Verify result shows correct success/failure split and `em.clear()` is called after the failure.
    - Partial failure (ForbiddenException): mock one row throwing `ForbiddenException`. Verify it's caught and recorded as failure (not re-thrown as HTTP 403).
    - Version not found: verify `NotFoundException`.
  - Notes: Mock `EntityManager`, `CommentGeneratorService`, `QuestionnaireService`. Follow `admin.service.spec.ts` mocking pattern.

- [ ] **Task 11: Unit tests for new filter endpoints**
  - File: `api.faculytics/src/modules/admin/services/__tests__/admin-filters.service.spec.ts` (update or NEW)
  - Action: Test new methods:
    - `GetFaculty()`: mock enrollment query returning users, verify response shape
    - `GetCoursesForFaculty()`: mock user lookup + enrollment query, verify course mapping. Test `NotFoundException` for unknown username.
    - `GetQuestionnaireTypes()`: mock type query, verify mapping
    - `GetQuestionnaireVersions()`: mock version query with type filter, verify only active returned
  - Notes: If existing test file exists, add tests there. Otherwise create new file.

#### Phase 2: Admin Console Frontend

**File structure:**

```
src/features/submission-generator/
├── generator-page.tsx                  # Main page (route target, orchestrates view state)
├── components/
│   ├── selection-form.tsx              # Two-track selection panel with cascading selects
│   ├── preview-panel.tsx               # Metadata card + scrollable table + commit action
│   └── commit-result-dialog.tsx        # Post-commit results summary dialog
├── use-generator-filters.ts            # React Query hooks for 4 filter endpoints
└── use-generate-submissions.ts         # Preview + commit mutation hooks
```

- [ ] **Task 12: Add API types for submission generator**
  - File: `admin.faculytics/src/types/api.ts`
  - Action: Add TypeScript interfaces at the end of the file:

    ```typescript
    // --- Submission Generator ---

    // Filter response types
    export interface FacultyFilterOption {
      id: string;
      username: string;
      fullName: string;
    }
    export interface CourseFilterOption {
      id: string;
      shortname: string;
      fullname: string;
    }
    export interface QuestionnaireTypeOption {
      id: string;
      name: string;
      code: string;
    }
    export interface QuestionnaireVersionOption {
      id: string;
      versionNumber: number;
      isActive: boolean;
    }

    // Generator types
    export interface GeneratePreviewRequest {
      versionId: string;
      facultyUsername: string;
      courseShortname: string;
    }
    export interface GeneratedRow {
      externalId: string;
      username: string;
      facultyUsername: string;
      courseShortname: string;
      answers: Record<string, number>;
      comment?: string;
    }
    export interface PreviewQuestion {
      id: string;
      text: string;
      sectionName: string;
    }
    export interface GeneratePreviewResponse {
      metadata: {
        faculty: { username: string; fullName: string };
        course: { shortname: string; fullname: string };
        semester: { code: string; label: string; academicYear: string };
        version: { id: string; versionNumber: number };
        maxScore: number;
        totalEnrolled: number;
        alreadySubmitted: number;
        availableStudents: number;
        generatingCount: number;
      };
      questions: PreviewQuestion[];
      rows: GeneratedRow[];
    }
    export interface GenerateCommitRequest {
      versionId: string;
      rows: GeneratedRow[];
    }
    export interface CommitResult {
      commitId: string;
      total: number;
      successes: number;
      failures: number;
      records: {
        externalId: string;
        success: boolean;
        error?: string;
        internalId?: string;
      }[];
    }
    ```

  - Notes: Follow existing export patterns in the file. All types are exported for use across the feature.

- [ ] **Task 13: Create React Query hooks for generator**
  - File: `admin.faculytics/src/features/submission-generator/use-generator-filters.ts` (NEW)
  - Action: Create filter hooks following the `use-admin-filters.ts` pattern:

    ```typescript
    export function useFacultyFilter(): UseQueryResult<FacultyFilterOption[]>;
    // queryKey: ['generator-filters', 'faculty', activeEnvId]
    // queryFn: apiClient<FacultyFilterOption[]>('/admin/filters/faculty')
    // enabled: !!activeEnvId && isAuth
    // staleTime: 5 * 60_000

    export function useCoursesFilter(
      facultyUsername?: string,
    ): UseQueryResult<CourseFilterOption[]>;
    // queryKey: ['generator-filters', 'courses', facultyUsername, activeEnvId]
    // queryFn: apiClient<CourseFilterOption[]>(`/admin/filters/courses?facultyUsername=${facultyUsername}`)
    // enabled: !!activeEnvId && isAuth && !!facultyUsername

    export function useQuestionnaireTypesFilter(): UseQueryResult<
      QuestionnaireTypeOption[]
    >;
    // queryKey: ['generator-filters', 'questionnaire-types', activeEnvId]
    // queryFn: apiClient<QuestionnaireTypeOption[]>('/admin/filters/questionnaire-types')

    export function useVersionsFilter(
      typeId?: string,
    ): UseQueryResult<QuestionnaireVersionOption[]>;
    // queryKey: ['generator-filters', 'versions', typeId, activeEnvId]
    // queryFn: apiClient<QuestionnaireVersionOption[]>(`/admin/filters/questionnaire-versions?typeId=${typeId}`)
    // enabled: !!activeEnvId && isAuth && !!typeId
    ```

  - Notes: Use `useEnvStore` for `activeEnvId` and auth check, matching the existing `use-admin-filters.ts` hook pattern.

  - File: `admin.faculytics/src/features/submission-generator/use-generate-submissions.ts` (NEW)
  - Action: Create mutation hooks:

    ```typescript
    export function useGeneratePreview(): UseMutationResult<
      GeneratePreviewResponse,
      ApiError,
      GeneratePreviewRequest
    >;
    // mutationFn: apiClient<GeneratePreviewResponse>('/admin/generate-submissions/preview', {
    //   method: 'POST', body: JSON.stringify(request)
    // })
    // onError: toast specific messages for known status codes:
    //   400 → parse body for descriptive message (e.g., "All students have already submitted")
    //   404 → "Faculty, course, or version not found"
    //   default → "Failed to generate preview"

    export function useCommitSubmissions(): UseMutationResult<
      CommitResult,
      ApiError,
      GenerateCommitRequest
    >;
    // mutationFn: apiClient<CommitResult>('/admin/generate-submissions/commit', {
    //   method: 'POST', body: JSON.stringify(request)
    // })
    // No onSuccess/onError here — handled by the component for dialog flow control
    ```

  - Notes: Preview is a mutation (not a query) because it triggers server-side AI generation and is not idempotent. Commit mutation delegates success/error handling to the component so it can control the result dialog.

- [ ] **Task 14: Create selection-form component**
  - File: `admin.faculytics/src/features/submission-generator/components/selection-form.tsx` (NEW)
  - Props:
    ```typescript
    interface SelectionFormProps {
      onPreviewReady: (
        data: GeneratePreviewResponse,
        versionId: string,
      ) => void;
      isGenerating: boolean; // from parent, to show loading state
    }
    ```
  - Action: Create two-track selection form:
    - **Layout**: Two `Card` components side-by-side using `grid grid-cols-1 md:grid-cols-2 gap-4`
    - **Left card — "Who's being evaluated?"**:
      - Faculty `Select` — populated from `useFacultyFilter()`. Display `fullName` as label, store `username` as value. Show `Loader2` in trigger while loading.
      - Course `Select` — populated from `useCoursesFilter(facultyUsername)`. Display `fullname` as label (with `shortname` in muted text), store `shortname` as value. Disabled until faculty selected.
      - Cascading reset: when faculty changes, clear course selection.
    - **Right card — "Using which form?"**:
      - Questionnaire Type `Select` — populated from `useQuestionnaireTypesFilter()`. Display `name`, store `id` as value.
      - Version `Select` — populated from `useVersionsFilter(typeId)`. Display `v{versionNumber}`, store `id` as value. Disabled until type selected.
      - Cascading reset: when type changes, clear version selection.
    - **Generate button** below the cards:
      - Text: "Generate Preview"
      - Disabled: `!facultyUsername || !courseShortname || !typeId || !versionId || isGenerating`
      - Loading state: when `isGenerating`, show `Loader2 className="animate-spin"` + text "Generating comments..."
      - onClick: call `useGeneratePreview().mutate({ versionId, facultyUsername, courseShortname })`, on success call `onPreviewReady(data, versionId)`
  - Notes: Follow `users-page.tsx` cascading select pattern. Use `useState` for all 4 field values. shadcn `Select` + `Card` + `Button` components. Lucide `Loader2` for spinner.

- [ ] **Task 15: Create preview-panel component**
  - File: `admin.faculytics/src/features/submission-generator/components/preview-panel.tsx` (NEW)
  - Props:
    ```typescript
    interface PreviewPanelProps {
      data: GeneratePreviewResponse;
      versionId: string;
      onBack: () => void;
      onCommitSuccess: (result: CommitResult) => void;
    }
    ```
  - Action: Create preview display with metadata + table + commit action:

    **Metadata summary card:**
    - `Card` at top with grid layout showing:
      - Faculty: `{fullName} ({username})`
      - Course: `{fullname} ({shortname})`
      - Semester: `{label} ({academicYear})`
      - Version: `v{versionNumber}`
    - Count badges below: `Badge variant="secondary"` for `{totalEnrolled} enrolled`, `Badge variant="outline"` (yellow-ish) for `{alreadySubmitted} submitted`, `Badge variant="default"` (green) for `{generatingCount} generating`

    **Preview table:**
    - Wrap in `ScrollArea` with `className="w-full"` for horizontal scrolling
    - shadcn `Table` with columns:
      - **Student** (first column, sticky/pinned left if possible via `sticky left-0 bg-background`)
      - **Q1, Q2, ... QN** (one column per question) — header text truncated to ~20 chars, full text in `Tooltip`. `TooltipTrigger` wraps truncated text, `TooltipContent` shows full question text + section name.
      - **Comment** (last column) — truncated to ~40 chars, full text in `Tooltip`
    - Answer cell styling: centered text, color-coded background **relative to maxScore** (from `data.metadata.maxScore`):
      - Bottom third (`value <= maxScore * 0.4`): `text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30`
      - Middle third (`value <= maxScore * 0.7`): `text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/30`
      - Top third (`value > maxScore * 0.7`): `text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/30`
      - Example: maxScore=5 → red: 1-2, yellow: 3, green: 4-5. maxScore=3 → red: 1, yellow: 2, green: 3.
    - Row count badge above table: `"Showing {rows.length} submissions"`

    **Action bar:**
    - `div` with `flex justify-between items-center pt-4`
    - Left: "Back" button (`variant="outline"`) — calls `onBack()`. **Disabled while commit is in-flight** (`commitMutation.isPending`).
    - Right: "Commit {rows.length} Submissions" button (`variant="default"`) — calls `useCommitSubmissions().mutate({ versionId, rows: data.rows })`.
      - Loading state: `Loader2 className="animate-spin"` + "Committing..."
      - On success: call `onCommitSuccess(result)`
      - On error: `toast.error('Failed to commit submissions')`, stay on preview (user can retry)

    **Navigation guard:**
    - `useEffect` that registers `beforeunload` handler when `commitMutation.isPending` is true. Message: "Submissions are being committed. Leaving now may result in partial data without confirmation."
    - Clean up handler when commit completes or component unmounts.

  - Notes: shadcn `Card`, `Table`, `Badge`, `Button`, `ScrollArea`, `Tooltip` components. Lucide `Loader2`, `ArrowLeft` icons.

- [ ] **Task 16: Create commit-result-dialog component**
  - File: `admin.faculytics/src/features/submission-generator/components/commit-result-dialog.tsx` (NEW)
  - Props:
    ```typescript
    interface CommitResultDialogProps {
      open: boolean;
      result: CommitResult | null;
      metadata: GeneratePreviewResponse['metadata'] | null;
      onGenerateMore: () => void;
      onDone: () => void;
    }
    ```
  - Action: Create result dialog using shadcn `Dialog`:
    - **Header**: "Submissions Committed" title
    - **Body**:
      - **All succeeded** (`failures === 0`): Green checkmark icon (`CheckCircle2`), text: "{successes} submissions committed successfully"
      - **Partial failures** (`failures > 0 && successes > 0`): Yellow warning icon (`AlertTriangle`), text: "{successes} succeeded, {failures} failed", sub-text: "Some students may have submitted between preview and commit."
      - **All failed** (`successes === 0`): Red error icon (`XCircle`), text: "All {failures} submissions failed", sub-text: "Data may have already been committed for these students."
    - Context summary below: Faculty, Course, Version from `metadata`
    - **Footer** with two buttons:
      - "Generate More" (`variant="outline"`) — calls `onGenerateMore()`. Resets to selection form for another round.
      - "Done" (`variant="default"`) — calls `onDone()`. Closes dialog, stays on preview as read-only.
  - Notes: shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`. Lucide `CheckCircle2`, `AlertTriangle`, `XCircle` icons.

- [ ] **Task 17: Create generator-page orchestrator**
  - File: `admin.faculytics/src/features/submission-generator/generator-page.tsx` (NEW)
  - Action: Create the main page component that orchestrates view state and child components:

    ```typescript
    type ViewState = 'selection' | 'preview';

    // State
    const [view, setView] = useState<ViewState>('selection');
    const [previewData, setPreviewData] =
      useState<GeneratePreviewResponse | null>(null);
    const [previewVersionId, setPreviewVersionId] = useState<string>('');
    const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
    const [resultDialogOpen, setResultDialogOpen] = useState(false);
    const generatePreview = useGeneratePreview();
    ```

    - **Page header**: Title "Submission Generator", subtitle "Generate test submissions for analytics testing"
    - **Selection view** (`view === 'selection'`):
      - Render `<SelectionForm onPreviewReady={handlePreviewReady} isGenerating={generatePreview.isPending} />`
      - `handlePreviewReady`: store preview data + versionId in state, switch to `'preview'` view
    - **Preview view** (`view === 'preview'`):
      - Render `<PreviewPanel data={previewData} versionId={previewVersionId} onBack={handleBack} onCommitSuccess={handleCommitSuccess} />`
      - `handleBack`: clear preview data, switch to `'selection'` view
      - `handleCommitSuccess`: store result, open result dialog
    - **Result dialog** (overlay on preview):
      - Render `<CommitResultDialog open={resultDialogOpen} result={commitResult} metadata={previewData?.metadata} onGenerateMore={handleGenerateMore} onDone={handleDone} />`
      - `handleGenerateMore`: clear ALL state (preview, result, dialog), switch to `'selection'`
      - `handleDone`: close dialog only, stay on preview as read-only

    **Navigation guard during preview generation:**
    - `useEffect` that registers `beforeunload` handler when `generatePreview.isPending` is true. Message: "Preview is being generated, are you sure?"
    - Clean up on unmount or when generation completes.

  - Notes: This is a thin orchestrator — all logic lives in child components. shadcn `Card` for page wrapper if desired. Follow the `users-page.tsx` page-level pattern.

- [ ] **Task 18: Add route and navigation**
  - File: `admin.faculytics/src/routes.tsx`
  - Action: Add route for the generator page. **CRITICAL: nest INSIDE the `AuthGuard` wrapper children**, not as a top-level route. The `AuthGuard` component protects routes and redirects unauthenticated users. Adding outside it would create an unprotected route.
    ```typescript
    { path: 'submission-generator', element: <GeneratorPage /> }
    ```
    Import: `import { GeneratorPage } from './features/submission-generator/generator-page'`
  - File: `admin.faculytics/src/components/layout/app-shell.tsx`
  - Action: Add navigation item in the sidebar for "Submission Generator" with the `FlaskConical` Lucide icon. Place it after the existing nav items. The sidebar uses a `const navItems` array with shape `{ to: string, label: string, icon: LucideIcon }` — add `{ to: '/submission-generator', label: 'Submission Generator', icon: FlaskConical }`. **Note**: if `navItems` is declared with `as const`, remove the `as const` assertion or change to an explicitly typed mutable array (`const navItems: NavItem[] = [...]`) to allow adding the new entry.
  - Notes: Import `FlaskConical` from `lucide-react`. Follow the exact sidebar nav item pattern used for existing items (icon + label, active state via route match).

### Acceptance Criteria

**Filter Endpoints:**

- [ ] AC 1: Given the API is running, when `GET /admin/filters/faculty` is called by a SUPER_ADMIN, then it returns all users who have at least one active EDITING_TEACHER enrollment with `{ id, username, fullName }` shape.
- [ ] AC 2: Given a valid faculty username, when `GET /admin/filters/courses?facultyUsername=X` is called, then it returns only courses where that faculty has an active EDITING_TEACHER enrollment.
- [ ] AC 3: Given no faculty username, when `GET /admin/filters/courses` is called, then it returns 400 Bad Request.
- [ ] AC 4: Given the API is running, when `GET /admin/filters/questionnaire-types` is called, then it returns all questionnaire types with `{ id, name, code }`.
- [ ] AC 5: Given a valid type ID, when `GET /admin/filters/questionnaire-versions?typeId=X` is called, then it returns only active versions for that type.

**Preview Endpoint:**

- [ ] AC 6: Given a valid versionId + facultyUsername + courseShortname where 10 students are enrolled and 3 have already submitted, when `POST /admin/generate-submissions/preview` is called, then it returns 7 rows with `metadata.availableStudents = 7`, `metadata.alreadySubmitted = 3`, `metadata.totalEnrolled = 10`.
- [ ] AC 7: Given the preview response, when inspecting generated rows, then every row has answers for ALL questions in the schema with values in range `[1, maxScore]`.
- [ ] AC 8 (manual verification): Given the preview response, when inspecting comments, then comments include a mix of English, Tagalog, Cebuano, and code-switched text. Unit tests verify the prompt includes language distribution instructions and responses are parsed correctly.
- [ ] AC 9: Given an inactive version, when preview is called, then it returns 400 Bad Request.
- [ ] AC 10: Given a faculty who is NOT enrolled as EDITING_TEACHER in the specified course, when preview is called, then it returns 400 Bad Request.
- [ ] AC 11: Given all students have already submitted for this version+faculty+course+semester, when preview is called, then it returns 400 Bad Request with descriptive message.

**Commit Endpoint:**

- [ ] AC 12: Given a valid preview payload POSTed to `POST /admin/generate-submissions/commit`, when `submitQuestionnaire()` processes each row, then it returns `CommitResultDto` with `successes` matching the row count and `failures = 0`.
- [ ] AC 13: Given the commit has completed, when querying the database, then `QuestionnaireSubmission` records exist for each generated row with correct faculty, course, version, and semester linkage.
- [ ] AC 14: Given the same preview payload is committed twice, when the second commit runs, then it returns HTTP 200 with `CommitResultDto` showing `successes = 0` and `failures` matching row count (unique constraint violations per row, not an HTTP error).

**Auth & Security:**

- [ ] AC 15: Given a non-SUPER_ADMIN user, when any generator or filter endpoint is called, then it returns 403 Forbidden.

**Resilience:**

- [ ] AC 16: Given the OpenAI API is unreachable or returns an error, when preview is called, then it still returns rows with generic fallback comments instead of failing entirely.

**Admin Console UI — Selection:**

- [ ] AC 17: Given a SUPER_ADMIN is logged into the admin console, when they navigate to the Submission Generator page, then they see two-track selection (faculty+course and type+version) with cascading dropdowns.
- [ ] AC 18: Given a faculty is selected, when the user opens the Course dropdown, then only courses where that faculty has an active EDITING_TEACHER enrollment are shown. When the faculty selection changes, the course selection resets.
- [ ] AC 19: Given a questionnaire type is selected, when the user opens the Version dropdown, then only active versions for that type are shown. When the type selection changes, the version selection resets.
- [ ] AC 20: Given fewer than 4 fields are selected, when the user views the "Generate Preview" button, then it is disabled.

**Admin Console UI — Preview:**

- [ ] AC 21: Given all four fields are selected, when the user clicks "Generate Preview," then a loading state with "Generating comments..." text is shown and on success a preview table displays with metadata summary card, color-coded answer columns, and truncated question headers with tooltips.
- [ ] AC 22: Given the preview table is displayed, when inspecting answer cells, then color-coding is relative to `maxScore` from metadata: bottom third red, middle third yellow, top third green (e.g., for maxScore=5: 1-2 red, 3 yellow, 4-5 green).
- [ ] AC 23: Given the preview is displayed, when the user clicks "Back," then they return to the selection form with all selections cleared.

**Admin Console UI — Commit & Results:**

- [ ] AC 24: Given the preview is displayed, when the user clicks "Commit N Submissions," then a loading state with "Committing..." text is shown, the "Back" button is disabled, and a `beforeunload` browser guard is active.
- [ ] AC 25: Given the commit succeeds with all rows, when the result dialog appears, then it shows a green checkmark with "{N} submissions committed successfully" and buttons "Generate More" and "Done."
- [ ] AC 26: Given the commit has partial failures, when the result dialog appears, then it shows a yellow warning with "{N} succeeded, {M} failed" and a message about possible duplicate submissions.
- [ ] AC 27: Given the user clicks "Generate More" in the result dialog, then all state is reset and they return to the empty selection form.
- [ ] AC 28: Given the user clicks "Done" in the result dialog, then the dialog closes and the preview remains visible as read-only.

## Additional Context

### Dependencies

**API:**

- `openai` npm package (already installed — used by ChatKit and analysis modules)
- Existing entities: User, Course, Enrollment, Semester, QuestionnaireVersion, QuestionnaireSubmission, QuestionnaireType
- Existing services: `QuestionnaireService` (exported from `QuestionnaireModule`), `QuestionnaireTypeService`
- Existing infrastructure: `OPENAI_API_KEY` env var, `@UseJwtGuard` decorator, `FilterOptionResponseDto`

**Admin Console:**

- No new npm dependencies needed — all required packages already installed (React Query, shadcn/ui, sonner, Lucide)
- Depends on Phase 1 API endpoints being available

### Testing Strategy

**Unit Tests (API):**

- `CommentGeneratorService`: mock OpenAI client, test success/fallback/invalid-response paths
- `AdminGenerateService`: mock EntityManager + CommentGenerator + QuestionnaireService, test preview logic (available students calculation, answer generation range scaled to maxScore, metadata shape, conditional comment generation based on qualitativeFeedback.enabled) and commit loop (per-row submitQuestionnaire calls, comment→qualitativeComment mapping, partial failure aggregation)
- `AdminFiltersService` (new methods): mock EntityManager, test query patterns and response mapping

**Integration Tests (manual):**

- Run `POST /admin/generate-submissions/preview` with real dev data, verify response shape and comment quality
- Run `POST /admin/generate-submissions/commit` with preview output, verify submissions appear in DB
- Verify analytics dashboards populate correctly with generated data
- Test full admin console flow: select → preview → commit → verify in DB

**Not Required:**

- Frontend unit tests (admin console has no test runner configured)
- E2E tests (internal tool, manual verification sufficient)
- Load testing (max ~50 records per course, well within pipeline capacity)

### Notes

- This is an internal developer tool — iterate fast, polish later
- ~50 students across 4 courses in current dev/staging data
- Comment generation is the only external API call — 60-second timeout with fallback to generic comments ensures preview never fails due to OpenAI issues
- Answer distribution uses per-student tendency scaled to maxScore for realistic variation — works for any Likert scale, not just 1-5
- The commit endpoint calls `submitQuestionnaire()` directly per row, meaning all existing validation (enrollment, unique constraint, answer range, qualitative comment) is applied. The generator doesn't duplicate any validation. Post-submission side effects (analysis jobs, cache invalidation) fire normally.
- Admin console uses native fetch (no Axios), React state for forms (no form library), shadcn/ui for all components
- `beforeunload` guards protect against accidental refresh during preview generation (wasted OpenAI call) and commit processing (lost result visibility). In-app navigation blocking via React Router is intentionally omitted — not worth the complexity for an internal tool.
- Preview table color-coding uses maxScore-relative thresholds for correct visual feedback regardless of scale
- Post-commit flow offers "Generate More" (reset to selection for next course) or "Done" (close dialog, stay on read-only preview) — optimized for batch generation across multiple courses

**Known Limitations (acceptable for internal tool):**

- Race condition between preview and commit: if someone submits evaluations for some students between preview and commit, those rows will fail with unique constraint violations. The result dialog handles this gracefully (shows partial failure count).
- No retry path for partially failed commits — "commit all" design means you'd need to generate a new preview to fill remaining students.
- No rate limiting on preview endpoint — each call makes an OpenAI API request. The frontend disables the button during generation, but multiple admin users or browser tabs could trigger concurrent calls.
- `externalId` format `gen_{username}_{timestamp}_{index}` is unique within a batch but could theoretically collide across batches in the same millisecond. Not a practical concern for an internal tool with manual usage.
- `dryRun` field in `CommitResult` is always `false` — included for API shape compatibility but the generator does not support dry-run mode.
