---
title: 'FAC-130 refactor: aggregate analytics materialized view by faculty home department'
slug: 'fac-130-analytics-mv-home-department'
created: '2026-04-13'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - NestJS 11
  - MikroORM (PostgreSQL)
  - PostgreSQL 15
  - BullMQ (analytics-refresh queue)
files_to_modify:
  - src/migrations/<new-timestamp>_fac-130-mv-home-department.ts
files_to_reference:
  - src/migrations/Migration20260412153923_fix-deleted-at-type.ts # CURRENT MV source-of-truth (NOT 20260322)
  - src/migrations/Migration20260413125358_add-faculty-department-snapshot-to-submissions.ts
  - src/entities/questionnaire-submission.entity.ts
  - src/modules/analytics/analytics.service.ts
  - src/modules/analytics/processors/analytics-refresh.processor.ts
  - src/modules/analytics/analytics.service.spec.ts
  - src/modules/analytics/processors/analytics-refresh.processor.spec.ts
  - docs/architecture/analytics.md
code_patterns:
  - MikroORM raw-SQL migration (addSql DROP + CREATE MATERIALIZED VIEW)
  - MV recreation pattern from Migration20260412153923 (private readonly MV_* constants)
  - Drop trends → stats; recreate stats → trends (dependency order)
  - REFRESH CONCURRENTLY requires retained unique indexes
test_patterns:
  - Jest unit tests via NestJS TestingModule with em.execute jest.fn mocks
  - SQL assertion tests checking query strings (see analytics.service.spec.ts:374-403)
  - Processor spec asserts refresh order (analytics-refresh.processor.spec.ts:78-79)
  - Contract-shape assertions on /analytics response DTOs (unchanged by this work)
---

# Tech-Spec: FAC-130 refactor: aggregate analytics materialized view by faculty home department

**Created:** 2026-04-13

## Overview

### Problem Statement

`mv_faculty_semester_stats` currently aggregates submissions by `qs.department_code_snapshot`, which is the course-owner department at submission time. Under the scope-resolution philosophy finalized in FAC-125/127/128/129, the correct aggregation axis is the **faculty's institutional home department** — the department the faculty belongs to, not the department that owns the course being evaluated. Dean dashboards therefore show inflated or misplaced faculty rows whenever a faculty member teaches outside their home department.

FAC-128 already snapshot the faculty's home department onto every new submission as `faculty_department_id` / `faculty_department_code_snapshot` / `faculty_department_name_snapshot`. Historical submissions predating that migration have NULL values in those columns. This issue completes the behavior rewire by recreating the MV to group by the home-department snapshot, with a COALESCE fallback to the legacy course-owner column so historical dashboards remain readable.

### Solution

Write a single MikroORM migration that:

1. Drops `mv_faculty_trends` and `mv_faculty_semester_stats` in reverse dependency order.
2. Recreates `mv_faculty_semester_stats` using `COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot)` as the grouping key, reusing the **same column name** `department_code_snapshot` in the MV to keep the service and DTO contracts untouched. The `MODE() WITHIN GROUP` input for the name column is also COALESCEd so code/name labels stay consistent.
3. Recreates `mv_faculty_trends` unchanged — it transitively picks up the new semantics because it reads from the parent MV's `department_code_snapshot` column.
4. Recreates the two unique indexes and two lookup indexes identical to the originals.
5. Runs `REFRESH MATERIALIZED VIEW` for both and leaves a parameterized side-by-side verification query in the spec for PR evidence.

No application code changes are required: the MV column names, DTO field names, service query shapes, and public `/analytics/*` contracts stay identical. The semantic change is confined to the MV body.

### Scope

**In Scope:**

- New migration in `src/migrations/` that drops and recreates both `mv_faculty_semester_stats` and `mv_faculty_trends`.
- `COALESCE(faculty_department_code_snapshot, department_code_snapshot)` for the grouping key.
- `COALESCE(faculty_department_name_snapshot, department_name_snapshot)` as input to `MODE() WITHIN GROUP` for the name column.
- Recreation of `idx_sr_submission_processed`, `uq_mv_faculty_semester_stats`, `idx_mv_fss_dept_semester`, `uq_mv_faculty_trends`, `idx_mv_ft_dept` (identical to originals).
- Semantic comment inside the migration documenting the new home-department semantics.
- A parameterized side-by-side verification SQL snippet embedded in the spec for PR-description evidence.
- Unit/contract test notes: smoke tests for `/analytics/departments/overview` returning the unchanged response shape; acceptance cases covering the snapshot-present vs. snapshot-null aggregation split.

**Out of Scope:**

- Renaming the MV column from `department_code_snapshot` to anything like `home_department_code` (explicitly rejected in Party Mode — would ripple into DTOs, frontend, caches).
- Switching the grouping key from codes to ids (`faculty_department_id`) (rejected — existing public contract and `ResolveDepartmentCodes` flow speak in codes; this would be a full refactor).
- Zero-downtime `_v2` MV swap (rejected — REFRESH on this dataset is sub-second; ceremony not worth it).
- Backfilling `faculty_department_*` snapshot columns on historical submissions (handled — if ever — by a future ticket; COALESCE fallback is the deliberate stand-in).
- Any change to `src/modules/analytics/analytics.service.ts` (no call sites need updating; column names are preserved).
- Any change to frontend (`app.faculytics/`) or admin console — the analytics contract is unchanged.

