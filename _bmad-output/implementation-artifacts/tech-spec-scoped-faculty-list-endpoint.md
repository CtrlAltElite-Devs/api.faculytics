---
title: 'Scoped Faculty List Endpoint'
slug: 'scoped-faculty-list-endpoint'
created: '2026-03-16'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS v11',
    'MikroORM v6.6',
    'PostgreSQL',
    'Passport/JWT',
    'class-validator',
    'class-transformer',
    'Jest v30',
    'Swagger/OpenAPI',
  ]
files_to_modify:
  - 'src/modules/faculty/faculty.module.ts (new)'
  - 'src/modules/faculty/faculty.controller.ts (new)'
  - 'src/modules/faculty/services/faculty.service.ts (new)'
  - 'src/modules/faculty/services/faculty.service.spec.ts (new)'
  - 'src/modules/faculty/dto/requests/list-faculty-query.dto.ts (new)'
  - 'src/modules/faculty/dto/responses/faculty-list.response.dto.ts (new)'
  - 'src/modules/faculty/dto/responses/faculty-card.response.dto.ts (new)'
  - 'src/modules/common/services/scope-resolver.service.ts (new)'
  - 'src/modules/common/services/scope-resolver.service.spec.ts (new)'
  - 'src/modules/common/common.module.ts (modify — export ScopeResolverService)'
  - 'src/modules/index.module.ts (modify — register FacultyModule)'
code_patterns:
  - 'Module structure: module.ts + controller.ts + services/ + dto/requests/ + dto/responses/'
  - 'Controller: @UseJwtGuard(roles) + @UseInterceptors(CurrentUserInterceptor)'
  - 'Service: PascalCase public methods, inject EntityManager + repositories'
  - 'Response DTOs: static Map() method, @ApiProperty() decorators'
  - 'Query DTOs: @IsOptional() + @Type(() => Number) + @Min/@Max validators'
  - 'Pagination: offset-based, PaginationMeta DTO, page/limit params'
  - 'Filter building: conditional FilterQuery<T> construction in service'
test_patterns:
  - 'Jest with NestJS Test.createTestingModule()'
  - 'Mock EntityManager as plain object with jest.fn() methods'
  - 'Mock UnitOfWork.runInTransaction() to execute callback immediately'
  - 'Mock repositories as useValue in providers array'
  - 'Tests colocated with source as .spec.ts files'
---

# Tech-Spec: Scoped Faculty List Endpoint

**Created:** 2026-03-16

## Overview

### Problem Statement

There is no way to retrieve a list of faculty members scoped to the caller's institutional role. Deans need to see faculty within their department(s), and super admins need a system-wide view — all for a given semester. Currently, faculty data is only surfaced per-course via `GET /enrollments/me`, with no dedicated faculty listing or hierarchical scoping.

### Solution

Create a `GET /faculty` endpoint that returns a deduplicated, paginated list of faculty members with their taught course shortnames, scoped by the authenticated user's institutional role (department-level for deans, system-wide for super admins). Faculty are identified by `editingteacher` or `teacher` enrollment roles. A reusable `ScopeResolverService` handles scope resolution to support future role-based scoping (chairperson, campus head).

### Scope

**In Scope:**

