---
title: 'Derive User Roles During Moodle Sync'
slug: 'derive-roles-during-sync'
created: '2026-04-03'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - NestJS 11
  - MikroORM 6
  - BullMQ
  - Jest 30
files_to_modify:
  - src/entities/user.entity.ts
  - src/modules/moodle/services/moodle-enrollment-sync.service.ts
  - src/entities/user.entity.spec.ts (new)
code_patterns:
  - updateRolesFromEnrollments() for role derivation (user.entity.ts:93-114)
  - MoodleRoleMapping for Moodle-to-app role translation (roles.enum.ts:10-16)
  - backfillUserScopes() as precedent for post-enrollment-sync user processing (moodle-enrollment-sync.service.ts:327-436)
  - refreshUserRoles() in AdminService as reference for loading enrollments + institutional roles (admin.service.ts:242-253)
  - Login-time role derivation in hydrateUserCourses() (moodle-user-hydration.service.ts:245-252)
  - PascalCase for public service methods
  - Forked EntityManager for batch operations
  - UnitOfWork for transactional integrity
test_patterns:
  - Unit tests alongside source with .spec.ts suffix
  - NestJS TestingModule with jest.fn() mocks
  - No existing test for EnrollmentSyncService or User entity
  - moodle-sync.processor.spec.ts exists as reference for processor tests
---

# Tech-Spec: Derive User Roles During Moodle Sync

**Created:** 2026-04-03

## Overview

### Problem Statement

User roles (`user.roles`) are only populated during login via `MoodleUserHydrationService.hydrateUserCourses()`. Users who are synced from Moodle but have never logged in appear with empty roles in the admin dashboard. The enrollment data needed to derive basic roles (STUDENT, FACULTY) already exists after the enrollment sync phase but is never used to update `user.roles`.

### Solution

Add a role derivation phase to the Moodle sync pipeline that calls `updateRolesFromEnrollments()` for each touched user after the enrollment sync completes. This uses existing enrollment records and institutional role records to populate `user.roles` without requiring a login.

### Scope

**In Scope:**

- New role derivation phase in the sync processor (after enrollment sync + scope backfill)
- Load `UserInstitutionalRole` records alongside enrollments to preserve DEAN/CHAIRPERSON
- Protect non-enrollment-derived roles (SUPER_ADMIN, ADMIN) from being overwritten by `updateRolesFromEnrollments()`
- Backfill via manual sync trigger post-deploy (no migration script)

**Out of Scope:**

- Username pattern parsing for role inference (deferred)
- Detecting new DEAN/CHAIRPERSON roles during sync (stays login-only, requires user token)
- Dedicated backfill migration script
- Changes to the login-time role derivation flow

## Context for Development

### Codebase Patterns

- **Sync pipeline phases:** `MoodleSyncProcessor.process()` runs Category → Course → Enrollment phases sequentially. Enrollment phase includes 4 sub-phases: HTTP fetch → user upsert → per-course enrollment upsert → scope backfill. Role derivation will be a 5th sub-phase.
- **backfillUserScopes()** (`moodle-enrollment-sync.service.ts:327-436`): Already iterates all touched users after enrollment upsert. Uses a forked `EntityManager`, batch-loads users by `moodleUserId`, updates fields, single `flush()` at end. This is the structural template for the new role derivation phase.
- **updateRolesFromEnrollments()** (`user.entity.ts:93-114`): Full replace of `this.roles`. Takes `Enrollment[]` + optional `UserInstitutionalRole[]` (defaults to `[]`). Uses `MoodleRoleMapping` lookup → uppercase fallback → `Set` deduplication → `Boolean` filter. Does NOT preserve any pre-existing roles on the user.
- **refreshUserRoles()** (`admin.service.ts:242-253`): Reference for correct role refresh — loads both `Enrollment { user, isActive: true }` and `UserInstitutionalRole { user }`, then calls `updateRolesFromEnrollments()`.
- **Login-time derivation** (`moodle-user-hydration.service.ts:245-252`): Same pattern as `refreshUserRoles()` — loads active enrollments + all institutional roles, calls `updateRolesFromEnrollments()`.
- **User upsert during sync** (`moodle-enrollment-sync.service.ts:130-191`): Sets `roles: []` on new users (line 143). The `mergeFields` array (lines 149-157) does NOT include `roles`, so existing user roles are not overwritten by the upsert itself.
- **Method naming:** Public service methods use PascalCase (e.g., `SyncAllCourses`). Private methods use camelCase (e.g., `backfillUserScopes`, `syncAllUsers`).
- **EntityManager forking:** Batch operations fork the EM (`this.em.fork()`) to avoid polluting the request-scoped identity map.

