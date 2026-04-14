---
title: 'FAC-132 feat: role-aware analysis pipeline triggering and output surfacing'
slug: 'fac-132-analysis-pipeline-interaction'
created: '2026-04-14'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - 'NestJS 11 (TypeScript 5)'
  - 'MikroORM 6 (PostgreSQL)'
  - 'Passport JWT + RolesGuard'
  - 'Zod + class-validator DTOs'
  - 'BullMQ/Redis (existing pipeline infra, no changes)'
  - 'OpenAI SDK (existing recommendation/topic-label services, no changes)'
  - 'Jest 30 (backend tests)'
  - 'Next.js 16 + React 19 (app.faculytics)'
  - 'TanStack Query v5 + Axios'
  - 'Zustand (auth store)'
  - 'shadcn/ui + Tailwind 4'
  - 'Bun (app.faculytics package manager)'
files_to_modify:
  # Backend — api.faculytics
  - 'api.faculytics/src/modules/analysis/analysis.controller.ts (modify — class-level @UseJwtGuard(DEAN,CHAIRPERSON,CAMPUS_HEAD,SUPER_ADMIN) + @UseInterceptors(CurrentUserInterceptor); method-level widening for FACULTY on GETs; add GET /pipelines list endpoint)'
  - 'api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts (modify — inject ScopeResolverService + CurrentUserService; add assertCanCreatePipeline + assertCanAccessPipeline; add ListPipelines method; call scope checks from Create/Confirm/Cancel/GetPipelineStatus/GetRecommendations; catch UniqueConstraintViolationException in CreatePipeline)'
  - 'api.faculytics/src/modules/analysis/dto/list-pipelines.dto.ts (create — Zod + class-validator query schema for list endpoint)'
  - 'api.faculytics/src/modules/analysis/dto/responses/pipeline-summary.response.dto.ts (create — { id, status, scope, coverage, warnings, createdAt, updatedAt, completedAt })'
  - 'api.faculytics/src/modules/analysis/dto/pipeline-status.dto.ts (modify — extend scope shape to return BOTH IDs and display values; scope: { semesterId, semesterCode, departmentId, departmentCode, facultyId, facultyName, programId, programCode, campusId, campusCode, courseId, courseShortname, questionnaireVersionId })'
  - 'api.faculytics/src/modules/common/services/scope-resolver.service.ts (modify — add ResolveCampusIds(semesterId) helper if missing; pipeline-specific logic stays in orchestrator)'
  - 'api.faculytics/src/migrations/<timestamp>_fac-132-pipeline-scope-unique-index.ts (create — partial unique index on (semester_id, coalesced scope fields) WHERE status NOT IN active terminal statuses AND deleted_at IS NULL; enforces TD-8 one-canonical-pipeline invariant)'
  - 'api.faculytics/src/modules/analysis/analysis.controller.spec.ts (modify — extend existing auditTestProviders() + overrideAuditInterceptors() harness; DO NOT copy from analytics.controller.spec.ts; add list-endpoint delegation test; add audit-on-403-reject test)'
  - 'api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.spec.ts (modify — scope authorization matrix: SUPER_ADMIN unrestricted + reads-any, DEAN/CAMPUS_HEAD/CHAIRPERSON in/out of scope, FACULTY read-own/foreign/dept-scoped, FACULTY list auto-override, FACULTY service-layer create 403 (belt-and-braces), STUDENT 403, UniqueConstraintViolation race handling)'
  - 'api.faculytics/docs/workflows/analysis-pipeline.md (modify — add Access Control section with per-endpoint allowlist + scope matrix + FACULTY auto-override + 404>403 rule)'
  - 'api.faculytics/docs/architecture/scope-resolution.md (modify — add Pipeline-scope authorization addendum)'
  # Frontend — app.faculytics
  - 'app.faculytics/network/endpoints.ts (modify — add 6 analysis pipeline endpoint entries: list, create, confirm, cancel, status, recommendations)'
  - 'app.faculytics/features/faculty-analytics/api/analysis-pipeline.requests.ts (create — thin Axios wrappers: listPipelines, createPipeline, confirmPipeline, cancelPipeline, fetchPipelineStatus, fetchPipelineRecommendations)'
  - 'app.faculytics/features/faculty-analytics/types/index.ts (modify — add PipelineStatus const-union (UPPERCASE members matching backend enum), RunStatus const-union, PipelineScopeIds (for CreatePipelineRequest/ListPipelinesQuery), PipelineScopeDisplay (for PipelineStatusResponse.scope — codes/names/ids both), PipelineCoverage, PipelineStageStatus, PipelineStatusResponse, PipelineSummary (with warnings: string[]), CreatePipelineRequest, ListPipelinesQuery, TopicSource, DimensionScoresSource, SupportingEvidence, RecommendedActionDto, RecommendationsResponse (status typed as RunStatus))'
  - 'app.faculytics/features/faculty-analytics/hooks/use-latest-pipeline-for-scope.ts (create — useQuery wrapping listPipelines; returns first/null)'
  - 'app.faculytics/features/faculty-analytics/hooks/use-pipeline-status.ts (create — useQuery with refetchInterval that stops on terminal status)'
  - 'app.faculytics/features/faculty-analytics/hooks/use-pipeline-recommendations.ts (create — useQuery enabled only when status === completed)'
  - 'app.faculytics/features/faculty-analytics/hooks/use-create-pipeline.ts (create — useMutation + invalidate list query)'
  - 'app.faculytics/features/faculty-analytics/hooks/use-confirm-pipeline.ts (create — useMutation + invalidate status query)'
  - 'app.faculytics/features/faculty-analytics/hooks/use-cancel-pipeline.ts (create — useMutation + invalidate status + list)'
  - 'app.faculytics/features/faculty-analytics/lib/pipeline-themes.ts (create — pure fn aggregateThemes(actions) returning ranked topic list with commentCount + weighted sentiment breakdown + sampleQuotes)'
  - 'app.faculytics/features/faculty-analytics/components/pipeline-status-badge.tsx (create — maps PipelineStatus to badge variant + label)'
  - 'app.faculytics/features/faculty-analytics/components/pipeline-trigger-card.tsx (create — Run/Confirm/Cancel/Re-run buttons with AlertDialog coverage warnings; role-gated via useActiveRole; FACULTY sees status badge only)'
  - 'app.faculytics/features/faculty-analytics/components/themes-chip-list.tsx (create — compact chips for faculty report)'
  - 'app.faculytics/features/faculty-analytics/components/themes-ranked-list.tsx (create — ranked list with count + sentiment bar for scoped dashboard)'
  - 'app.faculytics/features/faculty-analytics/components/recommendations-card.tsx (create — Strengths/Improvements tabs with expandable evidence accordion)'
  - 'app.faculytics/features/faculty-analytics/components/scoped-analytics-dashboard-screen.tsx (modify — compose PipelineTriggerCard row + conditional ThemesRankedList + RecommendationsCard row)'
  - 'app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx (modify — conditional PipelineStatusBadge inline with header + ThemesChipList + RecommendationsCard in slot between summary cards and section performance)'
  - 'app.faculytics/features/faculty-analytics/index.ts (modify — extend barrel exports)'
code_patterns:
  # Backend
  - '@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN) at controller level; method-level guards can narrow/widen'
  - '@UseInterceptors(CurrentUserInterceptor) on controller class — populates CLS with full User'
  - '@Audited({ action: AuditAction.X, resource: ... }) + @UseInterceptors(MetaDataInterceptor, AuditInterceptor) for write ops'
  - 'ScopeResolverService.ResolveDepartmentIds(semesterId) returns string[] | null — null = unrestricted, [] = 403, string[] = filter set'
  - 'Service methods PascalCase (CreatePipeline, ConfirmPipeline, ...)'
  - 'Zod + class-validator DTOs for requests; Zod response schemas'
  - 'EntityManager.fork() for isolated DB context within async methods'
  - 'Nullable scope fields on AnalysisPipeline — pipeline can be department-only / program-only / faculty-only / etc.'
  # Frontend
  - 'Feature-sliced: features/<feature>/{api,hooks,components,types,lib,index.ts} — FAC-132 does NOT use schemas/ or store/ subfolders'
  - 'Thin Axios requests in api/*.requests.ts that return response.data'
  - 'TanStack Query hooks in hooks/use-*.ts with queryKey + enabled: Boolean(token) gating'
  - 'Query keys MUST NOT include the auth token — token is an Axios interceptor header, not cache identity (prior `use-report-status.ts` included it; new FAC-132 hooks deliberately diverge for consistent invalidation)'
  - 'Pipeline status values are UPPERCASE strings matching the backend PipelineStatus enum: AWAITING_CONFIRMATION | EMBEDDING_CHECK | SENTIMENT_ANALYSIS | SENTIMENT_GATE | TOPIC_MODELING | GENERATING_RECOMMENDATIONS | COMPLETED | FAILED | CANCELLED'
  - 'useActiveRole() from @/features/auth/hooks/use-active-role for role branching; APP_ROLES constants from @/constants/roles'
  - 'Composition-based screens: header → metrics → charts → new pipeline row → attention/faculty-list'
  - 'No server state duplicated into Zustand — React Query is the source of truth'
test_patterns:
  # Backend
  - 'NestJS Test.createTestingModule with controllers + useValue mocks'
  - '.overrideGuard(AuthGuard("jwt")).useValue({ canActivate: () => true }) for JWT bypass in controller specs'
  - '.overrideGuard(RolesGuard).useValue({ canActivate: () => true }) for role bypass in controller specs (behavior verified separately in roles.guard.spec.ts — not re-tested here)'
  - '.overrideInterceptor(CurrentUserInterceptor).useValue({ intercept: (_ctx, next) => next.handle() }) to no-op the interceptor'
  - 'Service specs mock ScopeResolverService with jest.fn() returning null / [] / [ids] to exercise scope branches'
  - 'Tests co-located as *.spec.ts alongside the source'
  # Frontend
  - 'NO test framework established in app.faculytics as of 2026-04-14 — document gap; rely on manual E2E verification for this ticket; do NOT introduce Vitest/RTL in this spec (separate convention-setting ticket)'
---

# Tech-Spec: FAC-132 feat: role-aware analysis pipeline triggering and output surfacing

**Created:** 2026-04-14

**Source Issue:** https://github.com/CtrlAltElite-Devs/api.faculytics/issues/319

## Overview

### Problem Statement

The analysis pipeline is fully built on the backend but **disconnected from the product**:

1. **No role guards on triggering.** `POST /analysis/pipelines`, `/:id/confirm`, and `/:id/cancel` are protected by `@UseJwtGuard()` with no role restrictions. Any authenticated user — including a STUDENT — can trigger a pipeline for any scope.
2. **Zero frontend consumers.** There are no callers of the pipeline trigger/status endpoints in either `app.faculytics` or `admin.faculytics`. The pipeline is ungrafted from the UI.
3. **Pipeline output is invisible to stakeholders.** The `/analytics/*` endpoints that Dean / Campus Head / Chairperson dashboards consume read only the stats-oriented materialized views (`mv_faculty_semester_stats`, `mv_faculty_trends`). They do not surface topic themes, LLM-generated recommendations, or sentiment distributions that the pipeline produces.
4. **Net effect.** The pipeline produces signal (topics, strengths, improvements, sentiment gate outcomes) that never reaches the Faculty / Dean / Campus Head / Chairperson who would act on it. #319 calls this out as the core gap: "we need to enhance the analysis pipeline interaction, how to seamlessly integrate it with app.faculytics."

### Solution

A single integration slice delivered as one PR covering both backend guards and frontend surfacing:

