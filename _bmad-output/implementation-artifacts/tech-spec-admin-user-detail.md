---
title: 'Admin User Detail Endpoint'
slug: 'admin-user-detail'
created: '2026-04-02'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'MikroORM 6',
    'PostgreSQL',
    'class-validator',
    '@nestjs/swagger',
    'Jest 30',
  ]
files_to_modify:
  - 'src/modules/admin/admin.controller.ts'
  - 'src/modules/admin/services/admin.service.ts'
  - 'src/modules/admin/dto/responses/admin-user-detail.response.dto.ts (new)'
  - 'src/modules/admin/dto/responses/admin-user-item.response.dto.ts'
  - 'src/modules/admin/admin.module.ts'
  - 'src/modules/admin/services/admin.service.spec.ts'
  - 'src/modules/admin/admin.controller.spec.ts'
code_patterns:
  - 'PascalCase public service methods (e.g., GetUserDetail)'
  - 'Static Map() factory on response DTOs for entity-to-DTO conversion'
  - '@UseJwtGuard(UserRole.SUPER_ADMIN) on controller class'
  - 'em.findOneOrFail with failHandler for 404s'
  - 'em.find with populate for relation loading'
  - '@ApiOperation, @ApiResponse, @ApiParam Swagger decorators on endpoints'
  - 'AdminUserScopedRelationDto (id, code, name) reusable for scoped relations'
test_patterns:
  - 'NestJS TestingModule with mocked EntityManager (jest.fn() per method)'
  - 'Controller tests override AuthGuard("jwt") and RolesGuard'
  - 'Service tests mock em.findOneOrFail, em.find, em.findAndCount, em.flush'
  - 'Tests use as User / as unknown as User for mock data casting'
---

# Tech-Spec: Admin User Detail Endpoint

**Created:** 2026-04-02

## Overview

### Problem Statement

The admin console has no way to view detailed information about a single user. The existing list endpoint (`GET /admin/users`) returns only summary data (name, roles, active status, scoped relations). Admins need a drill-down view showing enrollments and institutional role assignments to manage users effectively.

### Solution

Add a `GET /admin/users/:id` endpoint (SUPER_ADMIN only) that returns the full user profile plus their active enrollments (with course info) and institutional role assignments (with category context).

### Scope

**In Scope:**

- New `GET /admin/users/:id` endpoint on `AdminController`
- New `AdminUserDetailResponseDto` with user details + enrollments + institutional roles
- Populate enrollment → course chain for course names
- Populate institutional roles → moodleCategory for role context
- Filter enrollments by `isActive: true` AND `course.isActive: true` to exclude deactivated courses
- Unit tests for service and controller

**Out of Scope:**

- Editing user details via this endpoint
- Enrollment management (create/delete)
- Moodle token exposure
- Changes to the existing list endpoint

## Context for Development

### Codebase Patterns

- **Service methods** use `PascalCase` (e.g., `ListUsers`, `GetDeanEligibleCategories`)
- **Response DTOs** use a static `Map()` factory for entity-to-DTO conversion (see `AdminUserItemResponseDto.Map()`)
- **Admin controller** has class-level `@UseJwtGuard(UserRole.SUPER_ADMIN)` and `@ApiBearerAuth()` — new endpoints inherit these
- **MikroORM** requires explicit `populate` for relation loading — no eager loading configured
- **Entity lookups** use `em.findOneOrFail` with `failHandler: () => new NotFoundException(...)` pattern
- **Enrollment entity** has nullable `section` relation (null when user has no group membership)
- **Enrollment.role** is a string field with values: `'student'`, `'editingteacher'`, `'teacher'` (see `EnrollmentRole` enum in `questionnaires/lib/questionnaire.types.ts`)
- **UserInstitutionalRole** has `role` (string: DEAN/CHAIRPERSON), `moodleCategory` (ManyToOne), `source` (AUTO/MANUAL)
- **MoodleCategory** has `name`, `depth`, `moodleCategoryId` — used for institutional role context
- **AdminModule** currently imports: Campus, Department, MoodleCategory, Program, Semester, UserInstitutionalRole, User — **Enrollment and Course are NOT imported yet**
- **Soft delete** is globally enforced via MikroORM filter; all entities inherit `deletedAt` from `CustomBaseEntity`