### Files to Reference

| File                                                                   | Purpose                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/modules/moodle/services/moodle-enrollment-sync.service.ts`        | Enrollment sync service — `backfillUserScopes()` is the structural template; new method added here         |
| `src/entities/user.entity.ts`                                          | `updateRolesFromEnrollments()` — needs protected-roles guard                                               |
| `src/modules/auth/roles.enum.ts`                                       | `UserRole` enum and `MoodleRoleMapping`                                                                    |
| `src/entities/enrollment.entity.ts`                                    | Enrollment entity — `role: string`, `isActive: boolean`                                                    |
| `src/entities/user-institutional-role.entity.ts`                       | `UserInstitutionalRole` entity — `role: string`, `source: 'auto' \| 'manual'`                              |
| `src/modules/moodle/processors/moodle-sync.processor.ts`               | Sync processor — no changes needed (role derivation lives inside `EnrollmentSyncService.SyncAllCourses()`) |
| `src/modules/moodle/services/moodle-user-hydration.service.ts:245-252` | Login-time role derivation — reference implementation                                                      |
| `src/modules/admin/services/admin.service.ts:242-253`                  | `refreshUserRoles()` — reference implementation                                                            |
| `src/modules/moodle/processors/moodle-sync.processor.spec.ts`          | Existing processor test — reference for test patterns                                                      |

### Technical Decisions

- **Protected roles:** `updateRolesFromEnrollments()` will preserve `SUPER_ADMIN` and `ADMIN` roles already present on `this.roles`, since these are never derived from enrollments or institutional roles. This is safe because: (1) `MoodleRoleMapping` never produces these values, (2) `UserInstitutionalRole.role` currently only stores DEAN/CHAIRPERSON (no schema constraint enforces this — it's observed behavior, so if new institutional role types are added in the future, revisit the protected-roles set), (3) these roles are assigned locally via seeder or manual DB operations.
- **Institutional role loading:** During sync, `UserInstitutionalRole` records must be loaded for each user so existing DEAN/CHAIRPERSON roles are preserved. Without this, the full-replace behavior of `updateRolesFromEnrollments()` would silently drop them.
- **No changes to sync processor:** The role derivation phase lives inside `EnrollmentSyncService.SyncAllCourses()` as Phase 5, after `backfillUserScopes()`. No changes to `MoodleSyncProcessor` needed.
- **No username pattern parsing:** Enrollment data is sufficient for STUDENT/FACULTY derivation. Username heuristics deferred.
- **Backfill strategy:** Manual sync trigger post-deploy (option B). No dedicated migration.
- **Convergence:** The sync-time and login-time derivation are convergent — both derive roles from the same data sources (enrollments + institutional roles) using the same `MoodleRoleMapping`. Any divergence from concurrent execution (e.g., a user logging in mid-sync) is corrected by the next sync or login. Running both is safe. Note: if Phase 3 partially fails for a specific course, stale enrollment data may feed Phase 5 — see Known Limitations.

## Implementation Plan

### Tasks

- [x] Task 1: Add protected-roles guard to `updateRolesFromEnrollments()`
  - File: `src/entities/user.entity.ts`
  - Action: At the start of `updateRolesFromEnrollments()` (line 93), capture any `SUPER_ADMIN` or `ADMIN` roles already present on `this.roles`. After deriving enrollment + institutional roles, merge the protected roles back into the final `Set` before assigning to `this.roles`.
  - Implementation:
    ```typescript
    const protectedRoles = this.roles.filter(
      (r) => r === UserRole.SUPER_ADMIN || r === UserRole.ADMIN,
    );
    ```
    Then change the final assignment to:
    ```typescript
    this.roles = [
      ...new Set([...protectedRoles, ...enrollmentRoles, ...instRoles]),
    ].filter(Boolean);
    ```
  - Notes: This is a behavioral change that affects all callers (login-time hydration, admin `refreshUserRoles()`, and the new sync-time derivation). All callers benefit from this fix — none of them should be stripping SUPER_ADMIN/ADMIN.

- [x] Task 2: Add `deriveUserRoles()` private method to `EnrollmentSyncService`
  - File: `src/modules/moodle/services/moodle-enrollment-sync.service.ts`
  - Action: Add a new private method following the `backfillUserScopes()` pattern. It receives the same `fetched` parameter.
  - Implementation approach:
    1. Collect unique `moodleUserId` values from `fetched` by iterating ALL remote users across all courses. Note: this differs from `backfillUserScopes()` which skips users in courses without program references — role derivation has no reason to apply that filter.
    2. Fork the `EntityManager`
    3. Batch-load users by Moodle ID: `fork.find(User, { moodleUserId: { $in: moodleUserIds } })`
    4. Extract entity UUIDs: `const userUuids = users.map(u => u.id)`
    5. Batch-load active enrollments by entity UUID: `fork.find(Enrollment, { user: { $in: userUuids }, isActive: true })` — no `populate` needed, only scalar fields (`role`, `isActive`) are accessed by `updateRolesFromEnrollments()`
    6. Batch-load institutional roles by entity UUID: `fork.find(UserInstitutionalRole, { user: { $in: userUuids } })` — no `populate` needed, only `role` scalar is accessed; `moodleCategory` is not used by the derivation
    7. Group enrollments and institutional roles by `user.id` (UUID) using `Map<string, Enrollment[]>` and `Map<string, UserInstitutionalRole[]>`
    8. For each user, snapshot `oldRoles = [...user.roles].sort()`, call `user.updateRolesFromEnrollments(userEnrollments, userInstRoles)`, compare via `JSON.stringify(oldRoles) !== JSON.stringify([...user.roles].sort())` to track change count for logging
    9. Always call `fork.flush()` — this is a deliberate departure from `backfillUserScopes()` which conditionally flushes (`if updated > 0`). For roles, array change detection is unreliable as a persistence gate. MikroORM's change-tracking only generates UPDATE statements for entities with actual column-level changes, so this is a no-op at the DB level if roles haven't logically changed. The change counter is for logging only.
    10. Log the count of users whose roles changed
  - Notes: Add imports for `Enrollment`, `UserInstitutionalRole` at the top of the file. `Enrollment` is already imported. `UserInstitutionalRole` needs to be added.

- [x] Task 3: Call `deriveUserRoles()` as Phase 5 in `SyncAllCourses()`
  - File: `src/modules/moodle/services/moodle-enrollment-sync.service.ts`
  - Action: After the `backfillUserScopes()` call (line 88-93), add a new Phase 5 block that calls `this.deriveUserRoles(fetched)` with the same try/catch + error logging pattern used for Phase 4.
  - Implementation:
    ```typescript
    // Phase 5: Derive user roles from enrollments + institutional roles
    try {
      await this.deriveUserRoles(fetched);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to derive user roles: ${message}`);
    }
    ```
  - Notes: Phase 5 failure should not fail the overall sync — same non-fatal pattern as Phase 4 (`backfillUserScopes`).

- [x] Task 4: Add unit tests for `updateRolesFromEnrollments()` protected-roles behavior
  - File: `src/entities/user.entity.spec.ts` (new file)
  - Action: Test that SUPER_ADMIN and ADMIN roles are preserved through `updateRolesFromEnrollments()`. Cover:
    - User with SUPER_ADMIN + enrollments → SUPER_ADMIN preserved alongside enrollment-derived roles
    - User with ADMIN + enrollments → ADMIN preserved
    - User with no protected roles → behavior unchanged (only enrollment-derived + institutional roles)
    - User with SUPER_ADMIN + no enrollments + no institutional roles → roles = [SUPER_ADMIN]
    - User with enrollment as teacher + institutional role as DEAN → roles contain both FACULTY and DEAN (order-agnostic)
    - User with `manager` enrollment role → roles contain DEAN (via `MoodleRoleMapping`)
    - User with no protected roles + no enrollments + no institutional roles → roles = []
    - User with enrollments where all have `isActive: false` + no institutional roles → roles = [] (validates the `.filter(e => e.isActive)` guard)
  - Notes: Plain unit tests — no NestJS TestingModule needed. This will be the first test file in `src/entities/`; entity-level tests are appropriate here because `updateRolesFromEnrollments()` is pure logic with no DI dependencies. Create `Enrollment` and `UserInstitutionalRole` stubs with just the fields `updateRolesFromEnrollments()` accesses (`role`, `isActive`). Use `as unknown as Enrollment` / `as unknown as UserInstitutionalRole` type assertions for stub objects (consistent with existing test patterns, e.g., `admin.service.spec.ts`). Use `expect.arrayContaining` for role assertions — array order is not guaranteed and should not be tested.

### Acceptance Criteria

- [ ] AC 1: Given a user synced from Moodle with `editingteacher` enrollments who has never logged in, when the Moodle sync completes, then `user.roles` contains `FACULTY`.
- [ ] AC 2: Given a user synced from Moodle with `student` enrollments who has never logged in, when the Moodle sync completes, then `user.roles` contains `STUDENT`.
- [ ] AC 3: Given a user with both `student` and `editingteacher` enrollments across different courses, when the Moodle sync completes, then `user.roles` contains both `STUDENT` and `FACULTY` (deduplicated).
- [ ] AC 4: Given a user with `SUPER_ADMIN` in their roles and active enrollments, when the Moodle sync completes, then `user.roles` still contains `SUPER_ADMIN` alongside their enrollment-derived roles.
- [ ] AC 5: Given a user with `ADMIN` in their roles, when `updateRolesFromEnrollments()` is called from any caller (sync, login, admin refresh), then `ADMIN` is preserved in the resulting roles array.
- [ ] AC 6: Given a user with a manually assigned `DEAN` institutional role, when the Moodle sync completes, then `user.roles` contains `DEAN` alongside their enrollment-derived roles.
- [ ] AC 7: Given the Moodle sync's role derivation phase completes, then only users present in the current sync batch have their roles re-derived. Users not in the batch (e.g., removed from all Moodle courses) retain their last-known roles until a login or manual admin refresh.
- [ ] AC 8: Given the Moodle sync's role derivation phase fails, when the sync completes, then the overall sync status is not `failed` — scope backfill and enrollment data remain intact.
- [ ] AC 9: Given a user with a `manager` enrollment role (Moodle role shortname), when the Moodle sync completes, then `user.roles` contains `DEAN` via `MoodleRoleMapping`. This is consistent with existing login-time behavior — `MoodleRoleMapping["manager"]` → `UserRole.DEAN`. The sync does not introduce a new privilege path; it replicates the same mapping the login flow already performs.

## Additional Context

### Dependencies

- No new dependencies required. All role mapping and derivation logic already exists.
- `UserInstitutionalRole` import needs to be added to `moodle-enrollment-sync.service.ts`.

### Testing Strategy

**Unit Tests:**

- `src/entities/user.entity.spec.ts` (new) — Tests for `updateRolesFromEnrollments()`:
  - Protected roles preservation (SUPER_ADMIN, ADMIN)
  - Enrollment role mapping via `MoodleRoleMapping`
  - Institutional role inclusion
  - Deduplication behavior
  - Empty enrollments / empty institutional roles edge cases

**Manual Testing:**

1. Deploy to staging
2. Verify admin dashboard shows users with empty roles (pre-condition)
3. Trigger a manual Moodle sync from the admin console
4. Refresh admin dashboard — users should now show STUDENT/FACULTY roles
5. Verify the SUPER_ADMIN user's roles are unchanged
6. Verify any users with DEAN/CHAIRPERSON institutional roles still have those roles

### Notes

- The login-time flow (`hydrateUserCourses()`) will continue to work as before — it does its own call to `updateRolesFromEnrollments()` with fresh enrollment data. The sync-time derivation and login-time derivation are idempotent and produce the same result for the same data.
- Party mode discussion surfaced the SUPER_ADMIN overwrite risk and the need to load institutional roles — both are critical correctness requirements.
- The protected-roles guard in Task 1 is a defensive fix that benefits all existing callers, not just the new sync-time path. If a SUPER_ADMIN user had ever logged in before this fix, their SUPER_ADMIN role would have been silently dropped by the login-time `updateRolesFromEnrollments()` call. This has likely not manifested because the superadmin user is locally created and probably has no Moodle enrollments.
- Post-deploy backfill: After deploying, trigger a manual sync from the admin console to populate roles for all existing users. No migration script needed.

### Known Limitations (from adversarial review)

- **Stale roles for fully-removed users:** Users removed from all Moodle courses won't appear in the `fetched` data, so `deriveUserRoles()` never visits them. Their roles persist until a login or manual admin refresh. This is acceptable for v1 — these users are effectively inactive.
- **Pre-existing stale `this.roles` in admin path:** `AdminService.refreshUserRoles()` does not re-load the User entity before capturing protected roles. If the user was loaded earlier in the same request with different roles, the guard reads stale data. This is a pre-existing issue, not introduced by this feature. Out of scope.
- **`MoodleRoleMapping` dead code for institutional roles:** `updateRolesFromEnrollments()` runs institutional role values (e.g., `"DEAN"`) through `MoodleRoleMapping`, which never matches (keys are lowercase Moodle names). The uppercase fallback produces the correct result by coincidence. Refactoring this is out of scope but noted for future cleanup.
- **`updatedAt` not explicitly refreshed:** When `deriveUserRoles()` mutates `user.roles`, `CustomBaseEntity.updatedAt` is not explicitly set to `new Date()`. MikroORM only persists changed columns, so `updatedAt` remains stale. No current consumer relies on `User.updatedAt` for change detection, so this is acceptable for v1.
- **Unbounded enrollment query at scale:** The batch query `find(Enrollment, { user: { $in: userUuids }, isActive: true })` loads all enrollments for all touched users in a single SELECT. At 57 users this is trivial. If the user base grows past ~5,000 users, consider chunking the query. Not a concern for v1.
- **Sync/login concurrency:** If a user logs in during a sync (between Phase 3 and Phase 5), the login may derive a more complete role set (from the user's own token), which Phase 5 could then overwrite with its batch-derived view. The next login or sync corrects this. The window is negligible.
- **`manager` enrollment → DEAN without capability check:** `MoodleRoleMapping["manager"]` → `UserRole.DEAN` is applied to enrollment roles during derivation. This means a user with `manager` as their Moodle course role will get DEAN in `user.roles` without the `moodle/category:manage` capability check that the login-time `resolveInstitutionalRoles()` performs. This is **not a new behavior** — the login-time flow applies the same mapping via `updateRolesFromEnrollments()`. The sync just makes it fire earlier. If this is a security concern, `MoodleRoleMapping` should be audited as a separate task to remove or gate the `manager`/`chairperson` entries.
- **Phase 3 partial failure → stale enrollments in Phase 5:** If Phase 3 fails for a specific course (per-course try/catch at `SyncAllCourses` line 73-84), enrollments for that course retain their previous `isActive` state. Phase 5 reads whatever is committed, so it may derive roles from stale enrollment data for that course. This divergence persists if the same course continues to fail across syncs. The login-time flow is more authoritative in this case.

## Review Notes

- Adversarial review completed
- Findings: 12 total, 2 fixed, 10 skipped (noise/pre-existing)
- Resolution approach: auto-fix
- Fixes applied: extracted `groupByUserId` helper (DRY), added unknown-role fallback test