1. **Backend role + scope guards** on pipeline trigger endpoints. SUPER_ADMIN (any scope). DEAN / CAMPUS_HEAD / CHAIRPERSON (their institutional scope only, validated against `UserInstitutionalRole` assignments). FACULTY (read-only on their own pipelines — no triggering). STUDENT (blocked entirely from `/analysis/*`). One canonical `AnalysisPipeline` per `(semester, scope)` tuple — role determines the view filter, not the computation. This is what the current entity design already implies (scope-keyed pipelines with nullable scope fields) and what the orchestrator's duplicate-check logic already enforces.
2. **Live reads, no new MVs.** Query `topic_assignment` and `recommended_action` directly by `pipelineId`. Defer materialization until read latency at dean/campus-head scope is demonstrated to need it.
3. **Frontend surfacing in `app.faculytics`** (`features/faculty-analytics/` feature slice):
   - **Faculty report page**: topic-theme chips + faculty-level LLM recommendation card on the existing `faculty-report-screen.tsx`.
   - **Dean / Campus Head / Chairperson dashboard** (`scoped-analytics-dashboard-screen.tsx`): trigger-pipeline button (scope-aware), status poller reusing the FAC polling contract, ranked department-level topic themes, and a recommendations list filtered/grouped from faculty-level records.

### Scope

**In Scope:**

- Role + scope guards on `POST /analysis/pipelines`, `POST /analysis/pipelines/:id/confirm`, `POST /analysis/pipelines/:id/cancel` (backend).
- Read access to `GET /analysis/pipelines/:id/status` and `GET /analysis/pipelines/:id/recommendations` gated per role (a faculty member can read their own pipeline, a dean can read pipelines within their scope, etc.).
- Any new or extended backend read endpoint required to surface topic themes keyed by `pipelineId` (e.g., `GET /analysis/pipelines/:id/topics`) if the existing endpoints do not already cover it.
- Scope-validation helper that checks a user's `UserInstitutionalRole` assignments against the requested pipeline scope.
- Frontend trigger-pipeline UI (button + confirmation dialog + coverage warnings) for DEAN / CAMPUS_HEAD / CHAIRPERSON / SUPER_ADMIN on the scoped analytics dashboard.
- Frontend pipeline-status polling hook (React Query `refetchInterval`) that reuses the polling DTO contract established by the `frontend-pipeline-polling` spec.
- Shared topic-themes component rendered in two framings: a chip list on the faculty report and a ranked/frequency-ordered list on the scoped dashboard.
- Shared recommendations card (faculty-level records surfaced on the faculty report; grouped/filtered on the scoped dashboard).
- Unit + integration tests for guard logic (NestJS `Test.createTestingModule` with mocked role/scope providers).
- Frontend automated tests are NOT in scope — see TD-6 (no test framework established in `app.faculytics`); verification is manual E2E.

**Out of Scope:**

- Aggregate (department / program / campus-level) LLM recommendation prompts and evidence assembly — tracked as a follow-up ticket.
- New materialized views for topics or recommendations — deferred until live-query latency is demonstrated to need them.
- Auto-triggering pipelines on semester close — tracked as a follow-up ticket.
- WebSocket / SSE live updates — polling is sufficient given the current pipeline duration profile.
- Admin console (`admin.faculytics`) pipeline triggers — the issue scopes integration to `app.faculytics` only.
- Student-facing surfaces — students do not interact with pipeline output in this slice.
- Backfilling role/scope guards onto historical pipelines (existing pipelines continue to be readable under the new guard logic, but their triggerer is not retroactively validated).
- Changes to pipeline execution, sentiment gate, topic-model prompts, or recommendation LLM prompts — this ticket surfaces existing output; it does not change how output is computed.

## Context for Development

### Technical Preferences & Constraints

- **Single PR, two repos.** Delivered as one atomic integration slice per yander's decision during spec discovery (2026-04-14). Acknowledges larger review surface in exchange for end-to-end shipability and single rollback boundary.
- **No new MVs.** Team synthesis (Winston/Mary): query live tables by `pipelineId`. Revisit only if dean-scope reads are measurably slow.
- **One canonical pipeline per scope.** Role = view filter, not compute boundary. Aligns with existing `AnalysisPipeline` entity design and the orchestrator's active-duplicate check.
- **Faculty do not trigger.** Consumer-only role. Avoids concurrency chaos and matches the UX mental model (faculty read their feedback; deans orchestrate the computation).
- **Reuse before build.** Frontend reuses the polling DTO contract, the existing `scoped-analytics-dashboard-screen.tsx`, the existing `faculty-report-screen.tsx`, and the existing React Query patterns in `features/faculty-analytics/`. Topic + recommendations components are shared across faculty and scoped dashboard surfaces with different framings.
- **Boring-tech defaults.** React Query `refetchInterval` for polling (no WebSockets). Live SQL queries (no new MVs). Standard NestJS guard composition (no custom auth middleware).

### Scope Resolution Reference

This ticket builds on the scope-resolution philosophy finalized in FAC-125, FAC-127, FAC-128, FAC-129, FAC-130, and FAC-131:

- FAC-128 snapshot faculty home-department onto submissions.
- FAC-129 filtered dean faculty listing by home department.
- FAC-130 rewired `mv_faculty_semester_stats` to aggregate by faculty home department.
- FAC-131 introduced the CAMPUS_HEAD role.

The institutional-role resolution logic (`UserInstitutionalRole`, scope codes, etc.) established by this prior work is the substrate for the scope-validation helper this ticket adds.

### Codebase Patterns

**Backend guard composition (copy exactly):**

The `@UseJwtGuard(...roles: UserRole[])` decorator at `api.faculytics/src/security/decorators/index.ts:12-25` applies `AuthGuard('jwt')` + `RolesGuard` when roles are passed. `RolesGuard` at `src/security/guards/roles.guard.ts:19-54` reads `ROLES_KEY` metadata and intersects with `user.roles`. Applied per method or class.

The reference pattern for a scoped controller is `AnalyticsController` (`src/modules/analytics/analytics.controller.ts:29-36`):

```typescript
@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN)
@UseInterceptors(CurrentUserInterceptor)
export class AnalyticsController { ... }
```

`AnalysisController` copies this shape, then applies **method-level narrowing** for read-only endpoints where FACULTY should be allowed to read their own pipeline (see Technical Decisions → TD-1).

**Scope resolution (reuse, do not reinvent):**

`ScopeResolverService` at `src/modules/common/services/scope-resolver.service.ts` exposes three result-typed helpers: `ResolveDepartmentIds(semesterId)`, `ResolveProgramIds(semesterId)`, `ResolveProgramCodes(semesterId)`. All return `string[] | null` where `null` = unrestricted (SUPER_ADMIN), `[]` = no access (throw 403), `string[]` = allowed IDs/codes. The service internally resolves the caller via `CurrentUserService.getOrFail()` which reads CLS context populated by `CurrentUserInterceptor`.

For pipeline scope validation, the orchestrator's `CreatePipeline` / `ConfirmPipeline` / `CancelPipeline` / `GetPipelineStatus` / `GetRecommendations` methods must add a call to the scope resolver **before** any DB work. The exact validation matrix is in Technical Decisions → TD-2.

**Frontend feature-slice (non-negotiable):**

Every new file for this ticket lives inside `app.faculytics/features/faculty-analytics/`. Placement rules from `app.faculytics/docs/ARCHITECTURE.md` §2 and §8:

| Artifact                | Goes in                                        |
| ----------------------- | ---------------------------------------------- |
| Axios request functions | `features/faculty-analytics/api/*.requests.ts` |
| TanStack Query hooks    | `features/faculty-analytics/hooks/use-*.ts`    |
| TS types (request/resp) | `features/faculty-analytics/types/index.ts`    |
| Pure helpers            | `features/faculty-analytics/lib/*.ts`          |
| React components        | `features/faculty-analytics/components/*.tsx`  |
| Public exports          | `features/faculty-analytics/index.ts`          |

Forbidden: reintroducing root `hooks/<feature>/`, `network/requests/*`, or `types/<feature>/` folders; importing feature requests into shared shell components; duplicating server state in Zustand.

**React Query + Axios pattern (template for pipeline hooks):**

```typescript
// api/analysis-pipeline.requests.ts
export async function fetchPipelineStatus(pipelineId: string) {
  const response = await apiClient.get<PipelineStatusResponse>(
    Endpoints.analysisPipelinesStatus.replace(':id', pipelineId),
  );
  return response.data;
}

// hooks/use-pipeline-status.ts
const TERMINAL_STATUSES: ReadonlySet<PipelineStatus> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export function usePipelineStatus(
  pipelineId: string | null,
  options?: { enabled?: boolean },
) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['analysis', 'pipeline-status', pipelineId], // NOTE: no token in queryKey
    enabled:
      Boolean(token) && Boolean(pipelineId) && (options?.enabled ?? true),
    queryFn: () => fetchPipelineStatus(pipelineId!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 3000;
    },
  });
}
```

Note the divergences from `use-report-status.ts`: (1) terminal-status values are **UPPERCASE** to match the backend `PipelineStatus` enum (`'COMPLETED' | 'FAILED' | 'CANCELLED'`), (2) the auth token is NOT part of `queryKey` (token goes through Axios headers), (3) uses a `ReadonlySet` for membership clarity. These apply to ALL new pipeline hooks in this ticket.

**Topic data is embedded in recommendations (no separate topics endpoint):**

`RecommendedAction.supportingEvidence` is a JSONB field whose Zod schema at `src/modules/analysis/dto/recommendations.dto.ts:1-47` contains `sources: (TopicSource | DimensionScoresSource)[]` where `TopicSource` = `{ type: 'topic', topicLabel, commentCount, sentimentBreakdown: {positive,neutral,negative}, sampleQuotes: string[].max(3) }`. This is sufficient to render theme chips (faculty report) and a ranked theme list (scoped dashboard) without any new backend endpoint. See Technical Decisions → TD-3.

**Scope shape in `GetPipelineStatus` — IDs + display values side by side:**

The current `GetPipelineStatus` response at `pipeline-orchestrator.service.ts:550-561` emits `scope` as display values (`semester.code`, `department.code`, `faculty.fullName`, `course.shortname`). This is ambiguous for frontend consumers that need UUIDs for lookups/invalidation. **This ticket extends the shape to emit both IDs and display values side by side** — e.g., `scope: { semesterId, semesterCode, departmentId, departmentCode, facultyId, facultyName, programId, programCode, campusId, campusCode, courseId, courseShortname, questionnaireVersionId }`. Existing display fields remain for backwards-compat. See TD-9.

**Tests (backend only — no frontend test framework):**

Controller specs: `.overrideGuard(AuthGuard('jwt')).useValue({ canActivate: () => true })` + same for `RolesGuard`. **`AnalysisController` already has its own test harness** (`auditTestProviders() + overrideAuditInterceptors(builder)`) — extend that, do NOT copy the simpler `analytics.controller.spec.ts` pattern. Add `.overrideInterceptor(CurrentUserInterceptor).useValue({ intercept: (_ctx, next) => next.handle() })` on top of the existing audit harness.

Service specs: mock `ScopeResolverService` methods with `jest.fn()` returning `null` / `[]` / `['id-1']` per scenario. Mock `CurrentUserService.getOrFail()` to return the user under test. Pattern at `src/modules/analytics/analytics.service.spec.ts:24-27, 40-99`.

Frontend: `app.faculytics` has **no established test framework or tests** as of 2026-04-14. Introducing one is explicitly out of scope for this ticket; verification happens via manual E2E against a running dev stack.

### Files to Reference