## Context for Development

### Codebase Patterns

- **MV recreation migrations** follow the pattern in `Migration20260412153923_fix-deleted-at-type.ts:7-100`: define MV bodies as `private readonly MV_*` string constants on the migration class, then issue `this.addSql(...)` calls. Same constants are reused in both `up()` and `down()`. Replicate this shape exactly.
- **NOTE: `idx_sr_submission_processed` is NOT touched** by this migration. It is a covering index on `sentiment_result` (a real table, not an MV), introduced by `Migration20260322120000`. It survived the 0412 MV recreation because dropping a materialized view does not affect indexes on unrelated tables. Same here — leave it alone.
- **Drop order matters.** `mv_faculty_trends` FROMs `mv_faculty_semester_stats`, so drop trends first, then stats. Re-create stats first (with its unique index), then trends (with its unique index).
- **Index naming convention.** Reuse the existing names exactly: `uq_mv_faculty_semester_stats`, `idx_mv_fss_dept_semester`, `uq_mv_faculty_trends`, `idx_mv_ft_dept`. Downstream `REFRESH CONCURRENTLY` in `analytics-refresh.processor.ts` relies on the two unique indexes; monitoring and manual scripts rely on the lookup indexes.
- **Soft-delete predicate** is applied explicitly in the MV body via `WHERE qs.deleted_at IS NULL` — MikroORM's global soft-delete filter does NOT run inside raw SQL MV definitions. Keep every existing `deleted_at IS NULL` predicate intact. Note: as of migration 0412, `deleted_at` on every `CustomBaseEntity` table is now `timestamptz` — no predicate change needed.
- **MikroORM snapshot drift caveat** (project memory): this team has repeatedly hit false-positive migration diffs caused by partial-index expression comparison. Verify with `npx mikro-orm migration:check` **not** `migration:create --dump`. Do not let the snapshot regenerate spuriously — only this one handwritten migration should land. No entity changes are made by this ticket, so `migration:check` should report "no pending changes" both before and after writing the handwritten migration file.
- **Test pattern.** Service unit tests mock `em.execute` with `jest.fn()` and assert on the SQL string passed. Since we are NOT changing the SQL that `analytics.service.ts` issues, existing specs stay green. For the MV behavior itself, we add an **integration-style SQL verification** — a runnable snippet against a seeded fixture (or the staging DB) rather than a Jest test, since MV state isn't easily unit-testable.

### Files to Reference

| File                                                                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/migrations/Migration20260412153923_fix-deleted-at-type.ts:7-100`                      | **CURRENT source-of-truth for the MV bodies.** The 0412 migration dropped both MVs to alter `deleted_at` from varchar to timestamptz, then recreated them verbatim. Base the new migration's MV bodies on the `MV_FACULTY_SEMESTER_STATS` and `MV_FACULTY_TRENDS` string constants here — NOT on the earlier `Migration20260322120000`. Replicating the `private readonly` constant pattern keeps both up()/down() identical.          |
| `src/migrations/Migration20260413125358_add-faculty-department-snapshot-to-submissions.ts` | Confirms the three FAC-128 snapshot columns exist on `questionnaire_submission` as nullable: `faculty_department_id` (FK), `faculty_department_code_snapshot`, `faculty_department_name_snapshot`.                                                                                                                                                                                                                                     |
| `src/entities/questionnaire-submission.entity.ts:83-105`                                   | Authoritative property names + nullability. The existing `@Index({ properties: ['facultyDepartment', 'semester'] })` indexes the FK **id** column — it does NOT accelerate the MV's `COALESCE(faculty_department_code_snapshot, department_code_snapshot)` grouping expression. An expression index on the COALESCE itself is the mitigation listed in risk 2; we start without it and add only if timing (Task 7) shows a regression. |
| `src/modules/analytics/analytics.service.ts`                                               | Consumes both MVs across three methods. References: `GetDepartmentOverview` L74-187, `GetAttentionList` L189-430 (five MV references in subqueries L244-253, L349, L400), `GetFacultyTrends` L432+. All filter on `department_code_snapshot` / `program_code_snapshot`. **No changes required** because TD-2 preserves column names.                                                                                                   |
| `src/modules/analytics/analytics.service.spec.ts:374-403`                                  | Existing tests assert SQL strings contain `JOIN mv_faculty_semester_stats`. Still pass — not touched.                                                                                                                                                                                                                                                                                                                                  |
| `src/modules/analytics/processors/analytics-refresh.processor.ts:30-39`                    | Issues `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats` then `mv_faculty_trends`. Requires unique indexes on both. Our migration preserves both unique indexes verbatim.                                                                                                                                                                                                                                             |
| `src/modules/analytics/processors/analytics-refresh.processor.spec.ts:78-79`               | Asserts refresh order. Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/architecture/analytics.md:28-30, 46-48, 120`                                         | Documents MV granularity as "one row per (faculty_id, semester_id, department_code_snapshot)" and the scope-resolution rationale. **Needs a one-paragraph semantic update after merge** clarifying that `department_code_snapshot` now resolves to the faculty's home department (COALESCE fallback for historical). Flagged in PR description; not part of this migration PR unless deadline permits.                                 |

