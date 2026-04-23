---
title: 'Faculty Composite Overall Rating (50/25/25)'
slug: 'faculty-composite-overall-rating'
created: '2026-04-23'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - 'NestJS 11 + TypeScript (api.faculytics)'
  - 'MikroORM + PostgreSQL (raw SQL via EntityManager.execute)'
  - 'class-validator + class-transformer for DTOs'
  - 'Swagger decorators (@ApiProperty, @ApiResponse)'
  - 'Jest (service unit tests, controller delegation tests)'
  - 'Next.js 16 + React 19 (app.faculytics)'
  - 'Tailwind 4 + shadcn/ui (Popover, AnimatedNumber)'
  - 'TanStack Query (React Query) + Zustand (useAuthStore)'
  - 'Axios (apiClient with auth-token injection + silent refresh)'
files_to_modify:
  - 'api.faculytics/src/modules/analytics/analytics.controller.ts (add GetFacultyOverview handler)'
  - 'api.faculytics/src/modules/analytics/analytics.service.ts (add GetFacultyOverview + computeFacultyPerTypeRatings helper — calls existing GetFacultyReportUnscoped 3x in a transaction)'
  - 'api.faculytics/src/modules/analytics/dto/analytics-query.dto.ts (add FacultyOverviewQueryDto with semesterId + optional courseId)'
  - 'api.faculytics/src/modules/analytics/dto/responses/faculty-overview.response.dto.ts (NEW)'
  - 'api.faculytics/src/modules/analytics/lib/composite-rating.constants.ts (NEW — typed weights, threshold, status union, shared round2)'
  - 'api.faculytics/src/modules/analytics/analytics.service.spec.ts (unit tests for GetFacultyOverview + helper + asserting parity test)'
  - 'api.faculytics/src/modules/analytics/analytics.controller.spec.ts (delegation test)'
  - 'api.faculytics/docs/architecture/analytics.md (document new endpoint + formula + coverage table + update REST table)'
  - 'api.faculytics/CLAUDE.md (short pointer to composite rating section)'
  - 'app.faculytics/network/endpoints.ts (add analyticsFacultyOverview)'
  - 'app.faculytics/features/faculty-analytics/types/index.ts (add overview types, reuse ReportFacultyDto/ReportSemesterDto)'
  - 'app.faculytics/features/faculty-analytics/api/faculty-analytics.requests.ts (add fetchFacultyOverview with optional courseId)'
  - 'app.faculytics/features/faculty-analytics/hooks/use-faculty-overview.ts (NEW, staleTime: 60_000)'
  - 'app.faculytics/features/faculty-analytics/components/composite-rating-summary-strip.tsx (NEW — rating-only strip, no sentiment, no response count)'
  - 'app.faculytics/features/faculty-analytics/components/composite-rating-breakdown-popover.tsx (NEW — children-only, no own PopoverContent)'
  - 'app.faculytics/features/faculty-analytics/components/headline-metrics-strip.tsx (accept required label prop — no default)'
  - 'app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx (restructure: sticky shell + composite strip mounted ABOVE /report early-return branches; pass per-type label)'
  - 'app.faculytics/app/(dashboard)/faculty/analytics/page.tsx (verify self-view renders composite — same FacultyReportScreen)'
  - 'app.faculytics/features/faculty-analytics/components/faculty-analysis-hero.tsx (audit: dead code per grep; delete OR rename its "Overall rating" literal)'
  - 'app.faculytics/features/faculty-analytics/index.ts (barrel re-exports if needed)'
  - 'app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx (export-button tooltip note: PDF does not include composite — V1 rollout gate)'
code_patterns:
  - 'NestJS controller: class-level @UseJwtGuard(roles) + method-level guard widening; @UseInterceptors(CurrentUserInterceptor) at class level'
  - 'Faculty scope auth: assertFacultySelfScope(currentUser, facultyId) at controller; validateFacultyScope() inside service — called for AUTH SIDE EFFECT ONLY (return value intentionally unused in composite method)'
  - 'Service aggregation: reuse existing GetFacultyReportUnscoped(facultyId, {semesterId, questionnaireTypeCode, courseId?}) to obtain per-type overallRating + submissionCount; wrap 3 calls in em.transactional for snapshot consistency'
  - 'Response DTO pattern: nested classes with @ApiProperty / @ApiPropertyOptional, nullable via `Type | null` + `nullable: true`'
  - 'Interpretation util: getInterpretation(number) from lib/interpretation.util — returns string (never null for numeric input); composite interpretation is null iff composite.rating is null'
  - 'Shared math: round2() util in lib/composite-rating.constants.ts — also referenced by BuildFacultyReportData to prevent rounding drift'
  - 'Frontend hook: useQuery keyed as ["faculty-analytics", "<resource>", params, token] with Boolean-enabled guard and staleTime: 60_000'
  - 'Frontend request: apiClient.get<T>(Endpoints.foo.replace(":param", val), { params })'
  - 'Interpretation chip styling: getFacultyReportInterpretationTextClass() / BadgeClass() from features/faculty-analytics/lib/faculty-report-detail.ts'
  - 'Popover hierarchy: caller owns <Popover>+<PopoverTrigger>+<PopoverContent>; inner content component returns children only, never its own <PopoverContent> wrapper'
test_patterns:
  - 'Backend: Jest + NestJS TestingModule; em.execute mocked via jest.fn() with .mockResolvedValueOnce chained per SQL call; service instantiated standalone with mocked deps'
  - 'Backend controller tests: guards/interceptors overridden; service methods mocked; lightweight delegation assertions only'
  - 'Backend: Given/When/Then via describe/it with setup → act → assert sections'
  - 'Parity test: ASSERTING (hard-fails CI on divergence) — composite per-type rating must equal GetFacultyReportUnscoped.overallRating for the same inputs'
  - 'Frontend: no test infrastructure exists — rely on manual smoke test + backend unit coverage'
---

# Tech-Spec: Faculty Composite Overall Rating (50/25/25)

**Created:** 2026-04-23
**Last amended:** 2026-04-23 (after 2 adversarial review rounds — 66 total findings triaged)

## Review Notes

- Adversarial review completed 2026-04-23 (post-implementation).
- Findings: 30 total (4 High / 18 Medium / 8 Low).
- Resolution approach: auto-fix real findings; skip noise/pre-existing patterns.
- **Fixed** (14): F1/F4/F16 — removed misleading `em.transactional` wrapper; updated JSDoc to accurately describe code-path-reuse parity vs best-effort cross-type consistency. F2 — added parity-test clarifying comment. F7 — `round2(coverageWeight)`. F13 — replaced if/else ladder with explicit `resolveCompositeCoverageStatus` helper keyed on `(hasFeedback, presentCount)`. F15 — exported `COMPOSITE_COVERAGE_STATUSES` array and used it in Swagger `@ApiProperty({ enum })`. F18 — narrowed `NotFoundException` catch to the literal `'Questionnaire type not found'` message so genuine faculty/semester-missing errors propagate. F21 — narrowed frontend `COMPOSITE_TYPE_ORDER` to `readonly CompositeQuestionnaireTypeCode[]`. F22 — unknown type codes now sort to end (not front) in the popover. F25 — replaced `title` attribute on PDF export button with shadcn `<Tooltip>` for a11y. F26 — replaced remaining inline `Math.round(... * 100) / 100` in `BuildFacultyReportData` with shared `round2`. F28 — added three 404-path tests (faculty missing, semester missing, non-type NotFoundException propagates). F30 — dropped `as number` cast; used proper narrowing.
- **Skipped** (16): F3 (documentation-only nit on scope-helper ordering). F5 (React Query `token` in key is a pre-existing codebase pattern, not this PR's scope). F6 — partially addressed via `"Faculty details unavailable"` placeholder on dual-failure; full redesign deferred. F8 (PARTIAL renormalization can diverge from naive calculator by a hundredth — documented as intentional chain-of-rounding behavior in the existing spec). F9 (harmless FEEDBACK_ONLY double rounding). F10/F11 (`|| null` on `profilePicture` matches pre-existing pattern at `BuildFacultyReportData:1430`; changing only one site would introduce inconsistency). F12 (courseId silent-empty parity with `/report`). F14 — popover banner already says ratings are for reference; ratings show where they exist, FEEDBACK row correctly shows `"No submissions"` when absent. F17 (test-vs-app pipe drift is a pre-existing pattern). F19 (soft-deleted type edge case). F20 (array-mutation style preference). F23 (effective-weight equality check is currently correct). F24 (React Query dedupes concurrent retries). F27 (split-commit is user's PR-hygiene choice). F29 (semester-existence documentation).
- Final gates: backend `npm run lint` (0 errors), `npm run build` (clean), `npm run test -- --testPathPatterns=analytics` (104/104 passing). Frontend `bun run typecheck` + `bun run lint` (both clean).
- Manual smoke test (Task 25) deferred to the engineer running the dev stack; the 8-scenario matrix × 4 roles checklist is preserved above for execution post-merge.

## Overview

### Problem Statement

Per-faculty analysis is currently scoped to a single questionnaire type at a time (`FACULTY_FEEDBACK`, `FACULTY_IN_CLASSROOM`, or `FACULTY_OUT_OF_CLASSROOM`). The `overallRating` returned by `GET /api/v1/analytics/faculty/:facultyId/report` is a weighted average of sections _within that one type_. There is no single number that summarizes a faculty's holistic performance across all three evaluation tracks, so the app cannot show a coherent "how is this faculty doing overall?" headline score that consumers (frontend, PDF reports) can agree on.

### Solution

Introduce a backend-computed **composite overall rating** that weights the three per-type overalls:

- **50%** — Faculty Feedback (`FACULTY_FEEDBACK`)
- **25%** — Faculty Out-of-Classroom (`FACULTY_OUT_OF_CLASSROOM`)
- **25%** — Faculty In-Classroom (`FACULTY_IN_CLASSROOM`)

Expose the composite through a dedicated backend endpoint `GET /api/v1/analytics/faculty/:facultyId/overview?semesterId=Y[&courseId=Z]` that returns the composite rating, interpretation, per-type contributions, and a `coverageStatus` describing how complete the input data is. The composite reuses the existing per-type rating computation path (via `GetFacultyReportUnscoped` called once per type inside a transaction) so it is numerically identical to what the per-type `/report` endpoint returns — parity is guaranteed by code-path reuse, not reproduction. On the frontend, render the composite inside a **summary strip** mounted _above_ any loading/error branches of the per-type report so it remains visible even when `/report` fails. A click-triggered **popover** surfaces the breakdown — per-type ratings, effective weights (post-renormalization), contributions, and a coverage-status banner.

### Stakeholder & Origin

- Ask originated from a Dean stakeholder: "overall rating should be 50% Feedback / 25% Out / 25% In."
- Missing-type handling and the breakdown popover are product-engineering additions to make the composite trustworthy and transparent when coverage is incomplete.
- **Dean-respecting default** (post-adversarial-review F26): when the 50%-weight FEEDBACK track is missing entirely, the composite rating is `null` — we refuse to publish a number that would silently invert the Dean's weighting. The coverage status still distinguishes the case (`PARTIAL_NO_FEEDBACK`) so the UI can show IN + OUT ratings transparently in the popover.