| File                                                                                                    | Purpose                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.faculytics/src/security/decorators/index.ts:12-25`                                                 | `@UseJwtGuard` decorator signature — copy role-args style to analysis controller                                                                                                                                     |
| `api.faculytics/src/security/guards/roles.guard.ts:19-54`                                               | Reads `ROLES_KEY` metadata; throws `ForbiddenException` on role mismatch                                                                                                                                             |
| `api.faculytics/src/modules/auth/roles.enum.ts`                                                         | `UserRole` enum — `SUPER_ADMIN`, `DEAN`, `CHAIRPERSON`, `CAMPUS_HEAD`, `FACULTY`, `STUDENT`                                                                                                                          |
| `api.faculytics/src/modules/analytics/analytics.controller.ts:29-36`                                    | Canonical scoped-controller pattern: `@UseJwtGuard(...roles)` + `@UseInterceptors(CurrentUserInterceptor)`                                                                                                           |
| `api.faculytics/src/modules/analytics/analytics.service.ts:74-94, 1061-1090`                            | Scope-filter application: `ResolveDepartmentIds`, `ResolveDepartmentCodes`, `IsProgramCodeInScope` — reuse the pattern inside `PipelineOrchestratorService`                                                          |
| `api.faculytics/src/modules/common/services/scope-resolver.service.ts:22-215`                           | `ResolveDepartmentIds`, `ResolveProgramIds`, `ResolveProgramCodes`, `resolveCampusHeadDepartmentIds` — the scope authorization substrate                                                                             |
| `api.faculytics/src/modules/common/cls/current-user.service.ts`                                         | CLS-backed `getOrFail()` — how scope resolver reads the caller                                                                                                                                                       |
| `api.faculytics/src/modules/common/interceptors/current-user.interceptor.ts:12-28`                      | Populates CLS with the full `User` entity on every request                                                                                                                                                           |
| `api.faculytics/src/entities/user-institutional-role.entity.ts`                                         | `UserInstitutionalRole` — how DEAN/CHAIRPERSON/CAMPUS_HEAD scope is stored (user + role + moodleCategory depth determines scope)                                                                                     |
| `api.faculytics/src/entities/analysis-pipeline.entity.ts`                                               | Already has nullable scope FKs (faculty, department, program, campus, course, questionnaireVersion) + `triggeredBy` FK. No entity change needed                                                                      |
| `api.faculytics/src/modules/analysis/analysis.controller.ts`                                            | 5 endpoints currently using bare `@UseJwtGuard()` — target of role-guard work                                                                                                                                        |
| `api.faculytics/src/modules/analysis/services/pipeline-orchestrator.service.ts:88-242`                  | `CreatePipeline` / `ConfirmPipeline` — no ownership validation today; add scope checks                                                                                                                               |
| `api.faculytics/src/modules/analysis/dto/pipeline-status.dto.ts`                                        | Polling DTO — already includes `scope` object with semester/department/faculty/program/campus/course; frontend consumes as-is                                                                                        |
| `api.faculytics/src/modules/analysis/dto/responses/recommendations.response.dto.ts`                     | Recommendations response — includes `actions[].supportingEvidence` with topic sources                                                                                                                                |
| `api.faculytics/src/modules/analysis/dto/recommendations.dto.ts:1-47`                                   | Zod schema for `supportingEvidence`: topic sources + dimension sources + confidence level                                                                                                                            |
| `api.faculytics/src/modules/analysis/services/recommendation-generation.service.ts`                     | Existing topic-source aggregation (label + sentiment + quotes). This is the data the frontend will render — no new backend work to expose topics separately                                                          |
| `api.faculytics/docs/workflows/analysis-pipeline.md`                                                    | Pipeline lifecycle reference — must gain an "Access Control" section                                                                                                                                                 |
| `api.faculytics/docs/architecture/scope-resolution.md`                                                  | Scope rules — must gain a pipeline-scope addendum                                                                                                                                                                    |
| `api.faculytics/_bmad-output/implementation-artifacts/tech-spec-fac-131-campus-head-role.md`            | Template for role addition: controllers touched, scope-resolver branch added                                                                                                                                         |
| `api.faculytics/_bmad-output/implementation-artifacts/tech-spec-fac-127-admin-manual-scope-override.md` | Scope-assignment flow primer (not directly modified here; informs how scope is provisioned)                                                                                                                          |
| `api.faculytics/_bmad-output/implementation-artifacts/tech-spec-frontend-pipeline-polling.md`           | Polling DTO contract already established; frontend consumes it as-is                                                                                                                                                 |
| `api.faculytics/_bmad-output/implementation-artifacts/tech-spec-recommendation-engine-faculty-level.md` | Recommendation engine shape + supporting-evidence schema (faculty-level only; aggregate scope is out-of-scope for FAC-132)                                                                                           |
| `api.faculytics/src/modules/analytics/analytics.controller.spec.ts:33-41`                               | Guard-override test pattern — copy into analysis controller spec                                                                                                                                                     |
| `api.faculytics/src/modules/analytics/analytics.service.spec.ts:24-27, 40-99`                           | Scope-resolver mock pattern for service tests                                                                                                                                                                        |
| `app.faculytics/docs/ARCHITECTURE.md`                                                                   | Feature-slice rules (§2, §8, §11) — hard constraints for every frontend file added                                                                                                                                   |
| `app.faculytics/features/faculty-analytics/api/faculty-analytics.requests.ts`                           | Existing analytics requests — reference only; FAC-132 creates a SEPARATE `api/analysis-pipeline.requests.ts` file (do not extend this one)                                                                           |
| `app.faculytics/features/faculty-analytics/hooks/use-faculty-report.ts`                                 | useQuery + auth-token gating + queryKey template — copy the structure, but new FAC-132 hooks OMIT the token from `queryKey` (see Codebase Patterns)                                                                  |
| `app.faculytics/features/faculty-analytics/hooks/use-report-status.ts`                                  | `refetchInterval` polling template — structure only; FAC-132 diverges on UPPERCASE terminal-status values and tokenless queryKey                                                                                     |
| `app.faculytics/features/faculty-analytics/components/scoped-analytics-dashboard-screen.tsx:1-87`       | Host screen currently mounted only at `/dean/dashboard` and `/campus-head/dashboard` — compose pipeline trigger + themes + recs here. CHAIRPERSON/SUPER_ADMIN dashboard mounting is deferred (see Known Limitations) |
| `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx:1-134`                  | Host screen for faculty view; compose theme chips + recs card here                                                                                                                                                   |
| `app.faculytics/features/auth/hooks/use-active-role.ts:1-42`                                            | `useActiveRole()` — current user's active role for component-level gating                                                                                                                                            |
| `app.faculytics/constants/roles.ts:1-13`                                                                | `APP_ROLES` enum — imports for role branching                                                                                                                                                                        |
| `app.faculytics/network/endpoints.ts`                                                                   | Endpoint enum — add 6 pipeline entries (list, create, confirm, cancel, status, recommendations)                                                                                                                      |
| `api.faculytics/src/modules/analysis/enums/pipeline-status.enum.ts`                                     | **Source of truth for `PipelineStatus` string values** (UPPERCASE). Frontend types MUST mirror verbatim                                                                                                              |
| `api.faculytics/src/modules/analysis/dto/recommendations.dto.ts:15`                                     | `sampleQuotes: z.array(z.string()).max(3)` — pipeline-themes helper must respect this ceiling (not "up to 5" as earlier draft claimed)                                                                               |

### Technical Decisions

**TD-1 — Guard granularity: controller-level allowlist with method-level narrowing.**

Apply `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN)` at the class level for write operations (create/confirm/cancel). For read endpoints (`GET /:id/status`, `GET /:id/recommendations`), widen with a method-level `@UseJwtGuard(...scopedRoles, UserRole.FACULTY)` so a faculty member can read their own pipeline. STUDENT is implicitly blocked because they never appear in any guard's allowlist. Service-layer scope validation still enforces that a FACULTY can only read pipelines whose `faculty` FK matches their userId.

**TD-2 — Pipeline-scope authorization matrix (enforced in the orchestrator service).** Create rules differ from List rules.

**Create / Confirm / Cancel / Read-by-id (requires explicit scope):**

| Role        | Create                                                                                                                    | Confirm/Cancel                                       | Read Status/Recs                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| SUPER_ADMIN | Any scope (incl. `semesterId` only)                                                                                       | Any pipeline                                         | Any pipeline                                    |
| DEAN        | Explicit `departmentId` required; must ∈ `ResolveDepartmentIds(semesterId)`                                               | Pipeline's `department` ∈ resolved set               | Same as Create                                  |
| CHAIRPERSON | Explicit `programId` required; must ∈ `ResolveProgramIds(semesterId)`                                                     | Pipeline's `program` ∈ resolved set                  | Same as Create                                  |
| CAMPUS_HEAD | Explicit `campusId` or `departmentId` required; campus must ∈ `ResolveCampusIds(semesterId)`, or dept ∈ campus's dept set | Pipeline's `campus`/`department` within their campus | Same as Create                                  |
| FACULTY     | _(blocked at guard — 403)_                                                                                                | _(blocked at guard — 403)_                           | Pipeline whose `faculty` FK equals their userId |
| STUDENT     | _(blocked at guard — 403)_                                                                                                | _(blocked at guard — 403)_                           | _(blocked at guard — 403)_                      |

Absence of the required explicit scope filter → `BadRequestException` with message `"scope filter required for your role"`. Scope provided but outside resolved set → `ForbiddenException`.

**List (`GET /analysis/pipelines`) — defaults to the caller's resolved scope:**

| Role        | Behavior                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPER_ADMIN | Returns all pipelines matching the query (unfiltered)                                                                                                   |
| DEAN        | If query omits `departmentId`, service fills with `ResolveDepartmentIds(semesterId)`. If query provides `departmentId`, verify ∈ resolved set else 403. |
| CHAIRPERSON | Same with `programId` and `ResolveProgramIds(semesterId)`                                                                                               |
| CAMPUS_HEAD | Same with `campusId` and `ResolveCampusIds(semesterId)`                                                                                                 |
| FACULTY     | Service forces `facultyId = currentUser.id` (any `facultyId` in the query is silently overridden)                                                       |
| STUDENT     | _(blocked at guard — 403)_                                                                                                                              |

List returns `PipelineSummaryResponseDto[]` ordered by `createdAt DESC`, limit 10. This difference lets a DEAN's dashboard call `listPipelines({ semesterId })` without first needing to enumerate department IDs on the client — solving the "frontend has no `departmentId`" gap.

**TD-3 — No new `/analysis/pipelines/:id/topics` endpoint. Themes derived on the frontend from recommendations evidence.**

The existing `GET /analysis/pipelines/:id/recommendations` response embeds topic sources inside `actions[].supportingEvidence.sources`. A pure-function helper `lib/pipeline-themes.ts::aggregateThemes(actions)` on the frontend deduplicates + ranks topics by aggregate `commentCount` and blends `sentimentBreakdown` weights. The helper caps `sampleQuotes` at **3 per topic** (matching the backend schema's `z.array(z.string()).max(3)`). Dedup rule: first occurrence wins (preserves the order LLM emitted). Avoids a new backend endpoint, a new service method, and a new round-trip.

**TD-4 — Faculty see only their own recommendations.**

When a FACULTY calls `GET /analysis/pipelines/:id/recommendations` or `/status`, the orchestrator populates `pipeline.faculty` explicitly (`findOne(..., { populate: ['faculty'] })`) and verifies `pipeline.faculty?.id === currentUser.id`. If the pipeline is department-scoped (null faculty FK), the faculty cannot read it — they only see pipelines created _for them_. Frontend discovers a faculty's current pipeline via `GET /analysis/pipelines?semesterId=X&facultyId=<self>` (list endpoint silently coerces `facultyId` to currentUser).

**TD-5 — Discovery via `GET /analysis/pipelines?semesterId=&...`.**

Query params: `semesterId` (required), `facultyId`, `departmentId`, `programId`, `campusId`, `courseId`, `questionnaireVersionId` (all optional). Returns `PipelineSummaryResponseDto[]`. Scope-filling behavior per TD-2 "List" table above. The frontend uses this to find "the latest pipeline for my scope" so status + recommendations hooks can key off the discovered id.

**TD-6 — Frontend tests deliberately deferred.**

`app.faculytics` has no test framework established. Introducing one (Vitest + React Testing Library, most likely) is a separate convention-setting ticket. This ticket verifies frontend work via manual E2E against a running dev stack (API on :5200, app on :3000).

**TD-7 — Documentation updates are part of this PR.**

`docs/workflows/analysis-pipeline.md` gains an "Access Control" section. `docs/architecture/scope-resolution.md` gains a one-paragraph pipeline addendum. Without these, the access-control rules become tribal knowledge.

**TD-8 — Partial unique index enforces one-canonical-pipeline-per-scope.**

The orchestrator's current `findOne → create` dedup check at `pipeline-orchestrator.service.ts:100-118` is a TOCTOU race. Ship a partial unique index (MikroORM raw-SQL migration):

```sql
CREATE UNIQUE INDEX uq_analysis_pipeline_active_scope
  ON analysis_pipeline (
    semester_id,
    COALESCE(faculty_id, 'NONE'),
    COALESCE(department_id, 'NONE'),
    COALESCE(program_id, 'NONE'),
    COALESCE(campus_id, 'NONE'),
    COALESCE(course_id, 'NONE'),
    COALESCE(questionnaire_version_id, 'NONE')
  )
  WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED') AND deleted_at IS NULL;