### Technical Decisions

**TD-1. Grouping key: code, not id.** The MV keys on `COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot)`, not on the id variant. Rationale: the entire downstream path — the unique index, `mv_faculty_trends`, every filter in `analytics.service.ts`, `ResolveDepartmentCodes()`, and the public `DepartmentOverviewQueryDto.programCode` — operates on codes. Switching to ids would be a full refactor disguised as a bug fix.

**TD-2. Column name unchanged.** The MV's grouping column remains `department_code_snapshot`. We change the _expression_ populating it, not its identifier. A SQL comment inside the migration documents the new semantics. Rationale: renaming would propagate into `FacultySemesterStatsDto.departmentCode`, the frontend response typing, any analytics caches, and the unique index name — all churn for zero functional benefit.

**TD-3. Name snapshot also COALESCEd.** `MODE() WITHIN GROUP (ORDER BY COALESCE(qs.faculty_department_name_snapshot, qs.department_name_snapshot))` so the `department_code_snapshot` and `department_name_snapshot` columns in the MV always describe the same department. Without this, a new row keyed on `MATH-HOME` could surface a `department_name_snapshot` of `"Computer Science"` because `MODE` would pick the historical course-owner name.

**TD-4. Drop + Create, not v2 swap.** The migration does `DROP MATERIALIZED VIEW IF EXISTS` then `CREATE MATERIALIZED VIEW`. Rationale: REFRESH on this dataset is sub-second to a few seconds in current production volume; a `_v2 + ALTER...RENAME` dance adds ceremony for an invisible gap. Acceptance criterion still requires deploying during a low-traffic window, matching the issue's rollout plan.

**TD-5. No application code change.** Because TD-2 preserves the column name, `src/modules/analytics/analytics.service.ts` needs zero edits. The issue body's reference to editing `src/modules/analysis/services/analytics.service.ts:74-149` is stale — (a) the path is wrong (it's `src/modules/analytics/`), and (b) there's nothing to change there anyway. This will be called out in the PR description.

**TD-6. Verification query parameterized.** The PR-description side-by-side query must be runnable by whoever reviews, without picking a specific dean at spec time. See _Testing Strategy_ below for the exact snippet.

### Ready-for-Dev Context from FAC-125 Design Discussion

FAC-128 snapshots `faculty.department` (the repurposed institutional field) onto every new submission. That column is the faculty's _institutional home department_ — **not** the course-owner department. The split was the whole point of the FAC-125 party-mode design. This MV update is the last visible surface that still keys on the old axis; after this ships, every dean-facing aggregation reflects the new philosophy consistently.

## Implementation Plan

### Tasks

- [x] **Task 1: Preflight — confirm clean schema tree**
  - File: _n/a (command-only)_
  - Action: Run `npx mikro-orm migration:check` from `api.faculytics/`. MUST report `No changes required, schema is up-to-date` before writing the new migration file.
  - Notes: Guards against the MikroORM snapshot-drift class of bugs recorded in `project_mikro_orm_snapshot_drift.md` / `project_mikroorm_diff_behavior.md`. If this command reports a pending diff, stop and investigate — do NOT let the snapshot regenerate; do NOT use `migration:create --dump`.

- [x] **Task 2: Create the handwritten migration file**
  - File: `src/migrations/<timestamp>_fac-130-mv-home-department.ts` (replace `<timestamp>` with the current `YYYYMMDDHHmmss`, matching the pattern of existing files; e.g. `Migration20260413170000_fac-130-mv-home-department.ts`)
  - Action: Create a new MikroORM migration class `export class Migration<timestamp> extends Migration`.
  - Notes: Write by hand — do NOT use `migration:create`. Use file `Migration20260412153923_fix-deleted-at-type.ts:7-100` as the baseline for MV body shape (it is the current source-of-truth, not `Migration20260322120000`).

