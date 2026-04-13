---
title: 'Add Source Tracking and Restore Enrollment-Based Derivation for User Department/Program'
slug: 'fac-125-department-source-tracking'
created: '2026-04-13'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack:
  - NestJS 11
  - MikroORM 6.6.6
  - PostgreSQL 15
  - TypeScript 5.7
files_to_modify:
  - src/entities/user.entity.ts
  - src/modules/moodle/services/moodle-enrollment-sync.service.ts
  - src/modules/moodle/services/moodle-user-hydration.service.ts
  - src/modules/moodle/services/scope-derivation.helper.ts (new)
  - src/migrations/ (new migration replacing FAC-123's)
  - docs/workflows/institutional-sync.md
  - docs/workflows/auth-hydration.md
code_patterns:
  - Source tracking enum pattern (InstitutionalRoleSource)
  - Batch upsert with onConflictMergeFields
  - Enrollment majority derivation with moodleCategoryId tiebreaker
  - Phase-based sync with aggregate logging
  - Atomic source-pair updates (department + program)
  - Pure helper function shared by cron and login paths
test_patterns:
  - NestJS TestingModule with Jest mocks
  - Pure function unit tests (no DB)
  - Convergence test (cron vs login produce same result)
---

# Tech-Spec: Add Source Tracking and Restore Enrollment-Based Derivation

**Created:** 2026-04-13
**Issue:** FAC-125 (#298)
**Adversarial review:** 18 findings, 9 incorporated below

## Overview

### Problem Statement

FAC-124 removed the enrollment-based derivation logic for `user.department` and `user.program` because it represented teaching load rather than institutional belonging. However, this left no automated way to populate these fields for new users. The original FAC-125 plan to use Moodle profile fields was abandoned after discovering:

1. No custom profile fields exist in Moodle
2. The built-in `department` field is empty for all users

A better approach: restore derivation with source tracking, allowing manual overrides that won't be clobbered.

### Solution

1. **Drop `home_department_id`** column added in FAC-123 (redundant)
2. **Add source tracking columns**: `department_source` and `program_source` (`'auto' | 'manual'`)
3. **Restore enrollment derivation logic** from FAC-124's removed code, with a guard that skips users where either source is `'manual'` (atomic)
4. **Repurpose existing fields**: `user.department` and `user.program` become the authoritative institutional assignment
5. **Strip campus writes from restored code** — campus stays handled by `UserRepository.UpsertFromMoodle()` at login; bulk sync no longer touches `user.campus`
6. **Extract derivation into a pure helper** so cron and login paths cannot diverge

This follows the same pattern as `UserInstitutionalRole.source` where auto-detected roles don't override manual assignments.

### Scope

**In Scope:**

- Migration: drop `home_department_id`, add `department_source` and `program_source` columns
- Update User entity with source properties
- New pure helper `deriveUserScopes(input)` — single source of derivation truth
- Restore enrollment-based derivation in both sync paths (cron + login) using the helper
- Aggregate logging: `{ auto_derived, manual_skipped, null }`
- Update `docs/workflows/institutional-sync.md` and `docs/workflows/auth-hydration.md`
- Idempotent: runs on every sync cycle, respects manual overrides, doesn't bump `updatedAt` on no-ops

**Out of Scope:**

- Admin UI for manual override (FAC-127)
- Moodle profile field integration (abandoned)
- Stage 2 scoping/authorization changes (FAC-126, FAC-129, etc.)
- `campus_source` column (campus is handled at login, not bulk sync)
- Observability metrics / SyncLog counters (deferred — see Notes)

## Context for Development

### Codebase Patterns

- **Source tracking pattern**: `InstitutionalRoleSource` enum in `src/entities/user-institutional-role.entity.ts`:
  ```typescript
  export enum InstitutionalRoleSource {
    AUTO = 'auto',
    MANUAL = 'manual',
  }
  ```
- **Enrollment derivation algorithm** (from removed PR #313 code, MODIFIED):
  1. Count enrollments per program for each user
  2. Winner = program with most enrollments
  3. **Tiebreaker = alphabetically first `program.moodleCategoryId`** (was: UUID — changed for environment stability)
  4. Derive: `program → program.department` only (no campus, no semester chain)
- **Upsert pattern**: Use `em.upsert()` with `onConflictMergeFields` excluding `id`, `createdAt`
- **Phase-based sync**: EnrollmentSyncService runs phases sequentially (HTTP fetch → user upsert → enrollment upsert → scope derivation → role derivation)
- **Atomic source rule**: Department and program updates are paired. If EITHER `departmentSource = 'manual'` OR `programSource = 'manual'`, the user is skipped entirely. This prevents inconsistent `user.department ≠ user.program.department` states.
- **Equality guard**: Before assignment, compare new vs current values. Only mutate if different. Prevents `updatedAt` bumps on no-op syncs.

### Files to Reference

| File                                                                              | Purpose                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/entities/user.entity.ts`                                                     | Add source properties, remove `homeDepartment`       |
| `src/entities/user-institutional-role.entity.ts`                                  | Reference for source enum pattern                    |
| `src/modules/moodle/services/moodle-enrollment-sync.service.ts`                   | Restore `backfillUserScopes()` as Phase 4            |
| `src/modules/moodle/services/moodle-user-hydration.service.ts`                    | Restore derivation in `hydrateUserCourses()`         |
| `src/migrations/Migration20260413013321_add-home-department-id.ts`                | Migration to replace                                 |
| `docs/workflows/institutional-sync.md:68`                                         | Doc reference to home_department_id (must update)    |
| `docs/workflows/auth-hydration.md:133`                                            | Doc reference to Moodle profile fields (must update) |
| `git show 9745f3b^:src/modules/moodle/services/moodle-enrollment-sync.service.ts` | Removed `backfillUserScopes()` to restore            |
| `git show 9745f3b^:src/modules/moodle/services/moodle-user-hydration.service.ts`  | Removed `deriveUserScopes()` to restore              |

### Technical Decisions (Finalized in Party Mode + Adversarial Review)

| Decision              | Answer                                     | Rationale                                                                                                                       |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Data source           | Enrollment derivation                      | Moodle profile fields are empty; enrollment data exists                                                                         |
| Moodle profile fields | **Skip entirely**                          | Empty in Moodle, admin overhead to populate                                                                                     |
| home_department_id    | **Drop it**                                | Redundant with repurposed `department_id`                                                                                       |
| Source tracking       | `'auto' \| 'manual'` columns               | Follows existing `UserInstitutionalRole` pattern                                                                                |
| Manual override       | Admin UI sets `source = 'manual'`          | Protected from sync overwrites                                                                                                  |
| program_source        | Include                                    | Same pattern as department for consistency                                                                                      |
| Sync hook             | Inline in Phase 4                          | Restore removed `backfillUserScopes()`                                                                                          |
| **Tiebreaker**        | **`moodleCategoryId` (NOT UUID)**          | UUIDs are environment-unstable; moodleCategoryId is canonical across dev/staging/prod                                           |
| **Campus handling**   | **Strip from restored code**               | Campus is set at login via `UserRepository.UpsertFromMoodle`; restoring writes would re-introduce flapping with no source guard |
| **Source atomicity**  | **Both fields update together or neither** | Prevents `user.department ≠ user.program.department` inconsistency                                                              |
| **Equality guard**    | **Required before assignment**             | Avoid bumping `updatedAt` on no-op syncs (preserves AC10)                                                                       |
| **Code sharing**      | **Extract pure function**                  | Both cron and login paths call the same `deriveUserScopes(input)` helper                                                        |

## Implementation Plan

### Tasks

- [x] **Task 1: Create new migration for schema changes**
  - File: `src/migrations/Migration<timestamp>_add_source_tracking.ts`
  - Actions:
    1. Drop `home_department_id` foreign key constraint: `user_home_department_id_foreign`
    2. Drop `user_home_department_id_index` index
    3. Drop `home_department_id` column
    4. Add `department_source VARCHAR(10) NOT NULL DEFAULT 'auto'`
    5. Add `program_source VARCHAR(10) NOT NULL DEFAULT 'auto'`
    6. No explicit backfill needed — `DEFAULT 'auto'` handles all rows
  - Down migration: reverse all changes (re-add `home_department_id` column + index + FK, drop source columns)
  - Notes:
    - **Accepted risk:** This migration assumes all currently-populated `department_id`/`program_id` values are safe to overwrite by future syncs. As a solo dev with no known hand-edited values in production, this is acceptable. If you have hand-edited values you want preserved, set `department_source = 'manual'` for those users BEFORE running the next sync.
    - Run `npx mikro-orm migration:check` after creating to verify snapshot drift is resolved cleanly. Past FAC-122.x history shows this surface area is fragile.

- [x] **Task 2: Update User entity**
  - File: `src/entities/user.entity.ts`
  - Actions:
    1. Remove `@Index({ name: 'user_home_department_id_index', properties: ['homeDepartment'] })` decorator (lines 22-25)
    2. Remove `homeDepartment` ManyToOne relation (lines 58-63)
    3. Reuse the existing `InstitutionalRoleSource` enum from `user-institutional-role.entity.ts` — do NOT create a new enum (keeps source pattern consistent across entities)
    4. Add `@Property({ default: InstitutionalRoleSource.AUTO }) departmentSource!: string;`
    5. Add `@Property({ default: InstitutionalRoleSource.AUTO }) programSource!: string;`
    6. Update docstrings for `department` and `program` fields:
       ```typescript
       /**
        * User's institutional department. Auto-derived from enrollment majority
        * (see EnrollmentSyncService.backfillUserScopes), or manually assigned via
        * admin UI (FAC-127). Manual assignments are protected from sync overwrites
        * via departmentSource = 'manual'.
        */
       ```
  - Notes: Use `string` type for the source columns (matches `UserInstitutionalRole.source`), default to enum value.

- [x] **Task 3: Extract pure derivation function**
  - File: `src/modules/moodle/services/scope-derivation.helper.ts` (NEW)
  - Actions: Create a pure function (no DB, no side effects):

    ```typescript
    import { Program } from 'src/entities/program.entity';
    import { Department } from 'src/entities/department.entity';

    export interface ScopeDerivationInput {
      enrollments: Array<{ program: Program | undefined }>;
    }

    export interface ScopeDerivationResult {
      primaryProgram: Program | null;
      primaryDepartment: Department | null;
    }

    /**
     * Pure helper: given a user's enrollments, derive the primary program
     * (most enrollments wins; tiebreaker = alphabetically first moodleCategoryId).
     *
     * Used by both:
     * - EnrollmentSyncService.backfillUserScopes (cron path)
     * - MoodleUserHydrationService (login path)
     *
     * Convergence is enforced by both paths calling this single function.
     */
    export function deriveUserScopes(
      input: ScopeDerivationInput,
    ): ScopeDerivationResult {
      const programCounts = new Map<
        string,
        { program: Program; count: number }
      >();
      for (const enrollment of input.enrollments) {
        const program = enrollment.program;
        if (!program) continue;
        const entry = programCounts.get(program.id);
        if (entry) {
          entry.count++;
        } else {
          programCounts.set(program.id, { program, count: 1 });
        }
      }

      let primaryProgram: Program | null = null;
      let maxCount = 0;
      for (const { program, count } of programCounts.values()) {
        if (count > maxCount) {
          maxCount = count;
          primaryProgram = program;
        } else if (count === maxCount && primaryProgram) {
          // Env-stable tiebreaker: alphabetical moodleCategoryId
          if (
            String(program.moodleCategoryId) <
            String(primaryProgram.moodleCategoryId)
          ) {
            primaryProgram = program;
          }
        }
      }

      return {
        primaryProgram,
        primaryDepartment: primaryProgram?.department ?? null,
      };
    }
    ```

  - Notes: This function is the ONLY source of derivation truth. Both bulk sync and login hydration import it. Eliminates F7 (divergence between counting denominators).

- [x] **Task 4: Restore `backfillUserScopes()` in EnrollmentSyncService (cron path)**
  - File: `src/modules/moodle/services/moodle-enrollment-sync.service.ts`
  - Actions:
    1. Add private method `backfillUserScopes(fetched)` with this control flow:

       ```typescript
       private async backfillUserScopes(
         fetched: { course: Course; remoteUsers: MoodleEnrolledUser[] }[],
       ) {
         const fork = this.em.fork();

         // 1. Build per-user enrollment list (in-memory, from fetched snapshot)
         //    Map: moodleUserId -> Array<{ program }>
         const enrollmentsByMoodleId = new Map<number, Array<{ program: Program }>>();
         for (const { course, remoteUsers } of fetched) {
           if (!course.program) continue;
           for (const remote of remoteUsers) {
             if (remote.id == null || !remote.username) continue;
             if (!enrollmentsByMoodleId.has(remote.id)) {
               enrollmentsByMoodleId.set(remote.id, []);
             }
             enrollmentsByMoodleId.get(remote.id)!.push({
               program: course.program as Program,
             });
           }
         }

         if (enrollmentsByMoodleId.size === 0) return;

         // 2. Load users with current source flags + program/department populated
         const users = await fork.find(
           User,
           { moodleUserId: { $in: [...enrollmentsByMoodleId.keys()] } },
           { populate: ['program', 'department'] },
         );

         // 3. Make sure programs in enrollment lists have department populated
         //    (single batch populate to avoid N+1)
         const allPrograms = [
           ...new Set(
             [...enrollmentsByMoodleId.values()]
               .flat()
               .map((e) => e.program),
           ),
         ];
         await fork.populate(allPrograms, ['department']);

         // 4. Derive + apply with atomic source guard + equality guard
         const counters = { auto_derived: 0, manual_skipped: 0, null: 0 };
         for (const user of users) {
           if (
             user.departmentSource === InstitutionalRoleSource.MANUAL ||
             user.programSource === InstitutionalRoleSource.MANUAL
           ) {
             counters.manual_skipped++;
             continue;
           }

           const result = deriveUserScopes({
             enrollments: enrollmentsByMoodleId.get(user.moodleUserId!) ?? [],
           });

           if (!result.primaryProgram) {
             counters.null++;
             continue;
           }

           // Equality guard: only mutate if values actually change
           const programChanged = user.program?.id !== result.primaryProgram.id;
           const departmentChanged =
             user.department?.id !== result.primaryDepartment?.id;

           if (programChanged || departmentChanged) {
             user.program = result.primaryProgram;
             user.department = result.primaryDepartment ?? undefined;
             user.programSource = InstitutionalRoleSource.AUTO;
             user.departmentSource = InstitutionalRoleSource.AUTO;
             counters.auto_derived++;
           }
         }

         // 5. Conditional flush — only if anything actually changed
         if (counters.auto_derived > 0) {
           await fork.flush();
         }

         this.logger.log(
           `Scope backfill: ${counters.auto_derived} derived, ${counters.manual_skipped} manual skipped, ${counters.null} no enrollments`,
         );
       }
       ```

    2. **DO NOT** restore the campus writes from the removed code (lines 425-433 in `9745f3b^`). Campus is handled by `UserRepository.UpsertFromMoodle` at login. There is no `campusSource` column.
    3. Re-add as Phase 4 in `SyncAllCourses()` (between current Phase 3 enrollment upsert and current Phase 4 deriveUserRoles, which becomes Phase 5).

  - Notes: The `enrollmentsByMoodleId` map is built from the in-memory `fetched` data, not from a fresh DB query, to keep the sync atomic to the snapshot it just upserted.

- [x] **Task 5: Restore derivation in MoodleUserHydrationService (login path)**
  - File: `src/modules/moodle/services/moodle-user-hydration.service.ts`
  - Actions:
    1. After Phase 3 (resolveInstitutionalRoles) and before `tx.persist(user)`, derive scopes from the user's enrollments:

       ```typescript
       // Build enrollment list from remoteCourses + programCache
       const userEnrollments = remoteCourses
         .map((rc) => ({ program: programCache.get(rc.category) }))
         .filter((e): e is { program: Program } => !!e.program);

       // Atomic source guard
       if (
         user.departmentSource !== InstitutionalRoleSource.MANUAL &&
         user.programSource !== InstitutionalRoleSource.MANUAL
       ) {
         // Ensure department is populated on programs
         const allPrograms = [
           ...new Set(userEnrollments.map((e) => e.program)),
         ];
         await tx.populate(allPrograms, ['department']);

         const result = deriveUserScopes({ enrollments: userEnrollments });

         if (result.primaryProgram) {
           const programChanged = user.program?.id !== result.primaryProgram.id;
           const departmentChanged =
             user.department?.id !== result.primaryDepartment?.id;

           if (programChanged || departmentChanged) {
             user.program = result.primaryProgram;
             user.department = result.primaryDepartment ?? undefined;
             user.programSource = InstitutionalRoleSource.AUTO;
             user.departmentSource = InstitutionalRoleSource.AUTO;
           }
         }
       }
       ```

    2. **DO NOT** restore campus writes from `9745f3b^` (the old `deriveUserScopes` set `user.campus` from username prefix or category hierarchy). Campus is set elsewhere — leave it alone here.

  - Notes: Same atomic + equality guards as Task 4. Calls the SAME helper to guarantee convergence.

- [x] **Task 6: Add unit tests**
  - File: `src/modules/moodle/services/scope-derivation.helper.spec.ts` (NEW)
  - Actions — pure-function tests for `deriveUserScopes()`:
    1. Empty enrollments → `{ primaryProgram: null, primaryDepartment: null }`
    2. All enrollments in one program → returns that program
    3. Majority in Program A (3 vs 2) → returns Program A
    4. Tie scenario → returns program with alphabetically first `moodleCategoryId`
    5. **Verify tiebreaker uses `moodleCategoryId`, NOT `id` (UUID)**: construct two programs where UUID order and `moodleCategoryId` order disagree, assert helper picks by `moodleCategoryId`
    6. Enrollment with `program: undefined` is skipped without crashing
  - File: `src/modules/moodle/services/moodle-enrollment-sync.service.spec.ts` (NEW)
  - Actions — `backfillUserScopes()` integration with mocked EM:
    1. User with `auto/auto` + enrollments → updated, counter `auto_derived` incremented
    2. User with `departmentSource = 'manual'` → skipped (BOTH dept and program preserved, atomic rule), counter `manual_skipped` incremented
    3. User with `programSource = 'manual'` → also atomically skipped
    4. User where derivation matches existing values → equality guard prevents mutation; `flush()` not called
    5. Empty enrollment list → `null` counter incremented, no mutation
    6. Aggregate logger call asserts the formatted log line
    7. Campus is NOT modified for any user (regression for F1/AC12)
  - File: `src/modules/moodle/services/moodle-user-hydration.service.spec.ts` (NEW)
  - Actions — login-path derivation:
    1. Login user with `auto/auto` + enrollments → derives correctly via shared helper
    2. **Login user with `departmentSource = 'manual'` → NOT modified** (covers F11)
    3. Login user with `programSource = 'manual'` → NOT modified (atomic)
    4. Campus is NOT modified by hydration's scope step (regression for F1)
  - File: `src/modules/moodle/services/scope-derivation.convergence.spec.ts` (NEW)
  - Actions — convergence regression:
    1. Construct an enrollment set with a tie scenario
    2. Call `deriveUserScopes(input)` directly (helper)
    3. Call it indirectly via mocked `backfillUserScopes` and mocked hydration paths
    4. Assert all three return the same `(primaryProgram.id, primaryDepartment.id)` — eliminates F7 drift risk

- [x] **Task 7: Update workflow documentation**
  - Files:
    - `docs/workflows/institutional-sync.md` (line 68 references `home_department_id`)
    - `docs/workflows/auth-hydration.md` (line 133 references Moodle profile custom fields)
  - Actions:
    1. In `institutional-sync.md:68`, replace the FAC-125 forward-reference with the actual implementation: enrollment derivation + source tracking on existing `user.department` / `user.program`. Mention the atomic source rule and that campus is no longer touched by the bulk sync.
    2. In `auth-hydration.md:133`, replace the "Moodle profile custom fields as the authoritative source" sentence with the new design: shared `deriveUserScopes` helper called by both login and cron paths, with `*_source` columns protecting manual overrides.
    3. Add a "Source Tracking" subsection to the institutional-sync doc explaining the `auto` / `manual` semantics and how admins (eventually FAC-127) override values.
  - Verification: `grep -rn "home_department_id\|homeDepartment" docs/ src/` should return zero matches after this task.

- [x] **Task 8: Update GitHub issue FAC-125 description**
  - File: N/A (GitHub)
  - Actions:
    1. Replace the original "Backfill faculty home department from Moodle profile field" body with the revised scope from this spec
    2. Note that the Stage 1/2 → Stage 2 hand-off no longer hinges on a Moodle prerequisite
  - Notes: Don't mention "Party Mode" in the public issue — keep the language professional. Reference this tech-spec by path instead.

### Acceptance Criteria

- [x] **AC1:** Given the migration has run, when I query the `user` table schema, then `home_department_id` column, FK, and index do not exist; `department_source` and `program_source` columns exist with `NOT NULL DEFAULT 'auto'`.

- [x] **AC2:** Given existing users have `department_id` and `program_id` populated before the migration, when the migration runs, then those users have `department_source = 'auto'` and `program_source = 'auto'` (via column default; no explicit backfill query needed).

- [x] **AC3:** Given a user with `departmentSource = 'auto'`, `programSource = 'auto'`, and active enrollments, when enrollment sync runs, then `user.program` is set to their majority program and `user.department` is set to that program's department.

- [x] **AC4 (atomic — covers F5):** Given a user with `programSource = 'manual'` and `departmentSource = 'auto'`, when enrollment sync runs, then NEITHER `user.program` NOR `user.department` is modified (atomic skip; prevents `user.department ≠ user.program.department` inconsistency).

- [x] **AC5:** Given a user with 3 enrollments in Program A and 2 in Program B, when enrollment sync runs, then `user.program` is set to Program A (majority wins).

- [x] **AC6 (env-stable tiebreaker — covers F12):** Given a user with equal enrollments in two programs, when enrollment sync runs, then `user.program` is set to the program with the alphabetically first `moodleCategoryId` (NOT the alphabetically first UUID), so the result is identical across dev/staging/prod for the same Moodle state.

- [x] **AC7:** Given a user with `departmentSource = 'auto'` logs in via Moodle, when `hydrateUserCourses()` completes, then `user.department` and `user.program` are derived via the shared helper.

- [x] **AC8 (manual login — covers F11):** Given a user with `departmentSource = 'manual'` logs in via Moodle, when `hydrateUserCourses()` completes, then `user.department` and `user.program` are NOT modified.

- [x] **AC9 (logging):** Given enrollment sync completes, when I check the logs, then I see `Scope backfill: X derived, Y manual skipped, Z no enrollments` with accurate counters.

- [x] **AC10 (idempotency — covers F8):** Given enrollment sync runs twice with no enrollment changes, when I compare user records, then no domain fields (`department`, `program`, `*_source`) AND `updatedAt` have changed (achieved via the equality guard before assignment plus the conditional flush).

- [x] **AC11 (convergence — covers F7):** Given the same set of enrollments for a user, when `backfillUserScopes` (cron) and the hydration-path derivation (login) both run, then they produce identical `(primaryProgram, primaryDepartment)` results. Verified by `scope-derivation.convergence.spec.ts`.

- [x] **AC12 (no campus writes — covers F1):** Given a user with no `campus` set and active enrollments, when enrollment sync runs OR the user logs in via hydration, then `user.campus` remains null. Bulk sync and hydration MUST NOT write `user.campus`. Campus is set only by `UserRepository.UpsertFromMoodle` at login.

- [x] **AC13 (docs):** Given the PR is merged, when I `grep -rn "home_department_id\|homeDepartment" docs/ src/`, then there are zero matches. The two affected docs (`institutional-sync.md`, `auth-hydration.md`) describe the actual implemented design.

## Additional Context

### Dependencies

- **FAC-123**: Added `home_department_id` column — **this PR drops it**
- **FAC-124**: Stopped sync from clobbering — **this PR restores derivation with guards**

### Downstream Impact

All Stage 2 tickets have been updated to reference `user.department` instead of `home_department_id`:

- FAC-126 (#299): Scope enforcement uses `faculty.department`
- FAC-127 (#300): Admin UI sets `department` + `departmentSource = 'manual'`
- FAC-128 (#301): Snapshot `faculty_department_id` on submissions
- FAC-129 (#302): Filter listing by `department_id`
- FAC-130 (#303): MV aggregates by `faculty_department_id`
- FAC-131 (#304): **CLOSED** as obsolete

### Testing Strategy

**Unit Tests (Task 6):**

- Pure-function tests for `deriveUserScopes()` (no DB)
- Bulk sync `backfillUserScopes()` with mocked EM
- Login-path hydration with mocked EM
- **Convergence test** asserting both paths produce identical results
- Source guard behavior (atomic skip)
- Equality guard preventing no-op `updatedAt` bumps
- Tiebreaker uses `moodleCategoryId` not UUID
- Campus is never written by either path

**Manual Verification:**

```sql
-- Before sync: snapshot
SELECT department_source, program_source, COUNT(*)
FROM "user" WHERE deleted_at IS NULL
GROUP BY department_source, program_source;

-- After sync: verify no manual users changed
SELECT user_name, department_source, department_id
FROM "user"
WHERE (department_source = 'manual' OR program_source = 'manual')
  AND deleted_at IS NULL;

-- Coverage check
SELECT
  COUNT(*) FILTER (WHERE department_id IS NOT NULL) AS with_department,
  COUNT(*) FILTER (WHERE department_id IS NULL) AS without_department
FROM "user" WHERE deleted_at IS NULL;

-- Idempotency: run sync twice, compare updatedAt
SELECT MAX(updated_at) FROM "user" WHERE deleted_at IS NULL;
-- (run sync)
SELECT MAX(updated_at) FROM "user" WHERE deleted_at IS NULL;
-- Should be identical for users with no actual changes
```

**Snapshot drift check:**

```bash
npx mikro-orm migration:check
```

Required after entity changes. See past FAC-122.x history for why.

### Git History Reference

Retrieve removed derivation logic for reference (DO NOT copy-paste verbatim — strip campus writes per F1):

```bash
git show 9745f3b^:src/modules/moodle/services/moodle-enrollment-sync.service.ts > /tmp/old-enrollment-sync.ts
git show 9745f3b^:src/modules/moodle/services/moodle-user-hydration.service.ts > /tmp/old-hydration.ts
```

Then read the full files locally — `grep -A N` will truncate.

### Notes

**High-Risk Items:**

- Migration drops `home_department_id` — Task 7 ensures docs are updated, but verify no other consumers via `grep -rn "home_department_id\|homeDepartment" src/ docs/ admin.faculytics/ app.faculytics/`
- The atomic source rule is a deliberate trade-off — losing partial-update flexibility in exchange for referential integrity
- The migration assumes all currently-populated `department_id`/`program_id` values are safe to be re-derived. Set `department_source = 'manual'` explicitly for any hand-edited values BEFORE the next sync runs.

**Known Limitations:**

- Users with no enrollments will have null department/program (no fallback)
- Campus derivation is not part of this spec — it remains handled at login by `UserRepository.UpsertFromMoodle` from the username prefix
- No metrics counter or `SyncLog` field — only a log line. FAC-127 or a follow-up should add observability if Stage 2 incident triage proves slow.
- Concurrency between login (`hydrateUserCourses`) and cron (`backfillUserScopes`) is not protected — last-writer-wins on `user.department`. Acceptable because both paths derive the same value via the shared helper, so the race is benign.

**Adversarial Review Findings — Disposition:**

| Finding                                  | Status         | Where addressed                                        |
| ---------------------------------------- | -------------- | ------------------------------------------------------ |
| F1 (campus has no source guard)          | **Fixed**      | Tasks 4/5 strip campus writes; AC12                    |
| F2 (pseudocode broken)                   | **Fixed**      | Task 4 has concrete restructured pseudocode            |
| F3 (docs reference home_department_id)   | **Fixed**      | Task 7 updates both docs; AC13                         |
| F4 (legacy-manual silently flagged auto) | **Accepted**   | Risk note in Task 1 + Notes section                    |
| F5 (referential inconsistency)           | **Fixed**      | Atomic source rule (AC4)                               |
| F6 (line ref nit)                        | Skipped        | Cosmetic only                                          |
| F7 (cron vs login divergence)            | **Fixed**      | Pure helper (Task 3) + convergence test (AC11)         |
| F8 (updatedAt idempotency)               | **Fixed**      | Equality guard + conditional flush (AC10)              |
| F9 (no migration:check)                  | **Fixed**      | Note in Task 1                                         |
| F10 (enum naming)                        | **Fixed**      | Task 2 reuses `InstitutionalRoleSource`                |
| F11 (no manual-login test)               | **Fixed**      | AC8 + Task 6 spec                                      |
| F12 (UUID tiebreaker unstable)           | **Fixed**      | `moodleCategoryId` tiebreaker (AC6)                    |
| F13 (process gripe)                      | Skipped        | Non-substantive                                        |
| F14 (concurrency)                        | **Documented** | Notes section explains the race is benign              |
| F15 (git show truncation)                | **Fixed**      | Tasks 4/Reference instruct full-file extract to `/tmp` |
| F16 (no metrics)                         | **Deferred**   | Notes section flags for follow-up                      |
| F17 (docs deletion)                      | **Fixed**      | Subsumed by F3 fix (Task 7)                            |
| F18 (soft-delete edge)                   | Skipped        | Low value                                              |
