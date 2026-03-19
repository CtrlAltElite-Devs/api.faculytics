---
title: 'Scoped Curriculum Query Endpoints'
slug: 'scoped-curriculum-query-endpoints'
created: '2026-03-19'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS v11',
    'MikroORM v6.6',
    'PostgreSQL',
    'Passport/JWT',
    'class-validator',
    'class-transformer (used by NestJS validation pipeline)',
    'Jest v30',
    'Swagger/OpenAPI',
    'nestjs-cls',
  ]
files_to_modify:
  - 'src/modules/curriculum/curriculum.module.ts (new)'
  - 'src/modules/curriculum/curriculum.controller.ts (new)'
  - 'src/modules/curriculum/services/curriculum.service.ts (new)'
  - 'src/modules/curriculum/services/curriculum.service.spec.ts (new)'
  - 'src/modules/curriculum/dto/requests/list-departments-query.dto.ts (new)'
  - 'src/modules/curriculum/dto/requests/list-programs-query.dto.ts (new)'
  - 'src/modules/curriculum/dto/requests/list-courses-query.dto.ts (new)'
  - 'src/modules/curriculum/dto/responses/department-item.response.dto.ts (new)'
  - 'src/modules/curriculum/dto/responses/program-item.response.dto.ts (new)'
  - 'src/modules/curriculum/dto/responses/course-item.response.dto.ts (new)'
  - 'src/modules/index.module.ts (modify — register CurriculumModule)'
code_patterns:
  - 'Module structure: module.ts + controller.ts + services/ + dto/requests/ + dto/responses/'
  - 'Controller: @UseJwtGuard(roles) + @UseInterceptors(CurrentUserInterceptor)'
  - 'Service: PascalCase public methods, inject EntityManager + ScopeResolverService'
  - 'Response DTOs: static Map() method, @ApiProperty() decorators'
  - 'Query DTOs: @IsOptional() + @IsUUID() + @IsString() + @MaxLength() validators'
  - 'Scope resolution: ScopeResolverService.ResolveDepartmentIds(semesterId) → null | string[]'
  - 'Filter validation: cascading departmentId → programId validation with 403/400 errors'
  - 'CLS-based user context: CurrentUserInterceptor → CurrentUserService → ScopeResolverService'
  - 'Search escaping: EscapeLikeWildcards() for ILIKE queries'
test_patterns:
  - 'Jest with NestJS Test.createTestingModule()'
  - 'Mock EntityManager as plain object with jest.fn() methods (findOne, find)'
  - 'Mock ScopeResolverService as { ResolveDepartmentIds: jest.fn() }'
  - 'Tests colocated with source as .spec.ts files'
  - 'Use npx jest --testPathPatterns=<pattern> to run specific tests'
---

# Tech-Spec: Scoped Curriculum Query Endpoints

**Created:** 2026-03-19

## Overview

### Problem Statement

Deans and super admins have no way to query the institutional hierarchy (departments, programs, courses) scoped to their role. The frontend needs these to populate filter dropdowns across multiple dashboard pages (faculty list, analytics, submission counts). Currently, the only course-level data available is per-user via `GET /enrollments/me`, which serves faculty — not the administrative lens deans require.

### Solution

Create three new endpoints (`GET /departments`, `GET /programs`, `GET /courses`) in a dedicated `CurriculumModule`, reusing the existing `ScopeResolverService` for role-based scoping. Lightweight DTOs without pagination (small result sets), search support on all three endpoints, and courses include an `isActive` flag for historical visibility into soft-deactivated courses.

### Scope

**In Scope:**

- New `CurriculumModule` with three endpoints:
  - `GET /departments?semesterId=X` — returns departments within the caller's scope
  - `GET /programs?semesterId=X&departmentId=Y` — returns programs under scoped departments, optional cascading filter by department
  - `GET /courses?semesterId=X&programId=Z` — returns courses under scoped programs, includes inactive courses with `isActive` flag. Requires at least one of `programId` or `departmentId` to prevent unbounded queries.