### Scope

**In Scope:**

- Backend: new `GET /api/v1/analytics/faculty/:facultyId/overview?semesterId=Y[&courseId=Z]` endpoint returning composite rating, interpretation, per-type contributions, and coverage status
- Backend: `courseId` propagation — composite follows the same scope filter as the per-type `/report` endpoint to avoid on-page number mismatches (adversarial review F7)
- Backend: composite computation via **Path B** — reuse `GetFacultyReportUnscoped(facultyId, {semesterId, questionnaireTypeCode, courseId?})` three times inside `em.transactional()` for snapshot consistency (adversarial review F4, F9)
- Backend: response DTO `FacultyOverviewResponseDto` with composite + contributions + coverageStatus
- Backend: **asserting parity unit test** — composite per-type rating MUST equal `GetFacultyReportUnscoped.overallRating` for same inputs; divergence blocks CI (F11, F32)
- Backend: shared `round2()` util to prevent rounding drift between composite and `/report` (F17)
- Frontend `features/faculty-analytics`: composite summary strip mounted **in an always-rendered shell** above the `/report`-driven early-return branches (F12) — strip remains visible on `/report` error/loading
- Frontend: React Query hook + request function with `staleTime: 60_000` (F30); summary-strip wired into **all four** per-faculty analysis pages: campus-head, chairperson, dean, and FACULTY self-view (at `app/(dashboard)/faculty/analytics/page.tsx` — note: `analytics`, not `analysis`)
- Frontend: rename existing `HeadlineMetricsStrip` label — make `label` prop REQUIRED (no default); per-type callers pass e.g. "Faculty Feedback rating"
- Type definitions updated on both API (DTO) and frontend (feature slice types), reusing `FacultyReportFacultyDto` / `FacultyReportSemesterDto` to avoid shape drift
- Unit tests covering six `coverageStatus` branches (`FULL`, `PARTIAL`, `PARTIAL_NO_FEEDBACK`, `FEEDBACK_ONLY`, `INSUFFICIENT`, `NO_DATA`) + null-rating-with-positive-submissionCount edge case + asserting parity
- Documentation update: add composite formula + coverage-status reference to `docs/architecture/analytics.md` (including updating the canonical endpoint table) and a pointer in the root CLAUDE.md
- **V1 rollout gate** (F27): PDF export button tooltip notes "PDF export shows per-track ratings; composite rating is available in the dashboard view" — until the follow-up lands

**Out of Scope:**

- Changing existing per-type `overallRating` semantics on `GET /analytics/faculty/:id/report` (stays unchanged for backward compatibility)
- **No refactor of `BuildFacultyReportData`** — the composite reuses the existing call path via `GetFacultyReportUnscoped`
- Historical recomputation or backfill — composite is derived on-read from stored submissions
- Aggregating composite across faculties (dean / campus-head / department roll-ups) — separate spec
- Aggregating composite across semesters or academic years
- Changes to scoring for sentiment, topic model, or qualitative analysis fields
- PDF composite rendering — deferred to a **named fast-follow** `FAC-XX: PDF composite rating` (see Future Considerations). V1 ships with a dashboard tooltip explaining the limitation.
- Pipeline-completion cache invalidation for the composite — matches the existing `/report` behaviour (separate concern, see Known Limitations)
- OpenAPI client-type generation pipeline — `CompositeCoverageStatus` is declared in three places (backend constants, frontend types, docs) with cross-reference comments; a future spec can add codegen if drift becomes painful

## Context for Development

### Codebase Patterns

**Backend (api.faculytics)**

1. **Controller pattern** (`src/modules/analytics/analytics.controller.ts`)
   - Class-level: `@UseJwtGuard(DEAN, CHAIRPERSON, CAMPUS_HEAD, SUPER_ADMIN)` + `@UseInterceptors(CurrentUserInterceptor)` (lines 35–41).
   - Per-faculty endpoints widen with `FACULTY` at the method decorator and call `assertFacultySelfScope(this.currentUserService.getOrFail(), facultyId)` before delegating to service.
   - Swagger: `@ApiOperation`, `@ApiQuery` (one per query param), `@ApiResponse({ status: 200, type: ... })`.
   - Existing route handler to mirror: `GetFacultyReport` at lines 84–105.

2. **Service pattern** (`src/modules/analytics/analytics.service.ts`)
   - Public method entry (e.g., `GetFacultyReport` at lines 555–575) → calls `validateFacultyScope()` → resolves metadata → calls private `BuildFacultyReportData()` at line 1141.
   - **`GetFacultyReportUnscoped(facultyId, FacultyReportQueryDto)`** exists at line 578–596 — thin wrapper that calls `resolveVersionIds` + `BuildFacultyReportData` without running `validateFacultyScope`. **This is the method the composite reuses** three times per page mount (once per canonical type code).
   - Aggregation uses raw SQL through `em.getConnection().execute(sql, params)`; `pgArray()` helper for array params.
   - `getInterpretation(rating: number): string` util imported from `src/modules/analytics/lib/interpretation.util.ts` at line 14 — **clamps rating to [1.0, 5.0] and always returns a non-null string**. `composite.interpretation` is `null` if and only if `composite.rating` is `null` (F8).
   - `BuildFacultyReportData`'s `overallRating` has three null-paths (submissionCount === 0, totalWeight === 0, all sections filter to zero scored questions). The composite treats any `rating === null` as "type not present" → coverage model is keyed on `rating !== null`, not `submissionCount > 0` (F1/F4/F14 from round 1).
   - **`validateFacultyScope` return shape** (confirmed at `analytics.service.ts:1501–1567`): returns `{ first_name, last_name } | null`. It does NOT return `profilePicture`. The composite method calls `validateFacultyScope` purely for its auth side effect (throw on scope mismatch); the return value is intentionally unused. Faculty metadata (incl. `profilePicture`) is fetched via a dedicated SQL query mirroring lines 1148–1186 (F2/F3 from round 2).

3. **DTO pattern** (`src/modules/analytics/dto/`)
   - Query/param DTOs: class-validator decorators (`@IsUUID`, `@IsString`, `@IsOptional`, `@IsNotEmpty`, `@Transform(trim)`). Reference: `BaseFacultyReportQueryDto` at `dto/analytics-query.dto.ts:83–97`.
   - Response DTOs: `dto/responses/*.response.dto.ts`, nested classes with `@ApiProperty`/`@ApiPropertyOptional`, nullability as `Type | null` + `nullable: true`.
   - Reference implementation: `dto/responses/faculty-report.response.dto.ts` (146 lines).
   - `GlobalValidationPipe` has `whitelist: true, forbidNonWhitelisted: true` — extra query params return 400. No extra guard needed.

4. **Auth scope helpers**
   - `assertFacultySelfScope(currentUser, facultyId)` from `src/modules/analytics/lib/faculty-scope.util.ts` — throws Forbidden if FACULTY user != facultyId; elevated roles bypass.
   - `validateFacultyScope(facultyId, semesterId)` on the service (lines 1501–1567) — resolves department-scoped access. **Return value NOT reused for metadata** by the composite method (see §2).

5. **Module wiring** (`analytics.module.ts`)
   - Adding a new service method + DTOs + constants file requires **no module changes**.

6. **Questionnaire types**
   - Canonical codes in `src/seeders/infrastructure/questionnaire-type.seeder.ts`: `FACULTY_FEEDBACK`, `FACULTY_IN_CLASSROOM`, `FACULTY_OUT_OF_CLASSROOM`.
   - Stored in `QuestionnaireType`; queried via `em.find(QuestionnaireType, { code: { $in: [...] } })`.

**Frontend (app.faculytics)**

1. **Route structure** (four entry points; all render `<FacultyReportScreen />`)
   - `app/(dashboard)/campus-head/faculties/[facultyId]/analysis/page.tsx` — elevated role, `:facultyId` path param
   - `app/(dashboard)/chairperson/faculties/[facultyId]/analysis/page.tsx` — elevated role, `:facultyId` path param
   - `app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx` — elevated role, `:facultyId` path param
   - **`app/(dashboard)/faculty/analytics/page.tsx`** — FACULTY **self-view**. No `:facultyId` in URL; the component reads `me.data.id` and passes it as `facultyId` to `FacultyReportScreen`. URL shape: `/faculty/analytics?semesterId=X[&questionnaireTypeCode=Y][&courseId=Z]` (F1, verified).
   - `semesterId`, `questionnaireTypeCode`, and (optionally) `courseId` come from URL query string, resolved inside `useFacultyReportDetailViewModel`.

2. **Screen composition** (`features/faculty-analytics/components/faculty-report-screen.tsx`)
   - Outer `<section className="max-w-full space-y-6 overflow-x-clip px-1 pb-4 md:p-8">` (~lines 157–360).
   - **Structural change for F12**: before the spec amendment, the screen early-returns on `reportQuery.isLoading / isError` at lines 131/139, which would make the composite strip unreachable in `/report` failure. The amended screen mounts an **always-rendered shell** containing:
     1. Sticky title row (avatar + `FacultyReportHeader`) at line 160.
     2. Semester label (lines 192–195).
     3. `<CompositeRatingSummaryStrip ... />` — **always rendered** regardless of `/report` state.
   - Underneath the shell, an **inner region** renders one of:
     - `/report` loading → `<ScopedAnalyticsLoadingState />`
     - `/report` error → `<ScopedAnalyticsErrorState />`
     - `/report` success → `<HeadlineMetricsStrip label={perTypeLabel} .../>` + tabs
   - Loading/error components remain unchanged.
   - **Unified empty-state on `NO_DATA`** (F13): when all three per-type reports return zero submissions, the composite strip's `"No submissions yet for this semester."` banner becomes the primary message; the per-type `ScopedAnalyticsEmptyState` receives a muted `"No per-tab breakdown available."` copy to avoid duplicate messaging.

3. **React Query hook pattern** (`features/faculty-analytics/hooks/use-faculty-report.ts`)
   - `useQuery({ queryKey, enabled, queryFn, staleTime: 60_000 })`.
   - `token` pulled from `useAuthStore` (Zustand).
   - The new `useFacultyOverview` hook uses the same pattern with `staleTime: 60_000` explicitly (F30) so tab-switch stability doesn't rely on React Query defaults.

4. **Request function pattern** (`features/faculty-analytics/api/faculty-analytics.requests.ts`)
   - `apiClient.get<TResponseDto>(Endpoints.foo.replace(":param", val), { params })`. Shared axios client from `@/network/axios`.

5. **Endpoint enum** (`network/endpoints.ts`)
   - Plain TS enum with path-template strings (`:facultyId` placeholder).

6. **Types** (`features/faculty-analytics/types/index.ts`)
   - All DTO/query types centralized in one file.
   - Existing `FacultyReportFacultyDto` and `FacultyReportSemesterDto` are reused by the new `FacultyOverviewResponseDto` to avoid shape drift.

