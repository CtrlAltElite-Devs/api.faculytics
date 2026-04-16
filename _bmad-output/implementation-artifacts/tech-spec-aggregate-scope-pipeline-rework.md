---
title: 'Aggregate-scope pipeline rework with tiered scheduler and faculty self-view'
slug: 'aggregate-scope-pipeline-rework'
created: '2026-04-15'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - NestJS 11
  - MikroORM + PostgreSQL
  - BullMQ / Redis
  - Zod + class-validator (belt-and-braces validation)
  - @nestjs/schedule (static @Cron decorators extending BaseJob)
  - Next.js 16 App Router
  - React 19
  - TanStack Query v5
  - Zustand
  - shadcn/ui + Tailwind 4
  - Axios (apiClient with interceptor-based auth)
files_to_modify:
  # API
  - api.faculytics/src/modules/analysis/dto/create-pipeline.dto.ts
  - api.faculytics/src/modules/analysis/dto/list-pipelines.dto.ts
  - api.faculytics/src/modules/analysis/dto/responses/pipeline-summary.response.dto.ts
  - api.faculytics/src/modules/analysis/dto/responses/recommendations.response.dto.ts
  - api.faculytics/src/modules/analysis/dto/recommendations.dto.ts
  - api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts
  - api.faculytics/src/modules/analysis/services/recommendation-generation.service.ts
  - api.faculytics/src/modules/analysis/analysis.controller.ts
  - api.faculytics/src/modules/analysis/lib/build-submission-scope.ts
  - api.faculytics/src/repositories/questionnaire-submission.repository.ts
  - api.faculytics/src/crons/index.jobs.ts
  # NEW: tiered scheduler job
  - api.faculytics/src/crons/jobs/analysis-jobs/tiered-pipeline-scheduler.job.ts (NEW)
  # Frontend
  - app.faculytics/app/(dashboard)/faculty/analytics/page.tsx
  - app.faculytics/app/(dashboard)/campus-head/dashboard/page.tsx
  - app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx
  - app.faculytics/features/faculty-analytics/components/pipeline-trigger-card.tsx
  - app.faculytics/features/faculty-analytics/components/pipeline-confirm-dialog.tsx
  - app.faculytics/features/faculty-analytics/components/recommendations-card.tsx
  - app.faculytics/features/faculty-analytics/components/theme-explorer-card.tsx
  - app.faculytics/features/faculty-analytics/components/scoped-analytics-dashboard-screen.tsx
  - app.faculytics/features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts
  - app.faculytics/features/faculty-analytics/hooks/use-latest-pipeline-for-scope.ts
  - app.faculytics/features/faculty-analytics/hooks/use-create-pipeline.ts
  - app.faculytics/features/faculty-analytics/hooks/use-pipeline-recommendations.ts
  - app.faculytics/features/faculty-analytics/api/analysis-pipeline.requests.ts
  - app.faculytics/features/faculty-analytics/types/index.ts
  # NEW: facet filter helpers
  - app.faculytics/features/faculty-analytics/lib/facet-filter.ts (NEW)
  # Faculty sidebar nav config (location TBD — verify in generate phase)
code_patterns:
  - 'Custom repository per entity registered via @Entity({ repository: () => X })'
  - 'Entities extend CustomBaseEntity (UUID PK, timestamps, soft delete)'
  - 'Zod schema mirrored alongside class-validator rules in DTOs (belt-and-braces)'
  - 'Service methods in PascalCase; read-heavy ops use em.fork(), transactional writes wrap in unitOfWork.runInTransaction'
  - 'Partial unique index migrations using raw SQL with COALESCE sentinels + WHERE partial filter (see Migration20260414155236)'
  - 'Cron jobs extend BaseJob, use static @Cron() decorator, guard with isRunning flag, register in src/crons/index.jobs.ts AllCronJobs array'
  - 'Endpoints protected via @UseJwtGuard(...roles); per-method widening to FACULTY where role can view own data'
  - 'Frontend feature-slice architecture (app.faculytics/docs/ARCHITECTURE.md) — all new code under features/faculty-analytics/{api,hooks,components,types,lib}'
  - 'React Query hooks follow queryKey shape [domain, action, ...variables]; token NOT in queryKey (Axios interceptor handles auth)'
  - 'URL-synced view state via useSearchParams-based view-model hooks'
  - 'Pipeline terminal statuses are UPPERCASE ("COMPLETED"|"FAILED"|"CANCELLED") — must match backend enum verbatim'
test_patterns:
  - 'Jest + NestJS TestingModule; mock dependencies via { provide: X, useValue: { method: jest.fn() } }'
  - 'Integration tests under test/e2e or test/integration — spawn real DB via docker compose'
  - 'Worker contracts tested against mock-worker server (docker compose up) using Zod schema round-trips'
  - 'Frontend: no established unit-test pattern for faculty-analytics components yet — verify during generate phase'
---

# Tech-Spec: Aggregate-scope pipeline rework with tiered scheduler and faculty self-view

**Created:** 2026-04-15
**Related issue:** https://github.com/CtrlAltElite-Devs/api.faculytics/issues/345
**Codebases in scope:** `api.faculytics/` (NestJS API) + `app.faculytics/` (Next.js frontend)

## Overview

### Problem Statement

The pipeline analysis trigger is scoped by `questionnaireTypeCode`, meaning Campus Heads and Deans must trigger separate pipeline runs per questionnaire type from the Faculty Analysis screen. Two of the three established questionnaire types — **In-Classroom Evaluation** and **Out-of-Classroom Evaluation** — are only answered by deans and chairpersons (at most one response per faculty per semester), so runs scoped to these types trip the coverage threshold and topic modeling no-ops. The coverage warning isn't a bug in the threshold; it's the pipeline truthfully reporting that it was triggered at the wrong scope.

Separately, the **Faculty self-view** (`/faculty/analytics`) is currently an unimplemented placeholder, and the **Campus Head dashboard** has no path to request campus-wide qualitative themes (only department rollups, which today are the same per-type runs at a higher tier).

### Solution

Collapse pipeline scope to `scopeType ∈ {faculty, department, campus} + scopeId + semesterId`. A single aggregate pipeline per scope ingests submissions across **all** questionnaire types and produces facet-tagged output — `Overall` plus three primary facets (`Faculty Feedback`, `In-Classroom`, `Out-of-Classroom`). Non-primary questionnaire codes fold into `Overall` via metadata tagging. The frontend renders facets as tabs on a single pipeline result (no new pipeline per tab click).

Add a **weekly tiered scheduler** (faculty → department → campus, staggered) with a "changed since last run" skip check and manual override at any scope. Add an **opt-in "Run campus-wide themes"** action on the Campus Head dashboard for deliberate institutional-level topic modeling (default campus view remains a department comparison rollup — cheap, always fresh, no new topic-model compute).

Wire the **Faculty self-view** with read-only trigger (Faculty cannot run pipelines; weekly schedule handles refresh), facet tabs, composition transparency badges, and a new **server-side verbatim-redaction guard** so Faculty viewing their own profile see aggregates only — no raw comments, no `supportingEvidence.sources[].sampleQuotes`.

### Scope

**In Scope:**

**API (`api.faculytics/`):**

- Collapse `CreatePipelineDto` scope fields: accept `scopeType ∈ {FACULTY, DEPARTMENT, CAMPUS}` + `scopeId` + `semesterId`. Drop `courseId`, `programId`, `questionnaireTypeCode` from the DTO surface. Keep `questionnaireVersionId` as optional (orchestrator continues to resolve active version when not provided).
- Internal mapping: orchestrator maps `scopeType + scopeId` back to the existing nullable FK columns on `AnalysisPipeline` (`faculty_id` | `department_id` | `campus_id`). **No entity schema change; no new migration for scope fields.** (See Technical Decisions §1 for rationale.)
- Update `list-pipelines.dto.ts` to accept `scopeType + scopeId` as query filter; drop `questionnaireTypeCode` as a filter.
- Extend `PipelineSummaryCoverageDto` with `voiceBreakdown: Record<QuestionnaireTypeCode, { submissionCount, commentCount, responseRate }>` covering the three primary codes + an `other` bucket for non-primary codes folded into Overall.
- Tag `RecommendedActionResponseDto` with a `facet: 'overall' | 'facultyFeedback' | 'inClassroom' | 'outOfClassroom'` field, derived upstream in `RecommendationGenerationService` from the action's `supportingEvidence.sources` (topic labels already carry enough context; tagging is a post-hoc grouping).
- Add verbatim redaction: in `AnalysisController.GetRecommendations`, after mapping actions, if `req.user.role === FACULTY && pipeline.faculty?.id === req.user.userId`, strip `supportingEvidence.sources[].sampleQuotes` to `[]` on every action. Leave all other fields intact.
- Add tiered scheduler: new `TieredPipelineSchedulerJob` under `src/crons/jobs/analysis-jobs/` extending `BaseJob`. Three `@Cron()` methods staggered (e.g., Sunday 01:00 faculty, 02:00 department, 03:00 campus). Each enqueues `POST /analysis/pipelines`-equivalent orchestrator calls for every active scope in its tier where submissions' `createdAt > lastRunCompletedAt` (see Task B1 for the critical-semantic explanation). Concurrency guarded via `isRunning` flag per tier. Register in `src/crons/index.jobs.ts`.
- Campus-wide themes reuses `POST /analysis/pipelines` with `scopeType: CAMPUS`. **No new endpoint.** The opt-in nature is purely a frontend affordance.
- Mock worker (`mock-worker/server.ts`) unchanged — already supports multi-item batches.

**Frontend (`app.faculytics/`):**