- [x] **Task 3: Define MV bodies as `private readonly` string constants**
  - File: same as Task 2
  - Action: Add **three** `private readonly` string properties on the migration class:

    **a) `MV_FACULTY_SEMESTER_STATS`** — copy of `Migration20260412153923`'s `MV_FACULTY_SEMESTER_STATS` string with exactly **five** changes:
    1. **`topic_counts` CTE grouping key (first place, inside the CTE's SELECT list).** Change `qs.department_code_snapshot,` to:

       ```sql
       COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot) AS department_code_snapshot,
       ```

    2. **`topic_counts` CTE GROUP BY.** Change `GROUP BY qs.faculty_id, qs.semester_id, qs.department_code_snapshot` to:

       ```sql
       GROUP BY qs.faculty_id, qs.semester_id, COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot)
       ```

       Rationale (F2 fix): the CTE's grouping axis must match the outer query's grouping axis, otherwise the LEFT JOIN produces row-multiplication that `MAX()` then collapses into a join artifact. Re-keying the CTE gives a correct distinct-topic count under the new home-department axis.

    3. **Outer SELECT third column.** Change `qs.department_code_snapshot,` (the third selected column of the outer SELECT) to:

       ```sql
       COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot) AS department_code_snapshot,
       ```

    4. **Outer SELECT `department_name_snapshot` MODE input.** Change:

       ```sql
       MODE() WITHIN GROUP (ORDER BY qs.department_name_snapshot) AS department_name_snapshot,
       ```

       to:

       ```sql
       MODE() WITHIN GROUP (ORDER BY COALESCE(qs.faculty_department_name_snapshot, qs.department_name_snapshot)) AS department_name_snapshot,
       ```

    5. **Outer GROUP BY.** The source at `Migration20260412153923:67-69` has a multi-line GROUP BY:

       ```sql
       GROUP BY
         qs.faculty_id, qs.semester_id,
         qs.department_code_snapshot;
       ```

       Change ONLY the last line `qs.department_code_snapshot;` to:

       ```sql
       COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot);
       ```

       Do NOT reformat the whole GROUP BY onto one line.

    6. **Also update the LEFT JOIN predicate** on the `topic_counts` CTE. The source has:
       ```sql
       LEFT JOIN topic_counts tc
         ON tc.faculty_id = qs.faculty_id
         AND tc.semester_id = qs.semester_id
         AND tc.department_code_snapshot = qs.department_code_snapshot
       ```
       Change the third predicate line to:
       ```sql
       AND tc.department_code_snapshot = COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot)
       ```
       Rationale (F2 fix, continued): `tc.department_code_snapshot` now carries the home-axis value (from CTE change 1). The outer `qs.department_code_snapshot` is still the raw course-owner column. Without this edit, the join would miss every row where the two axes differ.

    **b) `MV_FACULTY_TRENDS`** — copy verbatim from `Migration20260412153923`. **No changes** — it reads from `mv_faculty_semester_stats` which now exposes the new semantics under the same column name.

    **c) `MV_FACULTY_SEMESTER_STATS_PRE_FAC130`** — copy verbatim from `Migration20260412153923`'s `MV_FACULTY_SEMESTER_STATS` string. Used by `down()` to restore the pre-FAC-130 body. Note (F8 resolution): we do **not** need a `MV_FACULTY_TRENDS_PRE_FAC130` constant because the trends body is unchanged — `down()` can reuse the same `MV_FACULTY_TRENDS` constant that `up()` uses.

  - Notes: Add a SQL comment inside `MV_FACULTY_SEMESTER_STATS` body just above the outer `SELECT`:
    ```sql
    -- FAC-130: department_code_snapshot now resolves to the faculty's home department
    -- via COALESCE(faculty_department_code_snapshot, department_code_snapshot).
    -- The column name is preserved to keep service/DTO contracts untouched.
    -- Historical submissions (FAC-128 predecessors) fall back to the course-owner code.
    -- Both the topic_counts CTE and the outer query group on the same COALESCE expression
    -- so the LEFT JOIN produces a correct per-faculty/per-home-dept distinct topic count.
    ```

- [x] **Task 4: Implement `up()`**
  - File: same as Task 2
  - Action: In exact order via `this.addSql(...)`:
    1. `DROP MATERIALIZED VIEW IF EXISTS mv_faculty_trends;`
    2. `DROP MATERIALIZED VIEW IF EXISTS mv_faculty_semester_stats;`
    3. `this.MV_FACULTY_SEMESTER_STATS` (the CREATE statement — populates immediately with the new home-dept semantics)
    4. `CREATE UNIQUE INDEX uq_mv_faculty_semester_stats ON mv_faculty_semester_stats (faculty_id, semester_id, department_code_snapshot);`
    5. `CREATE INDEX idx_mv_fss_dept_semester ON mv_faculty_semester_stats (department_code_snapshot, semester_id);`
    6. `this.MV_FACULTY_TRENDS`
    7. `CREATE UNIQUE INDEX uq_mv_faculty_trends ON mv_faculty_trends (faculty_id, department_code_snapshot);`
    8. `CREATE INDEX idx_mv_ft_dept ON mv_faculty_trends (department_code_snapshot);`
    9. `DELETE FROM system_config WHERE key = 'analytics_last_refreshed_at';` — invalidate the stale freshness timestamp so the `lastRefreshedAt` field returned by `/analytics/*` reflects reality after the migration. `analytics.service.ts::GetLastRefreshedAt()` returns `null` when this row is absent, which the frontend already handles.
  - Notes: Do NOT touch `idx_sr_submission_processed` — it's on a real table and irrelevant here. Index names copied verbatim; `REFRESH CONCURRENTLY` in `analytics-refresh.processor.ts:30-39` depends on the two unique indexes. The `CREATE MATERIALIZED VIEW` statements populate the MVs immediately (PostgreSQL default); no `REFRESH` is needed in the migration itself. The next pipeline-triggered refresh job will repopulate `analytics_last_refreshed_at`.

