---
title: 'FAC-129 refactor: filter dean faculty listing by home department'
slug: 'fac-129-faculty-listing-home-department'
created: '2026-04-13'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  ['NestJS 11', 'MikroORM 6 (postgresql driver)', 'PostgreSQL 15', 'Jest']
files_to_modify:
  - 'src/modules/faculty/services/faculty.service.ts'
  - 'src/modules/faculty/faculty.controller.ts'
  - 'src/modules/faculty/services/faculty.service.spec.ts'
code_patterns:
  - 'ScopeResolverService.ResolveDepartmentIds for scope'
  - 'CurrentUserInterceptor + @UseJwtGuard for role gating'
  - 'em.findAndCount(User, filter, { limit, offset, orderBy }) for paginated lists'
  - 'roles: { $contains: [UserRole.FACULTY] } for Postgres text[] role filtering'
  - 'fullName: { $ilike: `%${search}%` } for name search'
  - 'Scoped filter: user.department / user.program via FilterQuery<User>'
test_patterns:
  - 'TestingModule with mocked EntityManager + ScopeResolverService'
  - 'Given/When/Then ACs'
  - 'Jest mock for em.findAndCount returning [items, count]'
---

# Tech-Spec: FAC-129 refactor: filter dean faculty listing by home department

**Created:** 2026-04-13

## Overview

### Problem Statement

The dean/chairperson primary faculty listing (`GET /faculty`) currently answers "which faculty teach courses in my scope?" by joining `enrollment → course → program → department`. Under the scoping philosophy established in FAC-125, the correct question is "which faculty are institutionally _home_ in my scope?" — independent of teaching load. A CCS-home-dept faculty teaching only SOE-owned courses today is still a CCS faculty member and must appear on the CCS dean's roster; conversely, a SOE-home faculty teaching a CCS-owned course must **not** leak onto the CCS dean's primary list.

### Solution

Rewire the primary `GET /faculty` query to filter by `user.department_id IN (scopedDepartmentIds)` and apply `departmentId` / `programId` query-param filters against `user.department_id` / `user.program_id` (home dept/program). Preserve the legacy enrollment-join behavior as a secondary endpoint `GET /faculty/cross-department-teaching` that returns only _true_ cross-dept faculty (home dept ≠ course-owning dept) so nothing is lost for workload-oriented views. The `subjects[]` field on the primary card continues to show all scope-visible courses the faculty teaches this semester (may be empty for home-dept faculty not teaching in scope).

### Scope

**In Scope:**

- Rewrite `FacultyService.ListFaculty` primary query to filter by `user.department_id` and optional `user.department_id` / `user.program_id` params.
- `subjects[]` enrichment continues via a secondary batch query against scoped enrollments (empty array allowed).
- New endpoint `GET /faculty/cross-department-teaching` preserving the legacy enrollment-join query, scoped to true-cross-dept faculty only (home dept ≠ course-owning dept).
- Shared `ListFacultyQueryDto`, `FacultyListResponseDto`, `FacultyCardResponseDto` reused across both endpoints; add a new DTO only if a field diverges.
- Update `faculty.service.spec.ts` to cover new primary semantics, the secondary endpoint, and all ACs below.
- Silently exclude faculty with `user.department_id = NULL` from the primary list.

**Out of Scope:**

- Per-semester historical home-dept resolution. `user.department_id` reflects _current_ state; a dean querying an older semester sees today's home-dept mapping. FAC-128 already handles per-submission home-dept snapshots for analytics continuity.
- Frontend (`app.faculytics`) dean dashboard UI changes for the new secondary endpoint — tracked as a separate frontend issue.
- Faculty detail endpoints and `GET /faculty/:id/submission-count` (unchanged).
- Any change to `ScopeResolverService`.

## Context for Development

### Codebase Patterns