### Files to Reference

| File                                                                | Purpose                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/admin/admin.controller.ts`                             | Add new `GET users/:id` endpoint (follows existing `ListUsers` pattern)                                                                                                                                           |
| `src/modules/admin/services/admin.service.ts`                       | Add `GetUserDetail()` method (follows `GetDeanEligibleCategories` pattern for single-entity lookup)                                                                                                               |
| `src/modules/admin/dto/responses/admin-user-item.response.dto.ts`   | Export `AdminUserScopedRelationDto` for reuse                                                                                                                                                                     |
| `src/modules/admin/dto/responses/admin-user-detail.response.dto.ts` | **NEW FILE** — detail response DTO with enrollment + institutional role sub-DTOs                                                                                                                                  |
| `src/modules/admin/admin.module.ts`                                 | Add `Enrollment` and `Course` to `MikroOrmModule.forFeature()` imports                                                                                                                                            |
| `src/modules/admin/services/admin.service.spec.ts`                  | Add `GetUserDetail` test describe block (follows existing mock patterns)                                                                                                                                          |
| `src/modules/admin/admin.controller.spec.ts`                        | Add controller delegation test (follows `ListUsers` pattern)                                                                                                                                                      |
| `src/entities/user.entity.ts`                                       | User entity — fields: userName, firstName, lastName, fullName, moodleUserId, userProfilePicture, isActive, roles, lastLoginAt, createdAt; relations: campus, department, program, enrollments, institutionalRoles |
| `src/entities/enrollment.entity.ts`                                 | Enrollment entity — fields: role (string), isActive, timeModified; relations: user, course, section (nullable)                                                                                                    |
| `src/entities/course.entity.ts`                                     | Course entity — fields: shortname, fullname, moodleCourseId, isActive, isVisible, startDate, endDate; relations: program                                                                                          |
| `src/entities/user-institutional-role.entity.ts`                    | UserInstitutionalRole entity — fields: role (string), source (AUTO/MANUAL); relations: user, moodleCategory                                                                                                       |
| `src/entities/moodle-category.entity.ts`                            | MoodleCategory entity — fields: moodleCategoryId, name, depth, path                                                                                                                                               |

### Technical Decisions

1. **Filter enrollments by `course.isActive: true`** — The sync pipeline can leave active enrollments pointing to deactivated courses. Filtering at query time prevents showing stale data.
2. **Export `AdminUserScopedRelationDto`** — Currently non-exported in `admin-user-item.response.dto.ts`. Add the `export` keyword so the detail DTO can import and reuse it for campus/department/program.
3. **Separate enrollment and institutional role sub-DTOs** — Keep the response structured with nested arrays.
4. **Return 404 for missing users** — Use `em.findOneOrFail` with `failHandler` pattern consistent with `GetDeanEligibleCategories`.
5. **Two separate queries for enrollments and institutional roles** — Rather than deep-populating from the User entity (which would load ALL enrollments including inactive), use targeted `em.find()` calls with explicit filters.
6. **Populate chain for enrollments: `['course']`** — Course name fields (shortname, fullname) are sufficient. No need to walk up the program->department->semester chain since the user's scoped relations (campus, department, program) are already on the User entity directly.
7. **Populate chain for institutional roles: `['moodleCategory']`** — Need category name and depth for display context.

## Implementation Plan

### Tasks

- [ ] **Task 1: Register entities in AdminModule**
  - File: `src/modules/admin/admin.module.ts`
  - Action: Add `Enrollment` and `Course` to the `MikroOrmModule.forFeature()` array
  - Notes: Import from `src/entities/enrollment.entity` and `src/entities/course.entity`

- [ ] **Task 2: Export `AdminUserScopedRelationDto`**
  - File: `src/modules/admin/dto/responses/admin-user-item.response.dto.ts`
  - Action: Add the `export` keyword to the existing `class AdminUserScopedRelationDto` declaration (line 5)
  - Notes: Currently `class AdminUserScopedRelationDto` — change to `export class AdminUserScopedRelationDto`. No other changes to this file.

- [ ] **Task 3: Create the detail response DTO**
  - File: `src/modules/admin/dto/responses/admin-user-detail.response.dto.ts` **(NEW)**
  - Action: Create `AdminUserDetailResponseDto` with the following structure:

  **Sub-DTOs to define in this file:**

  `AdminEnrollmentItemDto`:
  - `id` (string) — enrollment ID
  - `role` (string) — Moodle enrollment role (e.g., `'student'`, `'teacher'`)
  - `isActive` (boolean)
  - `course` object:
    - `id` (string) — course entity ID
    - `shortname` (string)
    - `fullname` (string)
  - Static `Map(enrollment: Enrollment)` method

  `AdminInstitutionalRoleItemDto`:
  - `id` (string) — institutional role entity ID
  - `role` (string) — e.g., `'DEAN'`, `'CHAIRPERSON'`
  - `source` (string) — `'auto'` or `'manual'` (lowercase, per `InstitutionalRoleSource` enum values)
  - `category` object:
    - `moodleCategoryId` (number)
    - `name` (string)
    - `depth` (number)
  - Static `Map(ir: UserInstitutionalRole)` method — must null-guard `ir.moodleCategory` (existing production code in `GetDeanEligibleCategories` defensively checks for falsy `moodleCategory` despite the non-nullable entity declaration)

  **Main DTO: `AdminUserDetailResponseDto`:**
  - `id` (string)
  - `userName` (string)
  - `fullName` (string)
  - `firstName` (string)
  - `lastName` (string)
  - `moodleUserId` (number, optional)
  - `userProfilePicture` (string)
  - `roles` (UserRole[])
  - `isActive` (boolean)
  - `lastLoginAt` (Date)
  - `createdAt` (Date)
  - `campus` (AdminUserScopedRelationDto | null) — imported from `admin-user-item.response.dto.ts`
  - `department` (AdminUserScopedRelationDto | null)
  - `program` (AdminUserScopedRelationDto | null)
  - `enrollments` (AdminEnrollmentItemDto[])
  - `institutionalRoles` (AdminInstitutionalRoleItemDto[])
  - Static `Map(user: User, enrollments: Enrollment[], institutionalRoles: UserInstitutionalRole[])` method

  Notes:
  - All properties must have `@ApiProperty` or `@ApiPropertyOptional` decorators
  - Use `@ApiProperty({ type: [AdminEnrollmentItemDto] })` for array properties
  - The `Map()` method handles null-safe mapping for campus/department/program (same pattern as `AdminUserItemResponseDto.Map()`)
  - The `Map()` method must use the `fullName` null-coalescing fallback: `user.fullName ?? \`${user.firstName} ${user.lastName}\`.trim()`(same as`AdminUserItemResponseDto.Map()` line 48)
  - The `Map()` method must filter out institutional roles where `ir.moodleCategory` is falsy before mapping to prevent runtime TypeError