```

**Column-type note (verified 2026-04-14 against `Migration20260313170918.ts:13`):** `analysis_pipeline` FK columns are `varchar(255)`, not `uuid` — so the sentinel is the text literal `'NONE'` (no cast). Do NOT write `::uuid` casts in this index; they will fail to compile against the current column types.

The orchestrator's `CreatePipeline` wraps the `findOne → create → flush` sequence in a try/catch for `UniqueConstraintViolationException` (imported from `@mikro-orm/core`); on catch it re-fetches the existing active pipeline and returns it (idempotent). Matches the project's `Anti-Pattern (Unique Constraint)` rule from CLAUDE.md (partial indexes for nullable/soft-delete-aware uniqueness). The sentinel-text trick is used because Postgres unique constraints treat NULL as distinct by default — replacing each nullable column with a stable sentinel value inside the index expression fixes this.

**TD-9 — `GetPipelineStatus` scope response shape is REPLACED with an IDs + display paired shape. This is a contract change, not an additive extension.**

Current response emits `scope: { semester, department, faculty, program, campus, course }` as display values only (codes, names, shortnames). Replace with:

```typescript
scope: {
  semesterId: string;
  semesterCode: string;
  departmentId: string | null;
  departmentCode: string | null;
  facultyId: string | null;
  facultyName: string | null;
  programId: string | null;
  programCode: string | null;
  campusId: string | null;
  campusCode: string | null;
  courseId: string | null;
  courseShortname: string | null;
  questionnaireVersionId: string | null; // no display field; the id IS the stable identity today
}
```

IDs are what the frontend uses for `queryClient.invalidateQueries`, scope comparisons, and lookups. Display values coexist for UI rendering.

**Why this is safe despite breaking the old shape:**

The `frontend-pipeline-polling` spec (referenced under Dependencies) declared the DTO contract but has **zero frontend consumers** as of 2026-04-14 (verified by the Step 1/2 investigation — no `/analysis/pipelines/:id/status` callers exist in `app.faculytics` or `admin.faculytics`). Replacing the shape now costs nothing in live-user impact. The backend-side `pipelineStatusSchema` Zod definition AND the corresponding spec (`pipeline-orchestrator.service.spec.ts`) both need updating as part of Task 9 — the `scope` assertions in existing tests will fail otherwise. Capture that rewrite as an explicit sub-task.

**Type structure on the frontend:**

- `PipelineScopeIds` — UUIDs only, used for `CreatePipelineRequest` and `ListPipelinesQuery` inputs (what the client sends).
- `PipelineScopeDisplay` — IDs + display paired, used for `PipelineStatusResponse.scope` (what the server returns).

**If a historical consumer ever surfaces** (unlikely — backend-only contract today), write a compat mapper in the consuming module. No mapper shipped in FAC-132 because no consumer exists.

## Implementation Plan

Tasks are ordered by dependency: backend module wiring → backend service scope logic → backend controller guards → backend tests → backend docs → frontend types/endpoints → frontend requests → frontend hooks (queries/mutations) → frontend lib helpers → frontend leaf components → frontend screen integration → barrel exports → manual E2E verification.

**Resolved open questions from Step 2 (+ adversarial-review revisions):**

- **TD-2 — split Create vs List rules.** Create/Confirm/Cancel/Read-by-id require explicit scope for non-SUPER_ADMIN and 400 if absent. List (`GET /analysis/pipelines`) fills in the caller's resolved scope when the query omits it, so a DEAN can call `listPipelines({ semesterId })` without needing a client-side `departmentId`. See TD-2 table.
- **TD-5 resolution (pipeline discovery).** Add `GET /analysis/pipelines` with query params `semesterId` (required), `facultyId`, `departmentId`, `programId`, `campusId`, `courseId`, `questionnaireVersionId` (all optional). Returns `PipelineSummaryResponseDto[]`. List semantics per TD-2.
- **TD-8 — partial unique index** on active-pipeline scope tuple, enforced at DB level. Replaces the weaker `findOne → create` TOCTOU dedup. Orchestrator catches `UniqueConstraintViolationException` and re-fetches for idempotence.
- **TD-9 — `GetPipelineStatus.scope` returns IDs + display values side by side.** Frontend `PipelineScopeIds` (UUIDs, used for lookups) and `PipelineScopeDisplay` (codes/names + ids, used for UI) are split types.

### Tasks

#### Backend — `api.faculytics`

- [x] **Task 1: Verify `AnalysisModule` already exposes `ScopeResolverService` + `CurrentUserService` through `CommonModule`.**
  - File: `src/modules/analysis/analysis.module.ts` (read-only)
  - Action: Confirm `CommonModule` is already in `imports` (it is, at L47 per verification 2026-04-14). Confirm `CommonModule` exports `ScopeResolverService` (it does, `common.module.ts:18`) and re-exports `AppClsModule` which provides `CurrentUserService` (it does, `cls.module.ts:6-7`). **No code change required.** If `CommonModule` is for any reason missing, add it and move on. This task exists only because the adversarial review flagged the assumption; keep it so future readers see the verification.
  - Notes: Do NOT add redundant providers. Verified 2026-04-14 against `common.module.ts` lines 7/12/18.

- [x] **Task 2: Add `ListPipelinesQueryDto` + `PipelineSummaryResponseDto` (with `warnings`).**
  - Files (new): `src/modules/analysis/dto/list-pipelines.dto.ts`, `src/modules/analysis/dto/responses/pipeline-summary.response.dto.ts`
  - Action: Zod schema `listPipelinesQuerySchema` mirroring `createPipelineSchema` (semesterId required, rest optional). `PipelineSummaryResponseDto.Map(pipeline)` producing `{ id, status, scope: <TD-9 shape>, coverage, warnings: string[], createdAt, updatedAt, completedAt }`. Warnings are included because the trigger-card confirmation dialog (AC-19) consumes them without a second roundtrip to `/status`.
  - Notes: Copy DTO shape conventions from `create-pipeline.dto.ts` (class-validator + Zod + Swagger). Scope sub-shape per TD-9 — include both IDs and display values.

- [x] **Task 3: Add scope-authorization helpers to `PipelineOrchestratorService`.**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action: Inject `ScopeResolverService` and `CurrentUserService`. Add three private async methods:
    - `assertCanCreatePipeline(input: CreatePipelineInput): Promise<void>` — resolves caller, routes on role per TD-2 "Create" table. SUPER_ADMIN: return. FACULTY/STUDENT: throw `ForbiddenException` (belt-and-braces; guard should have blocked). DEAN/CHAIRPERSON/CAMPUS_HEAD: require at least one scope filter beyond `semesterId` (else `BadRequestException('scope filter required for your role')`). For each provided scope, verify containment against `ResolveDepartmentIds(semesterId)` / `ResolveProgramIds(semesterId)` / `ResolveCampusIds(semesterId)` (adding `ResolveCampusIds` per Task 10 if missing). Outside-scope → `ForbiddenException('scope not in your assigned access')`.
    - `fillAndAssertListScope(query: ListPipelinesQueryInput): Promise<ListPipelinesQueryInput>` — resolves caller per TD-2 "List" table. SUPER_ADMIN: return query unchanged. DEAN: if `departmentId` absent, fill `departmentIds = ResolveDepartmentIds(query.semesterId)` as an IN-filter; if provided, verify ∈ resolved set or 403. CHAIRPERSON/CAMPUS_HEAD: same with program/campus. FACULTY: force `facultyId = currentUser.id` regardless of query value (silent override). Returns the augmented query the orchestrator uses for its actual `find`.
    - `assertCanAccessPipeline(pipeline: AnalysisPipeline): Promise<void>` — resolves caller; SUPER_ADMIN returns immediately.
      - **FACULTY branch (handled FIRST):** throw `ForbiddenException` unless `pipeline.faculty != null && pipeline.faculty.id === user.id`. **Do NOT call `ResolveDepartmentIds` / `ResolveProgramIds` / `ResolveCampusIds` from the FACULTY branch** — those resolvers throw `ForbiddenException('User does not have a role with scope access.')` for FACULTY per `scope-resolver.service.ts:41-44`, which would surface the wrong exception message. Return early after the ownership check.
      - **DEAN / CHAIRPERSON / CAMPUS_HEAD branch:** call the matching resolver, then compare the pipeline's scope FK against the resolved set:
        - If the relevant scope field on the pipeline is **non-null**: require it ∈ user's resolved set (else 403).
        - If the relevant scope field on the pipeline is **null** (e.g., `pipeline.department === null` means "no department filter — broader than any single department"): **deny for non-SUPER_ADMIN**. Null scope fields represent broader-than-role access and are reserved for SUPER_ADMIN. This applies regardless of which field is null (department, program, campus). Rationale: a DEAN must not read a pipeline that pulled in submissions from outside their dept; a null-scoped pipeline inherently could have.
      - **STUDENT:** always 403 (belt-and-braces; guard usually blocks first).
  - Notes: Pipeline-specific logic lives in orchestrator, not in `ScopeResolverService` (keep the resolver generic). FACULTY auto-override in `fillAndAssertListScope` is the single most security-sensitive rule — leave a code comment because "why" is non-obvious ("prevents enumeration of other faculty's pipelines via the list endpoint").

- [x] **Task 4: Add `ListPipelines` orchestrator method.**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Action: `async ListPipelines(query: ListPipelinesQueryInput): Promise<AnalysisPipeline[]>`. Validates query via Zod. Calls `fillAndAssertListScope(query)` to resolve and augment. Builds Mikro filter using the augmented query (use `$in` for array-filled fields). Returns pipelines ordered by `createdAt DESC`, limited to 10. Populate `['faculty', 'department', 'program', 'campus', 'course', 'semester', 'questionnaireVersion']` so the summary mapper has data for TD-9 fields.

- [x] **Task 5: Call scope checks from existing orchestrator methods (with explicit `populate: ['faculty']`).**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts`
  - Import: `import { UniqueConstraintViolationException } from '@mikro-orm/core';`
  - Action:
    - `CreatePipeline`: add `await this.assertCanCreatePipeline(input)` immediately after `createPipelineSchema.parse(dto)` and before the duplicate check (L96). Wrap the subsequent `findOne → create → flush` in try/catch for `UniqueConstraintViolationException` (TD-8). On catch, re-run the duplicate `findOne` and return the existing pipeline.
    - `ConfirmPipeline`: change the `findOne` to `fork.findOne(AnalysisPipeline, pipelineId, { populate: ['faculty', 'department', 'program', 'campus'] })`. Then `await this.assertCanAccessPipeline(pipeline)` **BEFORE any side effect** — in particular, before the `SENTIMENT_WORKER_URL` check (L184-190) which currently mutates `pipeline.status = FAILED` + flushes on a misconfiguration. **Rule: scope check MUST precede every `fork.flush()`, every `pipeline.status = ...` write, and every enqueue call in this method.** A foreign user must never cause side effects even when the worker URL is misconfigured.
    - `CancelPipeline`: same populate + `assertCanAccessPipeline` placement — scope check BEFORE setting `status = CANCELLED` or any flush.
    - `GetPipelineStatus`: change the internal `findOne`/`findOneOrFail` to populate `['faculty', 'department', 'program', 'campus', 'course', 'semester', 'questionnaireVersion']` so TD-9 scope shape can be built with both IDs AND display values. Then `await this.assertCanAccessPipeline(pipeline)`. Update the response builder to emit the new scope shape (replacement, not addition — see TD-9).
    - `GetRecommendations`: add `{ populate: ['faculty'] }` to its `findOne`. Then `await this.assertCanAccessPipeline(pipeline)`.
  - Notes: Place the scope check AFTER `findOne` so a 404 takes precedence over 403 (avoids some existence-leakage; documented trade-off in Notes→item 5). The `populate: ['faculty']` on GetRecommendations is critical — without it, `pipeline.faculty?.id` reads through the reference proxy and the ownership check is fragile. For Confirm/Cancel, scope-before-side-effects is a security invariant; code-comment it.

