---
title: 'Faculty analysis tri-view split (Insights / Scores / Feedback) with comment filters'
slug: 'faculty-analysis-tri-view-split'
created: '2026-04-15'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Next.js 16 App Router (mix of server + client components across the three role routes)
  - React 19
  - TanStack Query v5
  - Zustand (not directly touched by this spec)
  - shadcn/ui Tabs, DropdownMenu, Button
  - Tailwind 4
  - Axios (apiClient with interceptor-based auth)
  - NestJS 11 + MikroORM (only if we add a questionnaire-type list endpoint — TBD decision below)
files_to_modify:
  # Frontend — view-model + href + types
  - app.faculytics/features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts
  - app.faculytics/features/faculty-analytics/lib/faculty-report-detail.ts
  - app.faculytics/features/faculty-analytics/types/index.ts
  # Frontend — screen & header (tri-tab refactor)
  - app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx
  - app.faculytics/features/faculty-analytics/components/faculty-report-header.tsx
  # Frontend — new tab panel components
  - app.faculytics/features/faculty-analytics/components/insights-tab.tsx (NEW)
  - app.faculytics/features/faculty-analytics/components/scores-tab.tsx (NEW)
  - app.faculytics/features/faculty-analytics/components/feedback-tab.tsx (NEW)
  # Frontend — shared-header headline metrics strip (Phase B)
  - app.faculytics/features/faculty-analytics/components/headline-metrics-strip.tsx (NEW)
  # Frontend — Feedback filter bar
  - app.faculytics/features/faculty-analytics/components/feedback-filter-bar.tsx (NEW)
  # Frontend — Scores questionnaire-type secondary tabs
  - app.faculytics/features/faculty-analytics/components/questionnaire-type-tabs.tsx (NEW)
  # Frontend — existing components touched (props / defaults)
  - app.faculytics/features/faculty-analytics/components/quantitative-scores-section.tsx
  - app.faculytics/features/faculty-analytics/components/faculty-report-comments.tsx
  # Frontend — auto-correction notice (Decision §16)
  - app.faculytics/features/faculty-analytics/components/auto-correction-notice.tsx (NEW)
  # Frontend — hook for available questionnaire types (per-faculty + counts)
  - app.faculytics/features/faculty-analytics/hooks/use-faculty-questionnaire-types.ts (NEW)
  - app.faculytics/features/faculty-analytics/api/faculty-analytics.requests.ts (add getFacultyQuestionnaireTypes request fn)
  # Backend — questionnaire-type list endpoint + Task 0 role-guard expansion
  - api.faculytics/src/modules/analytics/analytics.controller.ts
  - api.faculytics/src/modules/analytics/analytics.service.ts
  - api.faculytics/src/modules/analytics/dto/responses/faculty-questionnaire-types.response.dto.ts (NEW)
  - api.faculytics/src/modules/analytics/dto/analytics-query.dto.ts (extend with FacultyQuestionnaireTypesQueryDto)
code_patterns:
  - 'shadcn Tabs (TabsList / TabsTrigger / TabsContent) URL-synced via router.replace + buildFacultyReportHref (features/faculty-analytics/lib/faculty-report-detail.ts:34-51)'
  - 'View-model resolver pattern: resolveFacet (use-faculty-report-detail-view-model.ts:79) — mirror for resolveView + resolveQuestionnaireTypeCode'
  - 'Query key shape [feature, action, ...variables] — faculty-analytics hooks include token in key for comments and qualitative-summary queries; NOT in key for pipeline list queries (by design)'
  - 'Feature-slice architecture (app.faculytics/docs/ARCHITECTURE.md §8 + §11): no root-level hooks/network/types folders; all new code stays under features/faculty-analytics/'
  - 'Three role routes (faculty/dean/campus-head) delegate identically to FacultyReportScreen({ facultyId }); dean + campus-head route pages are server components, faculty self-view route page is client. FacultyReportScreen itself carries "use client" — verified — so server-page → client-component delegation is safe; Task 14 must grep for the directive to confirm it stays.'
  - 'Pipeline terminal statuses UPPERCASE ("COMPLETED" | "FAILED" | "CANCELLED")'
  - 'SentimentLabel type: "positive" | "neutral" | "negative" (types/index.ts:225)'
  - 'Pagination via PaginationFooter (components/shared/pagination-footer.tsx) — reuse shape: itemCount, totalItems, currentPage, totalPages, onPageChange, onRowsPerPageChange'
test_patterns:
  - 'No existing test pattern for features/faculty-analytics/ — clean slate. Follow any house pattern established elsewhere in app.faculytics, else defer tests and verify via typecheck + manual flow before PR.'
  - 'Commands: bun run typecheck, bun run lint, bun run build'
---

# Tech-Spec: Faculty analysis tri-view split (Insights / Scores / Feedback) with comment filters

**Created:** 2026-04-15
**Branch:** `feat/fac-135` (extends aggregate-scope pipeline rework)
**Related predecessor spec:** `_bmad-output/implementation-artifacts/tech-spec-aggregate-scope-pipeline-rework.md`

## Overview

### Problem Statement

The faculty analysis screen is a single long scroll that forces three distinct consumer intents through one layout:

1. **Stakeholder first-glance** (Dean / Chairperson / Campus Head opens a faculty member to get a narrative summary — sentiment, themes, recommendations)
2. **Numerical drill-down** (looking at per-section / per-question score performance on a specific questionnaire type)
3. **Evidence-hunting** (reading raw student comments, ideally filtered by sentiment or topic)

Today's screen defaults to the narrative at the top and buries quantitative data under a collapsed "Numerical Scores" card at the bottom (`faculty-report-screen.tsx:272-276`). Stakeholders either miss the scores entirely or have to scroll past the qualitative first-glance every time they want numbers. Raw feedback comments are rendered as a fallback when themes are empty (`faculty-report-screen.tsx:240-263`) — there is no first-class way to browse all comments, and no UI filter for sentiment or topic despite the API already supporting both (`GET /analytics/faculty/:facultyId/report/comments` accepts `sentiment` and `themeId` query params).

A sophisticated-prototype demo is scheduled that requires these three consumer intents to each feel like a first-class experience on the same screen.

### Solution

Split the existing `FacultyReportScreen` body into **three URL-synced peer tabs** sharing a redesigned header, using the same shadcn `Tabs` pattern already established in `faculty-report-header.tsx:76-96` and `recommendations-card.tsx`:

- **Insights** (default, qualitative): sentiment distribution, themes, recommendations, theme explorer. The existing `facet` tabs (Overall / Faculty Feedback / In-Classroom / Out-of-Classroom) move **into this tab's body** — they are qualitative-only.
- **Scores** (quantitative): `QuantitativeScoresSection` lifted out of its collapsed card, with a new secondary questionnaire-type selector (tabs with submission-count badges), scoped by `questionnaireTypeCode`.
- **Feedback** (comments browser): paginated list of all student comments with new sentiment chips + topic dropdown filters (API already supports both). Shares `?questionnaireTypeCode=` with Scores.

The shared header promotes **headline metrics** (overall rating + sentiment mini-bar + response count) above the tab row so the one-pager signal is preserved at first glance regardless of which tab is active.

### Scope

**In Scope:**