- Role-based access: DEAN and SUPER_ADMIN only
- **Mandatory scope enforcement**: all three endpoints always apply `ScopeResolverService` resolved scope filter, regardless of whether explicit filter params are passed. Explicit filters only narrow within the resolved scope — they never bypass it.
- **Filter validation on programs and courses endpoints**: if `departmentId` or `programId` is provided, validate it falls within the caller's resolved scope (403 if not). The departments endpoint has no filterable ID params — scope is enforced via `ScopeResolverService` directly.
- `semesterId` as a **required** query parameter on all endpoints
- Search filtering on all three endpoints (`search` query param)
- Courses return both `shortname` and `fullname`
- Reuse `ScopeResolverService` from `CommonModule` for scope resolution
- Cascading filter validation (same pattern as `FacultyService`)

**Out of Scope:**

- Faculty role access (covered by `GET /enrollments/me`)
- Pagination (result sets are small — deans have 1-3 departments, 5-15 programs, 20-60 courses)
- Active semester auto-detection (no `isActive` flag on Semester entity)
- Nested/aggregated responses (keep endpoints flat and independent)
- Course-level filtering on the faculty endpoint (separate concern)

## Context for Development

### Codebase Patterns

- **Module structure**: `module.ts` + `controller.ts` + `services/` + `dto/requests/` + `dto/responses/`. Reference: `src/modules/faculty/` (best reference — uses `ScopeResolverService`, `CurrentUserInterceptor`, `CommonModule`, and `DataLoaderModule`).
- **Module registration**: Add to `ApplicationModules` array in `src/modules/index.module.ts`.
- **Controller pattern**: `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN)` at class level + `@UseInterceptors(CurrentUserInterceptor)`. The controller does NOT receive `req.currentUser` directly — the `CurrentUserInterceptor` loads the user into CLS via `CurrentUserService.set()`, and downstream services access it via `CurrentUserService.getOrFail()` (injected into `ScopeResolverService`).
- **Service pattern**: PascalCase public methods. Inject `EntityManager` and `ScopeResolverService`. Use `em.find()` with `FilterQuery<T>` for simple queries (no raw SQL needed — unlike faculty's distinct-count problem, these are straightforward entity queries).
- **Scope resolution chain**: `CurrentUserInterceptor` → `UserLoader.load()` → `CurrentUserService.set(user)` → CLS store. Then `ScopeResolverService.ResolveDepartmentIds(semesterId)` calls `CurrentUserService.getOrFail()` to get the user from CLS. Returns `null` (unrestricted for super admin) or `string[]` (department UUIDs for dean).
- **Filter validation**: Cascading validation pattern from `FacultyService` (lines 43-78): if `departmentId` provided and scope is restricted (`departmentIds !== null`), check `departmentIds.includes(query.departmentId)` → 403 if not. If `programId` provided, fetch program with populated `department`, verify `program.department.id` is in scope → 403 if not. If both `departmentId` and `programId` provided, verify `program.department.id === departmentId` → 400 if mismatch.
- **Response DTOs**: Static `Map()` method to convert entity → DTO. `@ApiProperty()` / `@ApiPropertyOptional()` for Swagger.
- **Query DTOs**: `@IsUUID()`, `@IsNotEmpty()`, `@IsOptional()`, `@IsString()`, `@MaxLength()`. Follow `ListFacultyQueryDto` pattern.
- **Course `isActive` semantics**: `isActive = false` means Moodle no longer reports the course during sync (`moodle-course-sync.service.ts:88-95`). Not a semester boundary marker — semester scoping is structural via the hierarchy chain.
- **Search escaping**: Escape LIKE wildcards (`%`, `_`, `\`) before ILIKE queries. Reuse the `EscapeLikeWildcards()` pattern from `FacultyService` (line 281-286). Note: unlike `FacultyService` which uses raw SQL with an explicit `ESCAPE '\\'` clause, these endpoints use MikroORM's `$ilike` operator which generates bare `ILIKE` without `ESCAPE`. This works correctly because PostgreSQL's default escape character is backslash when `standard_conforming_strings = on` (the default).
- **Entity field details**:
  - `Department`: `id`, `moodleCategoryId` (number, unique, indexed), `code` (string), `name` (string, nullable), `semester` (ManyToOne Semester)
  - `Program`: `id`, `moodleCategoryId` (number, unique, indexed), `code` (string), `name` (string, nullable), `department` (ManyToOne Department)
  - `Course`: `id`, `moodleCourseId` (number, unique, indexed), `shortname` (string), `fullname` (string), `isActive` (boolean, default true), `isVisible` (boolean), `program` (ManyToOne Program), `startDate`, `endDate`, `courseImage` (nullable)
  - `Semester`: `id`, `moodleCategoryId` (number, unique), `code` (string), `label` (nullable), `academicYear` (nullable), `campus` (ManyToOne), no `isActive` flag
- **Soft delete**: Global MikroORM filter auto-applies `deleted_at IS NULL` on all `em.find()` calls. No need to add soft delete conditions manually.
- **CommonModule is NOT `@Global()`**: Must be explicitly imported by consuming modules to access `ScopeResolverService`.
- **DataLoaderModule required**: Must be imported because `CurrentUserInterceptor` depends on `UserLoader`.

### Files to Reference

| File                                                             | Purpose                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/modules/faculty/faculty.module.ts`                          | Reference module structure — imports CommonModule, DataLoaderModule, MikroOrmModule.forFeature |
| `src/modules/faculty/faculty.controller.ts`                      | Reference controller pattern — @UseJwtGuard, @UseInterceptors, @Query DTO                      |
| `src/modules/faculty/services/faculty.service.ts`                | Reference filter validation cascade (lines 43-78), EscapeLikeWildcards (line 281)              |
| `src/modules/faculty/dto/requests/list-faculty-query.dto.ts`     | Reference query DTO with @IsUUID, @IsOptional, @MaxLength                                      |
| `src/modules/faculty/dto/responses/faculty-card.response.dto.ts` | Reference response DTO with static Map() method                                                |
| `src/modules/common/services/scope-resolver.service.ts`          | Core scope resolution — ResolveDepartmentIds(semesterId)                                       |
| `src/modules/common/cls/current-user.service.ts`                 | CLS-based user context — getOrFail(), set()                                                    |
| `src/modules/common/interceptors/current-user.interceptor.ts`    | Loads user into CLS from JWT via UserLoader                                                    |
| `src/modules/common/common.module.ts`                            | Exports UnitOfWork, CacheService, ScopeResolverService, AppClsModule                           |
| `src/entities/department.entity.ts`                              | Department entity — code, name (nullable), moodleCategoryId, semester ManyToOne                |
| `src/entities/program.entity.ts`                                 | Program entity — code, name (nullable), moodleCategoryId, department ManyToOne                 |
| `src/entities/course.entity.ts`                                  | Course entity — shortname, fullname, isActive, isVisible, program ManyToOne                    |
| `src/entities/semester.entity.ts`                                | Semester entity — code, label, academicYear, no isActive flag                                  |
| `src/modules/index.module.ts`                                    | ApplicationModules array — where CurriculumModule will be registered                           |
| `src/modules/common/services/scope-resolver.service.spec.ts`     | Reference test pattern for scope resolver mocks                                                |
| `src/modules/faculty/services/faculty.service.spec.ts`           | Reference test pattern for service with mocked EM + ScopeResolver                              |
| `_bmad-output/project-context.md`                                | Project rules: PascalCase methods, strict TypeScript, absolute imports, Swagger decorators     |

### Technical Decisions

- **`CurriculumModule`** — separate from `FacultyModule` since these endpoints serve the institutional hierarchy, not faculty-specific data. Consumed by multiple frontend pages.
- **No pagination** — result sets are inherently small within a dean's scope. Super admin sees more but still manageable. Simplifies DTOs and service logic.
- **All courses returned (active + inactive)** — inactive courses may have historical analytics data (submissions, sentiment results). `isActive` flag in response lets frontend decide display behavior (greyed out, badge, etc.).
- **Three separate endpoints** — RESTful routes (`/departments`, `/programs`, `/courses`). Scoping is a server-side concern, not reflected in URLs.
- **Single controller** — all three endpoints in one `CurriculumController` since they share the same guard, interceptor, and scoping concern.
- **Search on all endpoints** — result sets are small enough that search overhead is negligible. Useful for super admins with many results.
- **Search uses `$or` on all endpoints** — Departments and programs search against both `code` and `name` fields (since `name` is nullable, searching only `name` would miss entries where `name` is null but `code` matches, e.g., searching "CCS"). Courses search against both `shortname` and `fullname`. All use MikroORM `$or` filter with `$ilike`.
- **Courses require narrowing filter** — at least one of `programId` or `departmentId` must be provided on the courses endpoint. Departments and programs can scale within a dean's scope (small sets), but courses can reach hundreds for super admins without narrowing. This prevents unbounded responses without adding pagination complexity.
- **Scope is always enforced, never optional** — every endpoint applies `ScopeResolverService.ResolveDepartmentIds()` before querying, even when no explicit filter params are passed. Explicit `departmentId`/`programId` params are validated against the resolved scope (403 if outside). This prevents enumeration attacks where a user guesses IDs outside their scope.
- **MikroORM `em.find()` sufficient** — unlike the faculty endpoint which needed raw SQL for `COUNT(DISTINCT)` and pagination, these endpoints return all matching entities in a single query. No raw SQL or complex joins needed.
- **`name` fields are nullable** — `Department.name` and `Program.name` are nullable. DTOs must handle this (return `null`). Search with ILIKE on nullable `name` fields naturally excludes nulls (no match), but search also matches against `code` (always populated) via `$or`.
- **`departmentId` has no existence check (intentional)** — consistent with the `FacultyService` pattern. If a non-existent `departmentId` is passed, the query returns empty results (no 404). This is asymmetric with `programId` which does get a 404 check — the difference is that `programId` requires a populated `department` relation for cross-filter validation, so a `findOne` is already being performed. Adding an extra `findOne` for `departmentId` existence would be an unnecessary query for a no-harm scenario (empty results).
- **Results sorted alphabetically** — departments and programs by `name` (nulls last), courses by `shortname`. Deterministic ordering for frontend consistency.

## Implementation Plan

### Tasks

- [x] Task 1: Create `ListDepartmentsQueryDto` request DTO
  - File: `src/modules/curriculum/dto/requests/list-departments-query.dto.ts` (new)
  - Action: Create query DTO with:
    - `semesterId: string` — required, `@IsUUID()`, `@IsNotEmpty()`
    - `search?: string` — optional, `@IsString()`, `@IsOptional()`, `@MaxLength(100)`
  - Notes: Follow `ListFacultyQueryDto` pattern. All properties must have `@ApiProperty()` or `@ApiPropertyOptional()` decorators.

- [x] Task 2: Create `ListProgramsQueryDto` request DTO
  - File: `src/modules/curriculum/dto/requests/list-programs-query.dto.ts` (new)
  - Action: Create query DTO with:
    - `semesterId: string` — required, `@IsUUID()`, `@IsNotEmpty()`
    - `departmentId?: string` — optional, `@IsUUID()`, `@IsOptional()`
    - `search?: string` — optional, `@IsString()`, `@IsOptional()`, `@MaxLength(100)`
  - Notes: `departmentId` is optional — when omitted, returns programs across all departments within the caller's scope.

- [x] Task 3: Create `ListCoursesQueryDto` request DTO
  - File: `src/modules/curriculum/dto/requests/list-courses-query.dto.ts` (new)
  - Action: Create query DTO with:
    - `semesterId: string` — required, `@IsUUID()`, `@IsNotEmpty()`
    - `departmentId?: string` — optional, `@IsUUID()`, `@IsOptional()`
    - `programId?: string` — optional, `@IsUUID()`, `@IsOptional()`
    - `search?: string` — optional, `@IsString()`, `@IsOptional()`, `@MaxLength(100)`
  - Notes: At least one of `programId` or `departmentId` must be provided — this validation happens in the service, not the DTO (cross-field validation is more readable there). The DTO itself marks both as optional.

- [x] Task 4: Create `DepartmentItemResponseDto` response DTO
  - File: `src/modules/curriculum/dto/responses/department-item.response.dto.ts` (new)
  - Action: Create response DTO with:
    - `id: string` — department UUID
    - `code: string` — e.g., "CCS"
    - `name: string | null` — department name (nullable in entity)
  - Notes: Include a static `Map(department: Department): DepartmentItemResponseDto` method.

- [x] Task 5: Create `ProgramItemResponseDto` response DTO
  - File: `src/modules/curriculum/dto/responses/program-item.response.dto.ts` (new)
  - Action: Create response DTO with:
    - `id: string` — program UUID
    - `code: string` — e.g., "BSCS", "BSIT"
    - `name: string | null` — program name (nullable in entity)
    - `departmentId: string` — parent department UUID (for client-side re-filtering)
  - Notes: Include a static `Map(program: Program): ProgramItemResponseDto` method. The `departmentId` comes from `program.department.id` — requires `department` to be populated when querying.

- [x] Task 6: Create `CourseItemResponseDto` response DTO
  - File: `src/modules/curriculum/dto/responses/course-item.response.dto.ts` (new)
  - Action: Create response DTO with:
    - `id: string` — course UUID
    - `shortname: string` — e.g., "FREAI", "ELDNET1"
    - `fullname: string` — e.g., "Free Elective AI"
    - `programId: string` — parent program UUID (for client-side re-filtering)
    - `isActive: boolean` — whether the course is active in Moodle
  - Notes: Include a static `Map(course: Course): CourseItemResponseDto` method. The `programId` comes from `course.program.id` — requires `program` to be populated when querying.

- [x] Task 7: Create `CurriculumService`
  - File: `src/modules/curriculum/services/curriculum.service.ts` (new)
  - Action: Create injectable service with three public methods:

    **`ListDepartments(query: ListDepartmentsQueryDto): Promise<DepartmentItemResponseDto[]>`**
    1. Validate semester — `em.findOne(Semester, { id: query.semesterId })` → throw `NotFoundException` if not found.
    2. Resolve scope — call `ScopeResolverService.ResolveDepartmentIds(query.semesterId)`.
    3. Build filter — `FilterQuery<Department>`:
       - Base: `{ semester: query.semesterId }`
       - If scope restricted (`departmentIds !== null`): add `{ id: { $in: departmentIds } }`. If `departmentIds` is empty array, return `[]` immediately (dean has no departments in this semester).
       - If `search` provided: add `{ $or: [{ code: { $ilike: '%' + escapedSearch + '%' } }, { name: { $ilike: '%' + escapedSearch + '%' } }] }` (escape LIKE wildcards first). This ensures departments with null `name` but matching `code` (e.g., "CCS") are found.
    4. Query — `em.find(Department, filter, { orderBy: { name: QueryOrder.ASC_NULLS_LAST } })`.
    5. Map — `departments.map(DepartmentItemResponseDto.Map)`.

    **`ListPrograms(query: ListProgramsQueryDto): Promise<ProgramItemResponseDto[]>`**
    1. Validate semester — same as above.
    2. Resolve scope — same as above.
    3. Validate departmentId — if provided and scope restricted, check `departmentIds.includes(query.departmentId)` → throw `ForbiddenException` if not.
    4. Build filter — `FilterQuery<Program>`:
       - Base: `{ department: { semester: query.semesterId } }`
       - If scope restricted and no explicit `departmentId`: add `{ department: { id: { $in: departmentIds } } }`. If empty, return `[]`.
       - If `departmentId` provided: add `{ department: { id: query.departmentId } }` (already validated in scope).
       - If `search` provided: add `{ $or: [{ code: { $ilike: '%' + escapedSearch + '%' } }, { name: { $ilike: '%' + escapedSearch + '%' } }] }`. Same rationale as departments — `name` is nullable, `code` always populated.
    5. Query — `em.find(Program, filter, { populate: ['department'], orderBy: { name: QueryOrder.ASC_NULLS_LAST } })`.
    6. Map — `programs.map(ProgramItemResponseDto.Map)`.

    **`ListCourses(query: ListCoursesQueryDto): Promise<CourseItemResponseDto[]>`**
    1. Validate narrowing filter — if neither `programId` nor `departmentId` is provided, throw `BadRequestException('At least one of programId or departmentId is required.')`.
    2. Validate semester — same as above.
    3. Resolve scope — same as above.
    4. Validate filters — same cascading pattern as `FacultyService` (lines 43-78):
       - If `departmentId` provided and scope restricted: check in scope → 403.
       - If `programId` provided: fetch program with populated `department`. If not found → 404. If `departmentId` also provided, verify `program.department.id === departmentId` → 400 if mismatch. If scope restricted, verify `program.department.id` in scope → 403.
    5. Build filter — `FilterQuery<Course>`:
       - Base: `{ program: { department: { semester: query.semesterId } } }`
       - Apply the most specific department constraint (same logic as `FacultyService.BuildCourseFilter`):
         - If `departmentId` provided: `{ program: { department: { id: query.departmentId } } }`
         - Else if scope restricted: `{ program: { department: { id: { $in: departmentIds } } } }`
       - If `programId` provided: add `{ program: { id: query.programId } }`
       - If `search` provided: add `{ $or: [{ shortname: { $ilike: '%' + escaped + '%' } }, { fullname: { $ilike: '%' + escaped + '%' } }] }`
       - **Do NOT filter by `isActive`** — return both active and inactive courses.
    6. Query — `em.find(Course, filter, { populate: ['program'], orderBy: { shortname: QueryOrder.ASC } })`.
    7. Map — `courses.map(CourseItemResponseDto.Map)`.

  - Notes: Inject `EntityManager` and `ScopeResolverService`. Add a private `EscapeLikeWildcards(input: string): string` helper (same implementation as `FacultyService` line 281-286: escapes `\`, `%`, `_`). This duplicates the 3-line function — acceptable tradeoff vs extracting a shared utility for such a small helper. Use `QueryOrder` from `@mikro-orm/core` for ordering.

- [x] Task 8: Create `CurriculumController`
  - File: `src/modules/curriculum/curriculum.controller.ts` (new)
  - Action: Create controller:
    - `@ApiTags('Curriculum')`
    - `@Controller('curriculum')`
    - `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN)`
    - `@UseInterceptors(CurrentUserInterceptor)`
    - Three endpoints:
      - `@Get('departments')` with `@Query() query: ListDepartmentsQueryDto` → delegates to `CurriculumService.ListDepartments(query)`
      - `@Get('programs')` with `@Query() query: ListProgramsQueryDto` → delegates to `CurriculumService.ListPrograms(query)`
      - `@Get('courses')` with `@Query() query: ListCoursesQueryDto` → delegates to `CurriculumService.ListCourses(query)`
    - Each endpoint: `@ApiOperation()` with summary + `@ApiResponse({ status: 200 })` with the array type.
  - Notes: Return type is the DTO array directly (e.g., `Promise<DepartmentItemResponseDto[]>`), no wrapper object since there's no pagination.

- [x] Task 9: Create `CurriculumModule`
  - File: `src/modules/curriculum/curriculum.module.ts` (new)
  - Action: Create module:
    - `imports: [MikroOrmModule.forFeature([Department, Program, Course, Semester]), CommonModule, DataLoaderModule]`
    - `controllers: [CurriculumController]`
    - `providers: [CurriculumService]`
    - `exports: [CurriculumService]`
  - Notes: `CommonModule` must be explicitly imported (NOT `@Global()`) to access `ScopeResolverService`. `DataLoaderModule` must be imported because `CurrentUserInterceptor` depends on `UserLoader`. `Semester` entity included for existence validation. No `User` or `Enrollment` entities needed — scope resolution is handled by `ScopeResolverService` internally.

- [x] Task 10: Register `CurriculumModule` in application modules
  - File: `src/modules/index.module.ts` (modify)
  - Action: Import `CurriculumModule` and add it to the `ApplicationModules` array.

- [x] Task 11: Write unit tests for `CurriculumService`
  - File: `src/modules/curriculum/services/curriculum.service.spec.ts` (new)
  - Action: Test cases organized by endpoint:

    **ListDepartments:**
    - Super admin sees all departments for semester (scope returns `null`, no `id` filter applied)
    - Dean sees only departments in their scope
    - Dean with empty scope (no institutional roles for semester) returns `[]`
    - Search filters by department code and name (OR, ILIKE)
    - LIKE wildcards in search are escaped (`%`, `_`)
    - Non-existent `semesterId` returns 404
    - Empty result returns `[]`

    **ListPrograms:**
    - Super admin sees all programs for semester
    - Super admin with non-existent `departmentId` returns `[]` (no existence check, intentional)
    - Dean sees only programs under their scoped departments
    - `departmentId` within scope narrows results
    - `departmentId` outside dean's scope returns 403
    - Search filters by program code and name (OR)
    - Empty result returns `[]`

    **ListCourses:**
    - Missing both `programId` and `departmentId` returns 400
    - Super admin with `departmentId` sees all courses under that department
    - Dean with `programId` within scope returns courses
    - Dean with `programId` outside scope returns 403
    - `departmentId` + `programId` mismatch returns 400
    - `programId` not found returns 404
    - Search filters by both shortname and fullname (OR)
    - Inactive courses (`isActive: false`) ARE included in results
    - Results include `isActive` flag in response DTO
    - `departmentId` outside dean's scope returns 403
    - Only `programId` provided, program's department outside scope → 403
    - Empty result returns `[]`

  - Notes: Mock `EntityManager` as `{ findOne: jest.fn(), find: jest.fn() }` and `ScopeResolverService` as `{ ResolveDepartmentIds: jest.fn() }`. Follow `faculty.service.spec.ts` patterns. Use `Test.createTestingModule()` in `beforeEach`.

### Acceptance Criteria

- [ ] AC 1: Given a super admin with a valid `semesterId`, when `GET /curriculum/departments?semesterId=X`, then return all departments for that semester sorted by name.

- [ ] AC 2: Given a dean assigned to department CCS, when `GET /curriculum/departments?semesterId=X`, then return only CCS (and any other departments the dean is assigned to).

- [ ] AC 3: Given a super admin, when `GET /curriculum/programs?semesterId=X`, then return all programs across all departments for that semester.

- [ ] AC 4: Given a dean assigned to CCS, when `GET /curriculum/programs?semesterId=X&departmentId=CCS_ID`, then return only programs under CCS.

- [ ] AC 5: Given a dean assigned to CCS, when `GET /curriculum/programs?semesterId=X&departmentId=CBA_ID`, then return 403 Forbidden.

- [ ] AC 6: Given a valid `departmentId` and `semesterId`, when `GET /curriculum/courses?semesterId=X&departmentId=Y`, then return all courses (active and inactive) under programs in that department, each with `isActive` flag.

- [ ] AC 7: Given a valid `programId`, when `GET /curriculum/courses?semesterId=X&programId=Z`, then return all courses under that program sorted by shortname.

- [ ] AC 8: Given neither `programId` nor `departmentId`, when `GET /curriculum/courses?semesterId=X`, then return 400 Bad Request with message "At least one of programId or departmentId is required."

- [ ] AC 9: Given a dean scoped to CCS and a `programId` belonging to CBA, when `GET /curriculum/courses?semesterId=X&programId=CBA_PROGRAM_ID`, then return 403 Forbidden.

- [ ] AC 10: Given `departmentId=CCS_ID` and `programId=BSBA_ID` where BSBA belongs to CBA (not CCS), when `GET /curriculum/courses?semesterId=X&departmentId=CCS_ID&programId=BSBA_ID`, then return 400 Bad Request.

- [ ] AC 11: Given a search term `search=Comp`, when `GET /curriculum/departments?semesterId=X&search=Comp`, then return only departments whose `code` or `name` contains "Comp" (case-insensitive).

- [ ] AC 12: Given a search term `search=NET`, when `GET /curriculum/courses?semesterId=X&departmentId=Y&search=NET`, then return courses where shortname OR fullname contains "NET" (case-insensitive).

- [ ] AC 13: Given a search term containing LIKE wildcard `search=%admin`, when the query executes, then `%` is escaped and treated as a literal character.

- [ ] AC 14: Given a `semesterId` that does not exist, when any curriculum endpoint is called, then return 404 Not Found.

- [ ] AC 15: Given a user with role STUDENT or FACULTY, when any curriculum endpoint is called, then return 403 Forbidden.

- [ ] AC 16: Given an inactive course (`isActive: false`) within the scope, when `GET /curriculum/courses?semesterId=X&departmentId=Y`, then the course appears in results with `isActive: false`.

- [ ] AC 17: Given a semester with no departments, when `GET /curriculum/departments?semesterId=X`, then return `[]`.

- [ ] AC 18: Given a dean assigned to multiple departments (CCS and CBA), when `GET /curriculum/programs?semesterId=X`, then return programs from both departments.

- [ ] AC 19: Given a dean with no departments assigned for semester X (empty scope), when any curriculum endpoint is called with `semesterId=X`, then return `[]`.

- [ ] AC 20: Given a search term `search=CCS` and a department with `name = null` but `code = 'CCS'`, when `GET /curriculum/departments?semesterId=X&search=CCS`, then the department is found (search matches `code` via OR condition).

## Additional Context

### Dependencies

- `ScopeResolverService` must exist in `CommonModule` (already implemented in FAC-53).
- `CurrentUserInterceptor` and `UserLoader` must exist in `DataLoaderModule` (already implemented).
- `CurrentUserService` and `AppClsModule` must exist in `CommonModule` (already implemented in FAC-56).
- Department → Program → Course hierarchy must be synced from Moodle (`CategorySyncJob` + `CourseSyncJob`).
- `UserInstitutionalRole` must be populated for deans (populated by `MoodleUserHydrationService` during login/sync).
- No new external libraries required — all functionality uses existing NestJS, MikroORM, and class-validator packages.

### Testing Strategy

**Unit Tests:**

- `CurriculumService` — test all three methods with scope variations (super admin unrestricted, dean restricted, dean empty scope), filter validation (403/400 errors), search escaping, inactive course inclusion, empty results. Mock `EntityManager` and `ScopeResolverService`.

**Manual Testing:**

- Use Swagger UI (`OPENAPI_MODE=true`) to test the three endpoints with different user tokens.
- Verify dean scoping with a real dean account (check that only their department's programs and courses appear).
- Verify super admin sees all hierarchy data.
- Test cascading filter flow: select department → load programs → select program → load courses.
- Test search with special characters.

### Notes

- This is FAC-57 on the project board.
- The `ScopeResolverService` was intentionally placed in `CommonModule` during FAC-53 to support exactly this use case.
- The faculty endpoint (FAC-53) excludes inactive courses in its results (`isActive: true` filter) — different concern. Faculty list cares about current teaching assignments. Curriculum list cares about historical visibility for analytics.
- `Department.name` and `Program.name` are nullable — synced from Moodle category names. The DTOs return `null` when name is not set. Frontend should handle null names gracefully (e.g., fall back to displaying `code`).
- The controller uses `/curriculum/departments`, `/curriculum/programs`, `/curriculum/courses` routes (under the `curriculum` controller prefix). This groups them logically while keeping individual resource names RESTful.
- **Red Team hardening applied**: mandatory scope enforcement on all endpoints, filter validation against resolved scope, courses require narrowing filter. See Technical Decisions for details.

## Review Notes

- Adversarial review completed
- Findings: 15 total — 7 fixed, 4 acknowledged (Low/accepted), 2 undecided (accepted risk), 2 noise
- **Fixed**: F2 (search on code+name), F3 (removed cache claim), F6 (scope text correction), F7/F8 (documented departmentId behavior), F9 (added test case), F10 (acknowledged duplication), F12 (added AC 19), F1 (documented ESCAPE assumption), F5/F14 (cleaned up frontmatter)
- **Accepted**: F4 (entity summary omissions — minor, non-blocking), F13 (cross-campus returns empty — correct behavior), F11 (noise — logic is sound), F15 (ILIKE null behavior — now covered by $or on code)

## Implementation Review Notes

- Implementation adversarial review completed
- Findings: 13 total — 7 fixed, 5 acknowledged (accepted), 1 noise
- Resolution approach: auto-fix
- **Fixed**: F2 (wrapped search $or in $and for safe filter composition), F3 (mockResolvedValueOnce in test), F4 (reordered ListCourses validation — semester before business rules), F5 (added test: empty scope + programId), F7 (added test: scope + search combined), F12 (strengthened filter assertion in test), F13 (added happy-path test: both departmentId + programId)
- **Acknowledged**: F1 ($ilike ESCAPE — accepted per tech spec), F6 (Map() assumes populated relations — consistent with codebase pattern), F8/F9/F10/F11 (accepted by design or consistent with patterns)