- [x] **Task 6: Apply role guards to `AnalysisController`.**
  - File: `src/modules/analysis/analysis.controller.ts`
  - Action:
    - Class-level: replace `@UseJwtGuard()` with `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN)` and add `@UseInterceptors(CurrentUserInterceptor)`.
    - Method-level widening for read endpoints: `@Get('pipelines')`, `@Get('pipelines/:id/status')`, `@Get('pipelines/:id/recommendations')` each gain a method-level `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN, UserRole.FACULTY)`.
  - Notes: Nest's `Reflector.getAllAndOverride([handler, class])` in `RolesGuard:19-54` is guaranteed to prefer method-level metadata over class-level (this is documented Nest behavior; pre-mortem item 1 in prior draft was over-cautious). No explicit `@SetMetadata` fallback needed.

- [x] **Task 7: Add list endpoint to controller.**
  - File: `src/modules/analysis/analysis.controller.ts`
  - Action: `@Get('pipelines')` with `@ApiOperation({ summary: 'List pipelines for a scope' })` + `@ApiQuery` entries matching `listPipelinesQuerySchema`. Delegates to `orchestrator.ListPipelines(query)`. Returns `PipelineSummaryResponseDto[]`. No `@Audited` (read op).

- [x] **Task 7a: Create partial unique index migration.**
  - File (new): `src/migrations/<timestamp>_fac-132-pipeline-scope-unique-index.ts`
  - Action: MikroORM raw-SQL migration adding `uq_analysis_pipeline_active_scope` per TD-8 SQL. `down()` drops the index. Verify `npx mikro-orm migration:check` reports no pending entity diffs before and after.
  - Notes: The sentinel `'00000000-0000-0000-0000-000000000000'::uuid` pattern handles NULLable scope FKs correctly. Required because Postgres treats NULL as distinct in unique constraints.