- `?view=insights|scores|feedback` URL-synced tab navigation; default `insights` omitted from URL
- Relocation of the existing `facet` tabs from the page header into the Insights tab body
- New **Scores** tab wrapping existing `QuantitativeScoresSection`, `FacultyReportSectionPerformanceChart`, `FacultyReportSections` components with a questionnaire-type secondary selector (default = most-recent-with-data)
- New **Feedback** tab wrapping `FacultyReportComments` with new filter UI: sentiment chips (positive/neutral/negative, single-select matching existing `sentimentFilter` shape) and topic dropdown populated from the latest pipeline's `QualitativeThemeDto[]`; shares `?questionnaireTypeCode=` with Scores
- Shared header: back button, faculty name, **headline metrics strip** (overall rating, sentiment mini-bar, response count), course dropdown, export PDF button — all view-agnostic
- Empty-state differentiation per tab (see Technical Decision §7)
- Uniform tri-tab IA across Dean, Campus Head, and Faculty self-view routes
- `questionnaireTypeCode` URL param extraction to a shared resolver so both Scores and Feedback read the same `?questionnaireTypeCode=` value

**Out of Scope:**

- Converging the Chairperson screen (`FacultyEvaluationDetailScreen`) onto `FacultyReportScreen` — separate follow-up ticket
- Any change to existing analysis-pipeline or per-faculty report endpoints
- Aggregate-across-all-questionnaire-types view for Scores or Feedback (would require optional `questionnaireTypeCode` in API)
- Per-department / cross-faculty comment browsing
- Comment export / bulk download
- Redaction / anonymization changes for Faculty self-view of Feedback (already handled upstream)
- Changes to pipeline trigger / status logic — remains as built in aggregate-scope rework
- Automated tests for the new components (clean slate; defer unless house pattern emerges)

## Context for Development

### Codebase Patterns

**URL state**

- View-model resolver pattern: each URL param has a `resolve*()` function returning the validated value or a default (e.g. `resolveFacet` at `use-faculty-report-detail-view-model.ts:79`). Unknown values fall back silently.
- All param mutations route through `updateSearchParams(updates: Record<string, string | null>)` at `use-faculty-report-detail-view-model.ts:224-229`, which delegates to `buildFacultyReportHref(pathname, currentSearchParams, updates)` at `lib/faculty-report-detail.ts:34-51` and calls `router.replace(nextHref, { scroll: false })`. `buildFacultyReportHref` is generic — `null` or empty string deletes the key; any key is accepted (no whitelist). **No modification required** to support new params (e.g., `view`).

**Feature-slice constraints** (`app.faculytics/docs/ARCHITECTURE.md` §8, §11)

- All new code lives under `features/faculty-analytics/{api, components, hooks, lib, types}`. Barrel exports only expose stable entry points.
- MUST NOT create root-level `hooks/<feature>/`, `network/requests/`, `types/<feature>/`, or `schemas/<feature>/` folders.

**TanStack Query keys**

- `useFacultyReportComments` key: `["faculty-analytics", "faculty-report-comments", params, token]` (`use-faculty-report-comments.ts:21`) — includes token by current convention.
- `usePipelineRecommendations` enabled only when `pipelineStatus === "COMPLETED"` (`use-pipeline-recommendations.ts:21`); returns actions unfiltered by facet — facet filtering happens client-side via `deriveThemeFacets()` + `filterThemesByFacet()` in `faculty-report-screen.tsx:83-86`.
- `useLatestPipelineForScope` keyed on scope `query` object (`use-latest-pipeline-for-scope.ts:28`); re-queries only on scope/semester change, not on tab switch — good: tab switching does not invalidate pipeline state.

**shadcn Tabs** already imported and styled in:

- `faculty-report-header.tsx:1, 76-96` (facet tabs — `flex-wrap gap-1`)
- `recommendations-card.tsx:1, 78-100` (per-facet tabs — `grid grid-cols-3`)
  Use `TabsList + TabsTrigger + TabsContent` composition and match spacing.

**Pagination**

- `components/shared/pagination-footer.tsx`: props `itemCount, totalItems, currentPage, totalPages, itemLabel, rowsPerPage, onRowsPerPageChange, onPageChange`. Reused in `faculty-report-comments.tsx:153-162`.

**Sentiment type**

- `SentimentLabel = "positive" | "neutral" | "negative"` (`types/index.ts:225`). `SENTIMENT_LABELS` display map in `faculty-report-comments.tsx:38-42`.

### Files to Reference