- Remove `questionnaireTypeCode` from `PipelineScopeIds` type, from `useCreatePipeline`, `useLatestPipelineForScope`, and the entire `useFacultyReportDetailViewModel` query chain (`useFacultyReport`, `useQualitativeSummary`, `useFacultyReportComments`).
- Add `Facet` type: `'overall' | 'facultyFeedback' | 'inClassroom' | 'outOfClassroom'`. Add `selectedFacet` to the view-model with URL param `facet` (default `overall`).
- Add `features/faculty-analytics/lib/facet-filter.ts` with `filterActionsByFacet(actions, facet)` and `filterThemesByFacet(themes, facet)` helpers. Client-side only — no network calls per facet click.
- Replace questionnaire-type dropdown on `FacultyReportHeader` with a facet tab/toggle group. Keep the course dropdown but narrow its effect: pass `courseId` only to the quantitative queries (`useFacultyReport`), **not** to `useQualitativeSummary` or pipeline queries. Add subtext under the themes section: _"Themes and feedback are analyzed across all your courses to ensure reliable patterns. Per-course breakdowns show quantitative ratings only."_
- Render per-facet composition badges using new `voiceBreakdown` field — e.g., "Faculty Feedback: 200 · In-Classroom: 2 · Out-of-Classroom: 1". Badges live on the facet tab header and on `PipelineConfirmDialog` below the existing 3-column coverage grid.
- Render empty facets as **"No data yet"** cards (not hidden) — trigger when `filterActionsByFacet(actions, facet).length === 0 && voiceBreakdown[facet]?.submissionCount === 0`.
- Gate verbatim rendering in `ThemeExplorerCard` on the shape of the recommendations response: when API returns empty `sampleQuotes[]`, the card renders theme metadata + sentiment breakdown only (no quote list, no per-comment badges). Add a subtle "Comments not available" note in this state. This handles the Faculty self-view redaction transparently.
- Wire `/faculty/analytics/page.tsx` to resolve `facultyId` from `useMe()` and render `<FacultyReportScreen facultyId={me.id} />`. `PipelineTriggerCard`'s existing read-only branch (lines 154–172) already handles Faculty role — no new hidden mode needed.
- Add **auto-schedule info banner** (new small component) placed inside `PipelineTriggerCard` below the trigger controls for scoped roles, and as a sibling for Faculty view. Copy: _"Next scheduled refresh: {day} at {time}"_. Consumes new optional `nextScheduledRunAt` field on pipeline status response (API will populate based on scheduler registry lookup).
- Add **"Run campus-wide themes"** button on `ScopedAnalyticsDashboardScreen` when `scopeLabel === "Campus"`. Uses existing `useCreatePipeline` with `{ scopeType: 'campus', scopeId: campusId, semesterId }`. Button state shows "Running…" during pipeline execution; disabled when a campus-wide pipeline is already active for the semester.
- Ensure sidebar nav includes `/faculty/analytics` under the Faculty role. Verify location of `getNavItemsForRole` (likely `features/auth/` — to confirm in generate phase).

**Out of Scope:**

- Migration/backfill of historical `AnalysisPipeline` rows. Existing rows remain readable; partial unique index continues to enforce uniqueness per scope tuple. New pipelines simply don't populate `course_id`/`program_id`.
- Any changes to Moodle sync, ingestion adapters, or questionnaire versioning.
- Any changes to sentiment/topic-model algorithm internals or worker code (`topic.worker.faculytics`, sentiment worker).
- Any change to the Student UX (Students only submit; they do not see analytics).
- New role-based access policies beyond the Faculty verbatim redaction named above.
- Department-level opt-in "run themes" button (not requested — department tier always topic-models on its weekly cadence).
- Chairperson dashboard mount (FAC-132 deferred this; stays deferred).
- Automated campus-wide themes cron (campus tier scheduler only refreshes department comparison rollups, not full topic modeling — campus-wide topic model is opt-in via UI button).

## Context for Development

### Codebase Patterns

**Backend conventions to follow:**

- All entities extend `CustomBaseEntity` (UUID, timestamps, soft delete); soft delete enforced via MikroORM global filter.
- DTOs use **both Zod and class-validator** side-by-side (belt-and-braces per `project-context.md` §52). Request DTOs live in `src/modules/<module>/dto/`; responses in `dto/responses/`.
- Custom repositories per entity under `src/repositories/`; registered on entities via `@Entity({ repository: () => X })`. `QuestionnaireSubmissionRepository` is currently empty — safe to add a `FindChangedSince(scopeFilter, sinceDate)` helper.
- Public Service methods use **PascalCase**. Read-heavy ops use `em.fork()`; transactional writes wrap `unitOfWork.runInTransaction(...)`.
- Partial unique indexes with soft-delete awareness follow the pattern in `Migration20260414155236`: raw SQL `CREATE UNIQUE INDEX ... COALESCE(col, 'NONE') ... WHERE deleted_at IS NULL AND status NOT IN (...)`.
- Cron jobs extend `BaseJob` (`src/crons/base.job.ts`), use static `@Cron('<expr>', { name: <class>.name })` decorators, guard concurrency with an `isRunning` flag, and register into `src/crons/index.jobs.ts` `AllCronJobs` array. Never call `SchedulerRegistry.deleteCronJob` on shutdown (per `project-context.md` §99).
- Endpoints protected via `@UseJwtGuard(...roles)` from `src/security/decorators/`. Current authenticated user is extracted via `@Req() req: AuthenticatedRequest` with `req.user!.userId`, or via `currentUserService.getOrFail()` populated by `CurrentUserInterceptor`.

**Frontend conventions to follow (`app.faculytics/`):**

- Feature-sliced architecture is **non-negotiable** (`app.faculytics/docs/ARCHITECTURE.md` §§2, 8, 11). All pipeline-analytics code lives under `features/faculty-analytics/{api,hooks,components,types,lib}`. No root-level `hooks/<feature>/`, `network/requests/`, `types/<feature>/`, or `lib/<feature>/`.
- Query keys shape: `[domain, action, ...variables]` (e.g., `["analysis", "list-pipelines-for-scope", query]`). **Token is NOT in queryKey** — Axios interceptor handles auth.
- Terminal statuses are UPPERCASE strings matching the backend enum verbatim: `"COMPLETED" | "FAILED" | "CANCELLED"`.
- Request wrappers in `features/faculty-analytics/api/*.requests.ts` call `apiClient.get/post` and return `response.data` — thin and typed.
- Components in `features/faculty-analytics/components/` never import request modules directly; they consume hooks.
- URL-synced state lives in view-model hooks using `useSearchParams`. Existing example: `useFacultyReportDetailViewModel`.
- Consistent `null` over omission in API responses (per `tech-spec-frontend-pipeline-polling.md`).

### Files to Reference

| File                                                                                       | Purpose                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API — `api.faculytics/`**                                                                |                                                                                                                                                               |
| `src/modules/analysis/dto/create-pipeline.dto.ts:5-61`                                     | Current DTO with 8 scope fields — collapse to `scopeType + scopeId + semesterId + optional questionnaireVersionId`.                                           |
| `src/modules/analysis/dto/list-pipelines.dto.ts:13,269-275`                                | Listing filter — remove `questionnaireTypeCode`, add `scopeType + scopeId`.                                                                                   |
| `src/modules/analysis/dto/responses/pipeline-summary.response.dto.ts:46-61`                | `PipelineSummaryCoverageDto` — extend with `voiceBreakdown`. Mapper at lines 88–119.                                                                          |
| `src/modules/analysis/dto/responses/recommendations.response.dto.ts:7-80`                  | `RecommendedActionResponseDto` — add optional `facet` field. Mapper at lines 67–76.                                                                           |
| `src/modules/analysis/dto/recommendations.dto.ts:41-47`                                    | `SupportingEvidence` schema — `sources[].sampleQuotes` is the verbatim leak point.                                                                            |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:65-73`                     | `ScopeFilter` interface — keep shape; DTO layer collapses into it.                                                                                            |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:113-244`                   | `CreatePipeline` flow — update DTO parse + duplicate check to new shape.                                                                                      |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:813-930`                   | `assertCanCreatePipeline` — auto-fill logic; review for compatibility with `scopeType`.                                                                       |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:1124-1143`                 | `resolveLatestActiveVersionId` — still used when `questionnaireVersionId` is not provided.                                                                    |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:1187-1255`                 | `ComputeCoverageStats` — plug `voiceBreakdown` computation here (group submissions by `questionnaireVersion.questionnaire.type.code`).                        |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts:1279-1400+`                | Sentiment + topic-model dispatch — verify scope filter usage. No per-type loop to unwind (already single-pass).                                               |
| `src/modules/analysis/services/recommendation-generation.service.ts`                       | Derive `facet` tag per action from `supportingEvidence.sources[].topicLabel` — primary codes match by label/topic-lineage.                                    |
| `src/modules/analysis/analysis.controller.ts:38-119`                                       | All 6 endpoints. `GetRecommendations` at line 116 is the verbatim-redaction plug-in point.                                                                    |
| `src/modules/analysis/lib/build-submission-scope.ts:3-17`                                  | Builds query predicates from `ScopeFilter`. No change expected — scope collapse happens upstream.                                                             |
| `src/entities/analysis-pipeline.entity.ts:31-95`                                           | Entity columns — **no schema change** per Technical Decision §1. Existing FK columns continue to serve as storage.                                            |
| `src/migrations/Migration20260414155236_fac-132-pipeline-scope-unique-index.ts`            | Partial unique index pattern — reference only; not modified.                                                                                                  |
| `src/entities/questionnaire-version.entity.ts`                                             | Version → Questionnaire → QuestionnaireType chain confirmed. Version uniquely identifies type; removing `typeCode` from DTO does not break version selection. |
| `src/repositories/questionnaire-submission.repository.ts`                                  | Currently empty — add `FindChangedSince(scopeFilter, sinceDate)` for scheduler skip-check.                                                                    |
| `src/crons/base.job.ts:1-45`                                                               | `BaseJob` abstract — new `TieredPipelineSchedulerJob` extends this.                                                                                           |
| `src/crons/jobs/auth-jobs/refresh-token-cleanup.job.ts:1-63`                               | Reference implementation: static `@Cron` + `isRunning` guard.                                                                                                 |
| `src/crons/index.jobs.ts:1-3`                                                              | `AllCronJobs` array — register new scheduler job here.                                                                                                        |
| `src/security/decorators/index.ts:12-25`                                                   | `UseJwtGuard` composition. No change — reused by controller.                                                                                                  |
| `src/modules/auth/roles.enum.ts:1-9`                                                       | `UserRole` enum — `FACULTY` value drives the redaction branch.                                                                                                |
| `mock-worker/server.ts:31-78`                                                              | `/topic-model` endpoint already supports multi-item batches — no change needed.                                                                               |
| **Frontend — `app.faculytics/`**                                                           |                                                                                                                                                               |
| `app/(dashboard)/faculty/analytics/page.tsx`                                               | Current placeholder (9 lines) — wire `useMe` + `FacultyReportScreen`.                                                                                         |
| `app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx`                             | Dean per-faculty — already uses `FacultyReportScreen`; inherits facet rework.                                                                                 |
| `app/(dashboard)/dean/dashboard/page.tsx`                                                  | Dean department dashboard — uses `ScopedAnalyticsDashboardScreen`.                                                                                            |
| `app/(dashboard)/campus-head/dashboard/page.tsx`                                           | Campus Head dashboard — gets "Run campus-wide themes" button.                                                                                                 |
| `features/faculty-analytics/components/faculty-report-screen.tsx:1-259`                    | Primary layout. Dropdown-to-tabs rework concentrated in header section.                                                                                       |
| `features/faculty-analytics/components/pipeline-trigger-card.tsx:154-172`                  | Faculty read-only branch already exists — reuse for self-view.                                                                                                |
| `features/faculty-analytics/components/pipeline-trigger-card.tsx:175-396`                  | Scoped-role trigger UI. Add `nextScheduledRunAt` banner.                                                                                                      |
| `features/faculty-analytics/components/pipeline-confirm-dialog.tsx:62-97`                  | Coverage grid — add `voiceBreakdown` composition row below existing 3-col grid.                                                                               |
| `features/faculty-analytics/components/recommendations-card.tsx:45-119`                    | Action item renders `sampleQuotes` at line ~104–109 — becomes no-op when API returns empty array (redacted shape).                                            |
| `features/faculty-analytics/components/theme-explorer-card.tsx`                            | Renders per-comment sentiment badges + verbatim text on expand — same shape-based gating.                                                                     |
| `features/faculty-analytics/components/scoped-analytics-dashboard-screen.tsx`              | Dean + Campus Head dashboards. `scopeLabel === "Campus"` branches get the opt-in button.                                                                      |
| `features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts:101-129,268-331` | Drop `questionnaireTypeCode` from all three internal queries; add `selectedFacet`.                                                                            |
| `features/faculty-analytics/hooks/use-latest-pipeline-for-scope.ts`                        | QueryKey `["analysis", "list-pipelines-for-scope", query]` — query shape narrows.                                                                             |
| `features/faculty-analytics/hooks/use-create-pipeline.ts`                                  | Cache seed on success — update to new `variables` shape.                                                                                                      |
| `features/faculty-analytics/hooks/use-pipeline-recommendations.ts`                         | No shape change; consume redacted-shape responses transparently.                                                                                              |
| `features/faculty-analytics/api/analysis-pipeline.requests.ts`                             | `CreatePipelineRequest` type — drop `questionnaireTypeCode`, add `scopeType + scopeId`.                                                                       |
| `features/faculty-analytics/types/index.ts:346-505`                                        | Add `Facet` type, `VoiceBreakdown` type, update `PipelineScopeIds` and `PipelineCoverage`.                                                                    |
| `features/auth/hooks/use-me.ts:7-15`                                                       | Returns authenticated user; assumes `data.id` is available (verify in generate phase).                                                                        |
| `components/layout/app-sidebar.tsx:1-59`                                                   | Uses `getNavItemsForRole(activeRole)` — verify faculty nav includes `/faculty/analytics`.                                                                     |
| `network/endpoints.ts:64-68`                                                               | Pipeline endpoint enum — no path changes, only payload shapes change.                                                                                         |
| `docs/ARCHITECTURE.md`                                                                     | Binding rules for file placement, naming, hook/component boundaries.                                                                                          |
| **Reference specs**                                                                        |                                                                                                                                                               |
| `_bmad-output/implementation-artifacts/tech-spec-fac-132-analysis-pipeline-interaction.md` | Role-auth matrix, scope-validation rules, one-pipeline-per-scope contract. This rework extends, does not supersede.                                           |
| `_bmad-output/implementation-artifacts/tech-spec-frontend-pipeline-polling.md`             | `PipelineStatusResponse` shape and polling contract. `voiceBreakdown` added non-breakingly; `nextScheduledRunAt` added as new optional field.                 |