- [x] **Task 8: Update controller spec — extend existing audit harness.**
  - File: `src/modules/analysis/analysis.controller.spec.ts`
  - Action: **DO NOT copy** the `analytics.controller.spec.ts` pattern — `analysis.controller.spec.ts` already has its own harness using `auditTestProviders()` and `overrideAuditInterceptors(builder)`. Extend it:
    1. Add `.overrideGuard(AuthGuard('jwt')).useValue({ canActivate: () => true })` and `.overrideGuard(RolesGuard).useValue({ canActivate: () => true })` to the existing builder chain.
    2. Add `.overrideInterceptor(CurrentUserInterceptor).useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })` on top of the audit overrides.
    3. Add list-endpoint delegation test (calls orchestrator's `ListPipelines` with the query).
  - Notes: Do NOT re-test the role-guard matrix here — that's covered by `roles.guard.spec.ts` (unchanged) and by service-level scope tests (Task 9). **Do NOT write an "audit fires on 403" test** — `AuditInterceptor` at `src/modules/audit/interceptors/audit.interceptor.ts:47-48` uses RxJS `tap(() => ...)` which only runs on `next`/`complete`, not errors. On a rejected call the audit row is NOT emitted today. That's a pre-existing codebase behavior across every audited endpoint (Moodle sync, ingestion, etc.), out of scope for FAC-132. Documented in Known Limitations.

- [x] **Task 9: Update orchestrator service spec — scope validation matrix + TD-9 contract rewrite.**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.spec.ts`
  - Action: Two sub-tasks in one spec update:
    1. **Rewrite any existing `GetPipelineStatus` test assertions about the `scope` shape** to match TD-9's replaced contract (IDs + display paired). Old assertions that check `scope.semester`, `scope.department`, `scope.faculty` (display values only) will fail after the service change — replace with assertions on `scope.semesterId + scope.semesterCode`, `scope.departmentId + scope.departmentCode`, `scope.facultyId + scope.facultyName`, etc.
    2. Add a `describe('scope authorization')` block. Mock `ScopeResolverService` + `CurrentUserService`. Test each row:
    - SUPER_ADMIN creates with `semesterId` only → success.
    - SUPER_ADMIN reads any pipeline (foreign faculty, foreign dept) → success. **(AC-5a coverage)**
    - DEAN creates with `semesterId` only → 400 scope required.
    - DEAN creates with own `departmentId` → success.
    - DEAN creates with foreign `departmentId` → 403.
    - DEAN lists with `{ semesterId }` only → service fills `departmentIds` filter from resolver; returns filtered list.
    - DEAN lists with foreign `departmentId` → 403.
    - CAMPUS_HEAD creates with own-campus `departmentId` → success.
    - CAMPUS_HEAD creates with foreign-campus `departmentId` → 403.
    - CHAIRPERSON creates with own `programId` → success.
    - CHAIRPERSON creates with foreign `programId` → 403.
    - FACULTY reads own pipeline (faculty FK matches) → success.
    - FACULTY reads pipeline with different faculty FK → 403.
    - FACULTY reads department-scoped pipeline (null faculty FK) → 403.
    - FACULTY lists with `facultyId = self` → success.
    - FACULTY lists with `facultyId = other` → other value silently overridden; verify the query passed to EM uses own id.
    - **FACULTY invokes `CreatePipeline` directly (simulating guard bypass) → `ForbiddenException` thrown before any DB write. (AC-2a — belt-and-braces.)**
    - STUDENT any op → 403 (belt-and-braces; guard will usually block first).
    - **`CreatePipeline` race: two concurrent calls with same scope — one wins, the other catches `UniqueConstraintViolationException` and returns the existing pipeline.** Mock `em.flush` to throw the exception on second call; assert orchestrator returns the existing pipeline from re-fetch. (AC covers TD-8.)

- [x] **Task 10: Add `ResolveCampusIds(semesterId)` to `ScopeResolverService` if missing.**
  - File: `src/modules/common/services/scope-resolver.service.ts`
  - Action: Currently `resolveCampusHeadDepartmentIds` derives campus scope internally. For pipeline-scope validation of a CAMPUS_HEAD creating a pipeline with explicit `campusId`, we need a public `ResolveCampusIds(semesterId): Promise<string[] | null>` returning `null` for unrestricted / `[]` for no access / `string[]` for the user's allowed campus UUIDs. If the internal helper can be promoted to public, do so; otherwise write a thin new one.

- [x] **Task 11: Update `docs/workflows/analysis-pipeline.md` with "Access Control" section.**
  - File: `api.faculytics/docs/workflows/analysis-pipeline.md`
  - Action: Append a new section `## Access Control` documenting: (a) per-endpoint role allowlist, (b) the TD-2 Create scope-authorization matrix, (c) the TD-2 List default-fill behavior, (d) the FACULTY auto-override rule in `ListPipelines`, (e) the `populate: ['faculty']` requirement for ownership checks, (f) the rule that 404 precedes 403 on missing pipelines (and the enumeration caveat — see Notes→F12).

- [x] **Task 12: Update `docs/architecture/scope-resolution.md` with pipeline addendum.**
  - File: `api.faculytics/docs/architecture/scope-resolution.md`
  - Action: Append one short section `### Pipeline-scope authorization` linking to `docs/workflows/analysis-pipeline.md#access-control`, noting that pipeline authorization reuses the shared `ScopeResolverService` helpers.

#### Frontend — `app.faculytics`

- [x] **Task 13: Add endpoint entries.**
  - File: `app.faculytics/network/endpoints.ts`
  - Action: Add `analysisPipelinesList = "/api/v1/analysis/pipelines"`, `analysisPipelinesCreate = "/api/v1/analysis/pipelines"`, `analysisPipelinesConfirm = "/api/v1/analysis/pipelines/:id/confirm"`, `analysisPipelinesCancel = "/api/v1/analysis/pipelines/:id/cancel"`, `analysisPipelinesStatus = "/api/v1/analysis/pipelines/:id/status"`, `analysisPipelinesRecommendations = "/api/v1/analysis/pipelines/:id/recommendations"`.
  - Notes: `list` and `create` share the same URL — separate entries are for clarity in consumer call sites.

- [x] **Task 14: Add frontend types — mirror backend verbatim.**
  - File: `app.faculytics/features/faculty-analytics/types/index.ts`
  - Action: Add TypeScript types/interfaces mirroring backend shapes. All enum values are UPPERCASE strings matching `api.faculytics/src/modules/analysis/enums/pipeline-status.enum.ts` verbatim:

    ```typescript
    export type PipelineStatus =
      | 'AWAITING_CONFIRMATION'
      | 'EMBEDDING_CHECK'
      | 'SENTIMENT_ANALYSIS'
      | 'SENTIMENT_GATE'
      | 'TOPIC_MODELING'
      | 'GENERATING_RECOMMENDATIONS'
      | 'COMPLETED'
      | 'FAILED'
      | 'CANCELLED';

    export type RunStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

    // IDs only — used for CreatePipelineRequest + ListPipelinesQuery inputs
    export type PipelineScopeIds = {
      semesterId: string;
      facultyId?: string;
      departmentId?: string;
      programId?: string;
      campusId?: string;
      courseId?: string;
      questionnaireVersionId?: string;
    };

    // IDs + display values — shape of pipeline.status response's `scope` (per TD-9)
    export type PipelineScopeDisplay = {
      semesterId: string;
      semesterCode: string;
      departmentId: string | null;
      departmentCode: string | null;
      facultyId: string | null;
      facultyName: string | null;
      programId: string | null;
      programCode: string | null;
      campusId: string | null;
      campusCode: string | null;
      courseId: string | null;
      courseShortname: string | null;
      questionnaireVersionId: string | null;
    };
    ```

    Plus: `PipelineCoverage` ({ totalEnrolled, submissionCount, commentCount, responseRate, lastEnrollmentSyncAt }), `PipelineStageStatus`, `PipelineStatusResponse` (`status: PipelineStatus`, `scope: PipelineScopeDisplay`, `coverage`, `stages`, `warnings: string[]`, `errorMessage`, `retryable`, `createdAt`, `updatedAt`, `confirmedAt`, `completedAt`), `PipelineSummary` (`status: PipelineStatus`, `scope: PipelineScopeDisplay`, `coverage`, `warnings: string[]`, timestamps), `CreatePipelineRequest` (= `PipelineScopeIds`), `ListPipelinesQuery` (= `PipelineScopeIds`), `TopicSource` (`sampleQuotes: string[]` — note backend caps at 3), `DimensionScoresSource`, `SupportingEvidence`, `RecommendedActionDto`, `RecommendationsResponse` (`status: RunStatus` — NOT `PipelineStatus`).

  - Notes: Add a top-of-file comment naming the backend DTO/enum files these mirror, to aid drift detection. **Runtime-validation caveat for `CreatePipelineRequest`:** the type identity with `PipelineScopeIds` makes every scope field optional at compile time. TypeScript will accept `{ semesterId }` alone. The runtime contract — enforced by the backend per TD-2 — is that non-SUPER_ADMIN callers MUST supply at least one scope filter beyond `semesterId`, or the request returns `400 Bad Request`. This is deliberate: type-level branching by role would require either role-parameterized types or a runtime-only enum tag, both worse than accepting the loose compile-time shape plus a clear code comment at the request function.

- [x] **Task 15: Add pipeline request functions.**
  - File (new): `app.faculytics/features/faculty-analytics/api/analysis-pipeline.requests.ts`
  - Action: Export `listPipelines(query)`, `createPipeline(body)`, `confirmPipeline(id)`, `cancelPipeline(id)`, `fetchPipelineStatus(id)`, `fetchPipelineRecommendations(id)`. Thin Axios wrappers; return `response.data`.
  - Notes: New file (not extending `faculty-analytics.requests.ts`) to keep the analytics-vs-analysis concerns separated. Export from feature barrel.

- [x] **Task 16: Create `use-latest-pipeline-for-scope.ts`.**
  - File (new): `app.faculytics/features/faculty-analytics/hooks/use-latest-pipeline-for-scope.ts`
  - Action: `useQuery` wrapping `listPipelines`. Accepts scope query (`ListPipelinesQuery` = `PipelineScopeIds`). Query key: **`['analysis', 'list-pipelines-for-scope', query]`** (no token). The query function returns `listPipelines(query)` — the raw array. The hook exposes `latestPipeline = result.data?.[0] ?? null` to consumers as a derived value, but the cached data remains the array. Enabled only when `semesterId` present + auth token present.
  - Notes: Why cache the array (not just first-or-null)? So Task 19's `setQueryData` after a create mutation can seed a one-element array into the same cache key, matching the shape invariant.

- [x] **Task 17: Create `use-pipeline-status.ts`.**
  - File (new): `app.faculytics/features/faculty-analytics/hooks/use-pipeline-status.ts`
  - Action: `useQuery` with `refetchInterval` that returns `false` on **UPPERCASE** terminal statuses (`'COMPLETED' | 'FAILED' | 'CANCELLED'`), else `3000`. Accepts nullable `pipelineId`; `enabled: Boolean(pipelineId) && Boolean(token)`. Query key: `['analysis', 'pipeline-status', pipelineId]` — **no token in queryKey**. Use the `TERMINAL_STATUSES` const from the Codebase Patterns snippet.

- [x] **Task 18: Create `use-pipeline-recommendations.ts` — gate on pipeline status, not run status.**
  - File (new): `app.faculytics/features/faculty-analytics/hooks/use-pipeline-recommendations.ts`
  - Action: `useQuery` fetching `GET /:id/recommendations`. Takes `pipelineId: string | null` AND `pipelineStatus: PipelineStatus | undefined` as inputs (caller passes the current pipeline status from `usePipelineStatus`). `enabled: Boolean(pipelineId) && Boolean(token) && pipelineStatus === 'COMPLETED'`. Query key: `['analysis', 'pipeline-recommendations', pipelineId]` — no token.
  - Notes: Do NOT gate on `recommendations.status === 'COMPLETED'` — that's `RunStatus`, a different enum. Pipeline status (`'COMPLETED'`) is the correct gate because the recommendations run completes before the pipeline transitions to `COMPLETED`.

- [x] **Task 19: Create `use-create-pipeline.ts` — seed cache on success, invalidate in background.**
  - File (new): `app.faculytics/features/faculty-analytics/hooks/use-create-pipeline.ts`
  - Action: `useMutation` wrapping `createPipeline`. On `onSuccess(createdPipeline, variables)`:
    1. `queryClient.setQueryData(['analysis', 'list-pipelines-for-scope', variables], [createdPipeline])` — note the key matches Task 16 exactly (`list-pipelines-for-scope`, not `latest-pipeline-for-scope`) and the seeded value is a **single-element array**, matching the shape `listPipelines` returns. This seeds the cache so the trigger card immediately has the pipeline via the same hook, without waiting for a list refetch.
    2. `queryClient.invalidateQueries({ queryKey: ['analysis', 'list-pipelines-for-scope'] })` in background to refresh any other scoped listings that may exist.
  - Notes: The key structure and value shape MUST match Task 16's cache exactly — deep-equal keys + array values — or the seed is invisible to subscribers. The setQueryData guarantees the trigger card transitions Run → Awaiting Confirmation in a single render.

- [x] **Task 20: Create `use-confirm-pipeline.ts`.**
  - File (new): `app.faculytics/features/faculty-analytics/hooks/use-confirm-pipeline.ts`
  - Action: `useMutation` wrapping `confirmPipeline`. On success, invalidate status query so the UI immediately reflects `SENTIMENT_ANALYSIS`.

- [x] **Task 21: Create `use-cancel-pipeline.ts`.**
  - File (new): `app.faculytics/features/faculty-analytics/hooks/use-cancel-pipeline.ts`
  - Action: `useMutation` wrapping `cancelPipeline`. On success, invalidate status + list.

- [x] **Task 22: Create `pipeline-themes.ts` helper.**
  - File (new): `app.faculytics/features/faculty-analytics/lib/pipeline-themes.ts`
  - Action: Pure function `aggregateThemes(actions: RecommendedActionDto[]): RankedTheme[]` where `RankedTheme = { topicLabel, commentCount, sentimentBreakdown, sampleQuotes, referencedBy: number }`. Walks `action.supportingEvidence.sources`, filters `type === 'topic'`, deduplicates by `topicLabel` (first-occurrence-wins, preserving LLM emission order), sums `commentCount`, averages `sentimentBreakdown` weighted by each source's own `commentCount`, collects unique `sampleQuotes` up to **3 total** (matches backend cap `z.array(z.string()).max(3)` at `recommendations.dto.ts:15`), counts how many actions reference the topic. Sorts by descending `commentCount`.
  - Notes: Pure function — the ONE piece of logic most worth unit-testing when the frontend test framework lands. Leave a `// TODO(post-vitest-adoption): cover in unit test` comment in the file.

- [x] **Task 23: Create `PipelineStatusBadge`.**
  - File (new): `app.faculytics/features/faculty-analytics/components/pipeline-status-badge.tsx`
  - Action: Accepts `status: PipelineStatus`. Maps to shadcn `Badge` variant: `awaiting_confirmation → secondary`, `sentiment_* | topic_* | recommendations → default` (with a small spinner), `completed → success` (or `default` if variant missing; define a custom class), `failed → destructive`, `cancelled → outline`. Renders a human-readable label.

- [x] **Task 24: Create `PipelineTriggerCard`.**
  - File (new): `app.faculytics/features/faculty-analytics/components/pipeline-trigger-card.tsx`
  - Action: Accepts `scope: PipelineScopeIds` (UUIDs), `pipeline: PipelineSummary | null`, `onStatusChange?: (status: PipelineStatus) => void`. Internally uses `useCreatePipeline`, `useConfirmPipeline`, `useCancelPipeline`, `usePipelineStatus(pipeline?.id)`. UI (all status comparisons UPPERCASE):
    - If `pipeline === null`: "Run Analysis" button + coverage preview card.
    - If `pipeline.status === 'AWAITING_CONFIRMATION'`: show `pipeline.warnings` list (from the summary DTO — Task 2 ensures the field exists) + "Confirm & Start" + "Cancel" buttons.
    - If `pipeline.status ∈ { 'EMBEDDING_CHECK', 'SENTIMENT_ANALYSIS', 'SENTIMENT_GATE', 'TOPIC_MODELING', 'GENERATING_RECOMMENDATIONS' }`: show stepper (stages + status) + "Cancel" button; `PipelineStatusBadge`.
    - If `pipeline.status ∈ { 'COMPLETED', 'FAILED', 'CANCELLED' }`: show last-run metadata + "Re-run" button.
    - Role gate: only renders action buttons when `useActiveRole().activeRole` is `'DEAN' | 'CHAIRPERSON' | 'CAMPUS_HEAD' | 'SUPER_ADMIN'`. FACULTY sees the status badge + last-updated label only; no action buttons rendered.
  - Notes: Coverage warnings come from `pipeline.warnings` (the summary DTO field added in Task 2) — the trigger card does NOT need to call `/status` to display warnings. Confirmation dialog uses shadcn `AlertDialog` with an explicit "I understand" checkbox before the "Confirm" button activates.

- [x] **Task 25: Create `ThemesChipList`.**
  - File (new): `app.faculytics/features/faculty-analytics/components/themes-chip-list.tsx`
  - Action: Accepts `themes: RankedTheme[]`. Renders each theme as a shadcn `Badge` with the `topicLabel` and a tiny count indicator. Truncates to top 8 with a "+N more" overflow badge. Compact layout for faculty report.
  - Notes: Click/hover expansion (sample quotes on hover) is a nice-to-have; ship a minimal version first.

- [x] **Task 26: Create `ThemesRankedList`.**
  - File (new): `app.faculytics/features/faculty-analytics/components/themes-ranked-list.tsx`
  - Action: Accepts `themes: RankedTheme[]`. Renders as a vertical list with topic label, comment count, and a horizontal three-segment bar showing sentiment breakdown (positive green / neutral gray / negative red). Shows top 10.

- [x] **Task 27: Create `RecommendationsCard`.**
  - File (new): `app.faculytics/features/faculty-analytics/components/recommendations-card.tsx`
  - Action: Accepts `recommendations: RecommendationsResponse`. Splits actions by `category` into two sections (Strengths | Improvements). Each action renders: `headline` (heading), `description`, `actionPlan`, and an expandable "Evidence" accordion showing supporting-evidence details (topics + sample quotes + dimension scores). Uses shadcn `Accordion`, `Card`, `Badge` (for `priority`).
  - Notes: Same component used on both faculty report and scoped dashboard. Differentiation is only in the wrapper (parent decides whether to show all actions or filter by a specific facultyId in the evidence's topic sources — currently, actions ARE faculty-level, so dean dashboards display ALL faculty recs in the department, not an aggregate LLM synthesis; this is the constraint called out in Notes → Known limitations).

- [x] **Task 28: Integrate into `scoped-analytics-dashboard-screen.tsx`.**
  - File: `app.faculytics/features/faculty-analytics/components/scoped-analytics-dashboard-screen.tsx`
  - Action:
    - Use `useLatestPipelineForScope({ semesterId })` at the top of the screen (no `departmentId` needed — the backend fills in the DEAN/CAMPUS_HEAD's resolved scope per TD-2 List rules). Screen currently has `selectedSemesterId` and `selectedProgramCode`; pass `semesterId: selectedSemesterId`.
    - Insert `<PipelineTriggerCard scope={{ semesterId: selectedSemesterId }} pipeline={pipeline} />` row immediately after `<ScopedDashboardHeader>`.
    - When `pipeline?.status === 'COMPLETED'`:
      - Fetch `usePipelineRecommendations(pipeline.id, pipeline.status)`.
      - Derive themes via `aggregateThemes(recs.actions)` in a `useMemo`.
      - Insert `<ThemesRankedList>` + `<RecommendationsCard>` row below the sentiment-chart/attention-card row.
  - Notes: Hide (don't empty-state) themes/recs when no completed pipeline exists. The screen is currently mounted at `/dean/dashboard` and `/campus-head/dashboard` only; CHAIRPERSON and SUPER_ADMIN route mounting is out of scope for FAC-132 (see Known Limitations).

- [x] **Task 29: Integrate into `faculty-report-screen.tsx`.**
  - File: `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx`
  - Action: Near the top of the report body, call `useLatestPipelineForScope({ semesterId, facultyId })`. If a pipeline exists:
    - Show `<PipelineStatusBadge status={pipeline.status} />` inline with the header (compact visual cue).
    - If `pipeline.status === 'COMPLETED'`, fetch `usePipelineRecommendations(pipeline.id, pipeline.status)`, derive themes, and insert `<ThemesChipList>` + `<RecommendationsCard>` between `<FacultyReportSummaryCards>` and `<FacultyReportSectionPerformanceChart>`.
    - If `pipeline.status ∈ running-stages`, show a `<PipelineStatusBadge>` + small "Analysis in progress" helper text in the themes/recs slot.
    - If no pipeline exists (list returns empty), render nothing in the themes/recs slot.

- [x] **Task 30: Extend feature barrel exports.**
  - File: `app.faculytics/features/faculty-analytics/index.ts`
  - Action: Export the new components, hooks, types, and the `aggregateThemes` helper so route pages can consume them without deep imports.

- [x] **Task 31: Manual E2E verification across six roles.**
  - File: (no code change)
  - Action: See "Manual E2E Checklist" in Testing Strategy below.

### Acceptance Criteria

#### Backend role + scope authorization

- [x] **AC-1 (STUDENT blocked at guard):** Given an authenticated user with role STUDENT, when they call any `/analysis/*` endpoint, then the response is `403 Forbidden` and the orchestrator service is never invoked.
- [x] **AC-2 (FACULTY cannot create — guard layer):** Given an authenticated FACULTY, when they call `POST /analysis/pipelines`, then the response is `403 Forbidden` (FACULTY not in write-guard allowlist).
- [x] **AC-2a (FACULTY cannot create — service layer belt-and-braces):** Given the `PipelineOrchestratorService.CreatePipeline` method is invoked directly with a FACULTY user in CLS context (simulating a future controller misconfiguration that widens the guard), when the service runs, then it throws `ForbiddenException` before any DB write — verified by asserting no `fork.persist` / `fork.flush` calls occurred.
- [x] **AC-3 (DEAN out-of-scope create):** Given a DEAN assigned to department `dept-A`, when they call `POST /analysis/pipelines` with body `{ semesterId: 'sem-1', departmentId: 'dept-B' }`, then the response is `403 Forbidden` with message containing `"scope not in your assigned access"`.
- [x] **AC-4 (DEAN must scope):** Given a DEAN, when they call `POST /analysis/pipelines` with body `{ semesterId: 'sem-1' }` only, then the response is `400 Bad Request` with message `"scope filter required for your role"`.
- [x] **AC-5 (SUPER_ADMIN unrestricted create):** Given a SUPER_ADMIN, when they call `POST /analysis/pipelines` with body `{ semesterId: 'sem-1' }` only, then a pipeline is created in `AWAITING_CONFIRMATION` status and returned.
- [x] **AC-5a (SUPER_ADMIN reads any pipeline):** Given a SUPER_ADMIN who did not create pipeline `pipe-foreign` (triggered by another user, any scope), when they call `GET /analysis/pipelines/:id/status` or `GET /analysis/pipelines/:id/recommendations`, then the response is `200 OK` with the full payload.
- [x] **AC-6 (DEAN in-scope create):** Given a DEAN assigned to `dept-A`, when they call `POST /analysis/pipelines` with `{ semesterId: 'sem-1', departmentId: 'dept-A' }`, then a pipeline is created successfully.
- [x] **AC-7 (CAMPUS_HEAD in-scope create):** Given a CAMPUS_HEAD assigned to `campus-X`, when they call `POST /analysis/pipelines` with a `departmentId` belonging to `campus-X` (resolved via scope resolver), then the pipeline is created successfully.
- [x] **AC-8 (CAMPUS_HEAD out-of-scope create):** Given a CAMPUS_HEAD assigned to `campus-X`, when they call `POST /analysis/pipelines` with a `departmentId` belonging to a different campus, then the response is `403 Forbidden`.
- [x] **AC-9 (CHAIRPERSON backend scope — API-level only):** Given a CHAIRPERSON assigned to program `prog-A`, when they call `POST /analysis/pipelines` directly (via curl / Postman — no CHAIRPERSON dashboard UI exists in FAC-132, see Known Limitations), then `programId: 'prog-A'` → success (201); `programId: 'prog-B'` → 403.
- [x] **AC-10 (FACULTY read own):** Given a FACULTY user `fac-1`, when they call `GET /analysis/pipelines/:id/status` for a pipeline where `pipeline.faculty.id === 'fac-1'`, then the response is `200 OK` with the full status payload.
- [x] **AC-11 (FACULTY read foreign):** Given FACULTY `fac-1`, when they call `GET /analysis/pipelines/:id/status` for a pipeline where `pipeline.faculty.id !== 'fac-1'`, then the response is `403 Forbidden`.
- [x] **AC-12 (FACULTY read dept pipeline):** Given FACULTY `fac-1`, when they call `GET /analysis/pipelines/:id/status` for a department-scoped pipeline (null faculty FK), then the response is `403 Forbidden`.
- [x] **AC-13 (DEAN list with explicit in-scope dept):** Given a DEAN assigned to `dept-A`, when they call `GET /analysis/pipelines?semesterId=sem-1&departmentId=dept-A`, then the response is `200 OK` with an array of pipeline summaries for that scope, ordered by `createdAt DESC`.
- [x] **AC-13a (DEAN list with default-fill):** Given a DEAN assigned to `dept-A` and `dept-A2`, when they call `GET /analysis/pipelines?semesterId=sem-1` (no departmentId), then the response is `200 OK` and the returned list contains ONLY pipelines whose `department_id ∈ { dept-A, dept-A2 }`. No 400 is returned (list endpoint fills in the caller's scope; this differs from Create which 400s).
- [x] **AC-14 (DEAN list foreign):** Given a DEAN assigned to `dept-A`, when they call `GET /analysis/pipelines?semesterId=sem-1&departmentId=dept-B`, then the response is `403 Forbidden`.
- [x] **AC-15 (FACULTY list auto-override):** Given a FACULTY `fac-1`, when they call `GET /analysis/pipelines?semesterId=sem-1&facultyId=fac-2` (attempting to list another faculty's pipelines), then the response is `200 OK` with results filtered to `facultyId=fac-1` only (the query param is silently overridden).
- [x] **AC-16 (non-terminal cancel authorization):** Given a CAMPUS_HEAD whose scope does not include the pipeline's campus, when they call `POST /analysis/pipelines/:id/cancel`, then the response is `403 Forbidden` and the pipeline status is unchanged.
- [x] **AC-17 (404 precedes 403):** Given any authorized user, when they call any `/analysis/pipelines/:id/*` endpoint with an `:id` that does not exist, then the response is `404 Not Found` (not 403).
- [x] **AC-17a (unique-index race handling):** Given two concurrent `POST /analysis/pipelines` requests with identical scope tuples, when both reach the orchestrator before either flushes, then exactly one pipeline is created and both requests return `200 OK` with the same pipeline id (the losing request catches `UniqueConstraintViolationException`, re-fetches, and returns the winner).

#### Frontend surfacing

- [x] **AC-18 (Dean trigger visible):** Given a DEAN navigates to the scoped analytics dashboard, when the page renders, then the `PipelineTriggerCard` is visible and its "Run Analysis" button is enabled (or disabled with tooltip if a pipeline is already running).
- [x] **AC-19 (Coverage warnings confirmed):** Given the dashboard shows a newly created pipeline in `AWAITING_CONFIRMATION` with warnings, when the user clicks "Confirm & Start", then a confirmation dialog lists each warning and requires an "I understand" checkbox before the "Confirm" button activates.
- [x] **AC-20 (Polling while running):** Given a pipeline is in a running stage (`SENTIMENT_ANALYSIS`, `SENTIMENT_GATE`, `TOPIC_MODELING`, `GENERATING_RECOMMENDATIONS`, or `EMBEDDING_CHECK`), when `usePipelineStatus` is active, then the query refetches every 3000ms until a terminal status is observed.
- [x] **AC-21 (Polling stops on terminal):** Given a pipeline transitions from `TOPIC_MODELING` to `COMPLETED`, when the next poll response arrives, then `refetchInterval` returns `false` (the hook compares against UPPERCASE `'COMPLETED' | 'FAILED' | 'CANCELLED'`) and subsequent polls stop.
- [x] **AC-22 (Themes rendered on dashboard):** Given the dashboard loads a completed pipeline, when `ThemesRankedList` renders, then topics are ordered by descending `commentCount` and each shows its sentiment breakdown bar.
- [x] **AC-23 (Recommendations rendered on dashboard):** Given a completed pipeline with recommendation actions, when `RecommendationsCard` renders, then STRENGTH and IMPROVEMENT actions appear in distinct sections and each action's evidence is expandable.
- [x] **AC-24 (Faculty sees own themes + recs):** Given a FACULTY on `/faculty/report/:id` has a completed pipeline for `(semester, faculty)`, when the report renders, then `ThemesChipList` appears after `FacultyReportSummaryCards` and `RecommendationsCard` appears in the faculty report body.
- [x] **AC-25 (Faculty sees no themes without pipeline):** Given a FACULTY has no pipeline for `(semester, faculty)`, when the report renders, then the themes + recs slots are absent (no empty-state message, no broken layout).
- [x] **AC-26 (Faculty sees progress badge while running):** Given a FACULTY has a pipeline in a running stage for `(semester, faculty)`, when the report renders, then a `PipelineStatusBadge` + "Analysis in progress" helper text appear in place of the themes/recs sections.
- [x] **AC-27 (Faculty hides trigger controls):** Given any view that renders `PipelineTriggerCard`, when the current user's role is FACULTY, then no action buttons (Run, Confirm, Cancel, Re-run) are rendered — only the status badge + metadata.

#### Integration + docs

- [x] **AC-28 (Workflow doc updated):** Given the PR is open, when a reviewer inspects `docs/workflows/analysis-pipeline.md`, then it contains an "Access Control" section with the per-endpoint allowlist and the scope-authorization matrix.
- [x] **AC-29 (Scope-resolution doc addendum):** Given the PR is open, when a reviewer inspects `docs/architecture/scope-resolution.md`, then it contains a "Pipeline-scope authorization" subsection referencing the workflow doc.

### Dependencies

**External libraries/services:**

- None new. All required packages already installed in both `api.faculytics` (NestJS 11, MikroORM 6, Passport, Zod, class-validator, Jest, BullMQ, OpenAI SDK) and `app.faculytics` (Next.js 16, React 19, TanStack Query v5, Axios, Zustand, shadcn/ui, Tailwind 4).

**Internal tickets (all completed):**

- FAC-125 (department source tracking)
- FAC-127 (admin manual scope override)
- FAC-128 (faculty home-department snapshot on submissions)
- FAC-129 (dean faculty listing filter by home dept)
- FAC-130 (MV home-department aggregation)
- FAC-131 (CAMPUS_HEAD role + local user provisioning)
- `frontend-pipeline-polling` spec (status DTO contract; `status: 'implementation-complete'` / `stepsCompleted: [1,2,3,4]` verified 2026-04-14 against the spec's frontmatter — safe to depend on the contract)
- `recommendation-engine-faculty-level` spec (faculty-level recs + supporting-evidence schema; `status: 'implementation-complete'` — safe to depend on `RecommendedAction.supportingEvidence` shape)

**Data dependencies:**

- A seeded environment with at least: 1 semester, 1 campus, 2 departments (one with a CAMPUS_HEAD assigned, one without), 2 programs under one department, 1 chairperson, 1 dean, 2 faculty, 1 student, and enough `QuestionnaireSubmission` rows to satisfy the coverage warnings threshold (≥ 30 submissions + ≥ 10 comments).

### Testing Strategy

**Backend unit tests (Jest + NestJS TestingModule):**

- `analysis.controller.spec.ts` — controller delegation tests with `.overrideGuard` + `.overrideInterceptor` pattern. Assert each method calls its orchestrator counterpart with expected args. Add list-endpoint test. **Do NOT test role-guard matrix here**; that logic is covered by `roles.guard.spec.ts` (unchanged) and by service-level scope tests.
- `pipeline-orchestrator.service.spec.ts` — scope authorization matrix (17 scenarios in Task 9). Mock `ScopeResolverService` methods to return specific scope shapes per role. Mock `CurrentUserService.getOrFail()` to return the user under test. Assert exception types/messages for negative cases; assert orchestration proceeds for positive cases.
- `scope-resolver.service.spec.ts` — if Task 10 adds `ResolveCampusIds`, add focused unit tests for it (happy path + empty + null).

**Backend E2E tests:**

- Out of scope for this ticket. The existing `test/` folder does not currently have an `analysis.e2e-spec.ts`. Adding one would require a DB + Redis + mock-worker stack in CI, which is a larger undertaking. Flag as a follow-up.

**Frontend automated tests:**

- Deliberately deferred (TD-6). The exception: Task 22's `pipeline-themes.ts` pure helper is simple enough that if Vitest is ever introduced later, this is the first file to cover.

**Manual E2E checklist:**

1. **Environment:** `cd api.faculytics && docker compose up` (Redis + mock worker); in another terminal `npm run start:dev`; in a third terminal `cd app.faculytics && bun dev`.
2. **Provision roles via admin console** (uses FAC-127's manual-scope-override flow + FAC-131's local-user provisioning):
   - 1 SUPER_ADMIN (from seeder `SUPER_ADMIN_USERNAME`/`SUPER_ADMIN_PASSWORD`).
   - 1 DEAN: local-provision user, then admin console → Users → Edit scope → assign department `dept-CS`.
   - 1 CAMPUS_HEAD: local-provision user, assign to `campus-main` (must contain `dept-CS` + `dept-EE`).
   - 1 CHAIRPERSON: local-provision, assign to program `prog-BSCS`.
   - 2 FACULTY (one in `dept-CS`, one in `dept-EE`) — either Moodle-synced or locally provisioned.
   - 1 STUDENT.
   - Ensure each FACULTY has ≥ 30 QuestionnaireSubmissions with ≥ 10 comments for the current semester (uses existing CSV test submission generator from the `tech-spec-csv-test-submission-generator` ticket).
   - Estimate: ~20 minutes for a fresh environment; ~3 minutes per role if the submission seed already exists.
3. **As DEAN (dept-CS):** Log in → navigate to `/dean/dashboard`. `PipelineTriggerCard` should be visible. Click "Run Analysis" → dialog lists coverage warnings if any → confirm → observe polling transition through stages to `COMPLETED` (~2 min with mock worker). Verify `ThemesRankedList` + `RecommendationsCard` render below the charts. Attempt a direct `POST /analysis/pipelines` (via devtools / curl) with `departmentId: <dept-EE>` → 403.
4. **As CAMPUS_HEAD:** Log in → navigate to `/campus-head/dashboard`. Trigger pipeline for a department in `campus-main` → succeeds. Direct POST for a dept in another campus → 403. Verify themes + recs render.
5. **As FACULTY (dept-CS):** Navigate to own faculty report. If pipeline from step 3 completed for their `(semester, faculty)`, `ThemesChipList` + `RecommendationsCard` render after summary cards. No trigger card visible. Direct POST to `/analysis/pipelines` via devtools → 403. `GET /analysis/pipelines?semesterId=X&facultyId=<other>` → backend silently returns THEIR OWN list (verify via network inspector).
6. **As STUDENT:** All `/analysis/*` calls return 403 regardless of method. No themes/recs surfaces.
7. **API-level only — CHAIRPERSON + SUPER_ADMIN:** These roles have no dashboard UI in FAC-132 (see Known Limitations). Verify authorization via direct API calls: CHAIRPERSON `POST /analysis/pipelines { programId: <assigned> }` → 201; with foreign `programId` → 403. SUPER_ADMIN `POST /analysis/pipelines { semesterId }` (no scope filter) → 201. SUPER_ADMIN `GET /analysis/pipelines/:id/status` for any pipeline → 200.
8. **Regression check:** Existing `/analytics/*` endpoints (dean overview, attention list, faculty report, faculty report comments) unaffected — same data, same response shapes.
9. **Doc spot-check:** Verify `docs/workflows/analysis-pipeline.md` contains "Access Control" section with the scope matrix and FACULTY auto-override note.

### Notes

#### High-risk items (pre-mortem)

1. **`ScopeResolverService` internals may not cleanly handle campus-scope checks.** Current code uses a private `resolveCampusHeadDepartmentIds` — pipeline-scope for a CAMPUS_HEAD creating a `campusId` filter (not `departmentId`) needs a direct campus check. **Mitigation:** Task 10 extracts/adds a public `ResolveCampusIds(semesterId)` helper. If the helper requires more than a rename, the scope of this ticket expands slightly — acceptable.
2. **Scope drift mid-pipeline.** A DEAN who triggers a pipeline and is then reassigned to a different department mid-execution will lose read access to their own pipeline. **Mitigation:** This mirrors `/analytics/*` behavior and is expected. Documented in the workflow doc.
3. **Duplicate-trigger race is mitigated by TD-8 partial unique index.** Two concurrent `POST /analysis/pipelines` with the same scope tuple: the DB rejects the second insert with `UniqueConstraintViolationException`; the orchestrator catches it and re-fetches the winner. Both callers see the same pipeline id. Unit test (Task 9's race scenario) covers this path. Frontend mutation `onSuccess` seeds the cache with the returned pipeline (Task 19), so both clients converge without flicker.
4. **LLM cost regression (false alarm).** FAC-132 adds zero new LLM invocations. Topic labels and recommendations are generated by existing pipeline stages. Called out only to preempt review questions.
5. **Visibility of 403 vs 404 information leakage.** Task 5 explicitly sequences `findOne` → 404 before scope check → 403. **Threat model note:** combined with the FACULTY auto-override in `ListPipelines` (Task 3), this creates an enumeration surface for the **non-FACULTY** scoped roles — e.g., a DEAN who knows a foreign pipeline's UUID can distinguish "exists but forbidden" (403) from "doesn't exist" (404). This is bounded by UUID opacity (no sequential IDs) and the practical reality that pipeline UUIDs are not exposed externally. For FACULTY, the auto-override of the list endpoint means they never learn foreign pipeline UUIDs in the first place — so the oracle is ineffective against them. Trade-off accepted; documented in the workflow doc's Access Control section.
6. **Interceptor ordering — `CurrentUserInterceptor` (class-level) + `MetaDataInterceptor`/`AuditInterceptor` (method-level).** Nest runs class-level interceptors outside method-level, so `CurrentUserInterceptor` populates CLS before the audit interceptors run and before `@Audited` routes reach the service. Untested combo in `AnalysisController` specifically. **Mitigation:** Task 8 adds an audit-fidelity test that verifies audit rows still fire on 403-reject paths. If the test fails, fallback is to move `CurrentUserInterceptor` to method-level on each endpoint (more verbose but explicitly ordered).

#### Known limitations

- **No aggregate (dept/program/campus-level) LLM recommendations.** Dean dashboards show the union of faculty-level recommendations for the department, not a synthesized dept-level narrative. A future ticket can add an aggregate-scope prompt + LLM call.
- **`UserRole.ADMIN` is NOT included in any `/analysis/*` or `/analytics/*` guard allowlist.** This matches the pre-existing codebase convention established before FAC-132 (see `analytics.controller.ts:29-36` — the analytics controller also omits ADMIN). ADMIN is reserved for admin-console operations (audit logs, user provisioning, scope assignment) and does not have trigger or read access to analytics or pipeline surfaces. Promoting ADMIN to analytics/pipeline-read would be a separate product-decision ticket and is not part of FAC-132.
- **Audit rows do not fire on rejected (4xx/5xx) calls.** `AuditInterceptor` at `src/modules/audit/interceptors/audit.interceptor.ts:47-48` uses RxJS `tap(() => ...)` which runs only on successful emissions. On a rejected call (including all 403s added by FAC-132's scope guards), no audit row is written. This is a pre-existing codebase behavior affecting every audited endpoint (Moodle sync, ingestion, questionnaire submission, etc.). Fixing it requires changing `tap(fn)` to `tap({ next, error })` across the audit pipeline — a cross-cutting refactor deferred to a follow-up ticket. For FAC-132, successful-path audit (pipeline created, confirmed, cancelled) still works as before.
- **No CHAIRPERSON or SUPER_ADMIN scoped-dashboard UI routes.** `ScopedAnalyticsDashboardScreen` is currently mounted only at `/dean/dashboard` and `/campus-head/dashboard`. CHAIRPERSON and SUPER_ADMIN role-guard enforcement works at the API level (AC-9, AC-5, AC-5a cover this), but there's no in-app dashboard for these roles to trigger pipelines from. Follow-up ticket: "mount `ScopedAnalyticsDashboardScreen` at `/chairperson/dashboard` and `/super-admin/dashboard`". Today those roles use the API directly (via Postman/curl) or wait for the follow-up.
- **No frontend automated tests.** Explicit gap (TD-6). Introducing Vitest + RTL is a separate convention-setting ticket; this one runs on manual E2E + manual regression.
- **Pipeline summary list is not paginated.** `ListPipelines` returns the 10 most recent matching pipelines. Adequate for current usage; add pagination when/if a scope accumulates hundreds of pipelines.
- **Scope is not displayed on the trigger card in user-friendly terms.** The card shows "semester X, department Y" using IDs or codes; the frontend does not currently look up human-readable names for the scope filters. TD-9 unblocks this (scope response now includes display values alongside IDs), but wiring the display is a polish pass, not in this ticket.
- **No `/auth/me` extension for "my departments" or "my campuses".** Frontend detects the user's active ROLE (via `useActiveRole()`) but not their assigned institutional scope (dept/campus/program UUIDs). FAC-132 sidesteps this gap by letting the backend default-fill list scope from the resolver. If future work needs client-side scope awareness (e.g., a picker for multi-dept DEANs), `/auth/me` must expose the scope explicitly.

#### Future considerations (follow-up tickets — NOT part of this spec)

- Aggregate-scope LLM recommendations (new prompt templates at dept/program/campus level).
- Change `AuditInterceptor` to fire on both success and error outcomes (switch `tap(fn)` to `tap({ next, error })`). Cross-cutting; needs a separate audit-behavior review because every audited endpoint gains rejection entries.
- Mount `ScopedAnalyticsDashboardScreen` for CHAIRPERSON + SUPER_ADMIN routes.
- Vitest + React Testing Library adoption for `app.faculytics`; start with `pipeline-themes.ts` unit coverage.
- Auto-trigger pipelines on semester state transitions.
- Admin console pipeline trigger UI (`admin.faculytics`) for SUPER_ADMIN power users.
- Pipeline history page listing past runs per scope, with diff view between runs.
- `UserInstitutionalRole` extension for CHAIRPERSON holding multiple programs (already supported by data model; surface + validate in trigger UX).
- Human-readable scope display on the trigger card (uses TD-9's display values).
- `/auth/me` extension to expose current-user institutional scope, enabling client-side scope-picker UX.

## Review Notes

- Adversarial review completed 2026-04-14 (36 findings, auto-fix applied to critical + high-priority issues).
- **Fixed during review:**
  - **F1 (Critical)** — Create/Confirm/Cancel endpoints now return `PipelineSummaryResponseDto` (not `PipelineResponseDto`), matching the list endpoint and the frontend `PipelineSummary` type. Orchestrator populates all scope refs before return. Cache-seeding in `useCreatePipeline` now delivers the correct shape.
  - **F2 (Critical)** — `CreatePipeline.existingFilter` now binds every non-provided scope field to `null`, matching the partial unique index's COALESCE-sentinel semantics. Fixes silent superset-match + race-recovery corruption.
  - **F13 (Medium)** — `useConfirmPipeline` now invalidates `list-pipelines-for-scope` in addition to `pipeline-status`.
  - **F19 (Low)** — Controller `:id` params now use `ParseUUIDPipe` (matches `AnalyticsController` convention).
  - **F21 (Low)** — `analysis.controller.spec.ts` `GetPipelineStatus` mock scope updated to TD-9 shape.
  - **F22 (Low)** — Added AC-17 test asserting 404 precedes scope-resolver invocation.
- **Defended as design decisions:**
  - **F4** — `assertCanAccessPipeline` CAMPUS_HEAD allowing dept-scoped pipelines with null campus is consistent with TD-2's "campusId OR departmentId" create rule. A DEAN's dept-scoped pipeline IS legitimately readable by the CAMPUS_HEAD of that campus (role hierarchy).
  - **F5** — `Endpoints.analysisPipelines` merged list+create entry satisfies the lint rule `no-duplicate-enum-values`; a single shared URL with HTTP verb distinction is idiomatic.
  - **F6** — `PipelineSummary.lastEnrollmentSyncAt` hardcoded null in the list response is an acknowledged limitation; computing it per-pipeline in `ListPipelines` would N+1 the query. Frontend falls back to `/status` for fresh sync timestamps.
- **Acknowledged and deferred** (low-severity polish — not blocking):
  - F8 (existence-oracle bounded by UUID opacity, documented).
  - F17, F20, F27, F28–F36 — style/UX nits and test-coverage expansions.
  - F23 (persistent FAILED state on SENTIMENT_WORKER_URL misconfig — pre-existing, out of FAC-132 scope).
  - F24 (spinner icon on running status badges — UX polish).
  - F25 (default tab in RecommendationsCard when no improvements — UX polish).
  - F32 (mutation error surfacing in UI — UX polish).

**Verification status:** backend build + lint clean, 62/62 analysis tests passing, frontend typecheck + lint clean. Manual E2E (Task 31) is outside this automated pass per TD-6.