- [x] **Task 5: Implement `down()`**
  - File: same as Task 2
  - Action: Revert by dropping both MVs and recreating the _pre-FAC-130_ MV bodies. In exact order via `this.addSql(...)`:
    1. `DROP MATERIALIZED VIEW IF EXISTS mv_faculty_trends;`
    2. `DROP MATERIALIZED VIEW IF EXISTS mv_faculty_semester_stats;`
    3. `this.MV_FACULTY_SEMESTER_STATS_PRE_FAC130` (the pre-FAC-130 body — course-owner axis, defined in Task 3c)
    4. `CREATE UNIQUE INDEX uq_mv_faculty_semester_stats ON mv_faculty_semester_stats (faculty_id, semester_id, department_code_snapshot);`
    5. `CREATE INDEX idx_mv_fss_dept_semester ON mv_faculty_semester_stats (department_code_snapshot, semester_id);`
    6. `this.MV_FACULTY_TRENDS` (**reused from `up()`** — trends body is unchanged between pre- and post-FAC-130; it just inherits the parent MV's semantics)
    7. `CREATE UNIQUE INDEX uq_mv_faculty_trends ON mv_faculty_trends (faculty_id, department_code_snapshot);`
    8. `CREATE INDEX idx_mv_ft_dept ON mv_faculty_trends (department_code_snapshot);`
    9. `DELETE FROM system_config WHERE key = 'analytics_last_refreshed_at';` — same rationale as `up()` step 9 (F6 fix). Prevents the API from reporting a stale freshness timestamp after a rollback.
  - Notes: Only **one** `_PRE_FAC130` constant is needed (stats). The trends constant `MV_FACULTY_TRENDS` is identical across pre- and post-FAC-130 and is reused directly (F8 resolution).

- [x] **Task 6: Verify via migration tooling**
  - File: _n/a (commands)_
  - Action:
    1. `npx mikro-orm migration:list` → the new migration appears as pending.
    2. `npx mikro-orm migration:up` → applies cleanly; no errors.
    3. `npx mikro-orm migration:check` → reports `No changes required, schema is up-to-date` (snapshot should not diff — we touched no entities).
  - Notes: If step 3 reports a diff, STOP. A diff here means the MV DDL drifted the snapshot, which is a known false-positive class (see `project_mikroorm_diff_behavior.md`). Diagnose before merging.

- [ ] **Task 7: Manual refresh + timing baseline + EXPLAIN on staging**
  - File: _n/a (SQL on staging DB)_
  - Action: Before deploying to prod, on staging:
    1. `\timing on`, then capture `REFRESH MATERIALIZED VIEW mv_faculty_semester_stats;` duration on the pre-migration MV. Record in PR description as "Pre-FAC-130 refresh baseline".
    2. Capture `EXPLAIN (ANALYZE, BUFFERS) SELECT ...` on the inner SELECT of the pre-migration MV body. Record scan types (Seq Scan / Index Scan / Bitmap Heap Scan) and total `actual time`.
    3. Apply the migration.
    4. Capture the same refresh duration on the post-migration MV. Record as "Post-FAC-130 refresh".
    5. Capture `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats;` duration (the mode the processor actually uses).
    6. Capture `EXPLAIN (ANALYZE, BUFFERS) SELECT ...` on the inner SELECT of the post-migration MV body. Compare scan types vs. step 2.
  - Notes: Regression >2x on wall-clock refresh time is a blocker. **Plan-type regression** (e.g., pre uses Bitmap Heap Scan, post uses Seq Scan) is also a blocker even if timing happens to pass on staging-sized data — planner regressions scale worse than linear on prod volume. Mitigation if either check fails: add an expression index `CREATE INDEX ON questionnaire_submission (COALESCE(faculty_department_code_snapshot, department_code_snapshot))` inside the same migration (promotes risk 2 from "out of scope" to "required").

- [ ] **Task 8: Run the side-by-side verification query with a cross-department test faculty**
  - File: _n/a (SQL on staging DB)_
  - Action:
    1. **Pick a test faculty deliberately.** Before running the verification, identify a faculty in staging who has at least one submission in the target semester where `faculty_department_code_snapshot IS DISTINCT FROM department_code_snapshot` (i.e. teaches outside their home dept). Use this query to find candidates:
       ```sql
       SELECT qs.faculty_id, COUNT(*) AS mismatch_count
       FROM questionnaire_submission qs
       WHERE qs.semester_id = :semester_id
         AND qs.deleted_at IS NULL
         AND qs.faculty_department_code_snapshot IS DISTINCT FROM qs.department_code_snapshot
       GROUP BY qs.faculty_id
       ORDER BY mismatch_count DESC
       LIMIT 5;
       ```
       If no results, the staging data does not exercise the FAC-130 change — seed a cross-department submission before proceeding.
    2. Run the parameterized verification query from the _Testing Strategy_ section with the chosen `(faculty_id, semester_id)`.
    3. Paste the output into the PR description under a "Verification" heading with a one-sentence interpretation.
  - Notes: Expected pattern — OLD axis shows more rows (split by course-owner dept), NEW axis collapses them under the home-dept code. If OLD and NEW rows are identical, the test faculty was not actually cross-department and the verification proves nothing about the FAC-130 change.

- [x] **Task 9: Rerun existing test suites**
  - File: _n/a (commands)_
  - Action:
    1. `npm run test -- --testPathPattern=analytics` — unit specs for `analytics.service` and `analytics-refresh.processor` must pass unchanged.
    2. `npm run test:e2e` if an analytics e2e fixture exists; otherwise skip.
    3. `npm run lint` — clean.
  - Notes: No test files are added or modified by this ticket (TD-2 shields them). If any analytics spec fails, investigation is required because column semantics are the only change.

- [ ] **Task 10: Flag the docs delta in the PR description**
  - File: _n/a (PR description)_
  - Action: Add a "Follow-ups" note to the PR body:
    > `docs/architecture/analytics.md:28-30, 46-48, 120` still describes `department_code_snapshot` as the course-owner snapshot. A follow-up doc update should clarify that the column now resolves to the faculty's home department (COALESCE fallback for historical). Out of scope here to keep this PR focused.
  - Notes: If deadline permits, a one-paragraph doc update inside this same PR is welcome but optional. Do NOT block merge on it.

### Acceptance Criteria

- [ ] **AC 1 (happy path — snapshot present):** _Given_ a submission with `faculty_department_code_snapshot = 'MATH-HOME'` and `department_code_snapshot = 'CS-COURSE'`, _when_ `mv_faculty_semester_stats` is refreshed, _then_ the submission is counted in the MV row keyed on `department_code_snapshot = 'MATH-HOME'` (the home department), not `'CS-COURSE'`.

- [ ] **AC 2 (historical fallback — snapshot null):** _Given_ a submission predating FAC-128 where `faculty_department_code_snapshot IS NULL` and `department_code_snapshot = 'CS-COURSE'`, _when_ the MV is refreshed, _then_ the submission is counted under `department_code_snapshot = 'CS-COURSE'` (COALESCE fallback) so historical dashboards remain populated.

- [ ] **AC 3 (split aggregation):** _Given_ one faculty with two submissions in the same semester — submission A has `faculty_department_code_snapshot = 'MATH-HOME'` and submission B has it NULL with `department_code_snapshot = 'CS-COURSE'` — _when_ the MV is refreshed, _then_ the MV contains **two rows** for that `(faculty_id, semester_id)`, keyed on `'MATH-HOME'` and `'CS-COURSE'` respectively.

- [ ] **AC 4 (name/code consistency):** _Given_ any MV row, _when_ inspecting that row, _then_ `department_code_snapshot` and `department_name_snapshot` describe the **same** department (never a code from the home axis with a name from the course-owner axis, or vice versa).

- [ ] **AC 5 (REFRESH CONCURRENTLY still works):** _Given_ the migration is applied, _when_ `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats` is executed (as `analytics-refresh.processor.ts:31` does), _then_ it completes without `could not find unique index for concurrent refresh` errors — proving `uq_mv_faculty_semester_stats` is still valid on the new column semantics.

- [ ] **AC 6 (downstream MV still works):** _Given_ the migration is applied, _when_ `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_trends` is executed, _then_ it completes cleanly and trend rows group faculty across semesters under the home-department code (transitively via `mv_faculty_semester_stats`).

- [ ] **AC 7 (contract unchanged):** _Given_ the migration is applied, _when_ any `/analytics/*` endpoint is invoked with the same inputs as before, _then_ the response JSON shape is byte-identical in structure (same keys, same types) — only aggregated values may change because of the new axis.

- [ ] **AC 8 (existing tests pass):** _Given_ no test file is modified, _when_ `npm run test -- --testPathPattern=analytics` runs, _then_ all existing specs pass (including the SQL-string assertions at `analytics.service.spec.ts:374-403` and the refresh-order assertions at `analytics-refresh.processor.spec.ts:78-79`).

- [ ] **AC 9 (refresh timing AND plan stability):** _Given_ Task 7's pre-migration timing and EXPLAIN output are captured on staging, _when_ the post-migration timing and EXPLAIN are measured, _then_ **both** conditions hold: (a) post-migration `REFRESH` wall-clock time ≤ 2× pre-migration, AND (b) the scan type in the EXPLAIN output for the outer MV SELECT is unchanged (e.g., if pre used Bitmap Heap Scan, post must also use Bitmap Heap Scan — not Seq Scan). A regression on EITHER dimension is a blocker for merge.

- [ ] **AC 10 (migration round-trip):** _Given_ a database with the migration applied, _when_ `npx mikro-orm migration:down` is executed, _then_ both MVs revert to their pre-FAC-130 bodies (course-owner grouping) and a subsequent `migration:up` restores the FAC-130 semantics — both directions execute cleanly with no manual intervention.

- [ ] **AC 11 (snapshot integrity):** _Given_ the migration is applied, _when_ `npx mikro-orm migration:check` is executed, _then_ it reports `No changes required, schema is up-to-date` — proving we did not introduce a snapshot drift false-positive (cf. `project_mikroorm_diff_behavior.md`).

- [ ] **AC 12 (cross-department, same home dept):** _Given_ one faculty with two submissions in the same semester where **both** submissions have the SAME non-null `faculty_department_code_snapshot = 'MATH'` but **different** `department_code_snapshot` values (e.g. course A taught under CS dept, course B taught under STAT dept), _when_ the MV is refreshed, _then_ the MV contains exactly **one** row for that `(faculty_id, semester_id)` with `department_code_snapshot = 'MATH'` and `submission_count = 2`. This is the core FAC-130 semantic — cross-department teachers collapse under their home dept.

- [ ] **AC 13 (topic count correctness under new axis):** _Given_ one faculty with two submissions in the same semester, same non-null `faculty_department_code_snapshot = 'MATH'`, but different `department_code_snapshot` values, where submission A has dominant topics `{T1, T2, T3}` and submission B has dominant topics `{T4, T5}` (from completed pipelines), _when_ the MV is refreshed, _then_ the MV row for `(faculty_id, semester_id, 'MATH')` reports `distinct_topic_count = 5` — NOT `3` (the max-per-course-dept value) and NOT `0` (join miss). This locks the F2 fix: the `topic_counts` CTE must key on the home-dept axis so its distinct count reflects the faculty's topic diversity under their home dept.

## Additional Context

### Dependencies

- **Depends on:** FAC-128 — `faculty_department_id` / `faculty_department_code_snapshot` / `faculty_department_name_snapshot` columns must exist on `questionnaire_submission`. Confirmed present via `Migration20260413125358`.
- **Ships after:** FAC-129 (faculty listing by home department) — already merged (commit `ab9fe1e`). Side-by-side verification is cleaner with the faculty listing already matching the new axis.
- **Blocks:** none identified; this is the last ticket in the Stage 2 behavior rewire.

### Testing Strategy

**Unit tests:** No new Jest tests are required. Existing specs (`analytics.service.spec.ts`, `analytics-refresh.processor.spec.ts`) assert on SQL query strings and refresh ordering — neither changes under this migration (TD-2 preserves column names; TD-5 requires zero service-code edits). Task 9 reruns them as a regression gate.

**Integration / SQL verification:** The MV's new aggregation behavior is not easily unit-testable because it depends on MV refresh semantics against real submission data. Verification is therefore empirical, against staging:

1. **AC 1/2/3 coverage** — seed three submission rows matching the conditions in AC 1, AC 2, and AC 3; `REFRESH MATERIALIZED VIEW mv_faculty_semester_stats`; `SELECT faculty_id, department_code_snapshot, submission_count FROM mv_faculty_semester_stats WHERE faculty_id = <seeded>`; assert the row counts match each AC expectation.
2. **AC 4 coverage** — run `SELECT department_code_snapshot, department_name_snapshot FROM mv_faculty_semester_stats WHERE faculty_id = <mixed-axis faculty>` and eyeball that code/name pair belongs to the same department in `department` table.
3. **AC 5/6 coverage** — `REFRESH MATERIALIZED VIEW CONCURRENTLY` on both MVs after the migration completes (Task 7). If either command errors with `could not find unique index`, acceptance fails.
4. **AC 9 coverage** — Task 7's timing capture.
5. **AC 10 coverage** — `npx mikro-orm migration:down` then `migration:up` on a staging branch copy of the DB (Task 6).
6. **AC 11 coverage** — Task 6 step 3.

**Side-by-side verification SQL (embed in PR description):**

```sql
-- Parameters: :faculty_id  :semester_id
-- PRE-FLIGHT: refresh the MV first so the comparison against raw submission
-- data is apples-to-apples (F11 fix). The verification query below reads only
-- from questionnaire_submission, not the MV, but a stale MV during later
-- cross-checks causes confusing diffs.
REFRESH MATERIALIZED VIEW mv_faculty_semester_stats;

WITH old_axis AS (
  SELECT qs.department_code_snapshot AS dept_code,
         COUNT(*) AS submissions,
         ROUND(AVG(qs.normalized_score), 4) AS avg_score
  FROM questionnaire_submission qs
  WHERE qs.faculty_id = :faculty_id
    AND qs.semester_id = :semester_id
    AND qs.deleted_at IS NULL
  GROUP BY qs.department_code_snapshot
),
new_axis AS (
  SELECT COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot) AS dept_code,
         COUNT(*) AS submissions,
         ROUND(AVG(qs.normalized_score), 4) AS avg_score
  FROM questionnaire_submission qs
  WHERE qs.faculty_id = :faculty_id
    AND qs.semester_id = :semester_id
    AND qs.deleted_at IS NULL
  GROUP BY COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot)
)
SELECT 'OLD' AS axis, * FROM old_axis
UNION ALL
SELECT 'NEW' AS axis, * FROM new_axis
ORDER BY axis, dept_code;
```

### Notes

**Issue-body corrections to call out in the PR:**

- The issue body says "update `src/modules/analysis/services/analytics.service.ts:74-149` if it references the old grouping dimension directly." Two corrections:
  1. Path is wrong. Actual file is `src/modules/analytics/analytics.service.ts` (module renamed/moved at some point).
  2. File does not need editing. TD-2 preserves the column name `department_code_snapshot`, so the service is invariant under this migration.
- The issue body says "New migration recreating `mv_faculty_semester_stats` with `COALESCE(faculty_department_id, department_id)` as the grouping key." Correction: the MV keys on **codes** (`department_code_snapshot`), not ids. See TD-1 for why — codes are the existing contract surface, ids would be a full refactor.

**Party Mode consensus (2026-04-13):** Winston (Architect), Amelia (Dev), Quinn (QA) converged on TD-1..TD-5 with no dissent. Key calls:

- TD-1: codes, not ids
- TD-2: preserve column name
- TD-3: COALESCE name snapshot too
- TD-4: DROP + CREATE, not v2 swap
- TD-5: no service-code edits

**High-risk items (pre-mortem):**

1. **Snapshot drift false positive.** If `migration:check` reports a diff after writing the handwritten migration, do NOT let the snapshot regenerate and do NOT use `--dump`. Investigate. The memory file `project_mikroorm_diff_behavior.md` captures the class of bugs here.
2. **Refresh timing regression.** COALESCE expressions in GROUP BY can occasionally confuse the query planner (loss of equality stats). Baseline timing (Task 7) is the guardrail. Mitigation if needed: `CREATE INDEX ON questionnaire_submission (COALESCE(faculty_department_code_snapshot, department_code_snapshot))` — out of scope for this ticket, but noted.
3. **Topic count semantics unchanged.** The `topic_counts` CTE still keys on `qs.department_code_snapshot` (course-owner axis). This is intentional — topic diversity is a per-course concept, not a per-department concept. If a later requirement says "faculty topic diversity should aggregate on the home axis," that's a separate ticket.
4. **Historical fallback is a band-aid, not a fix.** Submissions predating FAC-128 have null `faculty_department_*_snapshot`. COALESCE falls back to course-owner, so pre-FAC-128 rows will still appear under their old axis in dean dashboards. A future backfill ticket should retroactively snapshot `faculty.department` onto historical submissions — deliberately out of scope here.
5. **Doc drift.** `docs/architecture/analytics.md` still describes the old semantics. Flagged in Task 10; non-blocking for merge.

**Rollback runbook (post-deploy regression):**

If production exhibits a refresh-time regression that was not caught on staging (e.g., because prod data volume is larger or data distribution differs):

1. **Acute:** run `npx mikro-orm migration:down` targeting this migration. Both MVs revert to the pre-FAC-130 bodies and the next scheduled refresh populates them under the old course-owner semantics. Analytics data quality regresses to pre-ticket state but dashboards stay responsive. `analytics_last_refreshed_at` is cleared so the frontend correctly shows "never refreshed" until the next pipeline completes.
2. **Investigate:** capture prod `EXPLAIN (ANALYZE, BUFFERS)` on the new MV body and compare to staging. If Seq Scan replaced Bitmap Heap Scan on `questionnaire_submission`, the planner needs the expression index.
3. **Re-apply with mitigation:** add `CREATE INDEX idx_qs_effective_dept_code ON questionnaire_submission (COALESCE(faculty_department_code_snapshot, department_code_snapshot))` to a follow-up migration, then re-apply FAC-130. Do NOT try to create the index as a side-effect of re-running `migration:up` on the original migration — file a new ticket.

**Known limitations / out-of-scope (future tickets):**

- Historical submission backfill of `faculty_department_*_snapshot` columns (see risk 4).
- Topic count aggregation on the home-department axis (see risk 3).
- Rename `department_code_snapshot` in the MV and DTOs to `home_department_code` for semantic honesty (see TD-2 rejection rationale).
- Switching scope resolution from codes to ids across the analytics path (see TD-1).

## Review Notes

- Adversarial review completed (2026-04-13)
- Findings: 6 surfaced (0 Critical, 0 High, 1 Medium spec-accepted, 4 Low, 1 Informational)
- Fixed: F10 — moved the FAC-130 explanatory comment out of the SQL template literal into a JS `//` block above the constant, so it doesn't end up embedded in `pg_matviews.definition` / `pg_dump` output.
- Skipped: F1 (deferred MV refresh — intentional per Task 4 step 9), F2 (pre-existing `topic.deleted_at` filter gap in 0412 source), F6 (duplicated trends body — acceptable since 0412 is frozen history), F7 (migration SQL not unit-tested — staging verification covers it per Task 7/8), F9 (planner stats — deferred per risk #2).
- Resolution approach: auto-fix real findings (F10 only in-scope).
- Tasks 7, 8, 10 remain open — require staging DB / PR description at merge time.