### Technical Decisions

1. **Entity shape: keep existing nullable FK columns (no schema change).** The scope collapse is a DTO/surface-level refactor. Orchestrator maps `scopeType + scopeId` → exactly one of `faculty | department | campus` FK columns (`programId`/`courseId` are rejected at validation if present). The existing partial unique index (`Migration20260414155236`) continues to enforce one-active-pipeline-per-scope-tuple unchanged. Historical rows with `programId`/`courseId` set remain readable. **Rationale:** Option A (new `scope_type + scope_id` columns) would require migration, dual storage during transition, and re-creating the unique index. Option B is a pure surface simplification, preserves FAC-132 work, and ships faster. Matches user's "iterate later" stance.

2. **Scope shape (API request contract):** `CreatePipelineDto` and `ListPipelinesQuery` accept `{ scopeType: 'FACULTY' | 'DEPARTMENT' | 'CAMPUS', scopeId: UUID, semesterId: UUID, questionnaireVersionId?: UUID }`. Legacy fields (`facultyId`, `departmentId`, `campusId`, `programId`, `courseId`, `questionnaireTypeCode`) are **removed from the DTO surface**. Hard cutover acceptable — test data only, no true production (user-confirmed).

3. **Facet tagging (not voice-reweighting):** `Overall` facet is count-weighted across all submissions (primary + non-primary codes). No artificial rebalancing. Composition surfaced via `voiceBreakdown` so readers self-calibrate. Locked in party-mode synthesis.

