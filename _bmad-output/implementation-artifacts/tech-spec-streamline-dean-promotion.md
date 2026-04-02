---
title: 'Streamline Dean Promotion Flow'
slug: 'streamline-dean-promotion'
created: '2026-04-02'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'MikroORM 6',
    'PostgreSQL',
    'TypeScript 5.7',
    'class-validator',
    '@nestjs/swagger',
  ]
files_to_modify:
  - 'src/modules/admin/admin.controller.ts'
  - 'src/modules/admin/services/admin.service.ts'
  - 'src/modules/admin/services/admin.service.spec.ts'
  - 'src/modules/admin/dto/requests/dean-eligible-categories-query.dto.ts (new)'
  - 'src/modules/admin/dto/responses/dean-eligible-category.response.dto.ts (new)'
code_patterns:
  - 'Controllers use @UseJwtGuard(UserRole.SUPER_ADMIN) for auth'
  - 'Services inject EntityManager directly'
  - 'DTOs use class-validator + @nestjs/swagger decorators'
  - 'Response DTOs have static Map() methods'
  - 'Public service methods use PascalCase'
  - 'findOneOrFail always uses failHandler for NestJS exceptions'
  - 'UserInstitutionalRole.role is string, compare with (UserRole.X as string)'
test_patterns:
  - 'Tests use Test.createTestingModule with mocked EntityManager'
  - 'Tests co-located with source as .spec.ts'
  - 'Jest mocks for em methods: find, findOneOrFail, etc.'
---

# Tech-Spec: Streamline Dean Promotion Flow