- **Scope resolution**: Every scoped list endpoint calls `ScopeResolverService.ResolveDepartmentIds(semesterId)`. Returns `null` = super-admin (unrestricted), `string[]` = restricted dept IDs. Must validate user-supplied `departmentId` / `programId` against scope before querying. (`src/modules/common/services/scope-resolver.service.ts:21`)
- **Role filtering on `user.roles` (Postgres `text[]`)**: Use MikroORM `$contains` operator. Example: `roles: { $contains: [UserRole.FACULTY] }` (`src/modules/admin/services/admin.service.ts:386`).
- **Paginated list pattern**: `em.findAndCount(User, filter, { limit, offset, orderBy })`. Returns `[items, totalCount]` in one call. Example: `src/modules/enrollments/enrollments.service.ts:39-47`.
- **Name search**: `fullName: { $ilike: `%${escaped}%` }` with manual `%`/`_`/`\` escape (reuse existing `EscapeLikeWildcards` helper).
- **Department filter**: Direct FK assignment `filter.department = id` or `filter.department = { $in: [ids] }` (see `src/modules/admin/services/admin.service.ts:397-399` and `src/modules/curriculum/services/curriculum.service.ts:110`).
- **Raw SQL vs QB**: Current `ListFaculty` uses raw SQL via `em.getConnection().execute()` for `COUNT(DISTINCT e.user_id)` across enrollment joins. Under new primary semantics, each user row is unique → standard `em.findAndCount(User, ...)` replaces the raw SQL. Keep the enrollment raw SQL intact for the legacy secondary endpoint.
- **Controller gating**: `FacultyController` is guarded by `@UseJwtGuard(SUPER_ADMIN, DEAN, CHAIRPERSON)` with `CurrentUserInterceptor`. New endpoint inherits the same guards — just another `@Get(...)` in the same controller.
- **Response mapping**: `FacultyCardResponseDto.Map(user, courseShortnames[])` — reused for both endpoints; `subjects` sorted alphabetically and deduped inside the mapper.
- **Note (non-blocking)**: No index exists on `user.department_id`. For the primary listing under dean scope the cardinality is modest (hundreds of faculty), so we accept this and do not add an index in this ticket.

### Files to Reference

| File                                                                   | Purpose                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/modules/faculty/services/faculty.service.ts`                      | Primary rewrite target; keep legacy SQL as the cross-dept method                                                 |
| `src/modules/faculty/faculty.controller.ts:20-51`                      | Add `GET /cross-department-teaching` route (same guards)                                                         |
| `src/modules/faculty/services/faculty.service.spec.ts`                 | Extend tests for both endpoints                                                                                  |
| `src/modules/faculty/dto/requests/list-faculty-query.dto.ts`           | Existing query DTO — reused as-is for both endpoints                                                             |
| `src/modules/faculty/dto/responses/faculty-list.response.dto.ts`       | Existing response — reused as-is                                                                                 |
| `src/modules/faculty/dto/responses/faculty-card.response.dto.ts:23-30` | `Map(user, shortnames)` — reused                                                                                 |
| `src/modules/common/services/scope-resolver.service.ts:21`             | `ResolveDepartmentIds` — no change                                                                               |
| `src/entities/user.entity.ts:52-67`                                    | `department`/`program` nullable ManyToOne; `departmentSource`/`programSource`; FKs `department_id`, `program_id` |
| `src/entities/user.entity.ts:87`                                       | `roles: UserRole[]` stored as Postgres `text[]` — use `$contains` filter                                         |
| `src/entities/program.entity.ts:25-26`                                 | `program.department` non-nullable ManyToOne                                                                      |
| `src/modules/auth/roles.enum.ts:6`                                     | `UserRole.FACULTY` — role literal used in filter                                                                 |
| `src/modules/enrollments/enrollments.service.ts:39-47`                 | Reference `findAndCount` pattern for pagination                                                                  |
| `src/modules/admin/services/admin.service.ts:371-406`                  | Reference `$contains` role filter + `$ilike` search                                                              |
| `src/entities/enrollment.entity.ts`                                    | Read-only reference for the legacy cross-dept query                                                              |

### Technical Decisions