7. **Popover primitive** (`components/ui/popover.tsx`)
   - Radix-based. Hierarchy locked: caller owns `<Popover>` + `<PopoverTrigger>` + `<PopoverContent>`; inner breakdown component returns children only.

8. **Interpretation chip styling** (`features/faculty-analytics/lib/faculty-report-detail.ts:129–149`)
   - `getFacultyReportInterpretationTextClass(interpretation: string | null): string` — returns `"text-foreground"` for null. **The chip itself is not rendered when `interpretation === null`** (F29).

9. **Feature-sliced architecture constraints** (`docs/ARCHITECTURE.md`)
   - Components → `features/faculty-analytics/components/`
   - Hooks → `features/faculty-analytics/hooks/`
   - Requests → `features/faculty-analytics/api/` (no React imports here)
   - Types → `features/faculty-analytics/types/index.ts`

### Files to Reference

| File                                                                                                    | Purpose                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.faculytics/src/modules/analytics/analytics.controller.ts:84–105`                                   | `GetFacultyReport` — decorator stack to mirror for `GetFacultyOverview`                                                                                                                               |
| `api.faculytics/src/modules/analytics/analytics.service.ts:555–575`                                     | `GetFacultyReport` entry point                                                                                                                                                                        |
| `api.faculytics/src/modules/analytics/analytics.service.ts:578–596`                                     | **`GetFacultyReportUnscoped`** — reused by the composite (called 3× per mount)                                                                                                                        |
| `api.faculytics/src/modules/analytics/analytics.service.ts:1141–1463`                                   | `BuildFacultyReportData` — read-only reference (not refactored)                                                                                                                                       |
| `api.faculytics/src/modules/analytics/analytics.service.ts:1148–1186`                                   | Faculty + semester metadata SQL pattern — mirror in composite method                                                                                                                                  |
| `api.faculytics/src/modules/analytics/analytics.service.ts:1501–1567`                                   | `validateFacultyScope` — returns `{first_name,last_name} \| null`; called for side effect only                                                                                                        |
| `api.faculytics/src/modules/analytics/lib/interpretation.util.ts`                                       | `getInterpretation()` — always returns a non-null string for numeric input                                                                                                                            |
| `api.faculytics/src/modules/analytics/lib/faculty-scope.util.ts`                                        | `assertFacultySelfScope` — used in controller                                                                                                                                                         |
| `api.faculytics/src/modules/analytics/dto/analytics-query.dto.ts:83–97`                                 | `BaseFacultyReportQueryDto` — decorator convention reference                                                                                                                                          |
| `api.faculytics/src/modules/analytics/dto/responses/faculty-report.response.dto.ts`                     | DTO style; `ReportFacultyDto` + `ReportSemesterDto` reused by overview DTO                                                                                                                            |
| `api.faculytics/src/modules/reports/processors/report-generation.processor.ts:53`                       | PDF reports consume `GetFacultyReportUnscoped` per-type — PDF follow-up will add composite block                                                                                                      |
| `api.faculytics/src/modules/analytics/analytics.service.spec.ts`                                        | Mock patterns + describe/it structure                                                                                                                                                                 |
| `api.faculytics/src/modules/analytics/analytics.controller.spec.ts:1–150`                               | Lightweight delegation test pattern                                                                                                                                                                   |
| `api.faculytics/src/seeders/infrastructure/questionnaire-type.seeder.ts`                                | Canonical three type codes                                                                                                                                                                            |
| `api.faculytics/docs/architecture/analytics.md`                                                         | Locate `### Faculty Self-View Authorization` (NOT `### Faculty Self-View Redaction` which also exists — use full heading) and insert composite subsection after; also update the canonical REST table |
| `app.faculytics/app/(dashboard)/{campus-head,chairperson,dean}/faculties/[facultyId]/analysis/page.tsx` | Three elevated-role routes with `:facultyId` path param                                                                                                                                               |
| `app.faculytics/app/(dashboard)/faculty/analytics/page.tsx`                                             | **FACULTY self-view** — path is `analytics`, no `:facultyId`; uses `me.data.id`                                                                                                                       |
| `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx:157–360`                | Restructured mount site — composite strip in always-rendered shell above early-returns                                                                                                                |
| `app.faculytics/features/faculty-analytics/components/headline-metrics-strip.tsx:68`                    | `"Overall rating"` literal to replace with `label` prop (required, no default)                                                                                                                        |
| `app.faculytics/features/faculty-analytics/components/faculty-analysis-hero.tsx:86`                     | **Dead code** (zero consumers per grep) — delete or rename the `"Overall rating"` literal (F33)                                                                                                       |
| `app.faculytics/features/faculty-analytics/hooks/use-faculty-report.ts`                                 | Hook template                                                                                                                                                                                         |
| `app.faculytics/features/faculty-analytics/api/faculty-analytics.requests.ts:85–92`                     | `fetchFacultyReport` pattern                                                                                                                                                                          |
| `app.faculytics/features/faculty-analytics/types/index.ts`                                              | Existing `FacultyReportFacultyDto` / `FacultyReportSemesterDto` — reused by overview DTO                                                                                                              |
| `app.faculytics/features/faculty-analytics/lib/faculty-report-detail.ts:129–149`                        | `getFacultyReportInterpretationTextClass/BadgeClass` — reuse                                                                                                                                          |
| `app.faculytics/network/endpoints.ts`                                                                   | Add `analyticsFacultyOverview`                                                                                                                                                                        |
| `app.faculytics/components/ui/popover.tsx`                                                              | Popover primitives                                                                                                                                                                                    |
| `app.faculytics/features/dimensions/components/dimension-code-select.tsx:24–106`                        | Controlled Popover usage reference                                                                                                                                                                    |

### Technical Decisions

All decisions below were ratified through 2 rounds of adversarial review + party-mode triage on 2026-04-23.

1. **Composite lives on the backend** so all consumers agree on the number.
2. **New dedicated endpoint** `GET /api/v1/analytics/faculty/:facultyId/overview?semesterId=Y[&courseId=Z]` — not a field on `/report`. Called once per page mount.
3. **Overview query scope propagation** (F7 resolution): `FacultyOverviewQueryDto` contains:
   - `semesterId: string` (required UUID, `@IsNotEmpty`, trimmed)
   - `courseId?: string` (optional UUID) — **propagated into the composite** so the composite and the per-type strip always reflect the same scope filter on the same page. No `questionnaireTypeCode` (composite spans all three).
   - `GlobalValidationPipe`'s `forbidNonWhitelisted: true` rejects unknown params automatically.
4. **Per-type rating computation — Path B: reuse `GetFacultyReportUnscoped`** (F4 resolution):
   - The composite method calls `this.GetFacultyReportUnscoped(facultyId, { semesterId, questionnaireTypeCode, courseId })` **three times** (once per `COMPOSITE_TYPE_ORDER` entry) inside `this.em.transactional(async () => ...)` for snapshot consistency (F9).
   - From each returned `FacultyReportResponseDto`, extract `overallRating` and `submissionCount` only. Discard everything else.
   - **Parity is guaranteed by code-path reuse** — the composite's per-type rating is literally the same number `/report` returns. No aggregation duplication. This auto-resolves F5 (version status filter), F6 (schema_snapshot selection), and the F32 parity ambiguity (the test becomes a trivial identity check but remains asserting for defense-in-depth).
   - If `GetFacultyReportUnscoped` throws (e.g., `NotFoundException` for a missing type), catch per-type and treat as `{ rating: null, submissionCount: 0 }` — the canonical types are seeded so this path is unreachable in practice but we code defensively.
   - **Cost**: 3× full-report computation per page mount. Acceptable for V1; benchmark in smoke testing. If it becomes a hotspot, a narrower helper (Path A: duplicate the aggregation SQL + schema walk) is a clean follow-up with a concrete benchmark.