- [ ] **Task 4: Implement `GetUserDetail()` in AdminService**
  - File: `src/modules/admin/services/admin.service.ts`
  - Action: Add the following method to `AdminService`:

  ```typescript
  async GetUserDetail(userId: string): Promise<AdminUserDetailResponseDto> {
    // 1. Load user with scoped relations
    const user = await this.em.findOneOrFail(
      User,
      { id: userId },
      {
        populate: ['campus', 'department', 'program'],
        failHandler: () => new NotFoundException('User not found'),
      },
    );

    // 2. Load active enrollments with active courses
    const enrollments = await this.em.find(
      Enrollment,
      { user: userId, isActive: true, course: { isActive: true } },
      {
        populate: ['course'],
        orderBy: { timeModified: 'DESC' },
      },
    );

    // 3. Load institutional roles with category context
    const institutionalRoles = await this.em.find(
      UserInstitutionalRole,
      { user: userId },
      { populate: ['moodleCategory'] },
    );

    return AdminUserDetailResponseDto.Map(user, enrollments, institutionalRoles);
  }
  ```

  Notes:
  - Add `AdminUserDetailResponseDto` to imports
  - Enrollments ordered by `timeModified DESC` (most recently modified first)
  - Enrollment filter: `isActive: true` AND `course: { isActive: true }` to exclude deactivated courses
  - Institutional roles have no active/inactive filter — show all assignments