**Created:** 2026-04-02
**Issue:** [#249](https://github.com/CtrlAltElite-Devs/api.faculytics/issues/249)

## Overview

### Problem Statement

The `POST /admin/institutional-roles` endpoint requires a numeric `moodleCategoryId` to assign a DEAN role, but admins have no reliable way to discover the correct ID. The admin console currently presents a raw text input, forcing admins to manually look up Moodle category IDs. CHAIRPERSON roles are auto-assigned via Moodle sync (`category:manage` capability check), so only DEAN promotion needs a manual flow.

### Solution

Create a new endpoint that returns the eligible depth-3 (department-level) Moodle categories for a given user, derived from their existing institutional role assignments. The user's CHAIRPERSON roles (auto-synced from Moodle or manually assigned) are resolved up the category tree to depth 3. The admin console can then present a dropdown of valid targets, and the selected `moodleCategoryId` is sent to the existing assignment endpoint.

### Scope

**In Scope:**

- New API endpoint: `GET /admin/institutional-roles/dean-eligible-categories?userId=<uuid>`
- Query the user's existing `UserInstitutionalRole` records where `role === CHAIRPERSON`, resolve to depth 3
- Exclude categories where user is already DEAN
- Return list of eligible department-level categories with `moodleCategoryId` and `name`
- Super admin access guard
- Unit tests

**Out of Scope:**

- Admin console UI changes (separate repo: `admin.faculytics`)
- Changes to the existing `POST /admin/institutional-roles` contract
- CHAIRPERSON assignment (handled by Moodle sync)
- Moodle sync modifications

## Context for Development

### Codebase Patterns

- **Auth:** Controller-level `@UseJwtGuard(UserRole.SUPER_ADMIN)` — already applied to `AdminController`
- **Entity queries:** Services inject `EntityManager` directly, use `em.find()` with `populate` for relations
- **DTOs:** Request DTOs use `class-validator` decorators (`IsUUID`, `IsString`, etc.), response DTOs use `@nestjs/swagger` decorators (`ApiProperty` with `description` and `example`) with static `Map()` factory methods
- **Method naming:** Public service methods use PascalCase (e.g., `ListUsers`, `AssignInstitutionalRole`)
- **Error handling:** Standard NestJS exceptions (`NotFoundException`, `BadRequestException`). All `findOneOrFail` calls must use `{ failHandler: () => new NotFoundException(...) }` — bare `findOneOrFail` throws MikroORM's `NotFoundError` (500), not NestJS's `NotFoundException` (404)
- **Query DTOs:** See `FilterDepartmentsQueryDto` pattern — single optional/required field with `@ApiPropertyOptional`/`@ApiProperty` + validators
- **String enum comparison:** `UserInstitutionalRole.role` is typed as `string`, not `UserRole` enum. Compare using `ir.role === (UserRole.DEAN as string)` pattern (see `moodle-user-hydration.service.ts` line 393)
- **Read-only methods:** This new method is a pure query — no `flush()` or `refreshUserRoles()` needed

### Files to Reference

| File                                                             | Purpose                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/modules/admin/admin.controller.ts`                          | Existing admin endpoints — add new GET here                                                        |
| `src/modules/admin/services/admin.service.ts`                    | Service with `AssignInstitutionalRole` — add query method here                                     |
| `src/modules/admin/services/admin.service.spec.ts`               | Existing tests — add new tests here                                                                |
| `src/entities/user-institutional-role.entity.ts`                 | `UserInstitutionalRole` — links user→role→moodleCategory, unique on `(user, moodleCategory, role)` |
| `src/entities/moodle-category.entity.ts`                         | `MoodleCategory` — `moodleCategoryId`, `name`, `depth`, `parentMoodleCategoryId`                   |
| `src/modules/admin/dto/responses/filter-option.response.dto.ts`  | Pattern reference for response DTO with static `Map()`                                             |
| `src/modules/admin/dto/requests/filter-departments-query.dto.ts` | Pattern reference for query DTO                                                                    |
| `src/modules/admin/admin.module.ts`                              | Module already imports all needed entities                                                         |
| `src/modules/common/services/scope-resolver.service.ts`          | Pattern reference for batch `$in` query on `moodleCategoryId`                                      |

### Technical Decisions

- **User-centric query:** Resolve eligible categories from the user's own `UserInstitutionalRole` records, not from a global category list
- **Explicit CHAIRPERSON filter:** Only roles where `role === (UserRole.CHAIRPERSON as string)` are considered candidates. Do NOT use "everything that isn't DEAN" — this prevents future role types from being silently included
- **Both source types included:** All CHAIRPERSON roles regardless of `source` (auto or manual) are considered eligible. The `source` distinction is for sync cleanup logic, not eligibility
- **Depth resolution:** For depth 4 categories, follow `parentMoodleCategoryId` to get the depth 3 parent. For depth 3 categories, use directly. Other depths are skipped
- **Batch parent resolution:** Collect all `parentMoodleCategoryId`s from depth-4 candidates and batch-fetch with `em.find(MoodleCategory, { moodleCategoryId: { $in: [...ids] } })` — no N+1 queries
- **Null guard on populated relations:** Skip any `UserInstitutionalRole` where `moodleCategory` is null after populate (handles edge case of soft-deleted `MoodleCategory`)
- **Exclusion:** Filter out categories where the user already holds a DEAN role
- **Deduplication:** Multiple CHAIRPERSON roles at depth 4 under the same department collapse to one entry
- **No new entities or module changes:** `AdminModule` already imports `UserInstitutionalRole`, `MoodleCategory`, and `User`
- **Response shape:** `{ moodleCategoryId: number, name: string }` — minimal, directly usable by the assignment DTO

## Implementation Plan

### Tasks

- [ ] Task 1: Create response DTO
  - File: `src/modules/admin/dto/responses/dean-eligible-category.response.dto.ts` (new)
  - Action: Create DTO with `moodleCategoryId` (number) and `name` (string), `@ApiProperty` decorators with `description` and `example` values, and static `Map(category: MoodleCategory)` factory method
  - Example:

    ```typescript
    export class DeanEligibleCategoryResponseDto {
      @ApiProperty({
        description: 'Moodle category ID for the department',
        example: 8,
      })
      moodleCategoryId: number;

      @ApiProperty({ description: 'Department name', example: 'CCS' })
      name: string;

      static Map(category: MoodleCategory): DeanEligibleCategoryResponseDto {
        return {
          moodleCategoryId: category.moodleCategoryId,
          name: category.name,
        };
      }
    }
    ```

- [ ] Task 2: Create request query DTO
  - File: `src/modules/admin/dto/requests/dean-eligible-categories-query.dto.ts` (new)
  - Action: Create DTO with required `userId` field, `@ApiProperty({ description: '...' })` + `@IsUUID()` validators
  - Notes: Follow `FilterDepartmentsQueryDto` pattern but with `userId` as required (not optional)

- [ ] Task 3: Add service method `GetDeanEligibleCategories`
  - File: `src/modules/admin/services/admin.service.ts`
  - Action: Add new public method with this logic:
    1. Validate user exists:
       ```typescript
       await this.em.findOneOrFail(
         User,
         { id: userId },
         {
           failHandler: () => new NotFoundException('User not found'),
         },
       );
       ```
    2. Fetch all institutional roles with populated moodleCategory:
       ```typescript
       const roles = await this.em.find(
         UserInstitutionalRole,
         { user: userId },
         { populate: ['moodleCategory'] },
       );
       ```
    3. Build DEAN exclusion set — collect `moodleCategoryId` from roles where `ir.role === (UserRole.DEAN as string)`:
       ```typescript
       const deanCategoryIds = new Set(
         roles
           .filter(
             (ir) => ir.role === (UserRole.DEAN as string) && ir.moodleCategory,
           )
           .map((ir) => ir.moodleCategory.moodleCategoryId),
       );
       ```
    4. Filter CHAIRPERSON candidates (explicitly, not "non-DEAN"), skip null moodleCategory:
       ```typescript
       const chairpersonRoles = roles.filter(
         (ir) =>
           ir.role === (UserRole.CHAIRPERSON as string) && ir.moodleCategory,
       );
       ```
    5. Separate depth-3 (direct) and depth-4 (need parent resolution):
       - Depth 3 → add directly to candidates `Map<number, MoodleCategory>`
       - Depth 4 → collect `parentMoodleCategoryId` for batch fetch
       - Other depths → skip
    6. Batch-fetch depth-4 parents (no N+1):
       ```typescript
       const parentCategories = await this.em.find(MoodleCategory, {
         moodleCategoryId: { $in: [...parentIds] },
       });
       ```
       Add resolved parents to candidates map.
    7. Exclude any `moodleCategoryId` in the DEAN exclusion set.
    8. Return mapped through `DeanEligibleCategoryResponseDto.Map()`, sorted by `name`.
  - Notes: Method signature: `async GetDeanEligibleCategories(userId: string): Promise<DeanEligibleCategoryResponseDto[]>`. This is a read-only query — no `flush()` or `refreshUserRoles()` needed.

- [ ] Task 4: Add controller endpoint
  - File: `src/modules/admin/admin.controller.ts`
  - Action: Add new GET endpoint in `AdminController`:
    ```typescript
    @Get('institutional-roles/dean-eligible-categories')
    @ApiOperation({ summary: 'List eligible department categories for DEAN promotion' })
    @ApiQuery({ name: 'userId', required: true, type: String, description: 'UUID of the user to check eligibility for' })
    @ApiResponse({ status: 200, type: [DeanEligibleCategoryResponseDto] })
    @ApiResponse({ status: 404, description: 'User not found' })
    async GetDeanEligibleCategories(
      @Query() query: DeanEligibleCategoriesQueryDto,
    ): Promise<DeanEligibleCategoryResponseDto[]> {
      return this.adminService.GetDeanEligibleCategories(query.userId);
    }
    ```
  - Notes: Import the new DTOs. No route ordering concern — GET `institutional-roles/dean-eligible-categories` and POST `institutional-roles` are different HTTP methods and different paths; no ambiguity.

- [ ] Task 5: Add unit tests
  - File: `src/modules/admin/services/admin.service.spec.ts`
  - Action: Add new `describe('GetDeanEligibleCategories')` block with these test cases:
    1. **Happy path — depth 4 resolved to depth 3:** User has CHAIRPERSON at depth 4 (programCatId=18, parentMoodleCategoryId=8) → batch-fetches parent → returns dept category (catId=8, name='CCS'). Mock `em.findOneOrFail` with `failHandler` for user lookup, `em.find` for roles (returns CHAIRPERSON role with depth-4 moodleCategory), `em.find` for batch parent fetch (returns depth-3 category).
    2. **Happy path — depth 3 used directly (manual-assignment scenario):** User has CHAIRPERSON at depth 3 (catId=8) → returns that category directly. Note: Moodle sync only creates CHAIRPERSON at depth 4; depth-3 CHAIRPERSON comes from manual assignment via `POST /admin/institutional-roles`.
    3. **Deduplication:** User has CHAIRPERSON at two depth-4 categories (catId=18, catId=19) both with same parentMoodleCategoryId=8 → batch-fetches one parent → returns one entry.
    4. **Exclusion of existing DEAN:** User has DEAN at dept catId=8 AND CHAIRPERSON at catId=18 (child of 8) → resolved parent matches DEAN exclusion set → returns empty array.
    5. **User not found:** `em.findOneOrFail` `failHandler` invoked → throws `NotFoundException`.
    6. **No institutional roles:** User exists, `em.find` returns empty array → returns empty array.
    7. **Mixed scenario:** User has CHAIRPERSON at programs under dept A (catId=8) and dept B (catId=12), already DEAN at dept A → returns only dept B (catId=12).
  - Notes: Follow existing test patterns. Mock `em.findOneOrFail` with `failHandler` support, `em.find` for institutional roles and batch parent fetch.

### Acceptance Criteria

- [ ] AC 1: Given a user with CHAIRPERSON roles at depth-4 categories, when `GET /admin/institutional-roles/dean-eligible-categories?userId=<uuid>` is called, then the response contains the resolved depth-3 parent departments with `moodleCategoryId` and `name`
- [ ] AC 2: Given a user with CHAIRPERSON roles at depth-3 categories (manually assigned), when the endpoint is called, then those categories are returned directly
- [ ] AC 3: Given a user with multiple CHAIRPERSON roles under the same department, when the endpoint is called, then only one entry per department is returned (deduplication)
- [ ] AC 4: Given a user who already has a DEAN role at a department, when the endpoint is called, then that department is excluded from the results
- [ ] AC 5: Given a user with no institutional roles, when the endpoint is called, then an empty array is returned
- [ ] AC 6: Given an invalid userId, when the endpoint is called, then a 404 NotFoundException is returned
- [ ] AC 7: Given an unauthenticated request or a non-SUPER_ADMIN user, when the endpoint is called, then a 401/403 response is returned
- [ ] AC 8: Given the endpoint response, then each item's `moodleCategoryId` corresponds to a valid depth-3 MoodleCategory in the database

## Additional Context

### Dependencies

- No new package dependencies required
- All entities already imported in `AdminModule`: `User`, `UserInstitutionalRole`, `MoodleCategory`
- Depends on Moodle sync having run at least once for the target user (CHAIRPERSON roles populated via `MoodleUserHydrationService.resolveInstitutionalRoles()`)
- Global `ValidationPipe` must be enabled for `@IsUUID()` on the query DTO to validate at the HTTP level

### Testing Strategy

**Unit Tests (Task 5):**

- 7 test cases covering happy paths, deduplication, exclusion, error handling, and edge cases
- Mock `EntityManager` methods: `findOneOrFail` (with `failHandler`), `find` (for roles and batch parent fetch)
- Follow existing patterns in `admin.service.spec.ts`

**Manual Testing:**

- Call `GET /admin/institutional-roles/dean-eligible-categories?userId=<uuid>` via Swagger or curl
- Verify response contains correct department categories for a user with known CHAIRPERSON roles
- Verify empty response for user with no roles or user who is already DEAN everywhere
- Verify 404 for nonexistent userId
- Verify end-to-end: select a `moodleCategoryId` from the response and send it to `POST /admin/institutional-roles` to confirm DEAN assignment succeeds

### Notes

- Consumer: `admin.faculytics` (React + Vite admin console) — the role assignment dialog at `src/features/admin/role-action-dialog.tsx` can replace its raw number input with a dropdown populated by this endpoint
- CHAIRPERSON roles are auto-synced during login via `MoodleUserHydrationService.resolveInstitutionalRoles()` — users who have `moodle/category:manage` on a course's program category get CHAIRPERSON at that depth-4 category
- A user who has never logged in will have no institutional roles and thus no eligible categories — this is expected and the admin should trigger a sync or wait for the user to log in

## Review Notes

- Adversarial spec review completed: 13 findings, 10 fixed, 3 skipped (noise)
- Adversarial code review completed: 12 findings, 3 fixed, 9 skipped (noise/systemic/by-design)
- Code fixes applied: depth-3 validation on batch-fetched parents, test for unexpected depths, test for sort order
- Resolution approach: auto-fix on real findings