1. **Primary query uses MikroORM EntityManager, not raw SQL.** Simpler, typesafe, no DISTINCT required since each user row is unique.
2. **`subjects[]` enrichment query unchanged.** Still batch-fetches enrollments for the paginated user IDs, filtered by `BuildCourseFilter`-equivalent scope + semester. Empty array is valid output.
3. **`departmentId` / `programId` filter `user.*` (home).** Scope validation against `ScopeResolverService` happens before the query, same as today.
4. **Secondary endpoint: reuse `ListFacultyQueryDto` + `FacultyListResponseDto`.** Same pagination/search/filter UX. `departmentId` / `programId` in this endpoint filter by _course-owning_ dept/program (legacy semantics).
5. **Cross-dept filter semantics**: `WHERE course.program.department.id != user.department_id` in addition to the legacy scope/semester joins. If `user.department_id IS NULL`, faculty is excluded (they can't be "cross-dept" without a home dept).
6. **NULL home dept handling**: Silent exclusion from primary list. SuperAdmin can assign via FAC-127 admin UI.
7. **Ordering**: Primary list orders by `fullName ASC NULLS LAST, id ASC` via `orderBy: { fullName: QueryOrder.ASC_NULLS_LAST, id: QueryOrder.ASC }`. Explicit NULLS handling makes pagination stable when some users have `fullName = NULL` (parity with Postgres default, but documented).
8. **Role filter on primary**: `roles: { $contains: [UserRole.FACULTY] }` — MikroORM maps this to Postgres `@>` on the `text[]` column.
9. **Active / soft-delete**: `isActive: true` on User filter; soft-delete is handled globally by the MikroORM filter in `mikro-orm.config.ts`, so no explicit `deleted_at IS NULL` needed on the entity-level query.
10. **Subjects enrichment reuses `BuildCourseFilter`**: the existing semester+scope course filter is sound for the subjects query. Keep it as-is; it is now only used inside `ListFaculty`'s enrichment step. An empty `subjects[]` is valid output (home-dept faculty with no scope-visible teaching this semester).
11. **`GetSubmissionCount` untouched** — out of scope.
12. **Test doubles**: replace `executeMock` (raw SQL stub) with `em.findAndCount` mock in the primary-path tests. Keep `executeMock` only for secondary-endpoint tests (which still hit raw SQL).

## Implementation Plan

### Tasks

Tasks are ordered by dependency (lowest level first): entity-level query helper → service method rewire → controller route → tests.

- [x] **Task 1: Extract a private `BuildUserFilter(query, departmentIds)` helper on `FacultyService`**
  - File: `src/modules/faculty/services/faculty.service.ts`
  - Action: Add a private method returning `FilterQuery<User>` composed of:
    - `roles: { $contains: [UserRole.FACULTY] }` (import `UserRole` from `src/modules/auth/roles.enum`)
    - `isActive: true`
    - `department: departmentIds === null ? { $ne: null } : { $in: departmentIds }` — null scope (super-admin) still excludes NULL home-dept; restricted scope narrows to `$in`.
    - If `query.departmentId`: override `department: query.departmentId`.
    - If `query.programId`: add `program: query.programId`.
    - If `query.search`: add `fullName: { $ilike: `%${this.EscapeLikeWildcards(query.search)}%` }`.
  - Notes: This helper is for the _primary_ list only. The legacy `BuildEnrollmentFilter` + `BuildCourseFilter` stay — they serve the secondary endpoint and the subjects enrichment.

- [x] **Task 1a: Empirical preflight — verify generated SQL for `department: { $ne: null }` on ManyToOne**
  - File: `src/modules/faculty/services/faculty.service.spec.ts`
  - Action: Add a focused test that boots a real MikroORM `EntityManager` in test config (SQLite-in-memory or Postgres test DB, whichever the project supports) and asserts that `em.qb(User).where({ department: { $ne: null } }).getKnexQuery().toString()` produces SQL containing `department_id is not null` (not `department_id != NULL`). If the assertion fails, fall back to `department: { id: { $ne: null } }` or explicit FK projection. This test MUST pass before proceeding to Task 2.
  - Notes: No precedent in the codebase for `$ne: null` on a ManyToOne relation (verified: 6 existing usages are all on scalar columns in `src/modules/analysis/services/*`). The preflight removes ORM-behavior guesswork per yander's "empirical verification over debate" principle. If the project lacks a real-MikroORM test harness, fall back to validating the SQL via a one-off script in `scripts/` and delete after verification — document the result in the Task 1 Notes.

- [x] **Task 2: Rewrite `FacultyService.ListFaculty` primary path using MikroORM `findAndCount`**
  - File: `src/modules/faculty/services/faculty.service.ts` (replace lines 29–175 body as noted)
  - Action:
    1. Keep steps 1 (semester validation) and 2 (scope resolution) and 3 (program/department cross-validation) as-is.
    2. **Early-return for empty scope**: After scope resolution, if `departmentIds !== null && departmentIds.length === 0`, return the empty-meta shape (`{ data: [], meta: { totalItems: 0, itemCount: 0, itemsPerPage: limit, totalPages: 0, currentPage: page } }`) immediately — DO NOT call `findAndCount`. This removes any `{ $in: [] }` edge-case risk.
    3. Compute `page`, `limit`, `offset` before the call (same as current).
    4. Replace steps 4–7 with:
       ```ts
       const userFilter = this.BuildUserFilter(query, departmentIds);
       const [users, totalItems] = await this.em.findAndCount(
         User,
         userFilter,
         {
           limit,
           offset,
           orderBy: { fullName: QueryOrder.ASC_NULLS_LAST, id: QueryOrder.ASC },
         },
       );
       ```
       Import `QueryOrder` from `@mikro-orm/core`. `ASC_NULLS_LAST` makes NULL `fullName` ordering explicit and pagination-stable.
    5. Early-return the empty-meta shape when `totalItems === 0` (parity with current behavior).
    6. **Guard enrichment on non-empty users**: only run the enrollment batch query if `users.length > 0`. Skip entirely if empty — no point issuing a query with `user: { $in: [] }`.
    7. For subjects enrichment: keep the existing `em.find(Enrollment, { user: { $in: userIds }, role: { $in: [TEACHER, EDITING_TEACHER] }, isActive: true, course: this.BuildCourseFilter(query, departmentIds) }, { populate: ['course'] })` batch exactly as-is. `BuildCourseFilter` continues to narrow to course-owning dept because `subjects[]` shows _scope-visible teaching_, not home-dept courses.
    8. Build `userCourseMap` preserving the existing dedup loop (`if (!courses.includes(shortname)) courses.push(shortname)`). **Do NOT delegate dedup to `FacultyCardResponseDto.Map` — the mapper only sorts.** Order the final `data` array by the order of `users` returned from `findAndCount`. Preserve the `userMap.get(id)` null-guard when mapping, even though under new semantics each returned user is guaranteed to match its own id (defense in depth).
  - Notes:
    - **Retain** `BuildEnrollmentFilter`, `BuildCountQuery`, `BuildPaginatedUserIdQuery`, `BuildQueryParams` private methods — they are reused by `ListCrossDepartmentTeaching` (see Task 3). `BuildCourseFilter` also stays (used for subjects enrichment).
    - Imports: add `UserRole` from `src/modules/auth/roles.enum`; add `QueryOrder` from `@mikro-orm/core`; `FilterQuery` is already imported.

- [x] **Task 3: Add a new service method `ListCrossDepartmentTeaching`**
  - File: `src/modules/faculty/services/faculty.service.ts`
  - Action: Add a public method with the same signature as `ListFaculty`. Preserve the old enrollment-join logic verbatim, plus additional WHERE clauses to restrict to true cross-department teaching and guard against soft-deleted home departments:
    - Modify `BuildEnrollmentFilter` to accept an optional `{ crossDeptOnly: boolean }` flag (flag approach preferred — simpler than an overload). When `crossDeptOnly: true`, append to the SQL `conditions`:
      ```
      u.department_id IS NOT NULL
      AND u.department_id <> d.id
      AND EXISTS (
        SELECT 1 FROM department hd
        WHERE hd.id = u.department_id
          AND hd.deleted_at IS NULL
      )
      ```
      The `EXISTS` guard prevents a faculty whose home-dept was soft-deleted in a prior semester from surfacing here (the global MikroORM softDelete filter does NOT apply to raw SQL).
    - Reuse `BuildCountQuery`, `BuildPaginatedUserIdQuery`, `BuildQueryParams`, and the full raw-SQL flow unchanged.
    - Empty-scope early-return: same `departmentIds.length === 0` guard as the primary path — skip the DB call.
    - Subjects enrichment unchanged (same `BuildCourseFilter`).
    - Map to `FacultyCardResponseDto` identically (dedup loop preserved, sort via mapper).
  - Notes:
    - Rationale for keeping raw SQL here: the DISTINCT-by-user semantics across the enrollment join still apply; the `IS NOT NULL <> d.id` predicate is trivial to express in SQL and awkward in QB.
    - Faculty with `user.department_id IS NULL` are excluded by the `IS NOT NULL` clause.
    - Faculty whose home-dept row has `deleted_at IS NOT NULL` are excluded by the `EXISTS` guard.

- [x] **Task 4: Add `GET /faculty/cross-department-teaching` controller route**
  - File: `src/modules/faculty/faculty.controller.ts`
  - Action: Add a new method:
    ```ts
    @Get('cross-department-teaching')
    @ApiOperation({
      summary: 'List faculty teaching courses outside their home department, scoped to caller',
    })
    @ApiResponse({ status: 200, type: FacultyListResponseDto })
    async findCrossDepartmentTeaching(
      @Query() query: ListFacultyQueryDto,
    ): Promise<FacultyListResponseDto> {
      return this.facultyService.ListCrossDepartmentTeaching(query);
    }
    ```
  - Notes: Place between `findAll()` and `getSubmissionCount()` for readability. There is no routing collision: `:facultyId/submission-count` is a two-segment parameterized path, while `cross-department-teaching` is a single-segment static path — they cannot match each other.

- [x] **Task 5: Update `faculty.service.spec.ts` — primary path**
  - File: `src/modules/faculty/services/faculty.service.spec.ts`
  - Action:
    1. Replace `executeMock` usage in all primary-path tests with `em.findAndCount` mock returning `[users, totalCount]`.
    2. Keep `em.find` mock for the subjects-enrichment enrollment query.
    3. Rewrite expectations:
       - `super admin sees all faculty` — assert `em.findAndCount` called with `FilterQuery<User>` containing `roles: { $contains: ['FACULTY'] }`, `isActive: true`, `department: { $ne: null }`.
       - `dean sees only faculty in their department scope` — assert `department: { $in: [deptId] }`.
       - `dean with empty department scope` — assert early-return shape; assert `em.findAndCount` was NOT called (AC 19 short-circuit).
       - `search filter` — assert `fullName: { $ilike: '%Varst%' }` in the filter; drop the raw-SQL string assertion.
       - `LIKE wildcard escaping` — assert `fullName: { $ilike: '%\\%admin\\_test%' }`.
       - `pagination` — assert `limit: 5, offset: 5` passed.
       - `departmentId outside dean scope` — unchanged (still throws `ForbiddenException` before the query).
       - `programId not belonging to department` — unchanged.
       - `programId without departmentId outside dean scope` — unchanged.
       - `faculty deduplication` — under new semantics each user row is already unique; the test now asserts that _subjects_ from multiple scope-visible enrollments for one user are deduped/sorted. Retain the test but update its narrative: it's no longer about row-level dedup, it's about `subjects[]` aggregation.
       - `subjects sorted alphabetically` — unchanged behavior; adjust mock plumbing.
       - `empty result` — assert `findAndCount` returns `[[], 0]`.
       - `fullName fallback`, `empty profilePicture`, `page beyond totalPages`, `non-existent semesterId` — update mocks for `findAndCount` but keep expectations.

- [x] **Task 6: Add new spec blocks for Task 1/2 behaviors not yet covered**
  - File: `src/modules/faculty/services/faculty.service.spec.ts`
  - Action: Add these describe blocks (one per AC):
    - `excludes faculty with NULL home department` (AC 4, AC 18): mock `findAndCount` to receive `department: { $ne: null }` (super-admin) or `{ $in: [...] }` (scoped); assert the filter shape.
    - `home-dept faculty with zero scope-visible teaching` (AC 3): user returned by `findAndCount`, but enrollment query returns `[]` → result has the user with `subjects: []`.
    - `programId filter targets user.program` (AC 6): assert `filter.program === programId` (not course-owning program).
    - `departmentId filter targets user.department` (AC 5): assert `filter.department === deptId`.
    - `dean with empty dept scope short-circuits` (AC 19): `scopeResolver.ResolveDepartmentIds` returns `[]`; assert response shape AND `em.findAndCount` was NOT called (`expect(em.findAndCount).not.toHaveBeenCalled()`).
    - `inactive faculty excluded` (AC 20): assert the `BuildUserFilter` output contains `isActive: true`.
    - `dual-role faculty included` (AC 21): mock a user with `roles: ['FACULTY', 'DEAN']` returned by `findAndCount`; assert they appear in `data`.
    - `subjects enrichment skipped on empty result` (AC 22): `findAndCount` returns `[[], 0]`; assert `em.find` (for Enrollment) was NOT called.

- [x] **Task 7: Add spec blocks for the cross-department-teaching endpoint**
  - File: `src/modules/faculty/services/faculty.service.spec.ts`
  - Action: New top-level `describe('ListCrossDepartmentTeaching', ...)`:
    - `returns only faculty whose home dept differs from course-owning dept` (AC 13): mock raw SQL `executeMock` like the legacy tests; assert the generated SQL includes `u.department_id IS NOT NULL AND u.department_id <> d.id`.
    - `NULL home-dept faculty never appear` (AC 14): implicit via the `IS NOT NULL` clause assertion above.
    - `soft-deleted home-dept excluded via EXISTS guard` (AC 23): assert the generated SQL contains `EXISTS` and `hd.deleted_at IS NULL`.
    - `inherits semester/scope/search/department/program/pagination behavior from legacy filter` (AC 15): one happy-path pagination test with a dean scope.
    - `subjects enrichment uses scope-visible courses` (AC 15, continued): mock `em.find(Enrollment, ...)` and assert shortnames are sorted/deduped in the card.
    - `dean with empty dept scope short-circuits` (analog of AC 19 for secondary endpoint): assert no DB call issued.

- [x] **Task 8: Manual verification — REQUIRED before PR**
  - Action: Start the API locally (`npm run start:dev`), authenticate as a super-admin, dean, and chairperson. Call:
    - `GET /faculty?semesterId=<id>` — primary list behaves per ACs 1–12, 17–21.
    - `GET /faculty?semesterId=<id>&departmentId=<id>` — assert home-dept filtering (AC 5).
    - `GET /faculty/cross-department-teaching?semesterId=<id>` — returns only true cross-dept rows (ACs 13–15).
    - `GET /faculty/:id/submission-count?semesterId=<id>` — unchanged (AC 16).
  - Notes: If local Moodle data is thin, seed test fixtures first via the admin console or a manual DB insert. For a semantics-changing refactor, manual verification is not optional — unit tests alone cannot catch ORM-generated-SQL surprises. Log the verification evidence (request/response excerpts) in the PR description.

### Acceptance Criteria

- [ ] **AC 1 (happy path — dean primary list)**: Given a dean whose `ScopeResolverService.ResolveDepartmentIds` returns `[CCS]`, when they call `GET /faculty?semesterId=<id>`, then the response contains exactly the faculty whose `user.department_id = CCS`, ordered by `fullName ASC NULLS LAST, id ASC`, paginated per `page`/`limit`.

- [ ] **AC 2 (cross-dept leak prevented)**: Given a faculty whose `user.department_id = SOE` and who teaches a CCS-owned course, when a CCS dean calls `GET /faculty`, then that faculty does NOT appear in `data`.

- [ ] **AC 3 (home-dept faculty with zero scope teaching)**: Given a faculty whose `user.department_id = CCS` and who teaches zero courses this semester (or only courses outside the dean's scope), when a CCS dean calls `GET /faculty`, then that faculty DOES appear in `data` with `subjects: []`.

- [ ] **AC 4 (NULL home dept excluded from primary)**: Given a user with `roles: ['FACULTY']` and `department_id = NULL`, when any caller (super-admin or dean) calls `GET /faculty`, then that user does NOT appear in `data`.

- [ ] **AC 5 (`departmentId` param filters home dept)**: Given a super-admin, when they call `GET /faculty?semesterId=<id>&departmentId=CCS`, then `data` contains only users with `user.department_id = CCS` (NOT users teaching CCS-owned courses).

- [ ] **AC 6 (`programId` param filters home program)**: Given a super-admin, when they call `GET /faculty?semesterId=<id>&programId=<pid>`, then `data` contains only users with `user.program_id = <pid>`.

- [ ] **AC 7 (scope violation on `departmentId`)**: Given a CCS dean, when they call `GET /faculty?departmentId=SOE`, then the API returns `403 Forbidden`.

- [ ] **AC 8 (scope violation on `programId`)**: Given a dean whose scope is `[CCS]`, when they call `GET /faculty?programId=<pid>` where `<pid>`'s department is SOE, then the API returns `403 Forbidden`.

- [ ] **AC 9 (`programId`/`departmentId` mismatch)**: Given a super-admin, when they call `GET /faculty?departmentId=CCS&programId=<pid>` where `<pid>`'s department is SOE, then the API returns `400 Bad Request`.

- [ ] **AC 10 (non-existent semester)**: Given an invalid `semesterId`, when any caller calls `GET /faculty`, then the API returns `404 Not Found`.

- [ ] **AC 11 (search with wildcard escape)**: Given `search = '%admin_test'`, when called, then the filter passed to `em.findAndCount` contains `fullName: { $ilike: '%\\%admin\\_test%' }`.

- [ ] **AC 12 (pagination beyond totalPages)**: Given `totalItems = 3, page = 5, limit = 5`, when called, then the response has `data: [], meta.currentPage: 5, meta.totalPages: 1`.

- [ ] **AC 13 (cross-dept secondary endpoint — true cross-dept only)**: Given a CCS dean, when they call `GET /faculty/cross-department-teaching?semesterId=<id>`, then `data` contains only faculty who both (a) teach at least one course in the dean's scope AND (b) have `user.department_id ≠ course.program.department_id`, i.e., home dept differs from course-owning dept.

- [ ] **AC 14 (cross-dept — NULL home excluded)**: Given a faculty with `department_id = NULL` who teaches a CCS-owned course, when a CCS dean calls `GET /faculty/cross-department-teaching`, then that faculty does NOT appear.

- [ ] **AC 15 (cross-dept — pagination/search/filter parity)**: Given the legacy `ListFacultyQueryDto` with `search`, `departmentId`, `programId`, `page`, `limit`, when passed to `GET /faculty/cross-department-teaching`, then filtering and pagination behave identically to the pre-FAC-129 `GET /faculty` (with the additional cross-dept predicate applied).

- [ ] **AC 16 (submission-count endpoint untouched)**: Given a valid `facultyId` + `semesterId`, when `GET /faculty/:facultyId/submission-count?semesterId=<id>` is called, then behavior and response are identical to pre-FAC-129.

- [ ] **AC 17 (subjects enrichment uses scope-visible courses)**: Given a CCS-home faculty teaching courses `A` (CCS-owned) and `B` (SOE-owned), when a CCS dean calls `GET /faculty`, then `subjects` contains only `A` (scoped to CCS, alphabetically sorted, deduped).

- [ ] **AC 18 (super-admin sees NULL-home-dept excluded)**: Given a super-admin (`departmentIds === null`), when they call `GET /faculty`, then users with `department_id = NULL` are excluded — the primary list is always home-dept-based. SuperAdmin discovery of unassigned faculty uses the admin console route `GET /admin/users` (`src/modules/admin/admin.controller.ts:43`), which is outside this ticket's scope.

- [ ] **AC 19 (dean with empty dept scope)**: Given a dean whose `ScopeResolverService.ResolveDepartmentIds` returns `[]`, when they call `GET /faculty`, then the response is `{ data: [], meta: { totalItems: 0, itemCount: 0, itemsPerPage: limit, totalPages: 0, currentPage: page } }` with HTTP 200, AND `em.findAndCount` is NOT called (assert via Jest mock `.not.toHaveBeenCalled()`).

- [ ] **AC 20 (inactive faculty excluded)**: Given a user with `roles: ['FACULTY']`, a valid home `department_id`, and `isActive = false`, when any caller queries `GET /faculty`, then that user does NOT appear in `data`. (Parity with pre-FAC-129 behavior; made explicit in ACs.)

- [ ] **AC 21 (dual-role user included)**: Given a user with `roles: ['FACULTY', 'DEAN']` and a home `department_id` in the caller's scope, when that caller queries `GET /faculty`, then the user appears in `data`. Role composition does not exclude FACULTY-qualified users.

- [ ] **AC 22 (subjects enrichment skipped on empty result)**: Given any scope that returns zero users from `findAndCount`, when `GET /faculty` is called, then the enrollment-enrichment query is NOT issued (assert `em.find(Enrollment, ...)` `.not.toHaveBeenCalled()`).

- [ ] **AC 23 (cross-dept — soft-deleted home-dept excluded)**: Given a faculty whose `user.department_id` references a `Department` row with `deleted_at IS NOT NULL`, when a dean calls `GET /faculty/cross-department-teaching`, then that faculty does NOT appear in `data` (guarded by the `EXISTS (... hd.deleted_at IS NULL)` clause in Task 3).

## Review Notes

- Adversarial review completed 2026-04-13; 12 findings surfaced (2 Critical, 3 High, 5 Medium, 4 Low).
- **Auto-fix applied (5 real findings):**
  - F3 (H1, AC 2 regression test): added `cross-dept leak prevented on primary list (AC 2)` — asserts dean scope narrows the filter AND the response excludes non-home rows.
  - F4 (H2, AC 23 assertion strength): normalized SQL and strengthened the EXISTS regex to anchor `AND` conjunction so an accidental OR refactor would fail the test.
  - F9 (M4, parity): added `programId NotFoundException` test on `ListCrossDepartmentTeaching`.
  - F10 (M5, ordering): added explicit test for `fullName: ASC_NULLS_LAST, id: ASC`.
  - F12 (L4, parity): added LIKE-escape propagation test for the cross-dept raw SQL path.
- **Skipped (accepted as noise or deferred per spec):** F1 (filter bypass — false alarm, scope always applies), F2 (COUNT/SELECT race — spec §6 risk #6), F5/F6/F7/F8 (commentary, not bugs), F11 (DRY duplication — scope discipline per spec §Notes).
- **Preflight (Task 1a) verified empirically:** `{ department: { $ne: null } }` emits `"department_id" is not null` on PostgresSQL — no behavioral surprise from MikroORM v6 `$ne: null` against ManyToOne.

## Additional Context

### Dependencies

- **Depends on:** FAC-125 (home-dept field authoritative), FAC-127 (manual override UI), FAC-128 (submission snapshot — analytics continuity)
- **Ships after:** FAC-128 (already merged as of 2026-04-13)
- **Frontend coordination:** Separate issue in `app.faculytics` for dean-dashboard surfacing of the new secondary endpoint

### Testing Strategy

**Unit tests (`faculty.service.spec.ts`)** — Jest via NestJS `TestingModule` with mocked `EntityManager` and `ScopeResolverService`.

- **Primary path (`ListFaculty`)**: mock `em.findAndCount(User, ...)` returning `[users, count]`, and `em.find(Enrollment, ...)` for subjects enrichment. Cover ACs 1–12, 17–18.
- **Secondary path (`ListCrossDepartmentTeaching`)**: mock `em.getConnection().execute()` for raw SQL, assert the generated SQL contains the cross-dept clause (`u.department_id IS NOT NULL AND u.department_id <> d.id`). Cover ACs 13–15.
- **`GetSubmissionCount`**: existing tests pass unchanged (AC 16).
- **Imports**: add `UserRole` import in spec where filter-shape assertions are made.

**No integration tests required** — existing unit coverage is the project norm for service-layer work.

**Manual verification** (per Task 8): exercise all three routes as super-admin, dean, chairperson against a local seeded instance.

### Notes

- **Keep legacy raw SQL intact** in `ListCrossDepartmentTeaching` — the only additions are the cross-dept predicate and the `EXISTS` home-dept soft-delete guard (Task 3). Do not refactor the helper methods in this PR. Scope discipline per user preference (root-cause where needed, not cosmetic cleanup).
- **Pre-mortem risks**:
  1. _`user.department_id` column has no index_ — under super-admin scope (`department: { $ne: null }` across all users) and large tenant growth, the plan may seqscan. Accepted for now; revisit if EXPLAIN shows a regression. Out of scope for this ticket.
  2. _`$ne: null` on ManyToOne — ORM behavior_ — no precedent in codebase for this pattern on a relation (verified: 6 existing `$ne: null` usages are all on scalar columns). **Task 1a mandates an empirical preflight** to assert the generated SQL before committing to the filter shape.
  3. _`findAndCount` + `populate` interactions_ — the primary path does NOT use `populate` on User (we don't need Department/Program entities hydrated), so the classic findAndCount-with-populate issues don't apply. Subjects query uses `populate: ['course']` on Enrollment as before.
  4. _Global soft-delete filter_ — MikroORM's global `softDelete` filter is defined in `src/mikro-orm.config.ts:41-45` as `{ deletedAt: null }` with `default: true`, applying to all entities extending `CustomBaseEntity` (User, Enrollment, Course, Program, Department). No explicit `filters: { softDelete: false }` needed on the QB path. **Raw SQL paths are NOT filtered by this mechanism** — which is why Task 3 adds the explicit `hd.deleted_at IS NULL` EXISTS guard.
  5. _Nest route ordering_ — `/faculty/cross-department-teaching` (single static segment) has no collision with `/:facultyId/submission-count` (two segments, first parameterized). No special ordering required.
  6. _Race between `findAndCount`'s COUNT and SELECT statements_ — MikroORM issues them as two separate queries. An admin re-homing a faculty via FAC-127 between the two can produce a brief meta/data inconsistency (e.g., `totalItems=N` but `data.length=N-1`). Accepted; mirrors existing pagination behavior across the API. No transaction wrapping added in this ticket.
  7. _FAC-128 snapshot tradeoff_ — A faculty re-homed mid-semester (CCS → SOE) now appears on the SOE dean's roster, but submissions made before the re-home are attributed to CCS via FAC-128's per-submission `homeDepartment` snapshot. This means the SOE dean may see a faculty on the roster with `submissionCount = 0` for prior-semester submissions. Expected behavior; analytics continuity is preserved via FAC-128.
  8. _Frontend consumer not yet built_ — `GET /cross-department-teaching` ships without a caller. No feature flag needed; additive endpoints in staging without consumers carry no user-facing risk. Frontend coordination tracked as a follow-up frontend issue.
- **Known test-coverage gap** — this ticket ships with unit tests only. ACs 13–15 (cross-dept SQL semantics) are covered by asserting SQL-string substrings, which does not prove end-to-end query correctness against a real database. An e2e test fixture for the `/faculty` module does not currently exist and is deferred to a follow-up ticket (`FAC-XXX: e2e coverage for FacultyController`). Task 8 (required manual verification) is the compensating control for this release.
- **Divergent LIKE-escaping conventions** — `FacultyService.EscapeLikeWildcards` and `AdminService`'s search escape use slightly different regex. Cosmetic inconsistency; out of scope for this ticket. Note for a future cleanup.
- **Future considerations (out of scope)**:
  - Add a btree index on `user.department_id` if primary-list p95 exceeds 200ms.
  - Consider per-semester historical home-dept resolution (would require a new `user_department_history` table or per-semester snapshot).
  - Consider consolidating `subjects[]` enrichment into `findAndCount`'s `populate` path once MikroORM supports filtered populates cleanly.
  - Add e2e test harness for `FacultyController`.
- **Party-mode decisions** archived in workflow history:
  - Session 1 (2026-04-13, Winston/Amelia/Quinn/John): scope & semantic decisions (Q1–Q5).
  - Session 2 (2026-04-13, same team): adversarial-review triage of 20 findings; resolutions applied to this spec.