- [ ] **Task 5: Add controller endpoint**
  - File: `src/modules/admin/admin.controller.ts`
  - Action: Add the following endpoint method to `AdminController`, placed after `ListUsers` and before `GetDeanEligibleCategories`:

  ```typescript
  @Get('users/:id')
  @ApiOperation({ summary: 'Get detailed information about a single user' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({ status: 200, type: AdminUserDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async GetUserDetail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailResponseDto> {
    return this.adminService.GetUserDetail(id);
  }
  ```

  Notes:
  - Import `Param, ParseUUIDPipe` from `@nestjs/common` (add to existing import)
  - Import `ApiParam` from `@nestjs/swagger` (add to existing import)
  - Import `AdminUserDetailResponseDto` from the new DTO file
  - `ParseUUIDPipe` validates the `:id` param is a valid UUID, returning 400 for malformed input (consistent with other controllers: `faculty.controller.ts`, `reports.controller.ts`, etc.)

- [ ] **Task 6: Add service unit tests**
  - File: `src/modules/admin/services/admin.service.spec.ts`
  - Action: Add a new `describe('GetUserDetail')` block with the following test cases:
  1. **`should return full user detail with enrollments and institutional roles`**
     - Mock `em.findOneOrFail` → returns a user with campus/department/program
     - Mock `em.find` call 1 → returns enrollments with populated course
     - Mock `em.find` call 2 → returns institutional roles with populated moodleCategory
     - Assert response contains all user fields, enrollment array, institutional roles array

  2. **`should return empty arrays when user has no enrollments or roles`**
     - Mock `em.findOneOrFail` → returns a user
     - Mock `em.find` → returns `[]` for both calls
     - Assert `enrollments: []` and `institutionalRoles: []`

  3. **`should throw NotFoundException when user does not exist`**
     - Mock `em.findOneOrFail` to invoke `failHandler`
     - Assert throws `NotFoundException`

  4. **`should filter enrollments by isActive and course.isActive`**
     - Mock `em.findOneOrFail` → returns user
     - Mock `em.find` → returns `[]`
     - Assert `em.find` was called with `Enrollment` and filter `{ user: userId, isActive: true, course: { isActive: true } }`

  Notes: Follow existing test patterns — use `em.findOneOrFail.mockResolvedValueOnce()` and `em.find.mockResolvedValueOnce()` sequencing. Use mock data objects cast with `as unknown as User`, etc.

- [ ] **Task 7: Add controller unit test**
  - File: `src/modules/admin/admin.controller.spec.ts`
  - Action: Add `GetUserDetail` to the mock service object and add a test:
  1. Add `GetUserDetail: jest.fn().mockResolvedValue({})` to the `adminService` mock
  2. Add test: `it('should delegate user detail to the admin service')` — call `controller.GetUserDetail('user-1')`, assert `adminService.GetUserDetail` was called with `'user-1'`

### Acceptance Criteria