5. **Coverage-status model — keyed on `rating !== null`, `PARTIAL_NO_FEEDBACK` returns null composite** (F26 resolution):

   Let `presentTypes = { t ∈ {FEEDBACK, IN, OUT} : rating(t) !== null }` and `coverageWeight = Σ weight(t) for t ∈ presentTypes`.

   | `coverageStatus`      | Condition                                                                            | Composite                                                   |
   | --------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
   | `FULL`                | All three types `rating !== null` (coverageWeight = 1.00)                            | `round2(Σ contribution[i])` (all 3)                         |
   | `PARTIAL`             | FEEDBACK present AND ≥1 of {IN, OUT} present, but not FULL (coverageWeight ∈ {0.75}) | `round2(Σ contribution[i] / coverageWeight)` (renormalized) |
   | `PARTIAL_NO_FEEDBACK` | FEEDBACK missing; IN AND OUT both present (coverageWeight = 0.50)                    | **`null`** (Dean-respecting: don't silently invert weights) |
   | `FEEDBACK_ONLY`       | Only FEEDBACK present (coverageWeight = 0.50)                                        | `round2(rating_FEEDBACK)`                                   |
   | `INSUFFICIENT`        | Only one of {IN, OUT} present (coverageWeight = 0.25)                                | `null`                                                      |
   | `NO_DATA`             | No type has `rating !== null`                                                        | `null`                                                      |

   **Threshold rule for positive composites**: coverage must include FEEDBACK (i.e., `rating_FEEDBACK !== null`) AND `coverageWeight ≥ 0.50`. Otherwise → `null`.

   **Why `PARTIAL_NO_FEEDBACK` yields null**: the Dean specified 50% FEEDBACK weighting. Computing `mean(r_IN, r_OUT)` when FEEDBACK is absent replaces the 50%-weight primary signal with an equal-weight average of two 25%-weight secondary signals — an implicit product change the Dean has not approved. The distinct status label preserves transparency (popover still shows IN + OUT ratings, banner explains the gap) while refusing to publish a misleading headline number. If a future stakeholder explicitly approves "compute anyway when FEEDBACK is missing," this is a one-line change in Task 5 step 7.

6. **`overallRating` field on the existing `/report` endpoint is unchanged** — composite is additive.

7. **Chain-of-rounding specification — canonicalized invariant** (F20):
   - Per-type rating `r(t)` is rounded to 2 decimals by `GetFacultyReportUnscoped` (existing `Math.round(... * 100) / 100` at line 1423).
   - Each `contribution[i] = round2(r(t) × effectiveWeight(t))`, where `effectiveWeight(t) = weight(t) / coverageWeight` for PARTIAL / FEEDBACK_ONLY, or `weight(t)` for FULL. For `PARTIAL_NO_FEEDBACK` / `INSUFFICIENT` / `NO_DATA` the composite is null so effective weights don't feed into a composite but are still reported as `0` in the DTO.
   - Composite `rating = round2(Σ non-null contribution[i])` — sum of already-rounded non-null contributions, then one more `round2` for display coherence.
   - **Canonical invariant (used verbatim across ACs + docs)**: `composite.rating === round2(Σ non-null contribution[i])` for non-null-composite cases. The popover's visible sum equals the visible composite.
   - **`round2()` is a shared util** in `lib/composite-rating.constants.ts`. `BuildFacultyReportData` should be updated to reference it too (if trivial — in-scope nit) to prevent future drift (F17).

8. **UI: summary strip + click-triggered popover** (F8, F11, F12, F13, F29, F34):
   - Mount point: inside `faculty-report-screen.tsx`, in an **always-rendered shell** above the `/report` early-return branches.
   - Composite strip label: `"Composite rating"`.
   - `HeadlineMetricsStrip` accepts a **required** `label` prop (**no default** — F11). Call sites pass `currentTypeLabel = questionnaireTypeName ? `${questionnaireTypeName} rating` : "Rating"` (F14 fallback for empty name during load).
   - `HeadlineMetricsStrip`'s sentiment + response-count cells are **unchanged** (F10 clarification): only the rating label is per-type-scoped via `label`.
   - **Composite strip renders rating-only** (F34): `"Composite rating"` label + animated number + interpretation chip (only when non-null) + amber dot (when `coverageStatus !== 'FULL'`) + ⓘ trigger. **No sentiment bar, no response count** — keeps the composite unambiguously semester-level without visual conflict with the type-scoped cells below.
   - Trigger: `<Button variant="ghost" size="sm" aria-label="View rating breakdown">` + `<Info className="size-4" />`; `asChild` wrapping a `<PopoverTrigger>`.
   - `coverageStatus !== 'FULL'` → amber dot (`<span className="size-1.5 rounded-full bg-amber-500" aria-hidden />`).
   - **Popover hierarchy (locked)**: `CompositeRatingSummaryStrip` owns `<Popover>` + `<PopoverTrigger>` + `<PopoverContent>`; `CompositeRatingBreakdownPopover` returns children-only JSX inside the caller's `<PopoverContent>`.
   - Popover content: three rows — one per questionnaire type in canonical order (FEEDBACK, OUT, IN) — each with rating, effective weight (formatted `${(eff * 100).toFixed(1)}%` → `50.0%` / `66.7%`, F19), contribution (rounded), and a defensive client-side sort by `COMPOSITE_TYPE_ORDER` regardless of backend order (F21).
   - Row display rule:
     - `rating !== null` → show rating + contribution
     - `rating === null && submissionCount > 0` → show `"No scored data"` muted (rare; degenerate schema)
     - `rating === null && submissionCount === 0` → show `"No submissions"` muted
   - **Coverage banner copy** — locked per status (F21 / AC21):
     - `FULL` → no banner
     - `PARTIAL` → `"Partial coverage — renormalized to available tracks."`
     - `PARTIAL_NO_FEEDBACK` → `"Feedback track missing — composite cannot be computed without the primary 50% track. Per-track ratings shown above for reference."`
     - `FEEDBACK_ONLY` → `"Only Faculty Feedback submissions available — composite equals Feedback rating."`
     - `INSUFFICIENT` → `"Insufficient data — need at least 50% coverage to compute composite."`
     - `NO_DATA` → `"No submissions yet for this semester."`
   - **Interpretation chip rendering** (F29): only rendered when `composite.interpretation !== null`. When null, the chip DOM is absent (not an empty-styled span).
   - **Retry wiring** (F12 round 1): `CompositeRatingSummaryStrip` accepts `{ data, isLoading, isError, onRetry }` — caller passes `overviewQuery.refetch`.
   - **Null-safe rendering** (F8 round 1): composite rating render is gated on `data?.composite.rating !== null && data.composite.rating !== undefined` — no non-null assertion.

9. **Independent fetch lifecycle + staleTime lock** (F30):
   - Query key `["faculty-analytics", "faculty-overview", { facultyId, semesterId, courseId }, token]`.
   - `staleTime: 60_000` (60s) — tab switches reuse cache; re-fetch happens only after 60s of inactivity or explicit `refetch`.
   - Composite query runs independently of `/report`; failed fetch never blanks the page (graceful fallback to `"Composite unavailable"` + retry button).

10. **Response DTO shape**:

    ```ts
    // api.faculytics/src/modules/analytics/dto/responses/faculty-overview.response.dto.ts
    import {
      ReportFacultyDto,
      ReportSemesterDto,
    } from './faculty-report.response.dto';
    import { CompositeCoverageStatus } from '../../lib/composite-rating.constants';

    export class FacultyOverviewCompositeDto {
      @ApiPropertyOptional({ type: Number, nullable: true })
      rating!: number | null; // 2-decimal weighted rating; null for PARTIAL_NO_FEEDBACK / INSUFFICIENT / NO_DATA
      @ApiPropertyOptional({ type: String, nullable: true })
      interpretation!: string | null; // null iff rating is null
      @ApiProperty({
        enum: [
          'FULL',
          'PARTIAL',
          'PARTIAL_NO_FEEDBACK',
          'FEEDBACK_ONLY',
          'INSUFFICIENT',
          'NO_DATA',
        ],
      })
      coverageStatus!: CompositeCoverageStatus;
      @ApiProperty({ type: Number })
      coverageWeight!: number; // 0.00 – 1.00
    }

    export class FacultyOverviewContributionDto {
      @ApiProperty() questionnaireTypeCode!: string;
      @ApiProperty() questionnaireTypeName!: string;
      @ApiPropertyOptional({ type: Number, nullable: true })
      rating!: number | null;
      @ApiProperty({ type: Number }) weight!: number; // canonical (0.50 / 0.25 / 0.25)
      @ApiProperty({ type: Number }) effectiveWeight!: number; // weight / coverageWeight for non-null composite; 0 otherwise
      @ApiPropertyOptional({ type: Number, nullable: true })
      contribution!: number | null; // round2(rating × effectiveWeight); null when rating is null
      @ApiProperty({ type: Number }) submissionCount!: number;
    }

    export class FacultyOverviewResponseDto {
      @ApiProperty({ type: ReportFacultyDto }) faculty!: ReportFacultyDto;
      @ApiProperty({ type: ReportSemesterDto }) semester!: ReportSemesterDto;
      @ApiProperty({ type: FacultyOverviewCompositeDto })
      composite!: FacultyOverviewCompositeDto;
      @ApiProperty({ type: [FacultyOverviewContributionDto] })
      contributions!: FacultyOverviewContributionDto[]; // always length 3, canonical order: FEEDBACK, OUT, IN
    }
    ```

11. **Constants file — typed weights + shared round2 util**:

    ```ts
    // api.faculytics/src/modules/analytics/lib/composite-rating.constants.ts
    export type CompositeQuestionnaireTypeCode =
      | 'FACULTY_FEEDBACK'
      | 'FACULTY_IN_CLASSROOM'
      | 'FACULTY_OUT_OF_CLASSROOM';

    export const COMPOSITE_WEIGHTS = {
      FACULTY_FEEDBACK: 0.5,
      FACULTY_OUT_OF_CLASSROOM: 0.25,
      FACULTY_IN_CLASSROOM: 0.25,
    } as const satisfies Record<CompositeQuestionnaireTypeCode, number>;

    export const COMPOSITE_COVERAGE_THRESHOLD = 0.5;

    export type CompositeCoverageStatus =
      | 'FULL'
      | 'PARTIAL'
      | 'PARTIAL_NO_FEEDBACK'
      | 'FEEDBACK_ONLY'
      | 'INSUFFICIENT'
      | 'NO_DATA';

    export const COMPOSITE_TYPE_ORDER: readonly CompositeQuestionnaireTypeCode[] =
      [
        'FACULTY_FEEDBACK',
        'FACULTY_OUT_OF_CLASSROOM',
        'FACULTY_IN_CLASSROOM',
      ] as const;

    /** Shared rounding util — single source of truth for 2-decimal rounding across composite and BuildFacultyReportData. */
    export const round2 = (x: number): number => Math.round(x * 100) / 100;
    ```

### Data Simplification Reconciliation

Submissions always include numeric answers — there is no "submissions without numeric scores" real-world branch (yander confirmed). However, `BuildFacultyReportData`'s `overallRating` has three null-paths at runtime:

- `submissionCount === 0`
- `totalWeight === 0` (degenerate schema)
- Every section filters to zero scored questions

All three collapse to `overallRating = null`. The composite treats any `rating === null` as "type not present" — a single uniform signal. UI distinguishes the cases in the popover row label: `"No submissions"` vs `"No scored data"` (for the degenerate case where `submissionCount > 0 && rating === null`).

On `NO_DATA`, the composite's banner becomes the page's primary empty-state message; the per-type `ScopedAnalyticsEmptyState` inside the `/report` inner region displays a muted secondary message to avoid duplicate messaging (F13).

### Scope refinement from investigation

- **PDF reports** — V1 rollout gate: the PDF export button shows a small tooltip `"PDF export shows per-track ratings; composite rating is in the dashboard view."` until the named follow-up (`FAC-XX: PDF composite rating`) lands. Tooltip removal is part of the follow-up's task list.
- **Analytics module CLAUDE.md**: no module-level CLAUDE.md exists today. Creating one remains optional — pointer from root `api.faculytics/CLAUDE.md` is sufficient.

## Implementation Plan

### Tasks

Tasks ordered bottom-up: constants → DTOs → service helper → service method → controller → tests → frontend plumbing → frontend UI → documentation → verification.

#### Backend — Constants & DTOs

- [x] **Task 1: Create composite constants + shared round2 util**
  - File: `api.faculytics/src/modules/analytics/lib/composite-rating.constants.ts` (NEW)
  - Action: Export `CompositeQuestionnaireTypeCode`, `COMPOSITE_WEIGHTS` (`as const satisfies Record<CompositeQuestionnaireTypeCode, number>`), `COMPOSITE_COVERAGE_THRESHOLD = 0.5`, `CompositeCoverageStatus` (6-variant union including `PARTIAL_NO_FEEDBACK`), `COMPOSITE_TYPE_ORDER`, and `round2(x: number)`. File shape per Technical Decisions §11.
  - Optional in-scope nit: update `BuildFacultyReportData` at line 1423 to import and use the shared `round2` instead of its inline expression (F17). Skip only if it touches unrelated tests.

- [x] **Task 2: Create `FacultyOverviewQueryDto` with optional courseId**
  - File: `api.faculytics/src/modules/analytics/dto/analytics-query.dto.ts`
  - Action: Append:

    ```ts
    export class FacultyOverviewQueryDto {
      @ApiProperty({ description: 'Semester UUID (required)' })
      @IsUUID()
      @IsNotEmpty()
      @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
      )
      semesterId!: string;

      @ApiPropertyOptional({
        description:
          'Optional course UUID — if present, composite is scoped to this course (matches /report behavior)',
      })
      @IsUUID()
      @IsOptional()
      courseId?: string;
    }
    ```

  - Notes: Do NOT extend `BaseFacultyReportQueryDto`. F25 adds `@IsNotEmpty` + trim transform. F7 adds optional `courseId` propagation.

- [x] **Task 3: Create `FacultyOverviewResponseDto`**
  - File: `api.faculytics/src/modules/analytics/dto/responses/faculty-overview.response.dto.ts` (NEW)
  - Action: Export `FacultyOverviewCompositeDto`, `FacultyOverviewContributionDto`, `FacultyOverviewResponseDto` per Technical Decisions §10. Import `ReportFacultyDto` / `ReportSemesterDto` from `faculty-report.response.dto.ts` and `CompositeCoverageStatus` from `../../lib/composite-rating.constants`.
  - Notes: `@ApiProperty` descriptions clearly explain `coverageStatus` semantics, distinguish `weight` (canonical) vs `effectiveWeight` (post-renormalization), and document the chain-of-rounding rule.

#### Backend — Service Helper & New Method

- [x] **Task 4: Add `computeFacultyPerTypeRatings` helper via Path B (reuse existing `GetFacultyReportUnscoped`)**
  - File: `api.faculytics/src/modules/analytics/analytics.service.ts`
  - Action: Add a new private method:
    ```ts
    private async computeFacultyPerTypeRatings(
      facultyId: string,
      semesterId: string,
      courseId?: string,
    ): Promise<Map<CompositeQuestionnaireTypeCode, { rating: number | null; submissionCount: number }>> {
      return this.em.transactional(async () => {
        const entries = await Promise.all(
          COMPOSITE_TYPE_ORDER.map(async (typeCode) => {
            try {
              const report = await this.GetFacultyReportUnscoped(facultyId, {
                semesterId,
                questionnaireTypeCode: typeCode,
                courseId,
              });
              return [typeCode, { rating: report.overallRating, submissionCount: report.submissionCount }] as const;
            } catch (e) {
              if (e instanceof NotFoundException) {
                return [typeCode, { rating: null, submissionCount: 0 }] as const;
              }
              throw e;
            }
          }),
        );
        return new Map(entries);
      });
    }
    ```
  - Notes: `em.transactional` gives a snapshot-consistent view across the three calls (F9). `Promise.all` parallelizes inside the transaction. `NotFoundException` handling defensively covers an unseeded type (should be unreachable). **No new SQL, no aggregation duplication, no refactor of `BuildFacultyReportData`.** Parity with `/report` is guaranteed by code-path reuse.

- [x] **Task 5: Add `GetFacultyOverview` service method**
  - File: `api.faculytics/src/modules/analytics/analytics.service.ts`
  - Action: Public method `async GetFacultyOverview(facultyId: string, query: FacultyOverviewQueryDto): Promise<FacultyOverviewResponseDto>`. Algorithm:
    1. `await this.validateFacultyScope(facultyId, query.semesterId)` — called **for auth side effect only**. Return value is intentionally unused (F2/F3).
    2. Fetch faculty + semester metadata via a dedicated SQL query mirroring `BuildFacultyReportData` lines 1148–1186. Apply the same `|| null` coalesce for `profilePicture` (F22): `profilePicture: facultyRow.user_profile_picture || null`.
    3. `const ratingsMap = await this.computeFacultyPerTypeRatings(facultyId, query.semesterId, query.courseId)`.
    4. `const typeNames = await this.em.find(QuestionnaireType, { code: { $in: [...COMPOSITE_TYPE_ORDER] } })` → `code → name` map.
    5. Build `contributions[]` iterating `COMPOSITE_TYPE_ORDER`:
       ```ts
       contributions = COMPOSITE_TYPE_ORDER.map((code) => {
         const entry = ratingsMap.get(code) ?? {
           rating: null,
           submissionCount: 0,
         };
         return {
           questionnaireTypeCode: code,
           questionnaireTypeName: typeNameMap.get(code) ?? code,
           rating: entry.rating,
           weight: COMPOSITE_WEIGHTS[code],
           effectiveWeight: 0, // filled in step 7
           contribution: null, // filled in step 7
           submissionCount: entry.submissionCount,
         };
       });
       ```
    6. Compute `coverageStatus` — keyed on `rating !== null`:
       ```ts
       const presentCodes = new Set(
         contributions
           .filter((c) => c.rating !== null)
           .map((c) => c.questionnaireTypeCode),
       );
       const coverageWeight = contributions
         .filter((c) => presentCodes.has(c.questionnaireTypeCode))
         .reduce((sum, c) => sum + c.weight, 0);
       const hasFeedback = presentCodes.has('FACULTY_FEEDBACK');
       let coverageStatus: CompositeCoverageStatus;
       if (presentCodes.size === 0) coverageStatus = 'NO_DATA';
       else if (!hasFeedback && presentCodes.size === 1)
         coverageStatus = 'INSUFFICIENT'; // only IN or only OUT
       else if (!hasFeedback && presentCodes.size === 2)
         coverageStatus = 'PARTIAL_NO_FEEDBACK'; // IN + OUT, no FEEDBACK
       else if (presentCodes.size === 1)
         coverageStatus = 'FEEDBACK_ONLY'; // only FEEDBACK
       else if (presentCodes.size === 3) coverageStatus = 'FULL';
       else coverageStatus = 'PARTIAL'; // FEEDBACK + 1 of {IN, OUT}
       ```
    7. Compute `effectiveWeight` + `contribution` + composite `rating`:
       - If `coverageStatus ∈ { 'NO_DATA', 'INSUFFICIENT', 'PARTIAL_NO_FEEDBACK' }`: composite `rating = null`, `effectiveWeight = 0` for all rows, `contribution = null` for all rows (ratings still shown in each row for transparency).
       - If `coverageStatus === 'FULL'`: `effectiveWeight = weight`, `contribution = round2(rating × weight)` for present rows. Composite `rating = round2(Σ non-null contribution[i])`.
       - If `coverageStatus === 'PARTIAL'` or `'FEEDBACK_ONLY'`: for present rows `effectiveWeight = weight / coverageWeight`, `contribution = round2(rating × effectiveWeight)`. Missing rows stay `effectiveWeight: 0, contribution: null`. Composite `rating = round2(Σ non-null contribution[i])`.
    8. `interpretation = rating === null ? null : getInterpretation(rating)`.
    9. **Telemetry** (F31): `this.logger.debug({ facultyId, semesterId, coverageStatus, coverageWeight, courseId }, 'Composite overview computed')` — single debug log line for future coverage-distribution analysis.
    10. Return `{ faculty, semester, composite: { rating, interpretation, coverageStatus, coverageWeight }, contributions }`.
  - Notes: `contributions` length is always 3 in `COMPOSITE_TYPE_ORDER` sequence. Use the shared `round2()` from `composite-rating.constants.ts`.

- [x] **Task 6: Add `GetFacultyOverview` controller handler**
  - File: `api.faculytics/src/modules/analytics/analytics.controller.ts`
  - Action: Add a new route handler after `GetFacultyReport`:
    ```ts
    @Get('faculty/:facultyId/overview')
    @UseJwtGuard(DEAN, CHAIRPERSON, CAMPUS_HEAD, SUPER_ADMIN, FACULTY)
    @ApiOperation({
      summary: 'Composite overall rating across all 3 questionnaire types (50/25/25)',
      description: 'Accepts semesterId (required) and optional courseId (propagates into per-type scope).',
    })
    @ApiQuery({ name: 'semesterId', required: true, type: String })
    @ApiQuery({ name: 'courseId', required: false, type: String })
    @ApiResponse({ status: 200, type: FacultyOverviewResponseDto })
    async GetFacultyOverview(
      @Param('facultyId', ParseUUIDPipe) facultyId: string,
      @Query() query: FacultyOverviewQueryDto,
    ): Promise<FacultyOverviewResponseDto> {
      assertFacultySelfScope(this.currentUserService.getOrFail(), facultyId);
      return this.analyticsService.GetFacultyOverview(facultyId, query);
    }
    ```

#### Backend — Tests

- [x] **Task 7: Asserting parity test** (F32)
  - File: `api.faculytics/src/modules/analytics/analytics.service.spec.ts`
  - Action: `describe('GetFacultyOverview parity with GetFacultyReportUnscoped', ...)`. Fixture: faculty with submissions in all three types. Mock `validateFacultyScope` + `em.execute` (metadata queries) + the three `GetFacultyReportUnscoped` calls (spy via `jest.spyOn(service, 'GetFacultyReportUnscoped')`). Assert:
    - The helper's Map contains one entry per `COMPOSITE_TYPE_ORDER` code.
    - `ratingsMap.get(typeCode).rating === GetFacultyReportUnscoped(…{typeCode}).overallRating` for each type (exact equality at 2-decimal precision).
  - Notes: **Hard-asserting**. Divergence blocks CI. Since the helper calls `GetFacultyReportUnscoped` directly, this test is almost an identity check — but defending against a future refactor that introduces a shortcut is still valuable.

- [x] **Task 8: Unit tests for `GetFacultyOverview` — all 6 coverage states + edge cases**
  - File: `api.faculytics/src/modules/analytics/analytics.service.spec.ts`
  - Action: `describe('GetFacultyOverview', ...)` covering:
    - **FULL**: mock `computeFacultyPerTypeRatings` to return `{FEEDBACK: r_F, OUT: r_O, IN: r_I}` all non-null. Expect `composite.rating = round2(round2(r_F*0.5) + round2(r_O*0.25) + round2(r_I*0.25))`, `coverageStatus: 'FULL'`, `coverageWeight: 1.00`. Assert `contributions.filter(c=>c.contribution!==null).reduce(...) === composite.rating` (chain-of-rounding invariant).
    - **PARTIAL**: FEEDBACK + IN non-null, OUT null. `effectiveWeight(FEEDBACK) = 0.5/0.75 ≈ 0.6667`, `effectiveWeight(IN) = 0.25/0.75 ≈ 0.3333`. `coverageStatus: 'PARTIAL'`, `coverageWeight: 0.75`.
    - **PARTIAL_NO_FEEDBACK**: IN + OUT non-null, FEEDBACK null. `composite.rating === null`, `coverageStatus: 'PARTIAL_NO_FEEDBACK'`, `coverageWeight: 0.50`. All rows have `effectiveWeight: 0, contribution: null`. IN and OUT rows still show their `rating` values.
    - **FEEDBACK_ONLY**: only FEEDBACK non-null. `effectiveWeight(FEEDBACK) = 1.00`, `composite.rating = round2(r_F)`, `coverageStatus: 'FEEDBACK_ONLY'`, `coverageWeight: 0.50`.
    - **INSUFFICIENT — IN only**: only IN non-null. `composite.rating === null`, `coverageStatus: 'INSUFFICIENT'`, `coverageWeight: 0.25`. IN row shows rating but `contribution: null, effectiveWeight: 0`.
    - **INSUFFICIENT — OUT only**: mirror of above with OUT in place of IN.
    - **NO_DATA**: all ratings null. `composite.rating === null`, `coverageStatus: 'NO_DATA'`, `coverageWeight: 0`. All rows `rating: null, contribution: null, effectiveWeight: 0`.
    - **Edge: rating null with `submissionCount > 0`** (F1/F14 round 1, F7 round 2): mock a type returning `{ rating: null, submissionCount: 5 }`. Assert coverage treats it as not-present (same as `submissionCount: 0`) and the contribution DTO preserves `submissionCount: 5` for the popover's `"No scored data"` label.
    - **courseId propagation**: assert `GetFacultyReportUnscoped` is called with the same `courseId` value that was passed into the query.
    - **Contribution ordering**: assert `contributions` is exactly in `COMPOSITE_TYPE_ORDER` (FEEDBACK, OUT, IN).

- [x] **Task 9: Controller delegation + auth tests**
  - File: `api.faculytics/src/modules/analytics/analytics.controller.spec.ts`
  - Action: Mirror existing `GetFacultyReport` controller test pattern (override `UseJwtGuard`, `CurrentUserInterceptor`, mock `analyticsService.GetFacultyOverview`). Cases:
    - FACULTY user calling with own `facultyId` → 200.
    - FACULTY user calling with different `facultyId` → 403.
    - Elevated role (DEAN/CHAIRPERSON/CAMPUS_HEAD) → service called, `assertFacultySelfScope` bypasses.
    - SUPER_ADMIN → service called.
    - Missing `semesterId` query → 400 (validation pipe).
    - Extra unknown query param (`foo=bar`) → 400 (whitelist rejects).

#### Frontend — Plumbing

- [x] **Task 10: Add endpoint enum entry**
  - File: `app.faculytics/network/endpoints.ts`
  - Action: Insert `analyticsFacultyOverview = "/api/v1/analytics/faculty/:facultyId/overview"` after `analyticsFacultyQualitativeSummary`.

- [x] **Task 11: Add frontend types — reuse existing faculty/semester shapes**
  - File: `app.faculytics/features/faculty-analytics/types/index.ts`
  - Action: Append:
    ```ts
    export type FacultyOverviewQuery = {
      facultyId: string;
      semesterId: string;
      courseId?: string;
    };
    // Mirrors backend CompositeCoverageStatus at api.faculytics/src/modules/analytics/lib/composite-rating.constants.ts
    export type CompositeCoverageStatus =
      | 'FULL'
      | 'PARTIAL'
      | 'PARTIAL_NO_FEEDBACK'
      | 'FEEDBACK_ONLY'
      | 'INSUFFICIENT'
      | 'NO_DATA';
    export type FacultyOverviewCompositeDto = {
      rating: number | null;
      interpretation: string | null;
      coverageStatus: CompositeCoverageStatus;
      coverageWeight: number;
    };
    export type FacultyOverviewContributionDto = {
      questionnaireTypeCode: string;
      questionnaireTypeName: string;
      rating: number | null;
      weight: number;
      effectiveWeight: number;
      contribution: number | null;
      submissionCount: number;
    };
    export type FacultyOverviewResponseDto = {
      faculty: FacultyReportFacultyDto; // reused from this file
      semester: FacultyReportSemesterDto; // reused from this file
      composite: FacultyOverviewCompositeDto;
      contributions: FacultyOverviewContributionDto[];
    };
    ```
  - Notes: Reuse existing shapes, add cross-reference comment to backend constants file for drift awareness (F23).

- [x] **Task 12: Add `fetchFacultyOverview` request function**
  - File: `app.faculytics/features/faculty-analytics/api/faculty-analytics.requests.ts`
  - Action: Append:
    ```ts
    export async function fetchFacultyOverview({
      facultyId,
      semesterId,
      courseId,
    }: FacultyOverviewQuery) {
      const response = await apiClient.get<FacultyOverviewResponseDto>(
        Endpoints.analyticsFacultyOverview.replace(':facultyId', facultyId),
        { params: courseId ? { semesterId, courseId } : { semesterId } },
      );
      return response.data;
    }
    ```
  - Notes: Conditional `courseId` to avoid sending `courseId=undefined` as a literal string.

- [x] **Task 13: Add `useFacultyOverview` hook with explicit staleTime**
  - File: `app.faculytics/features/faculty-analytics/hooks/use-faculty-overview.ts` (NEW)
  - Action:
    ```ts
    export function useFacultyOverview(
      params: FacultyOverviewQuery,
      options?: { enabled?: boolean },
    ) {
      const token = useAuthStore((s) => s.token);
      const isEnabled = options?.enabled ?? true;
      return useQuery({
        queryKey: ['faculty-analytics', 'faculty-overview', params, token],
        enabled:
          Boolean(token) &&
          Boolean(params.facultyId) &&
          Boolean(params.semesterId) &&
          isEnabled,
        queryFn: () => fetchFacultyOverview(params),
        staleTime: 60_000, // tab-switch stability (F30)
      });
    }
    ```

#### Frontend — UI Components

- [x] **Task 14: Build `CompositeRatingBreakdownPopover` (children-only)**
  - File: `app.faculytics/features/faculty-analytics/components/composite-rating-breakdown-popover.tsx` (NEW)
  - Action: Children-only component `({ composite, contributions }) => JSX` that returns header + three rows + optional banner. Never renders `<PopoverContent>`.
  - Content specifics:
    - Header: `"Rating Breakdown"` title + subtitle `"50% Faculty Feedback · 25% Out-of-Classroom · 25% In-Classroom"`.
    - **Defensive client-side sort** (F21): `const sorted = [...contributions].sort((a,b) => COMPOSITE_TYPE_ORDER.indexOf(a.questionnaireTypeCode) - COMPOSITE_TYPE_ORDER.indexOf(b.questionnaireTypeCode));`
    - Three rows iterating `sorted`: name + weight badge (canonical `50%`/`25%`), effective-weight sub-label formatted as `${(eff * 100).toFixed(1)}%` when `eff > 0 && eff !== weight`, rating (2 decimals) or muted label (see rule below), contribution (2 decimals) or em-dash.
    - Row display rule: `rating !== null` → numeric; `rating === null && submissionCount > 0` → `"No scored data"` muted; `rating === null && submissionCount === 0` → `"No submissions"` muted.
    - Coverage banner: exact copy per `coverageStatus` per Technical Decisions §8.
  - Notes: No `<Popover>`, `<PopoverTrigger>`, or `<PopoverContent>` inside this component. Mobile-friendly padding.

- [x] **Task 15: Build `CompositeRatingSummaryStrip` — rating-only, owns Popover chain**
  - File: `app.faculytics/features/faculty-analytics/components/composite-rating-summary-strip.tsx` (NEW)
  - Action: Component with props `{ data, isLoading, isError, onRetry }`. Card wrapper: `"flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border/70 bg-card px-5 py-4"`. **Renders ONLY rating + interpretation chip + amber dot + ⓘ trigger. No sentiment mini-bar. No response count.** (F34)
  - States:
    - **Loading**: compact `<Skeleton>` inline. Page below unaffected.
    - **Error**: `"Composite unavailable"` + `<Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>`.
    - **Success — rating non-null**: `"Composite rating"` label + `<AnimatedNumber value={data.composite.rating} decimals={2} />` + `{data.composite.interpretation !== null && <InterpretationChip ... />}` (F29 — no chip when null) + `{data.composite.coverageStatus !== 'FULL' && <AmberDot />}` + `<Popover>`-wrapped trigger.
    - **Success — rating null (PARTIAL_NO_FEEDBACK / INSUFFICIENT / NO_DATA)**: `"Composite rating"` label + muted `"Insufficient data"` + amber dot + popover-wrapped trigger (popover still accessible, banner explains).
  - Popover: `<PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label="View rating breakdown"><Info className="size-4" /></Button></PopoverTrigger>` followed by `<PopoverContent align="end" className="w-80"><CompositeRatingBreakdownPopover composite={data.composite} contributions={data.contributions} /></PopoverContent>`.
  - Null-safe rating render: `data?.composite.rating !== null && data.composite.rating !== undefined ? <AnimatedNumber .../> : <MutedText>Insufficient data</MutedText>`. **No non-null assertion.**

- [x] **Task 16: Update `HeadlineMetricsStrip` — required label prop**
  - File: `app.faculytics/features/faculty-analytics/components/headline-metrics-strip.tsx`
  - Action: Replace the hardcoded `"Overall rating"` literal at line 68 with `{label}`. Add `label: string` to `HeadlineMetricsStripProps` — **REQUIRED, no default** (F11). Sentiment + response-count cells are unchanged (F10 — the rename is rating-cell only).
  - Notes: Breaking the component's public type signature forces all callers to pass `label`. The only current caller is `faculty-report-screen.tsx` (Task 17).

- [x] **Task 17: Restructure `FacultyReportScreen` — always-rendered shell + composite strip + per-type label** (F12)
  - File: `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx`
  - Action:
    1. Call `const overviewQuery = useFacultyOverview({ facultyId, semesterId, courseId })` in the screen/ViewModel.
    2. Restructure the render output: the outer `<section>` now renders an **always-rendered shell** containing sticky title row + semester label + `<CompositeRatingSummaryStrip ... onRetry={overviewQuery.refetch} />`. The existing early-return branches (`reportQuery.isLoading` / `isError`) move INSIDE an `<InnerRegion>` block below the shell — they no longer short-circuit the whole screen.
    3. Inside the inner region: `reportQuery.isLoading` → `<ScopedAnalyticsLoadingState />`; `reportQuery.isError` → `<ScopedAnalyticsErrorState onRetry={reportQuery.refetch} />`; success → `<HeadlineMetricsStrip label={perTypeLabel} ... />` + tabs.
    4. Compute `perTypeLabel` as: `const perTypeLabel = questionnaireTypeName ? `${questionnaireTypeName} rating` : "Rating";` where `questionnaireTypeName` comes from the ViewModel's resolved type name (F14 fallback for empty mid-load).
    5. **NO_DATA unified empty-state** (F13): when `overviewQuery.data?.composite.coverageStatus === 'NO_DATA'`, the per-type `ScopedAnalyticsEmptyState` rendering path gets a muted `"No per-tab breakdown available."` copy instead of the current primary empty-state message (which becomes the composite strip's banner).
    6. Add a note to the PDF export button (whatever triggers PDF generation — locate via grep for `export` near the `FacultyReportHeader` usage): add a `title` or shadcn `<Tooltip>` attribute with text `"PDF export shows per-track ratings; composite rating is in the dashboard view."` — a V1 rollout gate per F27. The tooltip text is removed when the PDF composite follow-up lands.

- [x] **Task 18: Verify FACULTY self-view route**
  - File: `app.faculytics/app/(dashboard)/faculty/analytics/page.tsx` (path is `analytics`, NOT `analysis` — F1 correction)
  - Action: Verify the page renders `<FacultyReportScreen facultyId={meQuery.data.id} />`. No code change expected — this task is a checkpoint that the composite strip surfaces on self-view via Task 17's shell. If the self-view uses a different rendering path, align it to share `<FacultyReportScreen />`.

- [x] **Task 19: Audit `faculty-analysis-hero.tsx`** (F33)
  - File: `app.faculytics/features/faculty-analytics/components/faculty-analysis-hero.tsx`
  - Action: Grep confirmed zero import sites. Safe to **delete the file** as part of this spec, OR if the engineer wants to be conservative, rename the `"Overall rating"` literal at line 86 to something neutral. Delete preferred — less drift risk.

- [x] **Task 20: Barrel re-exports (if needed)**
  - File: `app.faculytics/features/faculty-analytics/index.ts`
  - Action: Export `CompositeRatingSummaryStrip`, `useFacultyOverview`, and overview types ONLY if consumed outside the feature slice. Skip otherwise.

#### Documentation

- [x] **Task 21: Update `api.faculytics/docs/architecture/analytics.md`**
  - File: `api.faculytics/docs/architecture/analytics.md`
  - Action:
    1. Locate the heading `### Faculty Self-View Authorization` via full-text search (do NOT confuse with `### Faculty Self-View Redaction` which also exists — F9).
    2. Insert a new `### Composite Overall Rating` subsection **after** that heading.
    3. Include: endpoint signature, example URL (both with and without `courseId`), auth roles (JWT; DEAN, CHAIRPERSON, CAMPUS_HEAD, SUPER_ADMIN, FACULTY self-only), formula (`composite = round2(Σ round2(rating × effectiveWeight))`), canonical weights, complete 6-row coverage-status table (incl. `PARTIAL_NO_FEEDBACK` with its null composite behavior), chain-of-rounding invariant statement, and response schema summary referencing `FacultyOverviewResponseDto`.
    4. **Also update the canonical REST endpoint table near the top of the file** to add the new `/overview` row.
  - Notes: This is the user-requested reference doc.

- [x] **Task 22: Pointer in root CLAUDE.md**
  - File: `api.faculytics/CLAUDE.md`
  - Action: Under Architecture → Key Patterns, add: `**Composite Overall Rating**: Faculty composite = 50% Feedback + 25% In-Class + 25% Out-of-Class. See docs/architecture/analytics.md § "Composite Overall Rating" for formula, 6 coverage states (FULL/PARTIAL/PARTIAL_NO_FEEDBACK/FEEDBACK_ONLY/INSUFFICIENT/NO_DATA), chain-of-rounding spec, and the Dean-respecting null-on-missing-FEEDBACK behavior.`

#### Verification

- [x] **Task 23: Backend verification gate**
  - Run `cd api.faculytics && npm run lint && npm run build && npm run test -- --testPathPattern=analytics`. All must pass.

- [x] **Task 24: Frontend verification gate**
  - Run `cd app.faculytics && bun run typecheck && bun run lint`. Both must pass.

- [x] **Task 25: Manual smoke test with explicit fixture seeding** (F24)
  - Setup fixtures via Postgres SQL or a ts-node script. Sample seeding snippets (adapt IDs to your dev DB):
    ```sql
    -- FULL scenario: create submissions in all 3 types
    -- ... (specific INSERT statements omitted for brevity; use the csv-test-submission-generator or write ts-node)
    -- PARTIAL_NO_FEEDBACK: create submissions for IN + OUT only, no FEEDBACK
    -- FEEDBACK_ONLY: create submissions for FEEDBACK only
    -- INSUFFICIENT: create submissions for IN only (or OUT only)
    -- NO_DATA: new faculty with zero submissions
    ```
  - Start backend + frontend. Visit the per-faculty analysis page for each of **four** roles (campus-head, chairperson, dean, FACULTY self-view at `/faculty/analytics`) across **8 coverage scenarios**:

    | Scenario | Present types          | Expected `coverageStatus` | Expected composite                          | Banner                            |
    | -------- | ---------------------- | ------------------------- | ------------------------------------------- | --------------------------------- |
    | 1        | FEEDBACK + IN + OUT    | `FULL`                    | weighted avg                                | none                              |
    | 2        | FEEDBACK only          | `FEEDBACK_ONLY`           | = FEEDBACK rating                           | "Only Faculty Feedback..."        |
    | 3        | FEEDBACK + IN          | `PARTIAL`                 | renormalized                                | "Partial coverage..."             |
    | 4        | FEEDBACK + OUT         | `PARTIAL`                 | renormalized                                | "Partial coverage..."             |
    | 5        | IN + OUT (no FEEDBACK) | `PARTIAL_NO_FEEDBACK`     | **null** (rating shows "Insufficient data") | "Feedback track missing..."       |
    | 6        | IN only                | `INSUFFICIENT`            | null                                        | "Insufficient data — need 50%..." |
    | 7        | OUT only               | `INSUFFICIENT`            | null                                        | same as 6                         |
    | 8        | none                   | `NO_DATA`                 | null                                        | "No submissions yet..."           |

  - For each: open the popover, verify rows render in canonical order, verify effective-weight formatting `"X.X%"`, verify banner text matches Technical Decisions §8 verbatim, verify amber dot present when `coverageStatus !== 'FULL'`, verify per-type `HeadlineMetricsStrip` label updates correctly per tab (`"Faculty Feedback rating"`, `"In-Classroom rating"`, `"Out-of-Classroom rating"`).
  - Network check: `/overview` fires once per page mount, NOT on tab switches within 60s (staleTime).
  - **`courseId` scenario**: add `?courseId=<UUID>` to the URL and verify both the composite strip and the per-type strip reflect course-scoped numbers (they should agree because the composite propagates `courseId`).
  - **`/report` failure scenario** (F12): mock an API error for `/report` (e.g., via DevTools block or dev-time override). Verify the composite strip still renders with its data, and the inner region shows `<ScopedAnalyticsErrorState />`.
  - Mobile viewport (≤ 640px): verify strip wraps, popover opens in-viewport.

### Acceptance Criteria

Each AC uses Given/When/Then. Happy path + every coverage branch + auth + integration + graceful degradation are covered.

**Backend — Core Computation**

- [x] **AC1 (FULL coverage)**: Given all three per-type ratings non-null (`r_F`, `r_I`, `r_O`), when `GET /analytics/faculty/:id/overview?semesterId=X` is called, then `contributions` are in canonical order (FEEDBACK, OUT, IN) with `contribution[i] = round2(rating[i] × weight[i])`, `composite.rating = round2(Σ non-null contribution[i])`, `composite.coverageStatus = 'FULL'`, `composite.coverageWeight = 1.00`. **Invariant**: `composite.rating === round2(Σ non-null contribution[i])`.

- [x] **AC2 (PARTIAL — FEEDBACK + one of IN/OUT)**: Given FEEDBACK non-null AND exactly one of IN/OUT non-null, when the endpoint is called, then `coverageStatus = 'PARTIAL'`, `coverageWeight = 0.75`, present rows have `effectiveWeight = weight / 0.75`, `contribution = round2(rating × effectiveWeight)`, missing row `rating: null, contribution: null, effectiveWeight: 0`, `composite.rating = round2(Σ non-null contribution[i])`.

- [x] **AC3 (PARTIAL_NO_FEEDBACK — IN + OUT, FEEDBACK missing) — composite is null** (F26): Given `rating_FEEDBACK === null` AND both `rating_IN !== null` AND `rating_OUT !== null`, when the endpoint is called, then `coverageStatus = 'PARTIAL_NO_FEEDBACK'`, `coverageWeight = 0.50`, `composite.rating = null`, `composite.interpretation = null`. All three contributions have `effectiveWeight: 0, contribution: null`. IN and OUT rows still show their `rating` values in the DTO. FEEDBACK row has `rating: null`.

- [x] **AC4 (FEEDBACK_ONLY)**: Given only FEEDBACK non-null, when the endpoint is called, then `coverageStatus = 'FEEDBACK_ONLY'`, `coverageWeight = 0.50`, FEEDBACK row has `effectiveWeight = 1.00, contribution = round2(rating_FEEDBACK)`, `composite.rating = round2(rating_FEEDBACK)`. **Invariant**: `composite.rating === round2(Σ non-null contribution[i])`.

- [x] **AC5 (INSUFFICIENT — single non-FEEDBACK type)**: Given exactly one of {IN, OUT} non-null AND both of the other types null (no FEEDBACK), when the endpoint is called, then `coverageStatus = 'INSUFFICIENT'`, `coverageWeight = 0.25`, `composite.rating = null`, `composite.interpretation = null`. The present type's row still shows its `rating` (transparency) but `contribution: null, effectiveWeight: 0`.

- [x] **AC6 (NO_DATA)**: Given all three ratings null, when the endpoint is called, then `coverageStatus = 'NO_DATA'`, `coverageWeight = 0`, `composite.rating = null`, and all three contributions have `rating: null, contribution: null, effectiveWeight: 0` with `submissionCount` preserved per type.

- [x] **AC7 (Coverage keyed on rating, not submissionCount)**: Given a faculty has `submissionCount > 0` for a type but the type's `rating === null` (degenerate schema / zero-weight sections / all-filtered sections), when the endpoint is called, then that type is treated as "not present" for coverage purposes. The popover row label shows `"No scored data"` (from `submissionCount > 0 && rating === null`).

- [x] **AC8 (courseId propagation)**: Given the endpoint is called with `?semesterId=X&courseId=Z`, when the composite is computed, then `GetFacultyReportUnscoped` is invoked three times with `courseId: Z` in each call; the composite's per-type ratings are course-scoped and therefore identical to what the `/report` endpoint returns for the same `courseId` + `questionnaireTypeCode`.

**Backend — Auth & Scope**

- [x] **AC9 (FACULTY self-scope)**: Given an authenticated FACULTY user with `id = A`, when they call the endpoint for `facultyId = B` (B ≠ A), then 403 Forbidden (via `assertFacultySelfScope`).

- [x] **AC10 (Elevated role scope)**: Given an authenticated CHAIRPERSON whose scope excludes the target faculty's department, when they call the endpoint, then `validateFacultyScope` throws → 403 Forbidden.

- [x] **AC11 (SUPER_ADMIN access)**: Given a SUPER_ADMIN, when they call the endpoint for any faculty, then 200 with a correctly-computed composite.

- [x] **AC12 (Validation pipe rejects extras)**: Given the endpoint is called with an unrecognized query param (e.g., `?semesterId=X&foo=bar`), when the request reaches the controller, then 400 Bad Request (whitelist).

**Backend — Parity & Regression**

- [x] **AC13 (Asserting parity — hard fail)** (F32): Given a fixture faculty with all three types populated, when both `computeFacultyPerTypeRatings` and `GetFacultyReportUnscoped` are invoked with the same inputs, then `ratingsMap.get(typeCode).rating === GetFacultyReportUnscoped(…{typeCode}).overallRating` for every type at exact 2-decimal equality. **Divergence blocks CI.** Since the helper calls `GetFacultyReportUnscoped` directly, this is by-construction true; the test defends against future refactors.

- [x] **AC14 (No `/report` regression)**: Given `/report` tests pass pre-change, when the spec lands, then they continue to pass unchanged — `BuildFacultyReportData` is not modified.

**Frontend — UI**

- [x] **AC15 (Composite strip renders on FOUR routes)** (F1 correction): Given a logged-in user visits one of:
  - `/campus-head/faculties/:facultyId/analysis?semesterId=X&questionnaireTypeCode=Y`
  - `/chairperson/faculties/:facultyId/analysis?semesterId=X&questionnaireTypeCode=Y`
  - `/dean/faculties/:facultyId/analysis?semesterId=X&questionnaireTypeCode=Y`
  - `/faculty/analytics?semesterId=X[&questionnaireTypeCode=Y]` (FACULTY self-view; note `analytics`, not `analysis`; no `:facultyId` param)

  when the page loads, then `<CompositeRatingSummaryStrip />` renders in the always-rendered shell showing "Composite rating" label, value, interpretation chip (when non-null), and ⓘ trigger. The strip renders **regardless of `/report` state** (F12 — even when `/report` is loading/erroring, the composite strip is visible).

- [x] **AC16 (Per-type strip label differentiation)**: Given the user is on any tab, when the page renders, then `HeadlineMetricsStrip`'s label is the selected tab's type name + `" rating"` (e.g., `"Faculty Feedback rating"`), never the literal `"Overall rating"`. When `questionnaireTypeName` is empty during load, label falls back to `"Rating"`.

- [x] **AC17 (Composite strip is rating-only — no sentiment, no responses)** (F34): Given the composite strip renders, when inspecting the rendered output, then it contains only the label + rating number (or "Insufficient data") + optional interpretation chip + optional amber dot + ⓘ trigger. It does NOT render a sentiment mini-bar or a response count cell.

- [x] **AC18 (Popover breakdown — FULL)**: Given `FULL`, when the user clicks ⓘ, then the popover shows three rows in canonical order with canonical weight badges (`50%` / `25%`), rating (2 decimals), contribution (2 decimals). No effective-weight sub-label (because `effective === canonical`). No coverage banner.

- [x] **AC19 (Effective weight sub-label for renormalized rows)** (F19): Given `coverageStatus ∈ {PARTIAL, FEEDBACK_ONLY}` AND a row's `effectiveWeight > 0 && effectiveWeight !== weight`, when the popover opens, then the row shows an "effective X.X%" sub-label formatted with one decimal place (e.g., `"66.7%"`, `"50.0%"`, `"100.0%"`).

- [x] **AC20 (Missing-type row styling)**: Given a row's `rating === null`, when the popover opens, then the row displays the type name with either `"No submissions"` (if `submissionCount === 0`) or `"No scored data"` (if `submissionCount > 0`) in muted text, and no numeric contribution.

- [x] **AC21 (Coverage banner copy — locked per status)**: Given each `coverageStatus` value, when the popover opens, then the banner text matches exactly:
  - `FULL` → no banner element rendered
  - `PARTIAL` → `"Partial coverage — renormalized to available tracks."`
  - `PARTIAL_NO_FEEDBACK` → `"Feedback track missing — composite cannot be computed without the primary 50% track. Per-track ratings shown above for reference."`
  - `FEEDBACK_ONLY` → `"Only Faculty Feedback submissions available — composite equals Feedback rating."`
  - `INSUFFICIENT` → `"Insufficient data — need at least 50% coverage to compute composite."`
  - `NO_DATA` → `"No submissions yet for this semester."`

- [x] **AC22 (Amber coverage badge)**: Given `composite.coverageStatus !== 'FULL'`, when the strip renders, then a small amber dot is visible adjacent to the composite rating.

- [x] **AC23 (Interpretation chip gating)** (F29): Given `composite.interpretation === null`, when the strip renders, then NO interpretation chip element appears in the DOM (not an empty-styled span).

- [x] **AC24 (Graceful composite fetch failure)**: Given `/overview` returns 500 or a network error, when the page renders, then the composite strip shows `"Composite unavailable"` + working retry button (`overviewQuery.refetch`), the `/report`-driven inner region continues to function, and the page is NOT blanked.

- [x] **AC25 (Composite strip visible when `/report` fails)** (F12): Given `/report` returns an error or is loading indefinitely, when the page renders, then the composite summary strip remains visible in the always-rendered shell (not hidden behind an early-return), while the inner region shows `<ScopedAnalyticsErrorState />` or `<ScopedAnalyticsLoadingState />` respectively.

- [x] **AC26 (Insufficient-data strip render)**: Given `composite.rating === null` (PARTIAL_NO_FEEDBACK / INSUFFICIENT / NO_DATA), when the strip renders, then muted `"Insufficient data"` text appears instead of a rating number (no NaN, no crash), the ⓘ trigger is clickable, and the popover's banner explains why.

- [x] **AC27 (Unified NO_DATA empty-state)** (F13): Given `composite.coverageStatus === 'NO_DATA'` AND `/report` also returns no submissions, when the page renders, then the composite banner is the primary empty-state message and the per-type inner region shows the muted secondary message `"No per-tab breakdown available."` — no duplicate primary messages.

- [x] **AC28 (Mobile layout)**: Given viewport width < 640px, when the per-faculty analysis page renders, then the composite strip wraps without horizontal overflow, and the popover opens within viewport bounds.

- [x] **AC29 (PDF export tooltip — V1 rollout gate)** (F27): Given the user hovers (or focuses) the PDF export button on the per-faculty analysis page, when the tooltip appears, then it displays `"PDF export shows per-track ratings; composite rating is in the dashboard view."` This tooltip is removed when the `FAC-XX: PDF composite rating` follow-up lands.

**Integration**

- [x] **AC30 (Independent query lifecycle + staleTime)** (F30): Given the user is on the analysis page, when they switch between tabs within 60 seconds, then the `/overview` query does NOT refetch (cache returns stable data keyed by `{facultyId, semesterId, courseId}`). After 60+ seconds of inactivity, the query becomes stale and refetches on next mount.

- [x] **AC31 (Documentation reference exists)**: Given a developer reads `api.faculytics/docs/architecture/analytics.md`, when they search for "composite" or "PARTIAL_NO_FEEDBACK", then they find the formula, all 6 coverage statuses, the chain-of-rounding invariant, the Dean-respecting null behavior on missing FEEDBACK, the endpoint signature, and the canonical REST table is updated.

## Additional Context

### Dependencies

**External**

- No new backend dependencies.
- No new frontend dependencies. shadcn `Popover`, `Tooltip`, `AnimatedNumber`, `Info` icon (`lucide-react`) already present.

**Internal (order of merge)**

- Backend must ship first or together with frontend.
- **PDF composite follow-up** (`FAC-XX: PDF composite rating`) should be opened as a Backlog issue the same day this spec lands.

**Data dependencies**

- Requires seeded `Semester` and three `QuestionnaireType` entities (already seeded).
- Smoke testing needs fixtures covering all 8 scenarios in Task 25's matrix.

### Testing Strategy

**Backend — Automated (Jest)**

- **Parity test** (Task 7, AC13): asserting — divergence blocks CI.
- **Composite branches** (Task 8): six status tests + null-rating-with-positive-submissionCount edge + courseId propagation + contribution ordering. Assert chain-of-rounding invariant for non-null composites.
- **Controller + auth** (Task 9): covers AC9–AC12.

**Frontend — Manual (no automated suite exists)**

- Smoke test (Task 25) — 4 roles × 8 scenarios = 32 checkpoints.
- DevTools: `/overview` fires once per page mount; stable across tab switches within 60s; refetches after 60s.
- Mobile viewport verification.
- Accessibility: ⓘ is a real focusable `<button>`; popover is keyboard-dismissable.
- `/report` failure scenario: block `/report` in DevTools → composite still renders.

**Edge-case seeding notes**

- `PARTIAL_NO_FEEDBACK`, `FEEDBACK_ONLY`, `INSUFFICIENT` rare in prod; document explicit SQL/ts-node snippets in Task 25's seeding section.
- For F7 (null rating with positive submissionCount): degenerate-schema fixture or explicit mock.

### Notes

**Layering note**

- Composite strip sits _above_ the per-type `HeadlineMetricsStrip` in an **always-rendered shell**. Labels differentiated (`"Composite rating"` vs `"{Tab} rating"`) to prevent the "two Overall numbers" confusion.

**FAC ticket**

- FAC ticket number not yet assigned — run `/promote-backlog` **before** opening PRs.

**Risks & Mitigations (pre-mortem, post-round-2-review)**

1. **3× report-build cost per page mount.**
   Mitigation: acceptable for V1 (wrapped in `em.transactional`; `Promise.all` parallelizes inside). If page-mount latency becomes a concern, a narrower helper that duplicates the aggregation SQL (Path A) is a clean follow-up with measurable benchmarks.

2. **PARTIAL_NO_FEEDBACK returning null reduces composite visibility in production.**
   Mitigation: this is the intended Dean-respecting default. Popover still shows IN + OUT ratings. If the Dean later requests "compute anyway when FEEDBACK is missing," flip the `PARTIAL_NO_FEEDBACK` branch in Task 5 step 7 — one-line change.

3. **New `QuestionnaireType` code introduced later is silently ignored.**
   Mitigation: `COMPOSITE_WEIGHTS` is typed with `satisfies` → adding to the union at type level forces a compile-time decision about weights.

4. **Cache staleness after pipeline completion.**
   Mitigation: documented as a known limitation (symmetric with `/report`'s same gap). `staleTime: 60_000` bounds staleness within a session.

5. **PDF mismatch during rollout window.**
   Mitigation: V1 tooltip on the PDF export button sets expectation. Fast-follow issue tracked as `FAC-XX: PDF composite rating`.

**Known limitations**

- **PDF reports do not yet include the composite.** V1 rollout gate: dashboard tooltip explains the gap; follow-up issue opens on day 1.
- **Pipeline-completion cache invalidation**: neither `/report` nor `/overview` invalidates on BullMQ pipeline completion. Bounded by `staleTime: 60_000`; full fix is a project-wide spec.
- **Course-level composite**: supported via `courseId` propagation. Coverage thresholds still apply at course scope — a faculty with submissions in all 3 types overall but only 1 type within the specific course will see `INSUFFICIENT` or similar.
- **Cross-faculty rollups** — separate spec; methodology TBD.
- **No observability hooks** beyond the `logger.debug` in Task 5 step 9.

**Future considerations & named follow-ups**

- **`FAC-XX: PDF composite rating`** (named follow-up, same sprint) — add composite block to faculty evaluation PDF; remove the V1 dashboard tooltip.
- **`FAC-XX: Pipeline-completion cache invalidation for analytics endpoints`** — invalidate `/report` + `/overview` React Query caches on pipeline completion.
- **Composite history** over time — persisting per-run composites for trend charts.
- **Path A optimization** — if latency data justifies it, implement the narrower duplicate-aggregation helper.
- **Threshold / weights tuning** — single-constant changes in `composite-rating.constants.ts`.
- **Cross-faculty composite rollups** — dept/campus/university-level composites as a separate spec.
- **Audit/telemetry dashboard** — feed the `logger.debug` telemetry line (Task 5 step 9) into a product dashboard tracking `coverageStatus` distribution.
- **OpenAPI type generation** — if `CompositeCoverageStatus` drift becomes painful across 3 declaration sites (backend constants, frontend types, docs), add codegen.

### Documentation Updates (per user ask)

- `api.faculytics/docs/architecture/analytics.md` — primary reference. New subsection + updated REST table (Task 21).
- `api.faculytics/CLAUDE.md` — single-line pointer (Task 22).
- Swagger/OpenAPI — `@ApiProperty` descriptions on the new DTOs describe `coverageStatus` semantics, the `weight` vs `effectiveWeight` distinction, and the chain-of-rounding rule (part of Task 3).