| File                                                                                             | Purpose                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.faculytics/features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts`        | Central view-model; returns identity, URL state (facet, sentimentFilter, themeLabelFilter, pagination), data queries (report, comments, qualitativeSummary, recommendations, pipeline, latestPipeline), and callbacks. Extend for `view` resolver + `selectView` / `selectQuestionnaireType` callbacks. The existing `questionnaireTypeCode` URL param stays as-is (no rename). |
| `app.faculytics/features/faculty-analytics/lib/faculty-report-detail.ts`                         | `buildFacultyReportHref` (generic searchParam updater) + `resolveFacet` + `resolveFacultyReportQuestionnaireTypeCode`. Add `resolveView`.                                                                                                                                                                                                                                       |
| `app.faculytics/features/faculty-analytics/types/index.ts`                                       | Add `ReportView = "insights" \| "scores" \| "feedback"` type + `REPORT_VIEW_ORDER` constant + label map.                                                                                                                                                                                                                                                                        |
| `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx`                 | Orchestrates layout. Extract current inline render (lines 149–290) into three tab-panel components; render shared header + Tabs + TabsContent. Preserve screen-level guards (lines 107–145) and `hasAnalyticsData` content gate (line 181).                                                                                                                                     |
| `app.faculytics/features/faculty-analytics/components/faculty-report-header.tsx`                 | Remove facet tabs (lines 76–96) — they move into `insights-tab.tsx`. Keep back button, course dropdown, export. Insert headline-metrics strip above / alongside course controls.                                                                                                                                                                                                |
| `app.faculytics/features/faculty-analytics/components/insights-tab.tsx` (NEW)                    | Wraps `FacultyAnalysisSentimentStrip`, `ThemeExplorerList`, `RecommendationsCard`, comments fallback. Owns facet tab rendering.                                                                                                                                                                                                                                                 |
| `app.faculytics/features/faculty-analytics/components/scores-tab.tsx` (NEW)                      | Wraps questionnaire-type secondary tabs + `QuantitativeScoresSection` (with `defaultOpen=true` or collapse removed) + `FacultyAnalysisStats` (if promoted to in-tab).                                                                                                                                                                                                           |
| `app.faculytics/features/faculty-analytics/components/feedback-tab.tsx` (NEW)                    | Wraps questionnaire-type secondary tabs (same component as Scores) + `FeedbackFilterBar` + `FacultyReportComments`.                                                                                                                                                                                                                                                             |
| `app.faculytics/features/faculty-analytics/components/questionnaire-type-tabs.tsx` (NEW)         | Secondary tab row: questionnaire types with submission-count badges + disabled tabs for zero-submission types. Shared between Scores and Feedback. URL-syncs `?questionnaireTypeCode=`.                                                                                                                                                                                         |
| `app.faculytics/features/faculty-analytics/components/feedback-filter-bar.tsx` (NEW)             | Sentiment chip row + topic dropdown. Chips toggle `?sentiment=`; dropdown toggles `?themeId=`. Gated empty/disabled state when no pipeline.                                                                                                                                                                                                                                     |
| `app.faculytics/features/faculty-analytics/components/headline-metrics-strip.tsx` (NEW, Phase B) | Compact row: overall rating (from `report.overallRating`), sentiment mini-bar (from `qualitativeSummary.sentimentDistribution`), response count (from `report.submissionCount`). Renders as null when data missing.                                                                                                                                                             |
| `app.faculytics/features/faculty-analytics/components/quantitative-scores-section.tsx`           | Change `defaultOpen` to `true` in Scores tab context, or remove collapse wrapper entirely for tabbed context (discuss in Step 3).                                                                                                                                                                                                                                               |
| `app.faculytics/features/faculty-analytics/components/faculty-report-comments.tsx`               | Keep list + pagination rendering. Filter UI lives in parent `FeedbackFilterBar`.                                                                                                                                                                                                                                                                                                |
| `app.faculytics/features/faculty-analytics/components/faculty-analysis-stats.tsx`                | Decide whether to move into Scores tab or feed its data into `headline-metrics-strip.tsx`. (Phase B).                                                                                                                                                                                                                                                                           |
| `app.faculytics/features/faculty-analytics/components/faculty-analysis-sentiment-strip.tsx`      | Stays inside Insights tab as the interactive filter control.                                                                                                                                                                                                                                                                                                                    |
| `app.faculytics/features/faculty-analytics/components/pipeline-trigger-card.tsx`                 | Remains above the tab row (header-level). Visible on all tabs — it is the pipeline status banner and role-gated CTA.                                                                                                                                                                                                                                                            |
| `app.faculytics/app/(dashboard)/faculty/analytics/page.tsx`                                      | Client component; uses `useMe().data.id` for `facultyId`. No change required (delegates to `FacultyReportScreen`).                                                                                                                                                                                                                                                              |
| `app.faculytics/app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx`                    | Server component; uses route param. No change.                                                                                                                                                                                                                                                                                                                                  |
| `app.faculytics/app/(dashboard)/campus-head/faculties/[facultyId]/analysis/page.tsx`             | Server component; uses route param. No change.                                                                                                                                                                                                                                                                                                                                  |
| `app.faculytics/components/shared/pagination-footer.tsx`                                         | Pagination primitive; reused as-is in `feedback-tab.tsx`.                                                                                                                                                                                                                                                                                                                       |
| `app.faculytics/docs/ARCHITECTURE.md`                                                            | Feature-slice rules (§8, §11) — must stay under the feature slice.                                                                                                                                                                                                                                                                                                              |

### Technical Decisions

1. **Tab mechanism:** shadcn `Tabs` with URL sync via `?view=insights|scores|feedback`. Default `insights` omitted from URL. No route changes. Rationale: matches house style and preserves all three role routes (`faculty/analytics/page.tsx`, `dean/.../analysis/page.tsx`, `campus-head/.../analysis/page.tsx`) delegating identically to `FacultyReportScreen`.

2. **Facet tabs relocation:** Move out of shared header into `insights-tab.tsx`. Facet is a qualitative-only lens (it slices `themes` + `recommendations.actions`); showing it on Scores or Feedback is misleading. View-model keeps `selectedFacet` state and `selectFacet` callback — only the render location changes.

3. **Feedback ignores facet.** Filters are sentiment chips + topic dropdown only. No third filter axis. (Facet param remains URL-preserved on tab switches so a user coming back to Insights retains their lens.)

4. **Shared `?questionnaireTypeCode=` URL param.** **Keep the existing key — do NOT rename to `qtype`.** The view-model already reads `searchParams.get("questionnaireTypeCode")` (`use-faculty-report-detail-view-model.ts:74`) via `resolveFacultyReportQuestionnaireTypeCode`. Renaming would break every existing bookmark and shared deep link with no offsetting benefit. Scores and Feedback both read from `?questionnaireTypeCode=`; `questionnaire-type-tabs.tsx` is the one component responsible for setting it. Param is omitted when value equals default (most-recent-with-data).

5. **Default questionnaire type:** "most-recent-with-data" — pick the type with the highest `submissionCount` for the current `semesterId` + `facultyId`. If tied, pick alphabetically by `code` for determinism. (Depends on decision §8 below for where the count list comes from.)

6. **Headline-metrics source mapping (Phase B):**
   - Overall rating → `viewModel.report.overallRating` + `overallInterpretation` (from `reportQuery`)
   - Sentiment mini-bar → `qualitativeSummary.sentimentDistribution` (from `qualitativeSummaryQuery`)
   - Response count → `viewModel.report.submissionCount`
     All three sources already populate the view-model; `headline-metrics-strip.tsx` is a render-only component that null-checks each input and degrades gracefully (e.g., render rating + count but skip mini-bar if no pipeline yet).

7. **Empty-state matrix:**

   | Tab      | No submissions                                                                                              | No pipeline run                                                                                                                                   | Pipeline running                                                                  | Pipeline COMPLETED + data                                                          |
   | -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
   | Insights | n/a (shared empty state from screen-level guard at `faculty-report-screen.tsx:181`)                         | Full empty state; pipeline-trigger card is primary CTA. No skeletons.                                                                             | Skeleton panels + trigger card transformed into status card (existing behavior).  | Renders full qualitative stack.                                                    |
   | Scores   | "No submissions for [period]" card inside Scores tab body (no pipeline CTA — scores don't need a pipeline). | Renders normally if submissions exist (scores don't depend on pipeline).                                                                          | Renders normally.                                                                 | Renders normally.                                                                  |
   | Feedback | "No submissions for [period]" same as Scores.                                                               | Raw comments list renders. Sentiment chips and topic dropdown disabled. Banner: "Run qualitative analysis to enable sentiment and topic filters." | Raw comments list renders; filters disabled; banner shows pipeline-running state. | Full filter UI enabled; topic dropdown populated from `qualitativeSummary.themes`. |

   This matrix is the design-time argument for peer tabs: **Feedback is the only tab usable pre-pipeline**, and conflating its empty state with Insights' pipeline-required empty state would degrade the demo.

8. **Questionnaire-type list source — OPEN DECISION (flag for user):**
   There is no existing endpoint that returns "list of questionnaire types with submission counts for this faculty in this semester." Options:
   - **(a) Add a small backend endpoint** `GET /analytics/faculty/:facultyId/questionnaire-types?semesterId=` → returns `Array<{ code, name, submissionCount }>`. Clean, single source of truth. Low-risk addition in `analytics.controller.ts` + `analytics.service.ts`. **Recommended.**
   - **(b) Derive client-side** by calling `GET /analytics/faculty/:facultyId/report?questionnaireTypeCode=X` for each known type and reading `submissionCount`. Wasteful (N requests per page load), brittle (requires knowing all type codes up-front), and mixes concerns.
   - **(c) Hardcode the list** of questionnaire types in the frontend with a separate count query per tab. Violates our "backend is source of truth" stance and rots when a new questionnaire type is added.

   **Recommendation: (a).** This adds a small backend task to Phase A but keeps the UX honest (real badge counts, real disabled states).

9. **`QuantitativeScoresSection` collapse:** In Scores tab, wrap either with `defaultOpen={true}` or remove the collapse chrome entirely. Prefer **removing collapse** inside the tab — the collapse was only there to hide quant from the one-pager first-glance, and that problem is solved by the tab split. Keep the component reusable by making collapse optional via prop (e.g., `collapsible?: boolean; defaultOpen?: boolean`).

10. **`PipelineTriggerCard` placement:** Remains above the tab row (header area), visible on all three tabs. It is the pipeline status banner + role-gated trigger and is orthogonal to the view lens.

11. **`showSentimentSurface` gate:** Continues to gate `FacultyAnalysisSentimentStrip` inside Insights tab only. Does not affect Scores or Feedback.

12. **Query behavior on tab switch:** No re-queries are triggered by `view` changes — all data queries key on `semesterId + facultyId + questionnaireTypeCode` (or pipeline scope). Tab switching is purely client-side routing through `router.replace`. This is a performance feature, not a risk.

13. **Role uniformity:** All three routes (Faculty, Dean, Campus Head) render the same `FacultyReportScreen` with the same tri-tab IA. Faculty self-view does not hide Feedback — comment anonymization is already enforced upstream (out of scope).

14. **Chairperson screen:** Left untouched. `FacultyEvaluationDetailScreen` continues to be used at `/chairperson/evaluation/[facultyId]`. Convergence is a separate epic.

15. **Internal phasing:** One ticket on `feat/fac-135`, two phases before demo:
    - **Phase A** — tri-tab split (view-model extension, 3 new tab-panel components, facet relocation, questionnaire-type-tabs component, feedback filter bar, new backend questionnaire-types endpoint per decision §8).
    - **Phase B** — headline-metrics strip in shared header.

16. **Observable URL param auto-correction.** When an invalid or stale URL param is corrected server-side by the view-model (e.g., `questionnaireTypeCode=COURSE_EVAL` requested but zero submissions in current semester → auto-corrected to `TEACH_EVAL`), the UI MUST render a **dismissible inline notice** in the affected tab explaining the substitution. Silent fallbacks are forbidden: they hide errors precisely at the moment stakeholders are clicking shared deep links. Applies to `questionnaireTypeCode`, `view` (unknown view values), and `themeLabel` (orphaned theme no longer in the current pipeline). Notice copy pattern: `The [requested] option is not available for this scope; showing [actual] instead.`

## Implementation Plan

Tasks are ordered by dependency (types → view-model → backend → hooks → components → screen refactor → polish). Phase A covers the tri-tab split and Feedback filter UI. Phase B adds the shared-header headline metrics strip.

### Tasks

#### Phase A — Tri-tab split + Feedback filter UI

- [ ] **Task 0 (PRECURSOR — blocks all UI work): Expand role guards on existing analytics endpoints to include FACULTY (self-only)**
  - Files:
    - `api.faculytics/src/modules/analytics/analytics.controller.ts`
    - `api.faculytics/src/modules/analytics/analytics.service.ts` (only if `validateFacultyScope` needs amending — see below)
  - **Why this is mandatory:** the controller-level `@UseJwtGuard` at `analytics.controller.ts:31-36` lists `UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN` only. **FACULTY is absent.** This means the entire `/faculty/analytics` route currently 403s for the user's own data. AC 14 (role uniformity) is untestable until this is fixed.
  - Action:
    1. The class-level guard cannot simply add `UserRole.FACULTY` because that would also widen the `overview`, `attention`, and `trends` endpoints to Faculty — undesirable. Instead, **per-method widening:** keep the class-level guard as-is, and add `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN, UserRole.FACULTY)` on the three methods `GetFacultyReport`, `GetFacultyReportComments`, `GetQualitativeSummary` to override.
    2. **In each of those three handlers**, before calling the service, add a self-only enforcement: `if (user.role === UserRole.FACULTY && user.id !== facultyId) throw new ForbiddenException();`. Extract a small helper (e.g., `assertFacultySelfScope(user, facultyId)`) in a shared util to avoid copy-paste rot.
    3. Audit `validateFacultyScope` in `analytics.service.ts` (around line 1269 per F10): currently it enforces department-membership, NOT self-only. Faculty role must be enforced as self-only at the controller layer (step 2) — do not weaken `validateFacultyScope` since other roles still need its department check.
    4. Apply the same self-only check pattern to the new endpoint added in Task 3.
  - Notes: Without this task, `/faculty/analytics` returns 403 across all three sub-tabs and the demo for Faculty self-view is dead. PR cannot merge without all three sibling endpoints + the new endpoint covered.

- [ ] **Task 1: Add `ReportView` type and constants**
  - File: `app.faculytics/features/faculty-analytics/types/index.ts`
  - Action: Export `type ReportView = "insights" | "scores" | "feedback"`, `REPORT_VIEW_ORDER: readonly ReportView[] = ["insights", "scores", "feedback"]`, `DEFAULT_REPORT_VIEW = "insights"`, and a `REPORT_VIEW_LABELS: Record<ReportView, string>` map with `"Insights" | "Scores" | "Feedback"`.
  - Notes: Mirror the shape already used for `Facet` types to keep patterns consistent.

- [ ] **Task 2: Add `resolveView` helper**
  - File: `app.faculytics/features/faculty-analytics/lib/faculty-report-detail.ts`
  - Action: Export `resolveView(raw: string | null): ReportView` that validates against `REPORT_VIEW_ORDER` and returns `DEFAULT_REPORT_VIEW` on invalid/missing input. Mirror the `resolveFacet` pattern.
  - Notes: No change to `buildFacultyReportHref` — it is already generic.

- [ ] **Task 3: Backend — add faculty questionnaire-types list endpoint (Decision §8 option a)**
  - Files:
    - `api.faculytics/src/modules/analytics/dto/responses/faculty-questionnaire-types.response.dto.ts` (NEW)
    - `api.faculytics/src/modules/analytics/dto/analytics-query.dto.ts` (extend)
    - `api.faculytics/src/modules/analytics/analytics.service.ts` (add service method — service is at module root, NOT in a `services/` subdir)
    - `api.faculytics/src/modules/analytics/analytics.controller.ts` (add controller route)
  - Action:
    - DTO: `FacultyQuestionnaireTypesResponseDto { items: Array<{ code: string; name: string; submissionCount: number }> }` with class-validator + mirrored Zod schema per belt-and-braces pattern.
    - Query DTO: `FacultyQuestionnaireTypesQueryDto { semesterId: string (UUID) }`.
    - Service: `GetAvailableFacultyQuestionnaireTypes(facultyId, semesterId)` — join `questionnaire_submission` to `questionnaire_type` filtered by faculty scope + semester; group by type code; count submissions; order by `submissionCount DESC, code ASC`; return only types with `submissionCount > 0` (keeps UI clean; no disabled tabs in v1).
    - Controller: `GET /analytics/faculty/:facultyId/questionnaire-types?semesterId=...` protected via per-method override `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD, UserRole.SUPER_ADMIN, UserRole.FACULTY)` (the class-level guard at `analytics.controller.ts:31-36` does NOT include FACULTY — same pattern Task 0 applies to sibling handlers).
    - **Authorization hardening (UNCONDITIONAL — do not skip):** `validateFacultyScope` in `analytics.service.ts` is a department-membership check, NOT a self-only check. Faculty role MUST be enforced as self-only at the controller layer using the shared helper introduced in Task 0 (`assertFacultySelfScope(user, facultyId)`) BEFORE calling the service. Apply this check verbatim to the new handler `GetAvailableFacultyQuestionnaireTypes`. Document the audit outcome in the PR description for reviewer confirmation.
  - Notes: Follow existing conventions in `analytics.controller.ts:77-131`.

- [ ] **Task 4: Frontend — API request + hook for questionnaire types**
  - Files:
    - `app.faculytics/features/faculty-analytics/api/faculty-analytics.requests.ts` (add `getFacultyQuestionnaireTypes` fn — this is the analytics-domain requests file, NOT `analysis-pipeline.requests.ts`)
    - `app.faculytics/features/faculty-analytics/types/index.ts` (add `FacultyQuestionnaireTypeOptionDto`)
    - `app.faculytics/features/faculty-analytics/hooks/use-faculty-questionnaire-types.ts` (NEW)
  - Action:
    - Request: typed `axios.get` hitting `/analytics/faculty/{facultyId}/questionnaire-types?semesterId=...`; return typed DTO.
    - Hook: `useFacultyQuestionnaireTypes({ facultyId, semesterId }, options?)` with `queryKey: ["faculty-analytics", "faculty-questionnaire-types", { facultyId, semesterId }, token]`; `enabled: Boolean(token) && Boolean(facultyId) && Boolean(semesterId)`.
    - **Coexistence note:** the existing `useQuestionnaireTypes()` hook (consumed at `use-faculty-report-detail-view-model.ts:88`) returns the **global** registry of all questionnaire types and is used by other consumers — leave it untouched. The new hook here returns **per-faculty per-semester** counts; both are needed and serve distinct purposes.
  - Notes: Match token-in-key convention of `use-faculty-report-comments.ts:21`.

- [ ] **Task 5: Extend view-model — `view` state, `questionnaireTypeCode` callback, and async-race fixes**
  - File: `app.faculytics/features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts`
  - Action:
    - Import `resolveView`, `ReportView`, `REPORT_VIEW_ORDER`, `DEFAULT_REPORT_VIEW`, and `useFacultyQuestionnaireTypes`.
    - Derive `selectedView = resolveView(searchParams.get("view"))`.
    - **`questionnaireTypeCode` URL key stays as-is** (per Decision §4). The view-model already reads `searchParams.get("questionnaireTypeCode")` (`use-faculty-report-detail-view-model.ts:74`) via `resolveFacultyReportQuestionnaireTypeCode`. No rename, no migration.
    - Call `useFacultyQuestionnaireTypes` (the new per-faculty + counts hook from Task 4) inside the view-model; expose `availableQuestionnaireTypes`, `questionnaireTypesQuery` (isLoading / isError). The pre-existing `useQuestionnaireTypes()` (`use-faculty-report-detail-view-model.ts:88`) returns the GLOBAL list of all questionnaire types and is used by other consumers — leave it untouched. The two hooks coexist with distinct purposes (global registry vs per-faculty per-semester counts).
    - Add callbacks: `selectView(next: ReportView)` → `updateSearchParams({ view: next === DEFAULT_REPORT_VIEW ? null : next })`; `selectQuestionnaireType(code: string | null)` → `updateSearchParams({ questionnaireTypeCode: code })`.
    - Include `selectedView`, `selectView`, `availableQuestionnaireTypes`, `selectQuestionnaireType` in the return payload.
    - **Theme filter — preserve existing label→id resolution.** The label↔id map (`labelToId` at `use-faculty-report-detail-view-model.ts:153-159`) and `resolvedThemeId` (line 161) are ALREADY implemented and feed `themeId` into the comments query (line 174). The URL param is `themeLabel` (`searchParams.get("themeLabel")`, line 86). **Keep both as-is.** No rename; no new lookup. Feedback filter UI (Task 7) consumes `resolvedThemeId` for active-state display and writes back to `themeLabel` via `updateThemeFilter`.
    - **Async race — `questionnaireTypeCode` must be derived, not stored.** Compute as `useMemo(() => searchParams.get("questionnaireTypeCode") ?? availableQuestionnaireTypes[0]?.code ?? null, [searchParams, availableQuestionnaireTypes])`. Gate downstream queries (`reportQuery`, `commentsQuery`) with `enabled: Boolean(questionnaireTypeCode) && !questionnaireTypesQuery.isLoading` so the empty state never flashes while the types list is still resolving.
    - **Re-scope the existing fallback `useEffect` (lines 179–196).** Today it auto-writes the chosen fallback `questionnaireTypeCode` into the URL via `router.replace`, which conflicts with AC 7 (default must NOT be written). Re-scope this effect to fire ONLY when `searchParams.get("questionnaireTypeCode")` is present AND does not match any code in `availableQuestionnaireTypes` (i.e., truly invalid input). When the param is simply missing, do nothing — the `useMemo` derivation handles defaulting in-memory without polluting the URL.
    - **Batched param updates.** Any callback that changes multiple URL params must issue **one** `updateSearchParams({...})` call, not serial calls. The existing `updateSentimentFilter` (`use-faculty-report-detail-view-model.ts:231-236`) already does this correctly — mirror its pattern. Specifically: the new theme filter and sentiment callbacks used by Task 7 MUST include `page: null` in the same updates object (e.g., `updateSearchParams({ sentiment: next, page: null })`). Serial calls cause flicker and double re-queries.
    - **Observable URL auto-correction.** When the re-scoped fallback effect fires (invalid `questionnaireTypeCode` in URL), expose a `questionnaireTypeCodeAutoCorrection: { requested: string; actual: string } | null` field on the view-model so UI can render a dismissible notice (Decision §16). Same field shape for orphaned `themeLabel` (replaces the existing `toast.info` at line 274 — see Task 7a).
  - Notes: Preserve existing return shape; add fields at the end of the returned object. State coupling between `qualitativeSummary.themes` and `recommendationsQuery` for facet derivation stays intact (Insights tab continues to consume both).

- [ ] **Task 6: New component — `questionnaire-type-tabs.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/questionnaire-type-tabs.tsx` (NEW)
  - Action: shadcn `Tabs` with `TabsList`/`TabsTrigger` only (no `TabsContent` — parent renders the body). Props: `types: FacultyQuestionnaireTypeOptionDto[]`, `selectedCode: string | null`, `onSelect: (code: string) => void`, `isLoading?: boolean`. Each trigger label is `{name} · {submissionCount}`. Skeleton when `isLoading`. If `types.length === 0`, render a short empty hint and no tab row.
  - Notes: Match visual style of `faculty-report-header.tsx:76-96` (flex-wrap, gap-1, text-xs). Reused in Scores and Feedback.

- [ ] **Task 7: New component — `feedback-filter-bar.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/feedback-filter-bar.tsx` (NEW)
  - Action: Horizontal row with:
    - Three sentiment chips (positive / neutral / negative) wired to `sentimentFilter` state; clicking toggles (single-select; clicking active chip clears).
    - Topic dropdown (shadcn `DropdownMenu` with radio items) populated from `themes: QualitativeThemeDto[]`; radio value is `themeId`; "All topics" option clears.
    - Clear-all button visible when any filter active.
  - Props: `themes: QualitativeThemeDto[]`, `sentimentFilter: SentimentLabel | null`, `resolvedThemeId: string | null` (active-state lookup), `onSentimentChange(next: SentimentLabel | null)`, `onThemeChange(label: string | null)` (writes to `themeLabel` URL param via existing `updateThemeFilter`), `disabled?: boolean`, `disabledReason?: string` (for banner).
  - When `disabled`, render chips + dropdown visually dimmed and non-interactive; render a small banner below with `disabledReason` (e.g., "Run qualitative analysis to enable sentiment and topic filters.").
  - **Stable `disabled` derivation** — the `disabled` value must come from `latestPipeline?.status !== "COMPLETED"` (stable, scope-keyed query), NOT from `livePipelineStatusQuery` (polling-keyed). Polling flips transiently and would disable chips mid-click.
  - Notes: View-model supplies state; this bar wires them. The label↔id mapping is already in the view-model (`labelToId` + `resolvedThemeId`) — no remapping in the bar. Filter callbacks must use single-call batched `updateSearchParams` (see Task 5 refinement); mirror existing `updateSentimentFilter` (`use-faculty-report-detail-view-model.ts:231-236`).

- [ ] **Task 7a: New component — `auto-correction-notice.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/auto-correction-notice.tsx` (NEW)
  - Action: shadcn `Alert` (`variant="default"`) with an inline dismiss button. Props: `requested: string`, `actual: string`, `paramLabel: string` (e.g., `"questionnaire"`, `"theme"`, `"view"`), `onDismiss(): void`. Copy pattern: `"The {requested} {paramLabel} is not available for this scope; showing {actual} instead."`. Local `useState` for dismissed (does not persist across navigation).
  - Rendered by: `insights-tab.tsx`, `scores-tab.tsx`, `feedback-tab.tsx` at the top of each tab body, conditional on the corresponding view-model field being non-null (`questionnaireTypeCodeAutoCorrection` and/or `themeLabelAutoCorrection`).
  - **Suppress the existing `toast.info` at `use-faculty-report-detail-view-model.ts:274`** that today fires when an orphaned `themeLabel` is corrected. The inline notice replaces it. Remove the `toast.info` call as part of Task 5 implementation.
  - Notes: Single component used for all auto-correction cases (`questionnaireTypeCode`, `view`, `themeLabel`). No new shadcn primitive required.

- [ ] **Task 8: New component — `insights-tab.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/insights-tab.tsx` (NEW)
  - Action: Extract from `faculty-report-screen.tsx` lines 191–270. Renders:
    - `<AutoCorrectionNotice />` at the top when `themeLabelAutoCorrection` is non-null (Task 7a)
    - Facet tabs (moved from header)
    - `FacultyAnalysisSentimentStrip` (gated on `showSentimentSurface`)
    - `ThemeExplorerList` + `RecommendationsCard` (gated on `showThemesSurface`)
    - Fallback `FacultyReportComments` when no themes but comments exist (preserve current behavior)
    - Empty state when pipeline not run: pipeline-trigger CTA + one-line explainer
  - **Preserve the existing four-branch ternary structure** from lines 215–270 (themes-with-data / no-themes-but-comments / pipeline-pending / empty). Do not collapse branches during extraction; each branch handles a distinct view-model state.
  - Props: all relevant fields from the view-model; no direct hook calls.
  - Notes: Facet tab rendering moves here; remove the facet JSX from `faculty-report-header.tsx` in Task 11.

- [ ] **Task 9: New component — `scores-tab.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/scores-tab.tsx` (NEW)
  - Action: Renders:
    - `QuestionnaireTypeTabs` (from Task 6)
    - `FacultyAnalysisStats` (optional — can also live in headline-metrics-strip in Phase B; keep here for Phase A)
    - `QuantitativeScoresSection` rendered WITHOUT collapse (see Task 12) — full-bleed chart + tables
    - Empty state: when `report.submissionCount === 0`, render "No submissions for [semester] · [questionnaireType]" card (no pipeline CTA)
  - Notes: Consumes `viewModel.report` for sections and `viewModel.selectedQuestionnaireTypeCode` / `availableQuestionnaireTypes` for tabs.

- [ ] **Task 10: New component — `feedback-tab.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/feedback-tab.tsx` (NEW)
  - Action: Renders:
    - `QuestionnaireTypeTabs` (same component as Scores, shares `?questionnaireTypeCode=`)
    - `FeedbackFilterBar` — disabled when pipeline not `COMPLETED`
    - `FacultyReportComments` with comments + pagination
    - Empty state: when `report.submissionCount === 0`, render "No submissions" card (no filter UI)
  - Notes: Feedback works pre-pipeline with filters disabled — this is the one tab that's always usable.

- [ ] **Task 11: Update `faculty-report-header.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/faculty-report-header.tsx`
  - Action:
    - **Remove** facet tab rendering (lines 76–96) and related props (`selectedFacet`, `onFacetChange`, `voiceBreakdown`) — they are now consumed by `insights-tab.tsx`.
    - **Keep** back button (lines 66–73), course dropdown (lines 98–129), export button (lines 131–139).
    - Header becomes view-agnostic.
  - Notes: The component's prop surface shrinks; update type declaration accordingly and adjust call site in Task 13.

- [ ] **Task 12: Update `quantitative-scores-section.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/quantitative-scores-section.tsx`
  - Action: Add optional `collapsible?: boolean` prop (default `true` to preserve current callers). When `collapsible === false`, render the chart + sections directly without the accordion chrome (skip the disclosure button). Pass `collapsible={false}` from `scores-tab.tsx` (Task 9).
  - Notes: Keep backward compatibility with any other caller; existing `defaultOpen` prop stays.

- [ ] **Task 13: Refactor `faculty-report-screen.tsx` to render Tabs**
  - File: `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx`
  - Action:
    - Replace the inline body (lines 149–290) with:
      1. Title + faculty name (HEADER — unchanged)
      2. `FacultyReportHeader` with reduced props (no facet)
      3. `PipelineTriggerCard` (stays above Tabs, visible on all views)
      4. shadcn `Tabs` with `value={viewModel.selectedView} onValueChange={viewModel.selectView}` and three `TabsContent`:
         - `<TabsContent value="insights"><InsightsTab ... /></TabsContent>`
         - `<TabsContent value="scores"><ScoresTab ... /></TabsContent>`
         - `<TabsContent value="feedback"><FeedbackTab ... /></TabsContent>`
    - Preserve screen-level guards (lines 107–145) and `hasAnalyticsData` empty state (line 181) as outer wrappers around the Tabs — if no semester context or report errored, do NOT render the tab row.
    - TabsList labels use `REPORT_VIEW_LABELS` (from Task 1).
  - Notes: Keep all existing hook calls and viewModel wiring; just reshape the render tree.

- [ ] **Task 14: Verify role route pages**
  - Files:
    - `app.faculytics/app/(dashboard)/faculty/analytics/page.tsx`
    - `app.faculytics/app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx`
    - `app.faculytics/app/(dashboard)/campus-head/faculties/[facultyId]/analysis/page.tsx`
  - Action: No code changes expected. Confirm each page still passes `facultyId` to `FacultyReportScreen` and renders without TS errors. Faculty route remains client; Dean + Campus Head remain server. **Grep `features/faculty-analytics/components/faculty-report-screen.tsx` for `"use client"` and confirm the directive is still present** — server-page → client-component delegation only works if `FacultyReportScreen` declares it. If a refactor in this spec accidentally removed it, restore.
  - Notes: Sanity check only.

#### Phase B — Shared-header headline metrics strip

- [ ] **Task 15: New component — `headline-metrics-strip.tsx`**
  - File: `app.faculytics/features/faculty-analytics/components/headline-metrics-strip.tsx` (NEW)
  - Action: Compact horizontal strip rendering three cells:
    - Overall rating (numeric + interpretation badge) — source `viewModel.report.overallRating` + `overallInterpretation`
    - Sentiment mini-bar (3-segment horizontal bar) — source `viewModel.qualitativeSummary.sentimentDistribution`; render `null` if absent
    - Response count — source `viewModel.report.submissionCount`
  - Null-safe: each cell degrades individually if its data is missing; entire strip renders nothing only if all three are absent.

- [ ] **Task 16: Insert headline metrics at screen level**
  - File: `app.faculytics/features/faculty-analytics/components/faculty-report-screen.tsx`
  - Action: Render `<HeadlineMetricsStrip ... />` directly inside `FacultyReportScreen`, **between the faculty-name line and the `<FacultyReportHeader />` element** (not inside `FacultyReportHeader`). Visible on all three tabs.
  - **Why screen-level (not inside the header):** `FacultyReportHeader` already owns its own responsive layout (back button, course dropdown, export). Mixing a metrics strip into it would force re-layout of those breakpoints. Keeping the strip at the screen level is the boring, isolated choice and matches the existing composition pattern.
  - Notes: Drop `FacultyAnalysisStats` from `scores-tab.tsx` once this lands — the Phase-B strip supersedes it for headline metrics. Per-section detail in the Scores tab is unaffected.

- [ ] **Task 17: Final QA & polish**
  - Action:
    - Run `bun run typecheck` — zero errors.
    - Run `bun run lint` — zero errors.
    - Manual QA per the Testing Strategy checklist below.
    - Verify URL persistence: open `/dean/faculties/{id}/analysis?view=feedback&questionnaireTypeCode=TEACH_EVAL&sentiment=negative` directly; state hydrates correctly.
    - Verify browser back/forward works across tab switches.

### Acceptance Criteria

- [ ] **AC 1: Default view.** Given a stakeholder opens `/dean/faculties/{id}/analysis` with no query params, when the page loads, then the Insights tab is active and the URL does NOT contain `?view=`.

- [ ] **AC 2: Tab switching.** Given the Insights tab is active, when the stakeholder clicks the Scores tab, then the URL updates to include `?view=scores` (preserving any other existing query params) and the Scores body renders.

- [ ] **AC 3: Deep link persistence.** Given a URL `/dean/faculties/{id}/analysis?view=feedback&questionnaireTypeCode=TEACH_EVAL&sentiment=negative`, when the page loads, then the Feedback tab is active, the `TEACH_EVAL` questionnaire type is selected, and the negative sentiment chip is active.

- [ ] **AC 3a: Observable auto-correction on invalid URL params (3 cases).**
  - **Case A — invalid `questionnaireTypeCode`:** Given a deep link with `questionnaireTypeCode=COURSE_EVAL` where that type has zero submissions in the current semester, when the page loads, then the auto-corrected default type renders AND `<AutoCorrectionNotice />` appears inside the active tab body with copy "The COURSE_EVAL questionnaire is not available for this scope; showing TEACH_EVAL instead.".
  - **Case B — orphaned `themeLabel`:** Given a deep link with `themeLabel=<obsolete-label>` that no longer exists in the current pipeline's themes, when Insights or Feedback loads, then the filter clears AND `<AutoCorrectionNotice />` appears with the analogous copy. The pre-existing `toast.info` at `use-faculty-report-detail-view-model.ts:274` is removed and replaced by this notice.
  - **Case C — invalid `view`:** Given a deep link with `view=Feedback` (wrong case) or any unknown value, when the page loads, then `selectedView` falls back to `insights` AND `<AutoCorrectionNotice />` renders explaining the fallback.
  - In all three cases, the notice is dismissible and does not re-appear after dismiss within the same navigation.

- [ ] **AC 4: Facet inside Insights only.** Given the stakeholder is on Insights with `?facet=facultyFeedback`, when they switch to Scores, then the facet tabs are NOT rendered on Scores; when they return to Insights, then `facet=facultyFeedback` remains selected (URL param preserved across tab switches).

- [ ] **AC 5: Shared `questionnaireTypeCode` across Scores and Feedback.** Given the stakeholder is on Scores with `?questionnaireTypeCode=TEACH_EVAL`, when they switch to Feedback, then Feedback also shows `TEACH_EVAL` selected in its questionnaire-type tabs, and the comments list and filter bar are scoped to `TEACH_EVAL`.

- [ ] **AC 6: Questionnaire-type badge counts.** Given the API endpoint `GET /analytics/faculty/:facultyId/questionnaire-types?semesterId=...` returns `[{ code: "TEACH_EVAL", name: "Teaching Eval", submissionCount: 142 }, { code: "COURSE_EVAL", name: "Course Eval", submissionCount: 98 }]`, when the Scores or Feedback tab is active, then both type tabs are rendered with counts `142` and `98` displayed as trailing numbers.

- [ ] **AC 7: Default questionnaire type = most recent with data.** Given no `questionnaireTypeCode` is in the URL and the API returns types `[{TEACH_EVAL, 142}, {COURSE_EVAL, 98}]`, when Scores or Feedback loads, then `TEACH_EVAL` is auto-selected (highest submission count) without being written to the URL; when the stakeholder explicitly selects `COURSE_EVAL`, then the URL updates to `?questionnaireTypeCode=COURSE_EVAL`.

- [ ] **AC 7a: Skeleton while questionnaire-types list is loading.** Given the questionnaire-types endpoint is still in-flight on a fresh page load, when the Scores or Feedback tab is active, then a skeleton is rendered (not the "No submissions" empty state); when the endpoint resolves, then the default questionnaire type auto-selects and `reportQuery` / `commentsQuery` fire exactly once — no empty-state flash occurs.

- [ ] **AC 8: Feedback filters — pipeline gated.** Given no pipeline has run (or latest status ≠ `COMPLETED`), when the Feedback tab loads, then the sentiment chips and topic dropdown are rendered disabled with a banner "Run qualitative analysis to enable sentiment and topic filters.", AND the comments list still renders with raw comments (no sentiment/theme metadata).

- [ ] **AC 9: Feedback filters — active.** Given the latest pipeline is `COMPLETED` with themes, when the stakeholder clicks the "positive" sentiment chip, then the URL updates to `?sentiment=positive`, the chip is visibly active, and the comments list re-fetches with `sentiment=positive`. When they then select a topic from the dropdown, the URL includes `?themeLabel={label}` (the existing key) and the comments query re-fetches with the resolved `themeId` derived in the view-model.

- [ ] **AC 9a: New theme-filter callback resets pagination in a single navigation.** Given the Feedback tab is active on page 3 with filters enabled, when the stakeholder selects a topic from the dropdown (the new callback added in Task 7), then a SINGLE navigation occurs that both sets `themeLabel=<label>` AND removes `page` from the URL (resetting to page 1); the scroll position does not jump and only one comments query fires. The callback must mirror the existing `updateSentimentFilter` pattern at `use-faculty-report-detail-view-model.ts:231-236`, which already batches correctly — do not introduce a second pattern.

- [ ] **AC 10: Insights empty state (no pipeline).** Given no pipeline has run for the scope, when the Insights tab is active, then a full empty state is rendered with the pipeline-trigger CTA and a single-line explainer — no skeletons of themes/recommendations are shown.

- [ ] **AC 11: Scores empty state (no submissions).** Given `report.submissionCount === 0` for the selected questionnaire type, when the Scores tab is active, then an empty-state card "No submissions for [semester] · [questionnaireType]" is rendered; no pipeline trigger is shown (scores do not depend on a pipeline).

- [ ] **AC 12: Feedback usable pre-pipeline.** Given no pipeline has run and at least one submission with comments exists, when the Feedback tab is active, then the raw comments list renders (without sentiment badges or theme chips), with pagination functional, and with the filter bar disabled.

- [ ] **AC 13: Pipeline trigger card visibility.** Given the stakeholder has permission to trigger a pipeline, when any tab is active, then `PipelineTriggerCard` is rendered above the Tabs row.

- [ ] **AC 14: Role uniformity.** Given the three routes `/faculty/analytics`, `/dean/faculties/{id}/analysis`, `/campus-head/faculties/{id}/analysis`, when each is loaded for the same underlying faculty, then all three render the same three-tab IA with identical control availability.

- [ ] **AC 14a: Faculty self-only authorization on questionnaire-types endpoint.** Given a Faculty user authenticated as Faculty-A, when they issue `GET /analytics/faculty/{facultyB_id}/questionnaire-types?semesterId=...` (where Faculty-B ≠ Faculty-A), then the API responds with HTTP 403 and does not leak submission counts. Given the same user requests their own `facultyId`, then the API responds with HTTP 200 and the expected list.

- [ ] **AC 15: Chairperson untouched.** Given `/chairperson/evaluation/{facultyId}`, when the page loads, then it continues to render `FacultyEvaluationDetailScreen` (not `FacultyReportScreen`) — no change in behavior.

- [ ] **AC 16: Typecheck & lint.** Given the implementation is complete, when `bun run typecheck` and `bun run lint` run, then both exit with zero errors.

- [ ] **AC 17 (Phase B): Headline metrics visible across tabs.** Given a semester with a completed report and pipeline, when the stakeholder switches between Insights, Scores, and Feedback, then the headline metrics strip (overall rating, sentiment mini-bar, response count) stays visible and does not flicker or reload.

- [ ] **AC 18 (Phase B): Headline metrics null-safety.** Given a faculty with submissions but no pipeline run, when any tab is loaded, then the rating + response count cells render, and the sentiment mini-bar cell is omitted without breaking layout.

## Additional Context

### Dependencies

- **Predecessor:** `tech-spec-aggregate-scope-pipeline-rework.md` (merged; provides `{scopeType, scopeId}` pipeline scope and tiered scheduler). This spec builds directly on that view-model and endpoints.
- **Backend endpoint (Phase A, Task 3):** New `GET /analytics/faculty/:facultyId/questionnaire-types?semesterId=` is the only backend addition. All other API endpoints already exist: `qualitative-summary`, `report`, `report/comments` (with `sentiment` + `themeId` + pagination).
- **No external libraries added.** All shadcn primitives (Tabs, DropdownMenu, Button) are already installed.
- **No new env vars.**
- **Feature branch:** `feat/fac-135`.

### Testing Strategy

**Automated:** Clean slate — no existing test pattern under `features/faculty-analytics/`. Defer automated tests for this spec unless a house pattern emerges mid-implementation. Enforce correctness via:

- `bun run typecheck`
- `bun run lint`
- `bun run build` (smoke check)

**Backend (Task 3):** If time allows, add a unit test for the new `GetAvailableQuestionnaireTypes` service method using NestJS TestingModule + Jest mocks per existing `analytics.service` test pattern (if present; else skip).

**Manual QA checklist** (run before demo):

- [ ] Open each of the three role routes for the same faculty; confirm identical tri-tab IA.
- [ ] Switch through Insights / Scores / Feedback; URL updates correctly (default `insights` omitted).
- [ ] Paste a deep link `?view=feedback&questionnaireTypeCode=<code>&sentiment=negative`; state hydrates on fresh load.
- [ ] **Malformed deep links degrade visibly, not silently:**
  - `?view=Feedback` (bad case) → falls back to Insights (no noise) OR renders a small notice (per Decision §16).
  - `?questionnaireTypeCode=NONEXISTENT_CODE` → Scores/Feedback auto-correct to default AND render the dismissible auto-correction notice.
  - `?themeId=<uuid-not-in-current-pipeline>` → Feedback filter bar clears the orphaned theme and shows the auto-correction notice.
- [ ] **Async race check:** hard-refresh Scores tab with DevTools network throttled (Slow 3G). Confirm a skeleton renders during the types-list fetch, NOT an empty "No submissions" state. Confirm no empty-state flash at the transition.
- [ ] **Filter flicker check:** on Feedback page 3, click a sentiment chip. Verify (a) scroll position does not jump, (b) DevTools Network shows a single comments request (not two), (c) URL transitions directly from `?view=feedback&page=3` to `?view=feedback&sentiment=<x>` (no intermediate state with both).
- [ ] **Authorization probe:** signed in as Faculty-A, hit `GET /analytics/faculty/{facultyB_id}/questionnaire-types?semesterId=...` via curl/Postman. Expect HTTP 403. Also confirm sibling endpoints (`report`, `comments`, `qualitative-summary`) behave identically for Faculty role — if any of those return 200 for a cross-faculty probe, audit `validateFacultyScope()` before considering this spec's work complete.
- [ ] Use browser back/forward across tab switches; history behaves.
- [ ] Scores tab: verify questionnaire-type tabs render with real submission counts; switch types and verify sections re-render.
- [ ] Feedback tab with completed pipeline: toggle sentiment chips and topic dropdown; list re-fetches with expected filters; clear-all resets URL.
- [ ] Feedback tab pre-pipeline: raw list renders; filters disabled with banner; pagination works.
- [ ] Scores tab with zero submissions: empty card renders; no pipeline CTA.
- [ ] Insights tab with no pipeline: full empty state with pipeline-trigger CTA.
- [ ] Verify export PDF button still works (no regression from header refactor).
- [ ] Faculty self-view: confirm no route-specific regressions.
- [ ] Phase B: headline metrics visible across all tabs; degrade gracefully when data absent.

### Notes

**High-risk items (pre-mortem):**

1. **(Resolved — already in place.)** Earlier drafts flagged a `themeLabelFilter` vs `themeId` mismatch, but inspection of `use-faculty-report-detail-view-model.ts:153-161` shows the label↔id resolution is already implemented (`labelToId` map + `resolvedThemeId`). Task 5 preserves this; Task 7 consumes `resolvedThemeId` for filter-bar active state.

2. **Questionnaire-type endpoint scope-validation correctness.** The new endpoint must enforce `validateFacultyScope()` identically to sibling endpoints (`report`, `comments`, `qualitative-summary`). Copy the pattern verbatim and verify during Task 3.

3. **State coupling in Insights.** `qualitativeSummary.themes` + `recommendationsQuery.data.actions` jointly feed `deriveThemeFacets()`. Extracting Insights into its own component must preserve this coupling; regressions would break facet badge counts or recommendation filtering.

4. **Server/client component boundary.** Dean + Campus Head pages are server components; Faculty is client. `FacultyReportScreen` is a client component today — that remains unchanged. Verify no new hook calls leak into the server pages (Task 14).

5. **Demo timing.** Phase B (headline metrics) is demo-wanted. If mid-implementation reveals layout complexity, it is safe to ship Phase A alone and add Phase B in a follow-up commit on the same branch — the tabs will still read well without the metrics strip.

**Known limitations:**

- No aggregate-across-all-questionnaire-types view for Scores or Feedback. Mixing instruments produces meaningless averages and noisy comment sets.
- Faculty self-view of Feedback shows unanonymized comments if upstream anonymization is not already applied; verify during QA.
- No automated test coverage for the new components. Clean-slate tradeoff.

**Future considerations (out of scope):**

- Converging Chairperson's `FacultyEvaluationDetailScreen` onto `FacultyReportScreen`.
- Cross-faculty comment browser (department-level).
- Comment export / CSV download from Feedback tab.
- "All questionnaire types" aggregation (requires API change).
- Per-question drill-down modal from Scores tab.
- Headline metrics trend arrows vs prior semester (requires a new comparison endpoint).