- New `FacultyModule` with `GET /faculty` endpoint
- Role-based scoping (DEAN → their department(s), SUPER_ADMIN → all)
- `semesterId` as a **required** query parameter (no active semester auto-detection)
- `search` optional query param for filtering faculty by name
- Optional query filters: `departmentId`, `programId` (narrowing within the caller's scope)
- Deduplication — one entry per faculty member
- Each entry includes: `id`, `fullName`, `profilePicture`, `subjects` (array of course shortnames)
- Pagination support
- Reusable `ScopeResolverService` for department-level scope resolution (shared by future endpoints)
- Designed to accommodate future roles (chairperson, campus head)

**Out of Scope:**

- Position/employment type field (being removed)
- Response count per faculty (separate endpoint, heavy query)
- Scoped program/course/department query endpoints (separate tickets)
- "View Analysis" button logic (frontend concern)
- Active semester auto-detection (no `isActive` flag on Semester entity today)

## Context for Development

### Codebase Patterns

- **Module structure**: `module.ts` + `controller.ts` + `services/` + `dto/requests/` + `dto/responses/`. Reference: `src/modules/enrollments/` (best reference for modules using `CurrentUserInterceptor`, `CommonModule`, and `DataLoaderModule`).
- **Module registration**: Add to `ApplicationModules` array in `src/modules/index.module.ts`.
- **Controller pattern**: `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN)` at class level + `@UseInterceptors(CurrentUserInterceptor)`. Access user via `@Request() req: AuthenticatedRequest` → `req.currentUser`.
- **Service pattern**: PascalCase public methods. Inject `EntityManager` + repositories. Use `UnitOfWork` for transactions.
- **Response DTOs**: Static `Map()` method to convert entity → DTO. `@ApiProperty()` for Swagger.
- **Query DTOs**: `@IsOptional()` + `@Type(() => Number)` + `@Min/@Max` validators. Reference: `ListDimensionsQueryDto`.
- **Pagination**: Offset-based with `page`/`limit` params, `PaginationMeta` DTO, `findAndCount`.
- **Filter building**: Conditional `FilterQuery<T>` construction in service. Reference: `DimensionsService.findAll()`.
- **Common module**: Exports `UnitOfWork`, `CustomJwtService`, `CacheService`. New shared services go here. **Not `@Global()`** — must be explicitly imported by consuming modules.
- **UserLoader**: REQUEST-scoped DataLoader that batches user lookups and populates `campus`. Used by `CurrentUserInterceptor` to set `req.currentUser`.
- **Institutional roles access**: `req.currentUser.institutionalRoles` (Collection — needs populate or separate query).
- Deans scoped to departments via `UserInstitutionalRole` (links user → MoodleCategory with a role). No campus-level dean assignment.
- A dean can have **multiple** `UserInstitutionalRole` entries for different departments — the query must union across all.
- Faculty identified by enrollment roles `editingteacher` or `teacher` with `isActive: true`.
- Hierarchy: Campus → Semester → Department → Program → Course.
- `Department.moodleCategoryId` (plain number) joins with `UserInstitutionalRole.moodleCategory.moodleCategoryId` for scope resolution.
- Empty results return `{ data: [], meta: { totalItems: 0, ... } }`, not 404.
- A dean who also teaches courses appears in results naturally — query is enrollment-based, not user-role-based.

### Files to Reference

| File                                                                  | Purpose                                                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/entities/user.entity.ts`                                         | User entity with campus, department, program relations and roles array                               |
| `src/entities/enrollment.entity.ts`                                   | Links User ↔ Course with role string and isActive flag                                               |
| `src/entities/user-institutional-role.entity.ts`                      | Links User → MoodleCategory with institutional role (DEAN at dept)                                   |
| `src/entities/department.entity.ts`                                   | Department entity — `moodleCategoryId` (number), child of Semester, parent of Program                |
| `src/entities/program.entity.ts`                                      | Program entity — child of Department, parent of Course                                               |
| `src/entities/course.entity.ts`                                       | Course entity with `shortname` field, ManyToOne to Program                                           |
| `src/entities/semester.entity.ts`                                     | Semester entity — no `isActive` flag, has `moodleCategoryId`, ManyToOne Campus, OneToMany Department |
| `src/modules/enrollments/enrollments.service.ts`                      | Existing faculty-per-course query pattern (reference for enrollment queries)                         |
| `src/modules/enrollments/dto/responses/faculty-short.response.dto.ts` | Existing minimal faculty DTO (to be extended or replaced)                                            |
| `src/modules/common/dto/pagination.dto.ts`                            | `PaginationMeta` DTO for paginated responses                                                         |
| `src/modules/dimensions/dto/requests/list-dimensions-query.dto.ts`    | Reference for query param validation pattern                                                         |
| `src/modules/dimensions/services/dimensions.service.ts`               | Reference for conditional filter building + pagination                                               |
| `src/security/decorators/use-jwt-guard.decorator.ts`                  | JWT + role guard decorator                                                                           |
| `src/security/guards/roles.guard.ts`                                  | Role-based authorization guard                                                                       |
| `src/modules/auth/roles.enum.ts`                                      | UserRole enum and MoodleRoleMapping                                                                  |
| `src/modules/common/interceptors/current-user.interceptor.ts`         | Loads `request.currentUser` from JWT via UserLoader                                                  |
| `src/modules/common/interceptors/http/authenticated-request.ts`       | `AuthenticatedRequest` interface with `user` and `currentUser`                                       |
| `src/modules/common/common.module.ts`                                 | Exports UnitOfWork, CacheService — where ScopeResolverService will be added                          |
| `src/modules/common/data-loaders/user.loader.ts`                      | REQUEST-scoped DataLoader for batched user loading                                                   |
| `src/modules/index.module.ts`                                         | ApplicationModules array — where FacultyModule will be registered                                    |
| `src/modules/dimensions/dimensions.module.ts`                         | Reference module structure (module + controller + service + DTOs)                                    |
| `src/modules/dimensions/dimensions.controller.ts`                     | Reference controller pattern with role-based guards                                                  |
| `src/modules/dimensions/services/dimensions.service.ts`               | Reference service pattern with filter building + pagination                                          |
| `src/modules/dimensions/dto/requests/list-dimensions-query.dto.ts`    | Reference query DTO pattern                                                                          |
| `src/modules/dimensions/dto/responses/dimension-list.response.dto.ts` | Reference list response DTO pattern                                                                  |
| `src/entities/base.entity.ts`                                         | CustomBaseEntity — UUID PK, timestamps, soft delete                                                  |

### Technical Decisions

- **`semesterId` is required** — no active semester concept exists in the codebase. Explicit is better.
- **New `FacultyModule`** — separate domain concern from enrollments.
- **Reusable `ScopeResolverService`** — extracts scope resolution logic (user + semesterId → allowed department IDs) into a shared service. Future endpoints (scoped programs, courses, departments) reuse this.
- **Scope resolution strategy**: role → depth → entity resolution pattern, not hardcoded if/else. Extensible for chairperson (program-level) and campus head (campus-level) in the future.
- Faculty identification includes both `editingteacher` and `teacher` Moodle enrollment roles.
- Scoping is resolved from `UserInstitutionalRole` for deans (department-level only for now).
- Super admins bypass all scoping restrictions.
- Response count is excluded from this endpoint for separation of concerns.
- **Query strategy (revised)**: Use a join-based approach with `em.find(Enrollment, ...)` and nested populate filters instead of two-phase course ID resolution. This avoids large IN clauses (F10) and QueryBuilder groupBy complexity (F4). For the total distinct faculty count, use a raw `COUNT(DISTINCT enrollment.user_id)` query via `em.getConnection().execute()`. Deduplicate in application code after fetching. The global soft-delete filter auto-applies to `em.find()` calls (F7 resolved).
- **Subjects are scope-filtered**: The `subjects` array only contains course shortnames within the caller's resolved scope, not all courses the faculty teaches globally. A CCS dean sees only CCS courses for a faculty member, even if that faculty also teaches in CBA.
- **Cross-filter validation**: If both `departmentId` and `programId` are provided, validate that the program belongs to the department. Return 400 if not.
- **Out-of-scope filter validation**: if a dean passes `departmentId` outside their scope, return 403. Same for `programId` not belonging to their departments.
- **Search escaping**: Escape LIKE wildcards (`%`, `_`) in the `search` parameter. Use MikroORM parameterized queries to prevent SQL injection.
- **Active record filters**: Filter `enrollment.isActive = true`, `course.isActive = true`, and `user.isActive = true` to exclude inactive courses and deactivated users from results.
- **Semester existence validation**: Check that the provided `semesterId` corresponds to an existing Semester entity. Return 404 if not found (prevents silent empty results from typos).
- **Subjects ordering**: Sort the `subjects` array alphabetically for deterministic output.
- **Layered authorization defense**: The `RolesGuard` (via `@UseJwtGuard`) provides the first line of defense, restricting access to SUPER_ADMIN and DEAN roles. The `ScopeResolverService` provides the second layer, resolving the specific scope within those roles. This means `ScopeResolverService` can assume the user has already passed the role check — but should still throw `ForbiddenException` as a safety net if called outside a guarded context.

## Implementation Plan

### Tasks

- [x] Task 1: Create `ScopeResolverService` in common module
  - File: `src/modules/common/services/scope-resolver.service.ts` (new)
  - Action: Create an injectable service with a `ResolveDepartmentIds(user: User, semesterId: string): Promise<string[] | null>` method.
    - If user has `SUPER_ADMIN` role → return `null` (meaning "no restriction").
    - If user has `DEAN` role → query `UserInstitutionalRole` for the user where `role = 'DEAN'`, populate `moodleCategory`. Collect the `moodleCategoryId` values. Then query `Department` where `moodleCategoryId IN [collected ids]` AND `semester.id = semesterId`. Return the department UUIDs.
    - If user has neither role → throw `ForbiddenException`.
  - Notes: Inject `EntityManager`. The method returns `null` for unrestricted (super admin) vs `string[]` for scoped. This distinction is important for downstream query building. Design for extensibility — future roles (chairperson at program level, campus head at campus level) can be added as additional branches.

- [x] Task 2: Register `ScopeResolverService` in `CommonModule`
  - File: `src/modules/common/common.module.ts` (modify)
  - Action: Add `ScopeResolverService` to `providers` and `exports` arrays. No `forFeature` addition needed — the service uses `EntityManager` directly (injected from root ORM context), not custom repositories.

- [x] Task 3: Create `ListFacultyQueryDto` request DTO
  - File: `src/modules/faculty/dto/requests/list-faculty-query.dto.ts` (new)
  - Action: Create query DTO with:
    - `semesterId: string` — required, `@IsUUID()`, `@IsNotEmpty()`
    - `departmentId?: string` — optional, `@IsUUID()`, `@IsOptional()`
    - `programId?: string` — optional, `@IsUUID()`, `@IsOptional()`
    - `search?: string` — optional, `@IsString()`, `@IsOptional()`, `@MaxLength(100)`
    - `page?: number` — optional, `@IsInt()`, `@Min(1)`, `@Type(() => Number)`, default `1`
    - `limit?: number` — optional, `@IsInt()`, `@Min(1)`, `@Max(100)`, `@Type(() => Number)`, default `20`
  - Notes: Follow `ListDimensionsQueryDto` pattern. All properties must have `@ApiProperty()` or `@ApiPropertyOptional()` decorators.

- [x] Task 4: Create `FacultyCardResponseDto` response DTO
  - File: `src/modules/faculty/dto/responses/faculty-card.response.dto.ts` (new)
  - Action: Create response DTO with:
    - `id: string` — faculty user UUID
    - `fullName: string`
    - `profilePicture: string | null`
    - `subjects: string[]` — array of course shortnames within the caller's scope, sorted alphabetically
  - Notes: Include a static `Map(user: User, courseShortnames: string[]): FacultyCardResponseDto` method. The `Map()` method must:
    - **fullName fallback**: Use `user.fullName ?? \`${user.firstName} ${user.lastName}\`` (User.fullName is nullable).
    - **profilePicture mapping**: Map `user.userProfilePicture` → `dto.profilePicture`. Coerce empty string `''` to `null`.
    - **subjects sorting**: Sort `courseShortnames` alphabetically before assigning.

- [x] Task 5: Create `FacultyListResponseDto` response DTO
  - File: `src/modules/faculty/dto/responses/faculty-list.response.dto.ts` (new)
  - Action: Create list response DTO with:
    - `data: FacultyCardResponseDto[]`
    - `meta: PaginationMeta`
  - Notes: Follow `DimensionListResponseDto` pattern. Import `PaginationMeta` from `src/modules/common/dto/pagination.dto.ts`.

- [x] Task 6: Create `FacultyService`
  - File: `src/modules/faculty/services/faculty.service.ts` (new)
  - Action: Create injectable service with `ListFaculty(user: User, query: ListFacultyQueryDto): Promise<FacultyListResponseDto>` method:
    1. **Validate semester** — `em.findOneOrFail(Semester, { id: query.semesterId })` → throw `NotFoundException` if not found.
    2. **Resolve scope** — call `ScopeResolverService.ResolveDepartmentIds(user, query.semesterId)`. Returns `null` (unrestricted) or `string[]` (department IDs).
    3. **Validate filters**:
       - If `departmentId` is provided and scope is restricted (`string[]`), check `departmentId` is in resolved IDs → throw `ForbiddenException` if not.
       - If `programId` is provided (with or without `departmentId`): query `em.findOneOrFail(Program, { id: programId }, { populate: ['department'] })`. If `departmentId` is also provided, verify `program.department.id === departmentId` → 400 if not. If scope is restricted, verify `program.department.id` is in resolved department IDs → 403 if not.
    4. **Build enrollment filter** — use join-based `em.find(Enrollment, ...)` with nested filters instead of two-phase course ID resolution:
       - `role: { $in: ['editingteacher', 'teacher'] }`
       - `isActive: true`
       - `user: { isActive: true }` — exclude deactivated users
       - `course: { isActive: true, program: { department: { semester: query.semesterId } } }` — base filter
       - If scope is restricted: add `course: { program: { department: { $in: departmentIds } } }`
       - If `departmentId` provided: narrow to that department
       - If `programId` provided: narrow to that program
       - If `search` provided: add `user: { fullName: { $like: '%' + escapedSearch + '%' } }` (case-insensitive via ILIKE or `$ilike`)
    5. **Get distinct faculty count** — use `em.getConnection().execute()` with `SELECT COUNT(DISTINCT user_id) FROM enrollment WHERE ...` for accurate pagination total. Build the WHERE clause to match step 4 filters.
    6. **Get paginated distinct faculty IDs** — use `em.getConnection().execute()` with `SELECT DISTINCT user_id FROM enrollment WHERE ... ORDER BY ... LIMIT/OFFSET` for the current page.
    7. **Batch-fetch faculty users and subjects** — for the paginated user IDs:
       - Fetch `User` entities: `em.find(User, { id: { $in: userIds } })`
       - Fetch their scoped enrollments to get course shortnames: `em.find(Enrollment, { user: { $in: userIds }, course: { $in: scopedCourseFilter } }, { populate: ['course'] })` — extract `course.shortname` per user.
    8. **Map to response** — construct `FacultyCardResponseDto` per faculty (with sorted subjects), build `PaginationMeta`, return `FacultyListResponseDto`.
  - Notes: Inject `EntityManager` and `ScopeResolverService`. Create a private helper `EscapeLikeWildcards(input: string): string` that escapes `%`, `_`, and `\` characters.

- [x] Task 7: Create `FacultyController`
  - File: `src/modules/faculty/faculty.controller.ts` (new)
  - Action: Create controller:
    - `@Controller('faculty')`
    - `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN)`
    - `@UseInterceptors(CurrentUserInterceptor)`
    - Single endpoint: `@Get()` with `@Query() query: ListFacultyQueryDto`
    - Access `@Request() req: AuthenticatedRequest` → `req.currentUser`
    - Delegate to `FacultyService.ListFaculty(req.currentUser, query)`
  - Notes: Add `@ApiOperation()` and `@ApiResponse()` Swagger decorators.

- [x] Task 8: Create `FacultyModule`
  - File: `src/modules/faculty/faculty.module.ts` (new)
  - Action: Create module:
    - `imports: [MikroOrmModule.forFeature([Enrollment, Course, Program, Department, User, Semester]), CommonModule, DataLoaderModule]`
    - `controllers: [FacultyController]`
    - `providers: [FacultyService]`
    - `exports: [FacultyService]`
  - Notes: `CommonModule` must be explicitly imported (it is NOT `@Global()`) to access `ScopeResolverService`. `DataLoaderModule` must be imported because `CurrentUserInterceptor` depends on `UserLoader`. Reference: `EnrollmentsModule` follows the same pattern. `Semester` entity added for the existence check in the service.

- [x] Task 9: Register `FacultyModule` in application modules
  - File: `src/modules/index.module.ts` (modify)
  - Action: Import `FacultyModule` and add it to the `ApplicationModules` array.

- [x] Task 10: Write unit tests for `ScopeResolverService`
  - File: `src/modules/common/services/scope-resolver.service.spec.ts` (new)
  - Action: Test cases:
    - Super admin returns `null` (unrestricted)
    - Dean with one department returns that department's ID
    - Dean with multiple departments returns all department IDs
    - Dean with no institutional roles for given semester returns empty array
    - User with neither SUPER_ADMIN nor DEAN role throws `ForbiddenException`
  - Notes: Mock `EntityManager.find()` for `UserInstitutionalRole` and `Department` queries.

- [x] Task 11: Write unit tests for `FacultyService`
  - File: `src/modules/faculty/services/faculty.service.spec.ts` (new)
  - Action: Test cases:
    - Super admin sees all faculty (no scope restriction)
    - Dean sees only faculty in their department scope
    - Pagination returns correct `PaginationMeta`
    - Search filter applies ILIKE on fullName
    - `departmentId` outside dean's scope returns 403
    - `programId` not belonging to department returns 400
    - `programId` provided without `departmentId` — validates program's department is in scope
    - Faculty deduplicated (teaches multiple courses → single entry with all shortnames)
    - Subjects array only contains courses within resolved scope, sorted alphabetically
    - Empty result returns `{ data: [], meta: { totalItems: 0, ... } }`
    - LIKE wildcards in search term are escaped
    - Non-existent `semesterId` returns 404
    - Inactive courses (`isActive: false`) are excluded from results
    - Inactive users (`isActive: false`) are excluded from results
    - Faculty with nullable `fullName` uses firstName + lastName fallback
    - Faculty with empty `userProfilePicture` returns `profilePicture: null`
  - Notes: Mock `ScopeResolverService` and `EntityManager`.

### Acceptance Criteria

- [ ] AC 1: Given a super admin with a valid `semesterId`, when `GET /faculty?semesterId=X`, then return a paginated list of all faculty members with `editingteacher` or `teacher` enrollments across all departments in that semester, deduplicated by user, each with their course shortnames.

- [ ] AC 2: Given a dean assigned to department CCS, when `GET /faculty?semesterId=X`, then return only faculty members who teach courses under programs in the CCS department for that semester.

- [ ] AC 3: Given a dean assigned to multiple departments (CCS and CBA), when `GET /faculty?semesterId=X`, then return faculty from both departments, deduplicated (a faculty teaching in both departments appears once with subjects from both).

- [ ] AC 4: Given a dean scoped to CCS, when `GET /faculty?semesterId=X&departmentId=CBA_ID`, then return 403 Forbidden.

- [ ] AC 5: Given a dean scoped to CCS, when `GET /faculty?semesterId=X&departmentId=CCS_ID&programId=BSBA_ID` where BSBA belongs to CBA (not CCS), then return 400 Bad Request.

- [ ] AC 6: Given a valid request with `search=Varst`, when `GET /faculty?semesterId=X&search=Varst`, then return only faculty whose `fullName` contains "Varst" (case-insensitive).

- [ ] AC 7: Given a search term containing LIKE wildcards `search=%admin`, when the query executes, then the `%` is escaped and treated as a literal character, not a wildcard.

- [ ] AC 8: Given `page=2&limit=5` with 12 total faculty, when `GET /faculty?semesterId=X&page=2&limit=5`, then return items 6-10 with `meta: { totalItems: 12, itemCount: 5, itemsPerPage: 5, totalPages: 3, currentPage: 2 }`.

- [ ] AC 9: Given a semester with no faculty enrollments, when `GET /faculty?semesterId=X`, then return `{ data: [], meta: { totalItems: 0, itemCount: 0, itemsPerPage: 20, totalPages: 0, currentPage: 1 } }`.

- [ ] AC 10: Given a faculty member who teaches FREAI, ELEMSYS, and ELDNET1 in the dean's scope, when the response is returned, then their `subjects` array contains `["ELDNET1", "ELEMSYS", "FREAI"]` — sorted alphabetically, only courses within the caller's resolved scope.

- [ ] AC 11: Given a user with role STUDENT or FACULTY (not DEAN or SUPER_ADMIN), when `GET /faculty?semesterId=X`, then return 403 Forbidden.

- [ ] AC 12: Given a dean who also teaches courses in their own department, when `GET /faculty?semesterId=X`, then that dean appears in the results like any other faculty member.

- [ ] AC 13: Given a `semesterId` that does not exist in the database, when `GET /faculty?semesterId=nonexistent-uuid`, then return 404 Not Found.

- [ ] AC 14: Given an inactive course (`isActive: false`) with faculty enrollments, when querying faculty for that semester, then enrollments for the inactive course are excluded and its shortname does not appear in any faculty's `subjects` array.

- [ ] AC 15: Given only `programId` (no `departmentId`) where the program's department is outside the dean's scope, when `GET /faculty?semesterId=X&programId=Y`, then return 403 Forbidden.

## Additional Context

### Dependencies

- `semesterId` must be provided by the caller (frontend selects semester).
- `UserInstitutionalRole` must be populated for deans to resolve their department scope (populated by `MoodleUserHydrationService` during login/sync).
- Department → Program → Course hierarchy must be synced from Moodle (`CategorySyncJob` + `CourseSyncJob`).
- Enrollments must be synced from Moodle (`EnrollmentSyncJob`).
- No new external libraries required — all functionality uses existing NestJS, MikroORM, and class-validator packages.

### Testing Strategy

**Unit Tests:**

- `ScopeResolverService` — test all role branches (super admin, dean single/multi dept, forbidden roles), mock EntityManager
- `FacultyService` — test scope integration, pagination, search, filter validation, deduplication, subject scoping; mock ScopeResolverService and EntityManager

**Manual Testing:**

- Use Swagger UI (`OPENAPI_MODE=true`) to test the endpoint with different user tokens
- Verify dean scoping with a real dean account (check that only their department's faculty appear)
- Verify super admin sees all faculty
- Test pagination with varying `page`/`limit` values
- Test search with special characters

### Notes

- The card UI shows subjects as colored chips with "8+ more" overflow — the API returns all course shortnames (sorted alphabetically), frontend handles display truncation.
- This is FAC-53 on the project board.
- Semester entity has no `isActive` flag — this is a known gap, not addressed in this ticket.
- The `ScopeResolverService` is intentionally placed in `CommonModule` (not `FacultyModule`) because future tickets for scoped program/course/department endpoints will reuse it.
- The scope resolver returns `null` for unrestricted access (super admin) vs `string[]` for restricted. Downstream consumers must handle both cases — `null` means "don't add department filter", `string[]` means "filter by these department IDs".
- **Teacher role inconsistency (F13)**: This endpoint includes both `editingteacher` and `teacher` enrollment roles, while the existing `EnrollmentsService.getFacultyByCourseIds()` only queries `editingteacher`. This is intentional — the faculty list is a broader view. Document this difference if both endpoints are used side-by-side.
- **Dean role origin (F15)**: Dean detection comes from `UserInstitutionalRole` entries (set by `MoodleUserHydrationService` during login based on Moodle `moodle/category:manage` capability), not from `MoodleRoleMapping`. The `user.roles` array contains `DEAN` if any institutional role entry exists.

## Review Notes

- Adversarial review completed
- Findings: 14 total, 7 fixed, 7 skipped (accepted patterns/low-risk)
- Resolution approach: auto-fix
- Fixed: BuildCourseFilter overwrite logic (F1), pagination ORDER BY full_name (F2), currentUser null guard (F3), soft-deleted MoodleCategory defense (F4), fragile test mocks (F8), ILIKE ESCAPE clause (F9), missing test cases (F10)