- [ ] **AC 1:** Given a SUPER_ADMIN is authenticated, when they call `GET /admin/users/:id` with a valid user UUID, then they receive a 200 response with the full user profile including `enrollments[]` and `institutionalRoles[]` arrays.

- [ ] **AC 2:** Given a SUPER_ADMIN calls `GET /admin/users/:id` with a UUID that does not match any user, when the request is processed, then they receive a 404 response with message `'User not found'`.

- [ ] **AC 2b:** Given a SUPER_ADMIN calls `GET /admin/users/:id` with a malformed (non-UUID) string, when the request is processed, then they receive a 400 response before hitting the database.

- [ ] **AC 3:** Given a user has active enrollments in both active and deactivated courses, when the detail endpoint is called, then only enrollments where both `enrollment.isActive = true` AND `course.isActive = true` are returned.

- [ ] **AC 4:** Given a user has no enrollments, when the detail endpoint is called, then the `enrollments` array is empty (`[]`) and the response still includes all other user fields.

- [ ] **AC 5:** Given a user has institutional roles (DEAN/CHAIRPERSON), when the detail endpoint is called, then the `institutionalRoles` array contains each role with its `moodleCategory` name, depth, and source (AUTO/MANUAL).

- [ ] **AC 6:** Given a user has no institutional role assignments, when the detail endpoint is called, then the `institutionalRoles` array is empty (`[]`).

- [ ] **AC 7:** Given the response DTO, when Swagger docs are generated, then the endpoint and its response schema are fully documented with `@ApiOperation`, `@ApiParam`, `@ApiResponse`, and `@ApiProperty` decorators.

- [ ] **AC 8:** Given the unit test suite, when `npm run test -- --testPathPattern=admin` is run, then all existing and new tests pass.

## Additional Context

### Dependencies

- No new packages required
- **Enrollment** and **Course** entities must be added to `AdminModule`'s `MikroOrmModule.forFeature()` array (Task 1)
- No database migrations needed — reads existing data only

### Testing Strategy

- **Unit tests (service):** Mock EntityManager methods. Test happy path (full data), empty relations, 404, and filter correctness. 4 test cases in `admin.service.spec.ts`.
- **Unit tests (controller):** Mock AdminService. Verify delegation. 1 test case in `admin.controller.spec.ts`.
- **Manual testing:** Call `GET /admin/users/:id` via Swagger UI or curl with a valid JWT. Verify:
  - Response shape matches DTO
  - Enrollments are filtered correctly (compare with DB records)
  - Institutional roles include category names

### Notes

- Investigation confirmed: enrollment → course data is always present in normal operations (sync ordering: categories → courses → enrollments). The `course.isActive` filter is a defensive measure for the edge case where courses are deactivated post-enrollment.
- `Section` on enrollment is nullable by design (no group membership) — excluded from the DTO since the admin console doesn't need group-level detail.
- `AdminUserScopedRelationDto` is currently a non-exported class inside `admin-user-item.response.dto.ts`. Task 2 exports it so the detail DTO can reuse it.
- The enrollment `role` field is a raw string from Moodle (e.g., `'student'`, `'editingteacher'`). Passed through as-is — no enum enforcement at the DTO level.
- Enrollment ordering: `timeModified DESC` gives admins the most recently active enrollments first.
- **Soft-deleted users:** The global MikroORM soft-delete filter will exclude soft-deleted users, returning a 404 indistinguishable from "user never existed." This is intentional and consistent with the list endpoint behavior — the admin console cannot list deleted users, so it cannot navigate to their detail view.
- **E2E test risk (deferred):** The nested MikroORM filter `course: { isActive: true }` cannot be validated by unit tests with mocked `em.find`. If MikroORM changes how nested relation filters generate SQL, unit tests will pass while the endpoint silently breaks. An E2E test seeding a user with active/inactive course enrollments and asserting correct filtering would catch this. Deferred for now — manual testing covers it, but consider adding E2E coverage later.