4. **Verbatim redaction at the response-mapping layer.** Single enforcement point: `AnalysisController.GetRecommendations` post-mapping. Clears `supportingEvidence.sources[].sampleQuotes` to `[]` when requester is Faculty self-viewing. All other roles receive full shape. This guard does NOT exist today — new with this spec. Comments endpoint, if exposed to Faculty at any point in the future, must apply the same check — captured as a note, not implemented (Faculty doesn't hit a comments endpoint today).

5. **Tiered scheduler implementation.** Single `TieredPipelineSchedulerJob` class with three separate `@Cron()` methods (one per tier) rather than three job classes. Each method reads "active scopes for tier X in current semester" and enqueues orchestrator calls for those whose submissions changed since last pipeline's `completedAt`. Skip-check query lives in `QuestionnaireSubmissionRepository.FindChangedSince(scopeFilter, sinceDate)`. Manual override from the frontend is a normal `POST /analysis/pipelines` — no scheduler involvement. Concurrency: `isRunning` flag per tier.

6. **Campus-wide opt-in button:** No new API endpoint. Frontend calls `POST /analysis/pipelines` with `scopeType: 'CAMPUS', scopeId: currentCampusId`. Semantics communicated through UX (button label, confirm dialog copy).

7. **Course filter scope (FacultyReportScreen):** Course filter applies ONLY to the quantitative section queries (`useFacultyReport`). Qualitative queries (`useQualitativeSummary`, `useFacultyReportComments`) and pipeline queries do NOT receive `courseId`. Subtext copy makes this explicit to the user.

8. **Facet filtering is client-side only.** Single pipeline result loaded; `filterActionsByFacet(actions, facet)` and `filterThemesByFacet(themes, facet)` filter the already-loaded array. No new network calls per tab click. Facet is derived server-side on each action (the `facet` field added to `RecommendedActionResponseDto`); client just groups by that field.

9. **Facet derivation strategy (server-side):** `RecommendationGenerationService` inspects each action's `supportingEvidence.sources[].topicLabel` (or direct submission-to-questionnaire-type lineage on topics) to assign a `facet`. Primary codes map 1:1 (`facultyFeedback`, `inClassroom`, `outOfClassroom`). Non-primary codes → `overall`. Exact derivation logic is an implementation detail of Step 3 — may lean on existing topic-to-submission trace paths.

10. **`nextScheduledRunAt` surfaced via pipeline status endpoint.** Computed at response time from `SchedulerRegistry` cron expression + now. Optional field; absent for roles that don't see scheduling (or can be always populated — low cost). Default banner copy falls back to generic "Weekly on Mondays" if absent.

11. **Historical data compatibility.** No migration, no backfill for `AnalysisPipeline`. Old rows keep their `course_id`/`program_id`; new rows leave those null. History-view UI tolerates both via the server-side `scopeLabel` derived field (Task A6). `RecommendedAction.facet` IS backfilled via JOIN to the parent pipeline's historical `questionnaireTypeCode` — see Task A9.

12. **Enum casing convention (normalization rule, end-to-end):**
    - **API enum-discriminator fields** (`scopeType`, `UserRole`, `PipelineStatus`, etc.): UPPERCASE strings. Rationale: matches existing NestJS codebase patterns (e.g., `UserRole.FACULTY = 'FACULTY'`).
    - **API identifier/value fields** (`facet`, `category`, `priority`, questionnaire type codes): camelCase strings. Rationale: `facet` values (`overall`, `facultyFeedback`, `inClassroom`, `outOfClassroom`) are not discriminators on a union — they're identifiers in a flat enum.
    - **Frontend TypeScript types:** match API shapes verbatim. No frontend re-casing.
    - **Display strings for UI** (tab labels, headings): Title Case, produced via formatter helpers (e.g., `formatFacetLabel(facet: Facet): string`). Never coerce enum values directly to display labels.
    - **Database columns:** `VARCHAR` stores the canonical API value (uppercase for discriminators, camelCase for facet). No case conversion at the ORM layer.
    - Any test or code review that finds mixed casing of the same enum should fail the check.

## Implementation Plan

Tasks are organized in four phases. **Phase A is the gate** — it ships a stable API contract; Phase B/C/D can then proceed in parallel (B independent; C and D sequenced C→D). Within each phase tasks are ordered by dependency.

**Integration sequence (important — primary plan):** Phase A ships with a **backwards-compat Zod preprocessor** as part of Task A2 that accepts the legacy field names (`facultyId`, `departmentId`, `campusId`, `programId`, `courseId`, `questionnaireTypeCode`) and transparently maps/drops them at the DTO parse layer while logging a `deprecated_field_used` warning per request. This keeps `develop` green during the staggered merge of Phase A → Phase C → cleanup. Concrete sequencing:

1. **PR-1 (Phase A):** ships DTO rework + bridging Zod preprocessor + all other Phase A items. Frontend still sends legacy payload; API accepts both shapes. `develop` stays green.
2. **PR-2 (Phase C):** frontend migrates to new payload shape + facet rework. Deprecation warnings from PR-1 stop firing.
3. **PR-3 (cleanup):** remove the Zod preprocessor after PR-2 lands. Hard cutover complete.
4. **PR-4 (Phase B):** scheduler — independent of the A↔C migration; can merge any time after PR-1.
5. **PR-5 (Phase D):** Faculty self-view — depends on PR-1 and PR-2 being live.

**Do NOT ship Phase A without the preprocessor.** The preprocessor is ≈15 lines, preserves trunk health, and is trivially removable in PR-3. Treat it as Phase A scope, not optional.

### Tasks

#### Phase A — API contract + scope collapse

- [ ] **Task A1: Add shared analysis type primitives**
  - File: `api.faculytics/src/modules/analysis/dto/facet.dto.ts` _(NEW)_
  - Action: Export `Facet` TS union + Zod enum `'overall' | 'facultyFeedback' | 'inClassroom' | 'outOfClassroom'`. Export `PrimaryQuestionnaireCode` mapping facet ↔ questionnaire-type code (read the three established codes from existing DB seed / `QuestionnaireType` table — investigate during implementation; fallback constants if needed).
  - Notes: Single source of truth for facet identifiers used in DTOs + services.

- [ ] **Task A2: Collapse `CreatePipelineDto` scope shape + ship backwards-compat Zod preprocessor**
  - File: `api.faculytics/src/modules/analysis/dto/create-pipeline.dto.ts`
  - Action:
    1. Canonical shape: keep `semesterId` (required). Add `scopeType: 'FACULTY' | 'DEPARTMENT' | 'CAMPUS'` (uppercase for enum-consistency) and `scopeId: UUID`. Keep `questionnaireVersionId?` (optional).
    2. Add a Zod `preprocess` layer BEFORE the canonical schema that: (a) if caller sent `facultyId`/`departmentId`/`campusId`, maps to `{ scopeType: 'FACULTY'|'DEPARTMENT'|'CAMPUS', scopeId: <value> }`; (b) silently drops `programId`, `courseId`, and `questionnaireTypeCode` if present; (c) emits a `logger.warn('deprecated_field_used', { fields: [...] })` once per request. The preprocessor is a named function so PR-3 can remove it cleanly.
    3. Update class-validator decorators on the canonical shape — belt-and-braces.
  - Notes: The preprocessor is a temporary bridge for the Phase A → Phase C staggered merge (see Integration Sequence). It is removed in PR-3. On PR-3 day, the Zod schema switches to `.strict()` / unknown-key rejection so any stragglers see clear 400s.

- [ ] **Task A3: Collapse `ListPipelinesQuery` filter**
  - File: `api.faculytics/src/modules/analysis/dto/list-pipelines.dto.ts` (lines 13, 269–275)
  - Action: Same removals as A2; accept `scopeType + scopeId` as optional listing filters.
  - Notes: Consumers (frontend `useLatestPipelineForScope`) change in Phase C.

- [ ] **Task A4: Map `scopeType + scopeId` → FK columns in orchestrator**
  - File: `api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts` (lines 113–244)
  - Action: After DTO parse, introduce a private helper `resolveScopeFilter(dto): ScopeFilter` that maps `{scopeType, scopeId}` to exactly one of `{ faculty: {id}, department: {id}, campus: {id} }` in the existing `ScopeFilter` interface (lines 65–73). Throw `BadRequestException` if `scopeType` unknown. `semesterId` and `questionnaireVersionId` resolution unchanged.
  - Notes: The existing `buildSubmissionScope(pipeline)` in `lib/build-submission-scope.ts` continues to work — we only changed the input surface, not the internal filter representation.

- [ ] **Task A5: Update `assertCanCreatePipeline` authorization**
  - File: `api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts` (lines 813–930)
  - Action: Rewrite authorization to operate on the resolved `scopeType + scopeId` rather than the old multi-field shape. Preserve FAC-132 role/scope validation matrix: SUPER_ADMIN unrestricted; DEAN only DEPARTMENT scope they own; CHAIRPERSON only CHAIRPERSON-scoped FACULTY (today auto-filled via program); CAMPUS_HEAD either CAMPUS or DEPARTMENT they own.
  - Notes: Auto-fill behavior (when requester has exactly one assigned scope) stays — adapt to new field names.

- [ ] **Task A6: Extend `PipelineSummaryCoverageDto` with `voiceBreakdown` + add derived `scopeLabel`**
  - File: `api.faculytics/src/modules/analysis/dto/responses/pipeline-summary.response.dto.ts` (lines 46–61, 88–119 mapper)
  - Action: (1) Add optional field `voiceBreakdown?: { facultyFeedback: CoverageSlice; inClassroom: CoverageSlice; outOfClassroom: CoverageSlice; other: CoverageSlice }` on `PipelineSummaryCoverageDto` where `CoverageSlice = { submissionCount: number; commentCount: number }`. (2) Add `scopeLabel: string` on `PipelineSummaryResponseDto` (top level, not inside coverage) — a **derived display string** computed by the mapper. Logic: inspect which FK is populated on the entity (faculty > department > campus > program > course) and return a formatted label (e.g., "Faculty: Jane Cruz", "Department: CS", "Legacy: course CS101"). This field tolerates BOTH new-shape pipelines (scopeType + one of 3 FKs) and old-shape historical rows (program/course FKs) without frontend branching.
  - **Relation loading guidance:** the mapper needs the human-readable names (`faculty.fullName`, `department.name`, `campus.name`, `program.name`, `course.name`). The controller / service code that calls `Map()` MUST `populate` these relations before mapping. Canonical call shape: `em.findOne(AnalysisPipeline, { id }, { populate: ['faculty', 'department', 'campus', 'program', 'course'] })`. If a relation is still lazy at map time, `scopeLabel` falls back to a id-only form (e.g., "Faculty: <uuid-prefix>") rather than triggering an N+1 or throwing. The mapper must NEVER emit literal `[object Object]` or `undefined` — all three failure modes explicitly fall back to the "Legacy scope" string.
  - Notes: `voiceBreakdown` is optional for backward compat with cached older pipelines; always populated on new responses. `scopeLabel` is non-optional — always populated.

- [ ] **Task A7: Compute `voiceBreakdown` in `ComputeCoverageStats`**
  - File: `api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts` (lines 1187–1255)
  - Action: After the aggregate coverage computation, run **one single SQL aggregation query** that joins `questionnaire_submission → questionnaire_version → questionnaire → questionnaire_type` and groups by `questionnaire_type.code`, selecting `COUNT(*) AS submission_count, SUM(CASE WHEN cleaned_comment IS NOT NULL THEN 1 ELSE 0 END) AS comment_count`. Apply the same scope predicate used by the aggregate coverage query. One round-trip — no N+1. In TS, map the result rows: the three primary codes fill their matching facet keys; any other code rows sum into `other`. Omit per-slice `responseRate` (aggregate `responseRate` already on the DTO covers this; per-facet denominators are ambiguous).
  - Notes: Do NOT loop per primary code issuing separate queries. Persistence-wise: compute on-demand; a JSONB `voice_breakdown` column on `AnalysisPipeline` is a future consideration, not this spec.

- [ ] **Task A8: Add `facet` field to `RecommendedActionResponseDto`**
  - File: `api.faculytics/src/modules/analysis/dto/responses/recommendations.response.dto.ts` (lines 7–31)
  - Action: Add `facet: Facet` field (non-optional) to each action. Update the mapper (lines 67–76) to read from the underlying `RecommendedAction` entity (to be extended in A9).
  - Notes: Non-optional so the frontend can always group. Default to `overall` if ambiguous.

- [ ] **Task A9: Derive facet during recommendation generation + add entity column**
  - Files: `api.faculytics/src/modules/analysis/services/recommendation-generation.service.ts`, `api.faculytics/src/entities/recommended-action.entity.ts`, `api.faculytics/src/migrations/MigrationXXXXXXXXXXXXXX_add-recommended-action-facet.ts` _(NEW migration)_
  - Action:
    1. **Migration:** Add column `facet VARCHAR(32)` (nullable initially) to `recommended_action`. Backfill existing rows via a SQL UPDATE with a JOIN to their parent pipeline: map each `AnalysisPipeline`'s original `questionnaireTypeCode` (still persisted on historical rows even though removed from new DTO) to its matching facet value — `facultyFeedback`, `inClassroom`, `outOfClassroom`, or `overall` for pipelines whose type-code is non-primary or null. One UPDATE, no default-`overall` lie. After backfill, `ALTER COLUMN facet SET NOT NULL` + `SET DEFAULT 'overall'` (default applies only to any row that slipped through the backfill — safety net). Historical data now carries truthful facet labels, not a convenient lie. If the column `questionnaire_type_code` was NEVER persisted on `AnalysisPipeline` historically (only present in the DTO), fall back to nullable column + frontend treats null as "legacy/unknown" and excludes from facet filtering — verify during migration writing.
    2. **Entity:** Add `@Property() facet: Facet` on `RecommendedAction` entity (import Facet from the new `facet.dto.ts`).
    3. **Generation logic:** When generating each `RecommendedAction`, inspect `supportingEvidence.sources[]`. For topic sources, trace contributing `TopicAssignment` → `QuestionnaireSubmission` → `QuestionnaireVersion` → `Questionnaire` → `QuestionnaireType.code`.
    4. **Derivation rule (explicit, deterministic):** Count contributing submissions by primary questionnaire-type code. Let `n_total` be the total contributing submission count and `n_top` be the count of the most-represented primary code. Tag the action with that primary code's facet IFF `n_top / n_total ≥ 0.60` (60% plurality threshold). Otherwise tag `overall`. Rationale: BERTopic clusters frequently produce mixed-source topics; a strict majority (>50%) is too fragile and sends plurality-mixed actions to `overall` — a 60% threshold strikes the balance between honest attribution and useful facet signal. The threshold is a constant in code (`FACET_DOMINANCE_THRESHOLD = 0.60`) so it can be tuned in a follow-up without a spec change.
    5. **Pre-work investigation:** Before writing derivation code, verify `TopicAssignment` actually has the FK chain to `QuestionnaireSubmission`. If not present, extend the entity / add the relation as part of this task — do not discover this mid-PR. If the trace is genuinely expensive at runtime, fall back to running this tagging step asynchronously as part of the recommendations BullMQ job rather than inline during generation.
  - Notes: Document the rule in a code comment at the derivation function. Covered by AC9, AC10, AC10b, AC10c.

- [ ] **Task A10: Faculty verbatim redaction helper (reusable)**
  - Files: `api.faculytics/src/modules/analysis/services/analysis-access.service.ts` _(NEW)_, `analysis.controller.ts` (line 116–117, GetRecommendations method)
  - Action: Create `AnalysisAccessService` with a method `RedactIfFacultySelfView<T>(response: T, pipeline: AnalysisPipeline, requester: AuthenticatedUser): T`. Logic: resolve `requester.facultyId` (the Faculty **profile id**, NOT the auth user id — these are distinct in this codebase; Faculty users have a `User.id` for auth and a separate `facultyId` populated via Moodle sync / domain mapping). If `requester.role === UserRole.FACULTY && pipeline.faculty?.id === requester.facultyId`, walk the response and clear `supportingEvidence.sources[].sampleQuotes = []` on every topic source and any other comment-bearing fields. Return the (possibly mutated) response. Leave a prominent code-comment anchor at the method signature: `// AUDIT: verbatim redaction — if you add any endpoint returning comment/quote text, call this helper. Single point of enforcement for Faculty self-view policy.`
  - Inject the service into `AnalysisController`; call from `GetRecommendations` after the service-layer response.
  - **Pre-work (MUST complete before writing redaction logic — gates the rest of A10):**
    1. Open `src/modules/auth/strategies/` (both `LocalLoginStrategy` and `MoodleLoginStrategy`) and `src/entities/user.entity.ts`. Confirm how a Faculty user's domain profile id (`facultyId`) is related to the auth `userId`.
    2. Document the exact accessor as a code-comment in `AnalysisAccessService` — one of: (a) `currentUser.facultyId` if directly present; (b) `currentUser.profile?.facultyId` if nested; (c) a new `UserRepository.resolveFacultyProfileId(userId: UUID): Promise<UUID | null>` helper if no direct accessor exists.
    3. If (c), add the repository method as part of this task (not a follow-up). It's two lines of MikroORM: find user by id, return `user.facultyProfile?.id ?? null`.
    4. Add a negative-case test (see AC35): construct an authenticated user where `userId !== facultyId` and assert the redaction comparison uses `facultyId`.
  - **Do not guess, do not skip this pre-work.** The security control is only as correct as the id-resolution path. Frontend side has the same pre-work requirement for `useMe` (see Task D1 cross-reference).
  - Notes: Today only `GetRecommendations` leaks verbatims. If a future endpoint (e.g., theme comments drill-down) is added, it MUST call `AnalysisAccessService.RedactIfFacultySelfView`. See AC34.
  - **Module registration:** Register `AnalysisAccessService` in `AnalysisModule`'s `providers` array. Inject into `AnalysisController` via constructor.

- [ ] **Task A11: API unit tests for Phase A**
  - Files: `api.faculytics/src/modules/analysis/__tests__/create-pipeline-dto.spec.ts` _(NEW)_, `pipeline-orchestrator.service.spec.ts` (EXTEND), `analysis.controller.spec.ts` (EXTEND)
  - Action: Cover DTO validation (accept new shape, reject forbidden fields); orchestrator scope-filter resolution for all three `scopeType` values; coverage with `voiceBreakdown`; facet tagging on actions; redaction branch assertion for Faculty vs non-Faculty requester.
  - Notes: Use `TestingModule` with mocked EM where practical; full integration tests live in Phase B/C.

#### Phase B — Tiered scheduler

- [ ] **Task B1: Add `FindChangedSince` to submissions repository**
  - File: `api.faculytics/src/repositories/questionnaire-submission.repository.ts`
  - Action: Add `async FindChangedSince(scope: ScopeFilter, since: Date | null): Promise<{ ids: string[]; count: number }>`. Query filter: existing scope predicates **AND** `createdAt > since` (when `since` is non-null; if null, treat as "all submissions in scope"). Return just the count + ids — full entities not needed for the skip decision.
  - **Critical semantic:** the skip-check uses `createdAt`, NOT `updatedAt`. Submissions are effectively immutable once posted in this domain (no edit flow exists for students), so `createdAt > since` correctly captures "new submissions since last pipeline run." Using `updatedAt` would be flawed because child-entity changes (sentiment result attached, comment cleaning) don't propagate to the submission row's timestamp — this would cause stale-data-masquerading-as-fresh bugs.
  - Notes: Current repository file is empty — this is the first custom method. If a late-edit flow is introduced in the future, revisit this — follow-up ticket territory, not this spec.

- [ ] **Task B2: Active-scopes-per-tier lookup helper**
  - File: `api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts` (NEW private method `FindActiveScopesForTier(tier: 'FACULTY' | 'DEPARTMENT' | 'CAMPUS')`)
  - Action: Determine **active semesters** first: query `Semester` entity for rows where `status = ACTIVE` (fall back to "semesters with any submission in the last 30 days" if the `status` field doesn't exist or isn't populated — verify during implementation). Returns potentially multiple active semesters. For each active semester × tier, enumerate distinct scope ids with ≥1 submission. Final shape: `{ scopeType, scopeId, semesterId, lastPipelineCompletedAt: Date | null }[]`.
  - **Rationale:** single-semester assumption breaks during semester transitions (e.g., new semester created mid-December but old semester still has active submissions). Multi-active-semester handling prevents "scheduler skipped everything for 2 weeks" bugs.
  - Notes: Used by the scheduler to enumerate work items. If multiple active semesters is an unexpected state for the domain, add a log-warning (not a hard error) and process each.

- [ ] **Task B3: Create `TieredPipelineSchedulerJob`**
  - File: `api.faculytics/src/crons/jobs/analysis-jobs/tiered-pipeline-scheduler.job.ts` _(NEW)_
  - Action: Class extends `BaseJob`. Three `@Cron` methods: `RunFacultyTier()` at `0 1 * * 0` (Sunday 01:00), `RunDepartmentTier()` at `0 2 * * 0`, `RunCampusTier()` at `0 3 * * 0`. Each method: (1) guard with tier-specific `isRunning` flag; (2) call `FindActiveScopesForTier` (returns scopes across all active semesters); (3) for each scope, call `FindChangedSince(scope, lastPipelineCompletedAt)`; (4) if any changed submissions, invoke `PipelineOrchestratorService.CreatePipeline({ scopeType, scopeId, semesterId })` internally + auto-confirm (no user interaction); (5) log skips.
  - **Load / concurrency:** the scheduler enqueues ALL work items immediately into BullMQ. Load spreading is BullMQ's responsibility via the existing `BULLMQ_SENTIMENT_CONCURRENCY` (and matching topic/embedding concurrency caps) environment configuration. Tier time-staggering exists for operational clarity (easier to diagnose which tier caused a spike), not for throttling. Do NOT add per-scope `await` delays or manual batching — that fights BullMQ's design.
  - **Auto-confirm semantics (sidesteps FAC-132's AWAITING_CONFIRMATION surface):** the scheduler calls a dedicated orchestrator method `CreateAndConfirmPipeline({ scopeType, scopeId, semesterId, trigger: 'SCHEDULER' })` that bypasses `AWAITING_CONFIRMATION` and creates the pipeline already in the CONFIRMED state. Coverage threshold check STILL runs during creation. **If the coverage check fails** (e.g., too few submissions for topic modeling): the pipeline is created in state `COMPLETED` with empty output, `warnings: ['insufficient_coverage_at_schedule_time']`, and a WARN-level log entry — NOT stuck in `AWAITING_CONFIRMATION` (no human to confirm), NOT errored (not a real error). The Dean sees it appear in pipeline history with the warning, can investigate, can manually trigger when ready. `trigger: 'SCHEDULER'` is persisted on `AnalysisPipeline` (add column if needed — minor migration) for provenance. Covered by AC42.
  - **Campus tier:** decide during implementation whether `RunCampusTier()` enqueues a pipeline at all. If campus-level analysis is purely a rollup of department outputs (no new topic modeling) and rollup computation is cheap enough to be on-read, remove `RunCampusTier()` entirely. If in doubt, keep it as a stub that logs "campus tier scheduled but no-op" — safe default, easy to activate later.
  - Notes: Campus-wide topic modeling is user-initiated only (via the Campus Head dashboard opt-in button); the scheduler must NOT enqueue it automatically.

- [ ] **Task B4: Register the scheduler job**
  - File: `api.faculytics/src/crons/index.jobs.ts`
  - Action: Add `TieredPipelineSchedulerJob` to `AllCronJobs` array.
  - Notes: Ensure `ScheduleModule.forRoot()` is active (it already is per `InfrastructureModules`).

- [ ] **Task B5: Surface `nextScheduledRunAt` on pipeline status**
  - File: `api.faculytics/src/modules/analysis/dto/responses/pipeline-summary.response.dto.ts` + status endpoint mapper in `pipeline-orchestrator.service.ts`
  - Action: Add optional `nextScheduledRunAt: string | null` to the status/summary response DTO. Populate by looking up `SchedulerRegistry.getCronJob(TieredPipelineSchedulerJob.name)` for the tier matching the pipeline's `scopeType`, computing next fire time, and ISO-stringifying.
  - Notes: Field absent is acceptable — frontend falls back to generic copy.

- [ ] **Task B6: Scheduler unit tests**
  - File: `api.faculytics/src/crons/jobs/analysis-jobs/__tests__/tiered-pipeline-scheduler.job.spec.ts` _(NEW)_
  - Action: Test `isRunning` concurrency guard; skip-check logic with mocked `FindChangedSince` returning empty vs populated; each tier dispatches to the correct orchestrator call shape.
  - Notes: Manual cron triggering via direct method invocation on the job instance is sufficient — no need for `SchedulerRegistry` time manipulation.

#### Phase C — Frontend facet rework

- [ ] **Task C1: Update type surface**
  - File: `app.faculytics/features/faculty-analytics/types/index.ts` (lines 346–505)
  - Action: Add `Facet` type (`'overall' | 'facultyFeedback' | 'inClassroom' | 'outOfClassroom'`). Add `CoverageSlice` + `VoiceBreakdown` types. Remove `questionnaireTypeCode` from `PipelineScopeIds`. Extend `PipelineCoverage` with optional `voiceBreakdown`. Add `facet: Facet` to `RecommendedActionDto`. Add `scopeLabel: string` (non-optional) to `PipelineSummary` + `PipelineStatusResponse`.
  - Notes: Matching shapes to API changes from Phase A. `scopeLabel` is how the frontend displays scope info defensively (handles both new + legacy pipeline shapes).

- [ ] **Task C2: Update API request wrappers**
  - File: `app.faculytics/features/faculty-analytics/api/analysis-pipeline.requests.ts`
  - Action: Update `CreatePipelineRequest` to `{ scopeType: 'FACULTY' | 'DEPARTMENT' | 'CAMPUS', scopeId: string, semesterId: string, questionnaireVersionId?: string }`. Update `ListPipelinesQuery` similarly. No endpoint path changes.
  - Notes: Thin layer — just shape changes.

- [ ] **Task C3: Add `facet-filter.ts` helpers**
  - File: `app.faculytics/features/faculty-analytics/lib/facet-filter.ts` _(NEW)_
  - Action: Export three pure functions:
    1. `filterActionsByFacet(actions: RecommendedActionDto[], facet: Facet): RecommendedActionDto[]` — returns all actions when `facet === 'overall'`, else filters by `action.facet === facet`.
    2. `deriveThemeFacets(themes: QualitativeThemeDto[], actions: RecommendedActionDto[]): Map<themeId, Facet>` — client-side join. For each theme, find the recommendation action(s) that cite it via `supportingEvidence.sources[].themeId` (or topic label match if ids aren't available). Inherit the action's facet. If no matching action, default to `'overall'`.
    3. `filterThemesByFacet(themes: QualitativeThemeDto[], themeFacets: Map<themeId, Facet>, facet: Facet): QualitativeThemeDto[]` — returns all themes for `'overall'`, else filters by the derived map.
  - **Strategy (locked):** themes inherit facet from their source recommendation via client-side join. No API DTO change to `QualitativeThemeDto`. Cheap and keeps the contract surface stable.
  - Notes: Client-side only; no network calls. Pure functions — easy to unit test (`facet-filter.test.ts`).

- [ ] **Task C4: Update pipeline query hooks**
  - Files: `app.faculytics/features/faculty-analytics/hooks/use-latest-pipeline-for-scope.ts`, `use-create-pipeline.ts`, `use-pipeline-recommendations.ts`
  - Action: Drop `questionnaireTypeCode` from all query key shapes. Cache seeding in `use-create-pipeline.onSuccess` uses new `variables` shape.
  - Notes: `use-pipeline-status.ts` already keys only by `pipelineId` — no change.

- [ ] **Task C5: Refactor `useFacultyReportDetailViewModel`**
  - File: `app.faculytics/features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts` (lines 101–129, 268–331)
  - Action: (1) Remove `questionnaireTypeCode` URL param + all three internal query bindings (`useFacultyReport`, `useQualitativeSummary`, `useFacultyReportComments`). (2) Add `selectedFacet: Facet` URL-synced state (param key `facet`, default `'overall'`) with `selectFacet(facet)` setter. (3) Keep `courseId` URL state but pass it ONLY to `useFacultyReport` (quantitative); remove it from `useQualitativeSummary` and `useFacultyReportComments` bindings. (4) Remove `availableQuestionnaireTypes` and `updateQuestionnaireType` from the return shape; replace with `selectedFacet`, `selectFacet`.
  - Notes: Return-shape change is breaking for the screen — handled in C6/C7.

- [ ] **Task C6: Replace dropdown with facet tabs in Faculty report header + thread `voiceBreakdown` through the component tree**
  - File: `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx` (lines 129–154 header section; investigate `FacultyReportHeader` subcomponent if separate)
  - Action:
    1. Remove questionnaire-type dropdown (lines 142–151 area). Render a `Tabs` or `ToggleGroup` (shadcn/ui) with four triggers: `Overall | Faculty Feedback | In-Classroom | Out-of-Classroom`. Wire to `viewModel.selectedFacet` + `selectFacet`. Course dropdown stays in place.
    2. Extract `voiceBreakdown` from `latestPipeline?.coverage.voiceBreakdown`. Pass it to: (a) the facet tab triggers (for count badges like "Faculty Feedback · 200"), (b) `RecommendationsCard` (required for Task C8 three-way empty-state discrimination), and (c) `PipelineConfirmDialog` (required for Task C9 composition row).
    3. Update the props interfaces of `RecommendationsCard` and `PipelineConfirmDialog` to accept `voiceBreakdown?: VoiceBreakdown` (optional so pre-A6 cached pipelines without the field don't crash; components handle absence by hiding the composition badges / showing only the 2-state empty logic).
  - Notes: Default selected tab = `overall`. Without this prop threading, Task C8's AC40 empty-state discrimination can't compute — this is the wiring that makes it work.

- [ ] **Task C7: Course-filter scope narrowing + subtext copy**
  - Files: `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx` (themes section, lines 194–236)
  - Action: Above or below the themes section, add a small muted-foreground paragraph: _"Themes and feedback are analyzed across all your courses to ensure reliable patterns. Per-course breakdowns show quantitative ratings only."_ Verify in view-model (C5) that course changes don't invalidate qualitative caches.
  - Notes: Copy is load-bearing — don't cut.

- [ ] **Task C8: Facet filtering + empty state in `RecommendationsCard`**
  - File: `app.faculytics/features/faculty-analytics/components/recommendations-card.tsx` (lines 45–119)
  - Action: Apply `filterActionsByFacet(actions, selectedFacet)` at the top of the component. Empty states MUST distinguish three conditions:
    1. **Genuine empty** — `voiceBreakdown[facet].submissionCount === 0` → render "No data yet" card with copy explaining no submissions of this type this semester.
    2. **Data present but no actions** — `submissionCount > 0` but filtered actions empty → render "Analysis still in progress or unavailable" with a faint contact-admin hint. This distinguishes broken-empty from expected-empty and prevents silent bugs.
    3. **Data and actions present** — render the Improvements/Strengths tabs as usual.
  - Notes: The facet selection lives in the parent (`FacultyReportScreen`). This component receives `selectedFacet` + `voiceBreakdown` via props.

- [ ] **Task C9: Composition badges in `PipelineConfirmDialog`**
  - File: `app.faculytics/features/faculty-analytics/components/pipeline-confirm-dialog.tsx` (lines 62–97)
  - Action: Below the existing 3-column grid, add a row rendering `voiceBreakdown`: each primary facet + `other` as a small badge showing `submissionCount`. Hidden if `voiceBreakdown` absent. Layout: single row, wrap on narrow.
  - Notes: Dialog width is `sm:max-w-xl`.

- [ ] **Task C10: Auto-schedule banner in `PipelineTriggerCard`**
  - File: `app.faculytics/features/faculty-analytics/components/pipeline-trigger-card.tsx` (lines 154–172 for Faculty branch; lines 175–396 for scoped branch)
  - Action: Add a small muted block rendering _"Next scheduled refresh: {formatted-from-nextScheduledRunAt}"_ in both branches. If `nextScheduledRunAt` absent, render fallback _"Refreshes weekly on Mondays."_ Component can live inline or as a new `features/faculty-analytics/components/auto-schedule-info.tsx` for reuse.
  - Notes: Use date-fns or Intl.DateTimeFormat for formatting.

- [ ] **Task C11: "Run campus-wide themes" button on Campus Head dashboard**
  - File: `app.faculytics/features/faculty-analytics/components/scoped-analytics-dashboard-screen.tsx`
  - Action: When `scopeLabel === "Campus"`, render a button in the header area labeled "Run campus-wide themes". On click, open the existing confirm dialog flow then call `useCreatePipeline({ scopeType: 'CAMPUS', scopeId: campusId, semesterId })`. Disable button when a `status === RUNNING`/`AWAITING_CONFIRMATION` pipeline exists for this scope. Replace generic copy during running state with "Campus analysis in progress…".
  - Notes: `campusId` extracted from `useMe()` for Campus Head (already-authenticated user's assigned campus).

- [ ] **Task C12: Verbatim gating in `ThemeExplorerCard`**
  - File: `app.faculytics/features/faculty-analytics/components/theme-explorer-card.tsx`
  - Action: Detect redacted shape: if `theme.sampleQuotes.length === 0` AND pipeline data indicates Faculty-self-view context (easiest: derive from `useMe().role === 'FACULTY'` plus scope match, OR simply always check `sampleQuotes.length === 0` — server-side redaction is the canonical gate), render theme metadata + sentiment breakdown only. Add a subtle "Individual comments are not available in your view" note.
  - Notes: Do not try to enforce redaction client-side — server is the canonical enforcement point; this is just cosmetic handling of the empty shape.

- [ ] **Task C13: Frontend compile + type-check pass**
  - Files: whole `app.faculytics/`
  - Action: Run `bun run typecheck` and `bun run lint`. Fix any breakage caused by type-surface changes in C1–C4.
  - Notes: Mandatory before PR per repo conventions.

#### Phase D — Faculty self-view

- [ ] **Task D1: Wire `/faculty/analytics/page.tsx`**
  - File: `app.faculytics/app/(dashboard)/faculty/analytics/page.tsx`
  - Action: Replace placeholder with a `"use client"` client component that calls `useMe()`, extracts the Faculty's **profile id** (NOT the auth user id) as `facultyId`, renders `<FacultyReportScreen facultyId={facultyId} />`. Handle loading/error states via existing loading components.
  - **Pre-work (mirrors A10 pre-work on the frontend):** Open `features/auth/api/auth.requests.ts` and inspect `fetchMe`'s actual return type. Confirm the exact accessor for the Faculty-profile id on the `User` DTO. Candidates: `me.data.facultyId`, `me.data.profile?.facultyId`, `me.data.roles.find(r => r.type === 'FACULTY')?.facultyId`. Document the chosen accessor inline. If the `useMe` response does NOT carry Faculty-profile id for a Faculty user, either (a) extend the `fetchMe` payload on the API side — same spec, add a task — or (b) fetch separately via a dedicated endpoint. Do NOT guess with `me.data.id` (which is the auth user id).
  - Notes: The API self-view hits the same `GET /analysis/pipelines/:id/recommendations` — redaction is automatic as long as the right id is resolved here AND in `AnalysisAccessService` (A10 pre-work).

- [ ] **Task D2: Verify/add Faculty sidebar nav entry**
  - Files: `app.faculytics/components/layout/app-sidebar.tsx` + wherever `getNavItemsForRole` is defined (likely `features/auth/`)
  - Action: Ensure `FACULTY` role's nav items include `{ title: "My Analytics", url: "/faculty/analytics", icon: <appropriate-icon> }`. If missing, add it.
  - Notes: Investigation required during implementation to locate `getNavItemsForRole`.

- [ ] **Task D3: End-to-end manual QA**
  - Action: Spin up full stack (`cd api.faculytics && docker compose up && npm run start:dev` + `cd app.faculytics && bun dev`). Log in as seeded users per role. Execute the following journeys:
    1. Dean triggers analysis on a Faculty; observe facet tabs, composition badges, verbatims visible on expand.
    2. Campus Head triggers campus-wide themes; observe dashboard rollup updates + opt-in button disabling while running.
    3. Faculty logs in, navigates to `/faculty/analytics`, observes: read-only trigger card, auto-schedule banner, facet tabs, themes with NO verbatim quotes, "Individual comments not available" subtext in ThemeExplorerCard.
    4. Change course filter on Faculty view; confirm quantitative cards update but themes/facets stay put.
    5. Empty facet test: pick a Faculty with zero In-Classroom submissions; select In-Classroom tab; confirm "No data yet" renders.
  - Notes: All five journeys must pass before calling this spec done.

### Acceptance Criteria

**Scope DTO validation (Phase A):**

- [ ] **AC1:** Given a valid payload `{ scopeType: 'FACULTY', scopeId: <valid-faculty-uuid>, semesterId: <valid-uuid> }`, when the client POSTs `/analysis/pipelines`, then the API returns 201 and the persisted pipeline row has `faculty_id = scopeId` and `department_id = campus_id = program_id = course_id = NULL`.
- [ ] **AC2:** Given a payload containing the legacy field `questionnaireTypeCode`, when the client POSTs `/analysis/pipelines`, then the API returns 400 with a message identifying the offending field.
- [ ] **AC3:** Given a payload containing `courseId` or `programId`, when the client POSTs `/analysis/pipelines`, then the API returns 400 with a message identifying the offending field.
- [ ] **AC4:** Given `scopeType: 'DEPARTMENT'` with a valid `scopeId`, when POST, then `department_id = scopeId` is persisted.
- [ ] **AC5:** Given `scopeType: 'CAMPUS'` with a valid `scopeId`, when POST, then `campus_id = scopeId` is persisted.
- [ ] **AC6:** Given an unknown `scopeType` value, when POST, then 400.

**Coverage voice breakdown (Phase A):**

- [ ] **AC7:** Given a faculty scope with 200 Faculty-Feedback submissions, 2 In-Classroom, 1 Out-of-Classroom, and 10 submissions of a non-primary questionnaire type, when a pipeline is created and `GET /pipelines/:id/status` is called, then `coverage.voiceBreakdown` contains `facultyFeedback.submissionCount=200`, `inClassroom.submissionCount=2`, `outOfClassroom.submissionCount=1`, `other.submissionCount=10`.
- [ ] **AC8:** Given a scope with only non-primary submissions, when pipeline created, then `voiceBreakdown.other.submissionCount` reflects all of them and the three primary facets report 0.

**Facet tagging on recommendations (Phase A):**

- [ ] **AC9:** Given a completed pipeline with generated recommendations, when a Dean calls `GET /pipelines/:id/recommendations`, then every action in the response has a `facet` field set to exactly one of `'overall' | 'facultyFeedback' | 'inClassroom' | 'outOfClassroom'`.
- [ ] **AC10:** Given an action whose topics derive from non-primary questionnaire submissions, then `action.facet === 'overall'`.
- [ ] **AC10b:** Given an action whose contributing submissions split evenly between two primary codes (tie), when facet is derived, then `action.facet === 'overall'` (no code reaches the 60% dominance threshold).
- [ ] **AC10c:** Given an action whose most-represented primary code accounts for ≥ 60% of contributing submissions, when facet is derived, then `action.facet` equals that primary code's facet. Given the most-represented code accounts for < 60% (plurality but not dominant), then `action.facet === 'overall'`. The threshold constant (`FACET_DOMINANCE_THRESHOLD = 0.60`) lives in code; change requires follow-up.

**Faculty verbatim redaction (Phase A):**

- [ ] **AC11:** Given a Faculty user logged in, when they call `GET /pipelines/:id/recommendations` on their own pipeline (`pipeline.faculty.id === me.userId`), then every `action.supportingEvidence.sources[].sampleQuotes` equals `[]` and no raw verbatim strings appear anywhere in the response.
- [ ] **AC12:** Given a Dean user, when they call `GET /pipelines/:id/recommendations` on the same pipeline, then `sampleQuotes` arrays are populated with the usual up-to-3 quotes.
- [ ] **AC13:** Given a Campus Head (or any non-Faculty role) viewing any pipeline, when they call `GET /pipelines/:id/recommendations`, then `sampleQuotes` are populated regardless of any id coincidence. Redaction applies ONLY when the requesting user's role is `FACULTY` AND their resolved Faculty-profile id matches `pipeline.faculty.id`.

**Tiered scheduler (Phase B):**

- [ ] **AC14:** Given Sunday 01:00 local server time, when `TieredPipelineSchedulerJob.RunFacultyTier` fires, then for every faculty scope with at least one `QuestionnaireSubmission` whose `createdAt > <last-completed-pipeline.completedAt or epoch>`, a new pipeline is created via orchestrator. (Semantic intentionally uses `createdAt`, not `updatedAt` — see Task B1.)
- [ ] **AC15:** Given a faculty scope whose submissions have no `createdAt` values later than the last completed pipeline's `completedAt`, when scheduler fires, then no new pipeline is created for that scope.
- [ ] **AC16:** Given a user clicks "Run analysis" in the UI (manual override), when `POST /analysis/pipelines` is called, then a new pipeline is always created regardless of the skip-check (the skip-check exists only inside the scheduler, not on the endpoint).
- [ ] **AC17:** Given `GET /pipelines/:id/status` on any active pipeline, then the response includes `nextScheduledRunAt` formatted as an ISO 8601 UTC string (e.g., `"2026-04-19T01:00:00.000Z"`) populated from the registered cron for the matching tier.
- [ ] **AC18:** Given the scheduler is already running a tier, when its `@Cron` method fires again (concurrency), then the second invocation returns early due to the `isRunning` guard and logs a skip.

**Frontend facet rendering (Phase C):**

- [ ] **AC19:** Given the FacultyReportScreen loaded with `facet=overall` in the URL, when the user clicks the "In-Classroom" tab, then the URL updates to `facet=inClassroom` and the recommendations panel re-renders showing only actions with `action.facet === 'inClassroom'` WITHOUT any new network request (verified via React Query DevTools or network tab).
- [ ] **AC20:** Given a facet with zero submissions according to `voiceBreakdown`, when that tab is selected, then a "No data yet" card renders in place of the Improvements/Strengths tabs.
- [ ] **AC21:** Given the user changes the course dropdown from "All courses" to a specific course, when the change fires, then the quantitative stats cards and per-question breakdowns refetch. Verified by code review against `use-faculty-report-detail-view-model.ts`: reviewer confirms that the query keys/inputs passed to `useQualitativeSummary` and `useFacultyReportComments` do NOT include `courseId`; only `useFacultyReport` and per-question quantitative queries MAY include it. No automated test is mandated for this AC (no unit-test pattern exists for this feature yet) — adding a pure-function key-composer in `facet-filter.ts` and testing it via `facet-filter.test.ts` is encouraged but out of scope.
- [ ] **AC22:** Given `FacultyReportScreen` rendered, then the subtext _"Themes and feedback are analyzed across all your courses to ensure reliable patterns. Per-course breakdowns show quantitative ratings only."_ is visible below or adjacent to the themes section.

**Campus-wide themes opt-in (Phase C):**

- [ ] **AC23:** Given a Campus Head on `/campus-head/dashboard`, then a "Run campus-wide themes" button is visible in the header area.
- [ ] **AC24:** Given that button is clicked, when confirmed in the dialog, then a `POST /analysis/pipelines` request fires with body `{ scopeType: 'CAMPUS', scopeId: <current-campus-id>, semesterId: <current-semester-id> }`.
- [ ] **AC25:** Given a campus-wide pipeline is already running (status in RUNNING or AWAITING_CONFIRMATION), when the dashboard renders, then the button is disabled with label "Campus analysis in progress…".
- [ ] **AC26:** Given a Dean on `/dean/dashboard`, then the "Run campus-wide themes" button is NOT visible.

**Auto-schedule banner (Phase C):**

- [ ] **AC27:** Given any role viewing an analytics screen with a known `nextScheduledRunAt`, then a muted banner reads "Next scheduled refresh: {formatted date+time}" within `PipelineTriggerCard`.
- [ ] **AC28:** Given `nextScheduledRunAt` is absent from the response, then the banner falls back to "Refreshes weekly on Mondays.".

**Faculty self-view (Phase D):**

- [ ] **AC29:** Given a Faculty user logged in, when they navigate to `/faculty/analytics`, then `FacultyReportScreen` renders with their own `facultyId` resolved from `useMe()`.
- [ ] **AC30:** Given a Faculty user on their own analytics screen, when they expand a theme in `ThemeExplorerCard`, then no verbatim student comments are rendered (empty quote arrays from redacted API) and a "Individual comments are not available in your view" note is shown.
- [ ] **AC31:** Given a Faculty user on their own analytics screen, when `PipelineTriggerCard` renders, then the "Run analysis" button is NOT visible (existing Faculty read-only branch is used), the status badge + last-updated label are visible, and the auto-schedule banner is visible.
- [ ] **AC32:** Given a Faculty user, then a "My Analytics" (or similar) nav entry is visible in the sidebar linking to `/faculty/analytics`.

**Regression safety:**

- [ ] **AC33:** Given an existing Dean workflow pre-rework, when they perform the full trigger → confirm → monitor → view recommendations flow, then it completes without regression relative to FAC-132's established contract (status polling, role guards, coverage warnings, recommendations shape — except now with `facet` and `voiceBreakdown` fields added).

**Hardening ACs (from pre-mortem):**

- [ ] **AC34:** Given any future endpoint on the AnalysisController that returns comment-bearing content (topic drill-downs, theme detail endpoints, etc.), that endpoint MUST call `AnalysisAccessService.RedactIfFacultySelfView` on its response before returning. The audit-comment anchor on the service method makes this reviewable; a code review checklist entry enforces it. The unit test suite for any such new endpoint must include a "Faculty self-view returns redacted" test case.
- [ ] **AC35:** Given a Faculty user whose `User.id` (auth identity) differs from their domain `facultyId` (profile id), when they call `GET /pipelines/:id/recommendations` on their own pipeline, then redaction fires correctly — i.e., the check compares `pipeline.faculty.id` to the Faculty **profile id**, not the auth user id. A unit test must explicitly construct a user with `userId !== facultyId` and assert redacted output.
- [ ] **AC36:** Given a scope with 500 submissions spanning mixed questionnaire types, when `POST /analysis/pipelines` is called, then the `voiceBreakdown` computation executes as **one round-trip to the database** — verified by running `EXPLAIN ANALYZE` against the generated SQL showing a single aggregation plan with no nested loops per questionnaire-type code. Absolute wall-clock time is not asserted; the intent is structural: no N+1, no per-type loop.
- [ ] **AC37:** Given the scheduler enqueues 100+ pipelines in a single tier run, when BullMQ processes them, then the per-queue concurrency cap (`BULLMQ_SENTIMENT_CONCURRENCY` etc.) is respected — no timeouts from queue saturation, jobs complete in bounded time.
- [ ] **AC38:** Given `SchedulerRegistry.getCronJob(TieredPipelineSchedulerJob.name).nextDate()` is unavailable or returns null in the runtime (R3 risk), when building the status response, then fall back to a cron-parser computation against the stored cron expression; `nextScheduledRunAt` remains populated.
- [ ] **AC39:** Given a historical pipeline row with only `program_id` or `course_id` populated (pre-rework shape), when the listing or status endpoints return the `PipelineSummaryResponseDto`, then `scopeLabel` is populated with a defensive human-readable string (e.g., "Course: CS101" or "Legacy scope"). Frontend never sees null or "undefined" for `scopeLabel`.
- [ ] **AC40:** Given a user selects a facet whose `voiceBreakdown.submissionCount > 0` but actions array is empty (data exists but analysis has no themes), when the facet is rendered, then the UI shows "Analysis still in progress or unavailable" — NOT "No data yet". These two empty states must be visually distinguishable.
- [ ] **AC41:** Given multiple active semesters exist (e.g., transition week), when the scheduler's faculty tier fires, then it enumerates scopes across ALL active semesters, not a single "current" semester. No semester's faculty scopes are skipped due to single-semester assumption.
- [ ] **AC42:** Given a scheduler-auto-triggered pipeline whose scope fails the coverage threshold check, when orchestrator processes it, then the pipeline is persisted in state `COMPLETED` with empty output and `warnings: ['insufficient_coverage_at_schedule_time']` — NOT stuck in `AWAITING_CONFIRMATION`, NOT errored. The auto-flow never leaves a pipeline in a state that requires human confirmation.
- [ ] **AC43:** Given a scheduler-auto-triggered pipeline (any outcome), then `AnalysisPipeline.trigger === 'SCHEDULER'` is persisted. Given a user-initiated pipeline (via frontend trigger), then `AnalysisPipeline.trigger === 'USER'`. Provenance is queryable.

## Additional Context

### Dependencies

- **GitHub Issue:** [#345](https://github.com/CtrlAltElite-Devs/api.faculytics/issues/345) — this spec closes the issue.
- **Merged prerequisites on `develop`:**
  - FAC-131 (campus head role) — PR #331
  - FAC-132 (role-aware analysis pipeline triggering and output surfacing) — PR #336
  - FAC-133 (faculty enrollments by id endpoint)
  - FAC-134 (qualitative analytics view for faculty analysis page) — PR #347
- **External:** No new service dependencies. Mock worker (`api.faculytics/mock-worker/`) is ready. Redis + Postgres via `docker compose up` unchanged.
- **No new npm or bun packages required.** All capabilities (Zod, @nestjs/schedule, TanStack Query tabs, shadcn ToggleGroup) are already in the dependency graph.

### Testing Strategy

**API unit tests (Jest + TestingModule):**

- `create-pipeline.dto.spec.ts` — Zod + class-validator coverage for new shape acceptance + legacy-field rejection.
- `pipeline-orchestrator.service.spec.ts` extensions — `resolveScopeFilter` for all three scope types; `ComputeCoverageStats` with mocked EM returning mixed-code submission sets; `FindActiveScopesForTier` returning correct distinct sets.
- `recommendation-generation.service.spec.ts` extensions — facet derivation from topic sources.
- `analysis.controller.spec.ts` extensions — redaction branch assertion (Faculty self vs Dean vs Campus Head).
- `tiered-pipeline-scheduler.job.spec.ts` — direct method invocation, mocked orchestrator, isRunning guard.

**API integration tests (test/integration or test/e2e):**

- Full pipeline lifecycle per role: POST `/analysis/pipelines` → confirm → poll status → fetch recommendations. Assert response shapes per role (Dean/Faculty self/Campus Head). Seed data must include mixed-questionnaire-type submissions to exercise `voiceBreakdown`.
- Scheduler: instantiate the job, call each `Run*Tier()` method, assert orchestrator invocations on mocked service.

**Frontend checks (no unit-test pattern yet established for this feature):**

- `bun run typecheck` and `bun run lint` must pass.
- Manual QA scripted in Task D3.
- Consider adding a minimal smoke test for `facet-filter.ts` (`lib/facet-filter.test.ts`) — pure function, cheap to test.

**Manual QA (pre-merge gate):**

- Run `cd api.faculytics && docker compose up` for Redis + mock worker; `npm run start:dev` for API; `cd app.faculytics && bun dev` for frontend.
- Execute the five end-to-end journeys from Task D3. Each must pass without console errors, without unexpected refetches, and without verbatim leaks on Faculty self-view.

### Notes

**Risks (pre-mortem — after elicitation round):**

- **R1 (resolved — rule explicit):** Facet derivation uses a 60% plurality-dominance threshold (`FACET_DOMINANCE_THRESHOLD = 0.60`). Below threshold → `overall`. Rationale: strict majority (>50%) is too fragile for BERTopic's mixed-source clusters. Code comment at derivation site documents the rule. Covered by AC10, AC10b, AC10c. See Task A9 derivation logic.
- **R2 (resolved — promoted to firm decision):** Skip-check semantics locked to `createdAt > since`, NOT `updatedAt`. Submissions are effectively immutable in this domain (no student edit flow). See Task B1 critical-semantic note. If a late-edit feature is introduced later, revisit — out of scope.
- **R3 (medium):** `SchedulerRegistry.getCronJob(...)` / `.nextDate()` may behave inconsistently across NestJS/cron library versions. **Mitigation:** Fallback-and-validate pattern — try `SchedulerRegistry.nextDate()` first; if it throws or returns null, compute manually from the stored cron expression using `cron-parser`. Covered by AC38.
- **R4 (resolved — redaction hardened):** Faculty verbatim redaction extracted to reusable `AnalysisAccessService.RedactIfFacultySelfView` with a code-audit anchor. Covered by AC34. The auth-user-id vs Faculty-profile-id distinction is explicitly called out in Task A10 and AC35.
- **R5 (low):** "Run campus-wide themes" button may be confused with the weekly scheduled department rollup if the copy is unclear. **Mitigation:** Use explicit dialog copy: _"This runs a fresh topic-model analysis across all departments in your campus. Recommended for end-of-term reviews."_
- **R6 (low):** Removing `questionnaireTypeCode` from URL params breaks any bookmarked deep-links on staging. **Mitigation:** Acceptable — test data only, no true prod.
- **R7 (medium):** `voiceBreakdown` computation could become an N+1 query if implemented naively. **Mitigation:** Locked to a single SQL aggregation in Task A7. Covered by AC36 (< 1s on 500-submission scopes).
- **R8 (medium):** Scheduler thundering-herd at Sunday 01:00. **Mitigation:** No manual staggering inside a tier — enqueue all, let BullMQ's existing concurrency caps do the work. Covered by AC37 and Task B3 notes.
- **R9 (low):** Historical pipeline rows with `program_id` / `course_id` but no `faculty_id`/`department_id`/`campus_id` could break listing UIs. **Mitigation:** Server-side derived `scopeLabel` field on `PipelineSummaryResponseDto` (Task A6). Frontend never branches on raw FKs. Covered by AC39.
- **R10 (low):** Single-semester assumption in scheduler could cause refresh blackouts during semester transitions. **Mitigation:** Multi-active-semester handling in Task B2. Covered by AC41.
- **R11 (low):** "No data yet" empty state could silently mask real bugs if facet derivation or API has a defect. **Mitigation:** Three-way empty-state discrimination in Task C8 (`submissionCount === 0` vs `submissionCount > 0 && actions empty` vs populated). Covered by AC40.

**Known limitations:**

- Facet tagging for themes rendered in `ThemeExplorerList` requires themes to carry a facet tag too; if `QualitativeThemeDto` doesn't already support this, add it to the API's qualitative-summary response alongside the recommendations facet work in A9. Investigate during A9 implementation; if non-trivial, defer theme-level facet filtering to a follow-up ticket and restrict facet filtering to recommendations only in v1.
- `voiceBreakdown` is computed on-demand during coverage stats — not persisted on the entity. If listings need historical per-facet coverage, a follow-up migration adding a JSONB `voice_breakdown` column to `analysis_pipeline` will be needed. Out of scope for this spec.
- Department-level "opt-in themes" is deliberately omitted — Deans get their weekly scheduled run; if they want ad-hoc reruns, the existing "Run analysis" button on the dashboard serves that already.

**Future considerations (explicit out-of-scope):**

- Scheduled campus-wide topic modeling cron (currently manual-only).
- Chairperson dashboard mount (FAC-132 deferred; stays deferred).
- Faculty-facing comments endpoint with per-comment redaction (only relevant if a future feature exposes raw comments to Faculty — which this spec explicitly does not).
- Historical pipeline migration to the new scope shape (Option A from the entity-shape decision).
- Email/push notification when scheduler auto-triggers a pipeline run.
- **Dynamic admin-configurable scheduler** (F10 deferral): adopt the Moodle-sync pattern — `SchedulerRegistry`-based scheduling with DB-backed `SystemConfig` interval overrides, admin endpoint to adjust cadence, per-environment defaults. Current spec ships static `@Cron()` v1; promotion to dynamic is a follow-up ticket. Tracked as tech-debt; not required to ship #345.
- **Scheduler observability + redaction audit log** (F18 deferral): add a `SyncLog`-equivalent for scheduler runs (per-tier counts, skipped, succeeded, failed) and an audit log entry every time `AnalysisAccessService.RedactIfFacultySelfView` fires (or is called with `shouldRedact=false`). Manual QA is the v1 safety net; observability promotion is a follow-up ticket.

**Reminders that survive from prior drafts:**

- Deadline is tight; phased merges per the Integration Sequence at the top of Implementation Plan.
- Compositional badges and the course-filter subtext copy are load-bearing UX — do not cut under pressure.
- Faculty verbatim redaction is the only new security-sensitive code path; extra review scrutiny required.
- No schema change to `AnalysisPipeline` (Technical Decision §1) — historical rows tolerated read-only via the `scopeLabel` derived field.
