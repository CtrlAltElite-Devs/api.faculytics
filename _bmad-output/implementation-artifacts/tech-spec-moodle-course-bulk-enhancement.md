---
title: 'Moodle Course Bulk Enhancement'
slug: 'moodle-course-bulk-enhancement'
created: '2026-04-12'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'MikroORM 6',
    'PostgreSQL',
    'React 19',
    'Vite',
    'TanStack Query',
    'shadcn/ui',
    'Radix Select',
    'Zod',
  ]
files_to_modify:
  - 'api: src/modules/admin/admin-filters.controller.ts'
  - 'api: src/modules/admin/services/admin-filters.service.ts'
  - 'api: src/modules/moodle/controllers/moodle-provisioning.controller.ts'
  - 'api: src/modules/moodle/services/moodle-provisioning.service.ts'
  - 'api: src/modules/moodle/services/moodle-course-transform.service.ts'
  - 'api: src/modules/moodle/dto/requests/seed-courses.request.dto.ts'
  - 'api: src/modules/moodle/dto/requests/execute-courses.request.dto.ts'
  - 'api: src/modules/moodle/dto/responses/course-preview.response.dto.ts'
  - 'api: src/modules/admin/dto/responses/semester-filter.response.dto.ts (new)'
  - 'api: src/modules/admin/dto/requests/filter-departments-query.dto.ts'
  - 'api: src/modules/audit/audit-action.enum.ts'
  - 'admin: src/features/moodle-provision/components/courses-bulk-tab.tsx'
  - 'admin: src/features/moodle-provision/use-preview-courses.ts'
  - 'admin: src/features/moodle-provision/use-execute-courses.ts'
  - 'admin: src/types/api.ts'
code_patterns:
  - 'Filter endpoints: GET /admin/filters/<resource>?parentParam= returning { id, code, name? }[]'
  - 'No dedicated repositories — direct em.find() with EntityManager'
  - 'Guard pattern on provisioning execute (concurrent protection)'
  - 'PascalCase public service methods'
  - 'DTOs in dto/requests/ and dto/responses/ subfolders'
  - 'Swagger decorators on all endpoints and DTO properties'
  - 'shadcn Select component (Radix) for dropdowns'
  - 'TanStack Query mutation hooks per API call'
test_patterns:
  - 'Unit tests alongside source: *.spec.ts'
  - 'Jest mocks for injected services'
  - 'NestJS TestingModule setup pattern'
---

# Tech-Spec: Moodle Course Bulk Enhancement

**Created:** 2026-04-12

## Overview

### Problem Statement

The current bulk course provisioning flow only drills down to Campus + Department with free-text inputs. This doesn't match the actual Moodle category hierarchy (Semester -> Department -> Program) and forces users to manually type values and date ranges that could be derived from existing data.

### Solution

Enhance the bulk course provisioning UI with cascading dropdown selectors (Semester -> Department -> Program) backed by new/existing API filter endpoints, with semester selection auto-filling date ranges while keeping dates editable. Replace CSV file upload with an inline editable table for course data entry (courseCode + descriptiveTitle), keeping the preview -> execute two-step pattern.

### Scope

**In Scope:**

- Cascading dropdown selectors: Semester -> Department -> Program
- API endpoint: `GET /admin/filters/semesters` (new, with date range data)
- API endpoint: Update department filter to support `semesterId` parameter
- Replace CSV upload with inline editable table (courseCode + descriptiveTitle columns)
- New JSON-based preview endpoint (replaces CSV buffer input)
- Auto-fill start/end dates from semester selection (dates remain editable)
- Both api.faculytics and admin.faculytics changes
- Bulk course tab full rework
- Single program per batch (confirmed user workflow)

**Out of Scope:**

- Quick course tab changes
- Category provisioning tab changes
- Moodle sync changes
- User provisioning changes
- CSV upload (fully replaced by inline table)
- Multi-program batch support

## Context for Development

### Codebase Patterns

- API uses PascalCase for public service methods
- Filter endpoints: `GET /admin/filters/<resource>?parentParam=` returning `{ id, code, name? }[]`
- No dedicated repositories for entities — direct `em.find()` via EntityManager
- DTOs split into `dto/requests/` and `dto/responses/` subfolders with Swagger decorators
- Admin frontend: TanStack Query mutation hooks per API call in `src/features/moodle-provision/`
- shadcn `Select` (Radix) already used for dropdowns in quick-course-tab
- Guard pattern prevents concurrent provisioning operations
- Category hierarchy: Campus -> Semester -> Department -> Program

### Entity Schema (Investigated)

```
Campus { id, moodleCategoryId, code, name? }
  └─ Semester { id, moodleCategoryId, code, label?, academicYear? }  ← NO startDate/endDate
       └─ Department { id, moodleCategoryId, code, name? }
            └─ Program { id, moodleCategoryId, code, name? }
```

**Critical**: Semester has no date fields. Dates are derived from the semester `code` field (e.g., `S12526` → Semester 1, 2025-2026) using hardcoded logic in `MoodleCourseTransformService.GetSemesterDates()`:

- S1: Aug 1 – Dec 18 (of startYear)
- S2: Jan 20 – Jun 1 (of endYear)

### Files to Reference

| File                                                                    | Purpose                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `api: src/entities/semester.entity.ts`                                  | Semester entity (code, label, academicYear, moodleCategoryId)           |
| `api: src/entities/department.entity.ts`                                | Department entity (ManyToOne Semester)                                  |
| `api: src/entities/program.entity.ts`                                   | Program entity (ManyToOne Department, moodleCategoryId)                 |
| `api: src/modules/admin/admin-filters.controller.ts`                    | Filter endpoints controller                                             |
| `api: src/modules/admin/services/admin-filters.service.ts`              | Filter queries (no moodleCategoryId filtering currently)                |
| `api: src/modules/moodle/controllers/moodle-provisioning.controller.ts` | Provision endpoints (CSV upload + context)                              |
| `api: src/modules/moodle/services/moodle-provisioning.service.ts`       | PreviewCourses (CSV parse), ExecuteCourseSeeding (batch create)         |
| `api: src/modules/moodle/services/moodle-course-transform.service.ts`   | Shortname/categoryPath generation, GetSemesterDates                     |
| `api: src/modules/moodle/services/moodle-csv-parser.service.ts`         | CSV parser (4 columns: courseCode, descriptiveTitle, program, semester) |
| `api: src/modules/moodle/dto/requests/seed-courses.request.dto.ts`      | Current: { campus, department, startDate, endDate }                     |
| `api: src/modules/moodle/dto/requests/execute-courses.request.dto.ts`   | Current: { rows[], campus, department, startDate, endDate }             |
| `api: src/modules/moodle/dto/responses/course-preview.response.dto.ts`  | Preview response (valid/skipped/errors)                                 |
| `api: src/modules/moodle/lib/provisioning.types.ts`                     | CurriculumRow, SeedContext, CoursePreviewRow types                      |
| `admin: src/features/moodle-provision/components/courses-bulk-tab.tsx`  | Current bulk UI (text inputs + CSV drop zone)                           |
| `admin: src/features/moodle-provision/components/csv-drop-zone.tsx`     | CSV file upload component (to be removed from bulk flow)                |
| `admin: src/features/moodle-provision/use-preview-courses.ts`           | FormData POST with file + context                                       |
| `admin: src/features/moodle-provision/use-execute-courses.ts`           | JSON POST with rows + context                                           |
| `admin: src/types/api.ts`                                               | All shared types (SeedCoursesContext, CoursePreviewRow, etc.)           |
| `admin: src/lib/constants.ts`                                           | CAMPUSES array, getSemesterDates() helper                               |
| `admin: src/components/ui/select.tsx`                                   | shadcn Select component (Radix-based)                                   |

### Technical Decisions

- Dropdown cascade starts from Semester (not Campus) — matches DB schema (Department.semester)
- Semester selection auto-fills dates by parsing semester code — dates remain editable
- CSV upload fully replaced by inline editable table — no backward compatibility
- Single program per batch always — no per-row program/semester needed
- `moodleCategoryId` is non-nullable (`number`, required) on all entities — these tables are only populated by Moodle sync, so every row inherently has a valid ID. No additional `$ne: null` filter is needed.
- Preview endpoint accepts JSON `{ semesterId, departmentId, programId, startDate, endDate, courses[] }` instead of CSV buffer
- Server resolves shortname, fullname, categoryPath, categoryId from entity hierarchy using programId
- CategoryId resolved directly from `Program.moodleCategoryId` (no path-string parsing)
- Inline table provides client-side validation before preview (course code format)
- Existing `MoodleCourseTransformService` methods reused for shortname/date generation
- Guard pattern on execute preserved

## Implementation Plan

### Phase 1: API Filter Endpoints

- [x] Task 1: Add `GET /admin/filters/semesters` endpoint
  - File: `api: src/modules/admin/services/admin-filters.service.ts`
  - Action: Add `GetSemesters()` method
    - Query: `em.find(Semester, {}, { populate: ['campus'], orderBy: { code: 'DESC' } })`
    - Map results to response shape including computed dates:
      ```typescript
      {
        id: string; // Semester UUID
        code: string; // "S12526"
        label: string; // "Semester 1" (from entity label or parsed from code)
        academicYear: string; // "2025-2026" (from entity or parsed)
        campusCode: string; // "UCMN" (from populated campus.code)
        startDate: string; // Computed: parse code → GetSemesterDates()
        endDate: string; // Computed: parse code → GetSemesterDates()
      }
      ```
    - Compute dates by parsing semester code with defensive regex `/^S([12])(\d{2})(\d{2})$/`:
      - Extract semester number (`match[1]`), startYY (`match[2]`), endYY (`match[3]`)
      - **Convert 2-digit to 4-digit years**: `"20" + startYY` → `"2025"`, `"20" + endYY` → `"2026"`. `GetSemesterDates()` takes full 4-digit year strings (it interpolates into `${startYear}-08-01`).
      - Call: `GetSemesterDates(semesterNum, fullStartYear, fullEndYear)` → returns `{ startDate, endDate }` as ISO date strings
      - If code doesn't match regex, skip semester from results (log warning) — malformed Moodle category codes should not crash the endpoint
  - File: `api: src/modules/admin/admin-filters.controller.ts`
  - Action: Add `@Get('semesters')` endpoint calling `GetSemesters()`. Add Swagger decorators.
  - File: `api: src/modules/admin/dto/responses/` (new file: `semester-filter.response.dto.ts`)
  - Action: Create `SemesterFilterDto` response class with Swagger `@ApiProperty()` decorators. **Place in admin module's DTO folder** (not moodle's) — the endpoint lives in `AdminFiltersController`, and all other admin filter DTOs are in `src/modules/admin/dto/responses/`.
  - Notes: Semesters are per-campus — response must include `campusCode` so frontend can display "UCMN - Semester 1 (2025-2026)" to disambiguate

- [x] Task 2: Update department filter to accept `semesterId`
  - File: `api: src/modules/admin/dto/requests/filter-departments-query.dto.ts`
  - Action: Add `@IsOptional() @IsUUID() semesterId?: string` property to the existing `FilterDepartmentsQueryDto` class. Add `@ApiPropertyOptional()` decorator.
  - File: `api: src/modules/admin/admin-filters.controller.ts`
  - Action: The controller already uses `@Query() query: FilterDepartmentsQueryDto`. Pass `query.semesterId` to the service: `this.filtersService.GetDepartments(query.campusId, query.semesterId)`.
  - File: `api: src/modules/admin/services/admin-filters.service.ts`
  - Action: Update `GetDepartments(campusId?: string)` signature to `GetDepartments(campusId?: string, semesterId?: string)`
    - When `semesterId` provided: filter `{ semester: semesterId }` and order by `{ code: 'ASC' }`
    - When `campusId` provided: keep existing `{ semester: { campus: campusId } }` and order by `{ code: 'ASC' }`
    - `semesterId` takes precedence if both provided
  - Notes: Additive change — existing call site passes `(query.campusId)` which still works since `semesterId` defaults to `undefined`. Update the controller call to pass both: `(query.campusId, query.semesterId)`.

- [x] Task 3: No `moodleCategoryId` filtering needed (removed)
  - `moodleCategoryId` is non-nullable on all entities (Semester, Department, Program). These tables are only populated by Moodle sync, so every row has a valid Moodle category ID. No additional filter is needed — the existing queries return correct results as-is.
  - **This task is a no-op.** Numbering preserved for continuity.

### Phase 2: API Provisioning DTOs

- [x] Task 4: Create new bulk course preview request DTO
  - File: `api: src/modules/moodle/dto/requests/` (new file: `bulk-course-preview.request.dto.ts`)
  - Action: Create DTO class:

    ```typescript
    class BulkCoursePreviewRequestDto {
      @IsUUID() semesterId: string;
      @IsUUID() departmentId: string;
      @IsUUID() programId: string;
      @IsDateString() @Validate(IsBeforeEndDate) startDate: string;
      @IsDateString() endDate: string;
      @IsArray()
      @ArrayNotEmpty()
      @ArrayMaxSize(500)
      @ValidateNested({ each: true })
      @Type(() => CourseEntryDto)
      courses: CourseEntryDto[];
    }

    class CourseEntryDto {
      @IsString() @IsNotEmpty() courseCode: string;
      @IsString() @IsNotEmpty() descriptiveTitle: string;
    }
    ```

  - Notes: Add Swagger decorators to all properties. `@Validate(IsBeforeEndDate)` is the custom validator used by existing DTOs (see `seed-courses.request.dto.ts`). `@ArrayMaxSize(500)` prevents DoS — 500 courses = 10 Moodle API batches, reasonable upper bound. `@IsArray()` and `@ArrayNotEmpty()` match existing DTO patterns.

- [x] Task 5: Create new bulk course execute request DTO
  - File: `api: src/modules/moodle/dto/requests/` (new file: `bulk-course-execute.request.dto.ts`)
  - Action: Create DTO class:

    ```typescript
    class BulkCourseExecuteRequestDto {
      @IsUUID() semesterId: string;
      @IsUUID() departmentId: string;
      @IsUUID() programId: string;
      @IsDateString() @Validate(IsBeforeEndDate) startDate: string;
      @IsDateString() endDate: string;
      @IsArray()
      @ArrayNotEmpty()
      @ArrayMaxSize(500)
      @ValidateNested({ each: true })
      @Type(() => ConfirmedCourseEntryDto)
      courses: ConfirmedCourseEntryDto[];
    }

    class ConfirmedCourseEntryDto {
      @IsString() courseCode: string;
      @IsString() descriptiveTitle: string;
      @IsInt() categoryId: number; // moodleCategoryId from preview — use @IsInt() not @IsNumber() to reject floats (matches existing CoursePreviewRowDto convention)
    }
    ```

  - Notes: `categoryId` is carried from preview response so execute doesn't re-resolve. **Known tradeoff (F12)**: trusting client-supplied `categoryId` is the pre-existing pattern from `ExecuteCourseSeeding` — a stale preview could target a wrong category. Accepted as pre-existing technical debt; server-side re-validation deferred to a future pass.

### Phase 3: API Provisioning Service

- [x] Task 6: Add `PreviewBulkCourses` method to provisioning service
  - File: `api: src/modules/moodle/services/moodle-provisioning.service.ts`
  - Action: Add new method (keep old `PreviewCourses` intact for now):

    ```typescript
    async PreviewBulkCourses(dto: BulkCoursePreviewRequest): Promise<CoursePreviewResult>
    ```

    - Load Program with populated hierarchy: `em.findOne(Program, dto.programId, { populate: ['department.semester.campus'] })`. If `null`, throw `BadRequestException('Program not found')` — matches existing pattern in this service (do NOT use `findOneOrFail` which throws raw `NotFoundError` as 500).
    - Validate the loaded program's `department.id === dto.departmentId` and `department.semester.id === dto.semesterId` (relationship integrity check). If mismatch, throw `BadRequestException('Program does not belong to the specified department/semester')`.
    - Extract from the populated entity:
      - `campusCode = program.department.semester.campus.code` (e.g., `"UCMN"`)
      - `semesterCode = program.department.semester.code` (e.g., `"S12526"` — the full code string from the entity)
      - `deptCode = program.department.code` (e.g., `"CCS"`)
      - `programCode = program.code` (e.g., `"BSIT"`)
      - `moodleCategoryId = program.moodleCategoryId`
    - Parse semester code with defensive regex: `const match = semesterCode.match(/^S([12])(\d{2})(\d{2})$/)`. If no match, throw `BadRequestException('Invalid semester code format: ${semesterCode}')`.
    - Extract: `const semesterDigit = Number(match[1])` (e.g., `1`). **Must use `Number()` for runtime conversion** — `as number` is a type assertion that does NOT convert. `"1" === 1` is false.
    - **Variable naming convention**: `semesterCode` = full entity string (e.g., `"S12526"`), `semesterDigit` = the parsed number (e.g., `1`). Never pass `semesterCode` to `GenerateShortname`/`BuildCategoryPath` — they expect the digit as a string and prepend `S` internally.
    - Derive `startYY`, `endYY` from provided `startDate`/`endDate` using `transformService.ComputeSchoolYears(semesterDigit, dto.startDate, dto.endDate)` — `ComputeSchoolYears` takes `semester: number`, returns `{ startYY: string, endYY: string }`. **Use user-provided dates** (not code-parsed years) since user may have manually overridden dates.
    - For each course in `dto.courses`:
      - Generate shortname via `transformService.GenerateShortname(campusCode, String(semesterDigit), startYY, endYY, course.courseCode)` — `GenerateShortname` takes `semester: string` (e.g., `"1"`), prepends `S` internally to produce `S12526`.
      - Build categoryPath via `transformService.BuildCategoryPath(campusCode, String(semesterDigit), deptCode, programCode, startYY, endYY)` — also prepends `S` internally.
      - Build preview row: `{ shortname, fullname: course.descriptiveTitle, categoryPath, categoryId: program.moodleCategoryId, startDate: dto.startDate, endDate: dto.endDate, program: programCode, semester: String(semesterNum), courseCode: course.courseCode }`. **Note**: `CoursePreviewRow` type (in `provisioning.types.ts`) requires `program: string` and `semester: string` fields — populate them from the entity-derived `programCode` and `semesterNum`. In the new bulk flow these are the same for every row, but the type requires them.
    - Return `{ valid, skipped: [], errors: [], shortnameNote }`

  - Notes: No CSV parsing. No per-row program/semester lookup. Single entity load covers all rows.

- [x] Task 7: Add `ExecuteBulkCourses` method to provisioning service
  - File: `api: src/modules/moodle/services/moodle-provisioning.service.ts`
  - Action: Add new method (keep old `ExecuteCourseSeeding` intact for now):

    ```typescript
    async ExecuteBulkCourses(dto: BulkCourseExecuteRequest): Promise<ProvisionResult>
    ```

    - Use `this.acquireGuard('courses')` (same guard pattern)
    - Load Program with populated hierarchy (same as preview): `em.findOne(Program, dto.programId, { populate: ['department.semester.campus'] })` + null check throwing `BadRequestException`
    - Extract `campusCode`, `semesterCode` from populated entity (same variable naming as Task 6). Parse with regex: `const match = semesterCode.match(/^S([12])(\d{2})(\d{2})$/)` + `BadRequestException` if no match. `const semesterDigit = Number(match[1])`.
    - Derive `startYY`, `endYY` from `dto.startDate`/`dto.endDate` using `transformService.ComputeSchoolYears(semesterDigit, dto.startDate, dto.endDate)`
    - For each confirmed course:
      - Regenerate shortname via `transformService.GenerateShortname(campusCode, String(semesterDigit), startYY, endYY, course.courseCode)` — new EDP code is generated (this is the final one)
      - Build Moodle course input: `{ shortname, fullname: course.descriptiveTitle, categoryid: course.categoryId, startdate: unixTimestamp, enddate: unixTimestamp }`
      - Convert dates to Unix timestamps: `Math.floor(new Date(dto.startDate).getTime() / 1000)`
    - Batch create in chunks of 50 via `moodleService.CreateCourses(batch)`
    - Track results, release guard in finally block
    - Return `ProvisionResult`

  - Notes: Same batching and guard pattern as existing `ExecuteCourseSeeding`. `MoodleConnectivityError` is NOT caught here — it propagates to the controller (see Task 8). The execute method deliberately loads the full entity hierarchy from `programId` and derives campus/semester/department codes from the _entity_ data — not from per-row fields. This is intentional: entity data is the source of truth, and the cascade dropdowns already validated the hierarchy before the user reached this point.

### Phase 4: API Provisioning Controller

- [x] Task 8: Add new bulk preview and execute endpoints
  - File: `api: src/modules/moodle/controllers/moodle-provisioning.controller.ts`
  - Action: Add two new endpoints:

    ```typescript
    @Post('courses/bulk/preview')
    async PreviewBulkCourses(@Body() dto: BulkCoursePreviewRequestDto): Promise<CoursePreviewResultDto>

    @Post('courses/bulk/execute')
    async ExecuteBulkCourses(@Body() dto: BulkCourseExecuteRequestDto): Promise<ProvisionResultDto>
    ```

  - Notes: New routes (`/bulk/preview`, `/bulk/execute`) rather than modifying existing CSV-based endpoints. Keeps backward compat if CSV endpoints are used elsewhere. Add Swagger `@ApiOperation()` and `@ApiResponse()` decorators. Both use `@UseJwtGuard()`.
  - **Audit trail (F6 fix)**: The execute endpoint MUST include audit decorators matching the existing `ExecuteCourses` pattern:
    - Add a new property to the `AuditAction` **const object** (not a TS enum) in `audit-action.enum.ts`: `MOODLE_BULK_PROVISION_COURSES: 'moodle.provision.bulk-courses'` — follows the existing `dot.separated.kebab` string value convention (e.g., `MOODLE_PROVISION_COURSES: 'moodle.provision.courses'`)
    - Add `@Audited({ action: AuditAction.MOODLE_BULK_PROVISION_COURSES, resource: 'MoodleCourse' })` to the execute endpoint
    - Add `@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor, AuditInterceptor)` to the execute endpoint
    - The preview endpoint does NOT need auditing (read-only, no side effects)
  - **MoodleConnectivityError handling**: The execute controller method must wrap the service call in a try/catch that catches `MoodleConnectivityError` and throws `BadGatewayException('Moodle is unreachable')`. This follows the pattern used in read-only controller methods (`GetCategoryTree`, `GetCategoryCourses`, `PreviewCategories`). Note: the existing `ExecuteCourses` endpoint does NOT have this handling — the new bulk endpoint is an improvement over the old pattern. Error handling belongs in the controller, NOT the service.
  - **`@HttpCode(HttpStatus.OK)`**: Add to BOTH new POST endpoints. All existing POSTs in this controller use this decorator. Without it, NestJS defaults to 201 which is semantically wrong.
  - **`@ApiBearerAuth()`**: Add to BOTH new endpoints. The controller does not have class-level `@ApiBearerAuth()`, so each endpoint needs it individually for Swagger documentation.

### Phase 5: Admin Frontend Types

- [x] Task 9: Add new TypeScript types for bulk course flow
  - File: `admin: src/types/api.ts`
  - Action: Add new interfaces:

    ```typescript
    // Semester filter response
    interface SemesterFilterOption {
      id: string;
      code: string;
      label: string;
      academicYear: string;
      campusCode: string;
      startDate: string;
      endDate: string;
    }

    // New bulk course request
    interface BulkCoursePreviewRequest {
      semesterId: string;
      departmentId: string;
      programId: string;
      startDate: string;
      endDate: string;
      courses: { courseCode: string; descriptiveTitle: string }[];
    }

    // New bulk course execute request
    interface BulkCourseExecuteRequest {
      semesterId: string;
      departmentId: string;
      programId: string;
      startDate: string;
      endDate: string;
      courses: {
        courseCode: string;
        descriptiveTitle: string;
        categoryId: number;
      }[];
    }
    ```

  - Notes: Existing `CoursePreviewResponse` and `ProvisionResultResponse` types remain unchanged — the response shapes are the same

### Phase 6: Admin Frontend Hooks

- [x] Task 10: Add `useSemesters` query hook
  - File: `admin: src/features/moodle-provision/` (new file: `use-semesters.ts`)
  - Action: Create TanStack Query hook. **CRITICAL**: Follow the exact pattern from existing hooks like `use-moodle-tree.ts`:

    ```typescript
    import { useQuery } from '@tanstack/react-query';
    import { apiClient } from '@/lib/api-client';
    import { useEnvStore } from '@/stores/env-store';
    import { useAuthStore } from '@/stores/auth-store';
    import type { SemesterFilterOption } from '@/types/api';

    export function useSemesters() {
      const activeEnvId = useEnvStore((s) => s.activeEnvId);
      const isAuth = useAuthStore((s) =>
        activeEnvId ? s.isAuthenticated(activeEnvId) : false,
      );
      return useQuery({
        queryKey: ['filters', 'semesters', activeEnvId],
        queryFn: () =>
          apiClient<SemesterFilterOption[]>('/admin/filters/semesters'),
        enabled: !!activeEnvId && isAuth,
      });
    }
    ```

  - Notes: **`apiClient` is a plain async function** (not Axios) — call as `apiClient<T>(path, options?)`. It returns parsed JSON directly (no `.data` wrapper). Zustand stores must use **selector syntax** `useEnvStore((s) => s.activeEnvId)`, not destructuring. `isAuthenticated(envId)` is a method on the auth store, not a boolean property. `activeEnvId` must be included in `queryKey` for cache isolation across environments.

- [x] Task 11: Add `useDepartmentsBySemester` query hook
  - File: `admin: src/features/moodle-provision/` (new file or extend existing)
  - Action: Create TanStack Query hook following the same pattern:
    ```typescript
    export function useDepartmentsBySemester(semesterId: string | undefined) {
      const activeEnvId = useEnvStore((s) => s.activeEnvId);
      const isAuth = useAuthStore((s) =>
        activeEnvId ? s.isAuthenticated(activeEnvId) : false,
      );
      return useQuery({
        queryKey: ['filters', 'departments', activeEnvId, { semesterId }],
        queryFn: () =>
          apiClient<{ id: string; code: string; name?: string }[]>(
            `/admin/filters/departments?semesterId=${semesterId}`,
          ),
        enabled: !!activeEnvId && isAuth && !!semesterId,
      });
    }
    ```
  - Notes: `enabled` includes all three guards. `activeEnvId` in query key.

- [x] Task 12: Add `useProgramsByDepartment` query hook
  - File: `admin: src/features/moodle-provision/` (new file or extend existing)
  - Action: Create TanStack Query hook following the same pattern:
    ```typescript
    export function useProgramsByDepartment(departmentId: string | undefined) {
      const activeEnvId = useEnvStore((s) => s.activeEnvId);
      const isAuth = useAuthStore((s) =>
        activeEnvId ? s.isAuthenticated(activeEnvId) : false,
      );
      return useQuery({
        queryKey: ['filters', 'programs', activeEnvId, { departmentId }],
        queryFn: () =>
          apiClient<{ id: string; code: string; name?: string }[]>(
            `/admin/filters/programs?departmentId=${departmentId}`,
          ),
        enabled: !!activeEnvId && isAuth && !!departmentId,
      });
    }
    ```

- [x] Task 13: Rewrite `use-preview-courses.ts` for JSON body
  - File: `admin: src/features/moodle-provision/use-preview-courses.ts`
  - Action: Replace FormData/file upload with JSON POST using `apiClient`:
    ```typescript
    export function usePreviewBulkCourses() {
      return useMutation({
        mutationFn: (dto: BulkCoursePreviewRequest) =>
          apiClient<CoursePreviewResponse>(
            '/moodle/provision/courses/bulk/preview',
            {
              method: 'POST',
              body: JSON.stringify(dto),
            },
          ),
        onError: (error) => {
          /* toast error — follow existing use-execute-courses.ts pattern */
        },
      });
    }
    ```
  - Notes: Remove file/FormData handling entirely. `apiClient` is called as a function with path + options object (see existing `use-execute-courses.ts` for exact pattern). Returns parsed JSON directly.

- [x] Task 14: Update `use-execute-courses.ts` for new request shape
  - File: `admin: src/features/moodle-provision/use-execute-courses.ts`
  - Action: Update mutation to use `BulkCourseExecuteRequest` type. Change endpoint to `/moodle/provision/courses/bulk/execute`. Keep 409 conflict handling. Use same `apiClient<ProvisionResultResponse>(path, { method: 'POST', body: JSON.stringify(data) })` pattern as the existing hook.

### Phase 7: Admin Frontend UI

- [x] Task 15: Rework `courses-bulk-tab.tsx` with cascading dropdowns and inline table
  - File: `admin: src/features/moodle-provision/components/courses-bulk-tab.tsx`
  - Action: Full rework of the component. New structure:

    **State:**

    ```typescript
    // Cascade state
    const [semesterId, setSemesterId] = useState<string>();
    const [departmentId, setDepartmentId] = useState<string>();
    const [programId, setProgramId] = useState<string>();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Course table state
    const [courses, setCourses] = useState<
      { courseCode: string; descriptiveTitle: string }[]
    >([
      { courseCode: '', descriptiveTitle: '' }, // start with one empty row
    ]);

    // View state
    const [view, setView] = useState<'input' | 'preview'>('input');
    ```

    **Cascade behavior:**
    - When `semesterId` changes: reset `departmentId`, `programId`. Auto-fill `startDate`/`endDate` from the selected semester's `startDate`/`endDate` fields returned by the `GET /admin/filters/semesters` API response (server-computed dates are the source of truth — do NOT use the client-side `getSemesterDates()` helper from `constants.ts`).
    - When `departmentId` changes: reset `programId`.

    **Dropdowns (using shadcn Select):**
    1. Semester Select — data from `useSemesters()`. Display: `"{campusCode} - {label} ({academicYear})"`. On change: auto-fill dates, clear children.
    2. Department Select — data from `useDepartmentsBySemester(semesterId)`. Disabled until semester selected. Display: `"{code} - {name}"` (or just `code` if no name).
    3. Program Select — data from `useProgramsByDepartment(departmentId)`. Disabled until department selected. Display: `"{code} - {name}"`.
    4. Start Date input — auto-filled, editable.
    5. End Date input — auto-filled, editable.

    **Inline course table:**
    - Rendered below dropdowns when all three selections made
    - Table columns: Row #, Course Code (text input), Descriptive Title (text input), Delete (button)
    - "Add Row" button below the table
    - Client-side validation: non-empty courseCode and descriptiveTitle, no duplicate courseCodes
    - Minimum 1 row to enable Preview button

    **Preview button:**
    - Enabled when: all 3 dropdowns selected + startDate + endDate + at least 1 valid course row
    - Calls `previewMutation.mutate()` with the full DTO
    - On success: switches to `preview` view

    **Preview view:**
    - Table with checkboxes showing shortname, fullname, categoryPath, dates. Note: the response still includes `program` and `semester` per-row (required by `CoursePreviewRow` type), but in the new bulk flow these are identical for every row — the preview table should NOT display them as columns (unlike the old CSV flow where they varied per row).
    - Shows `shortnameNote` info box
    - Skipped/errors sections if any
    - "Back" button to return to input view
    - "Create N Courses" button for checked rows

    **Execute:**
    - Maps checked preview rows to `BulkCourseExecuteRequest`
    - Calls `executeMutation.mutate()`
    - Shows `ProvisionResultDialog` on success

  - Notes: Remove all CSV-related imports/components (`CsvDropZone`, file state). Remove campus/department text inputs. The `onBrowse` prop can remain if the tree explorer button is still desired.

### Acceptance Criteria

- [x] AC 1: Given the admin is on the bulk courses tab, when the page loads, then a Semester dropdown is shown containing all synced semesters, displaying campus code, label, and academic year.

- [x] AC 2: Given the admin selects a semester, when the semester changes, then the Department dropdown populates with departments under that semester, and the start/end date fields auto-fill with the semester's server-computed dates.

- [x] AC 3: Given the admin selects a department, when the department changes, then the Program dropdown populates with programs under that department.

- [x] AC 4: Given the admin changes the semester selection, when a department and/or program were previously selected, then both department and program selections are cleared and their dropdowns reset.

- [x] AC 5: Given the admin changes the department selection, when a program was previously selected, then the program selection is cleared.

- [x] AC 6: Given all three dropdowns are selected, when the inline course table is displayed, then the admin can add rows with courseCode and descriptiveTitle fields, remove rows, and sees at least one empty row by default.

- [x] AC 7: Given the admin has filled in all dropdowns + dates + at least one valid course row, when they click Preview, then a JSON POST is sent to `/moodle/provision/courses/bulk/preview` and the response displays generated shortnames, fullnames, category paths, and dates for each course.

- [x] AC 8: Given the preview is displayed, when the admin checks courses and clicks "Create N Courses", then a JSON POST is sent to `/moodle/provision/courses/bulk/execute` and a result dialog shows created/error counts.

- [x] AC 9: Given a semester is selected, when the dates are auto-filled, then the admin can still manually edit the start and end dates before previewing.

- [x] AC 10: Given the admin enters duplicate course codes in the inline table, when they attempt to preview, then client-side validation prevents the request and shows an error.

- [x] AC 11: Given there are no semesters in the database, when the semester dropdown loads, then it shows an empty state (no options) and downstream dropdowns remain disabled.

- [x] AC 12: Given the execute endpoint is called while another provisioning operation is running, when the guard detects a conflict, then a 409 response is returned and the admin sees "A provisioning operation is already in progress."

- [x] AC 13: Given Moodle is unreachable during bulk execute, when the `MoodleConnectivityError` is thrown, then a 502 Bad Gateway response is returned and the admin sees a clear "Moodle is unreachable" error message.

- [x] AC 14: Given an invalid programId is submitted to the preview or execute endpoint, when the program is not found or doesn't belong to the specified department/semester, then a 400 Bad Request is returned with a descriptive error message.

## Additional Context

### Dependencies

- Existing filter endpoints: `GET /admin/filters/departments?campusId=`, `GET /admin/filters/programs?departmentId=`
- New endpoint: `GET /admin/filters/semesters` (must return computed date range from code)
- Department filter gains `semesterId` query parameter (additive, backward compatible)
- `moodleCategoryId` is non-nullable on all entities — no additional filter needed (tables only populated by Moodle sync)
- `MoodleCourseTransformService` methods reused: `GenerateShortname`, `BuildCategoryPath`, `GetSemesterDates`, `ComputeSchoolYears`
- Existing preview/execute CSV endpoints remain untouched (new `/bulk/` routes added alongside)

### Testing Strategy

**API Unit Tests:**

- `admin-filters.service.spec.ts`: Test `GetSemesters()` returns semesters with populated campus and computed dates from semester code, test `GetDepartments(undefined, semesterId)` filters by semester correctly, test backward compat of `GetDepartments(campusId)` still works
- `moodle-provisioning.service.spec.ts`: Test `PreviewBulkCourses()` generates correct shortnames/categoryPaths from entity hierarchy, test `BadRequestException` when programId not found, test relationship validation (mismatched semesterId/departmentId/programId throws `BadRequestException`), test `ExecuteBulkCourses()` batching and guard behavior, test `MoodleConnectivityError` propagation

**Admin Manual Testing:**

- Verify cascade: select semester → departments load → select department → programs load
- Verify cascade reset: change semester → department and program clear
- Verify date auto-fill on semester select, then manual override
- Verify inline table: add rows, remove rows, enter data, duplicate detection
- Verify preview renders correctly with generated shortnames
- Verify execute creates courses in Moodle
- Verify empty states (no semesters, no departments for a semester, etc.)

### Notes

- Semester code format: `S{semesterNum}{startYY}{endYY}` (e.g., `S12526` = Semester 1, 2025-2026)
- Shortname format: `{CAMPUS}-{semesterCode}-{courseCode}-{5digitEDP}`
- EDP code is random, regenerated on each preview, finalized at execute
- `MoodleCsvParserService` is not modified — old CSV endpoints still reference it
- Existing `SeedContext` type and `buildSeedContext()` helper remain for old endpoints
- Old CSV-based preview/execute endpoints (`/courses/preview`, `/courses/execute`) left intact — can be deprecated in a future cleanup pass
- `csv-drop-zone.tsx` component left in codebase (may be used by other tabs) — just removed from bulk tab imports
- **Behavioral note**: The new bulk flow derives `startYY`/`endYY` via `ComputeSchoolYears(semesterDigit, startDate, endDate)` while the old CSV flow uses pre-computed values from `buildSeedContext()`. These can diverge for same-year date ranges — this is acceptable since the new flow is the replacement, not a parallel path.
- **Task 2 edge case**: When both `campusId` and `semesterId` are provided to the departments filter, `semesterId` wins silently. This is intentional — the frontend cascade only ever sends one parameter. If both are sent, the semester is the more specific filter and `campusId` is redundant.

## Review Notes

- Adversarial review completed with 15 findings
- 10 fixed, 5 acknowledged (noise/low-severity design concerns)
- Resolution approach: auto-fix
- Key fixes: IDOR on categoryId (F1), missing @IsNotEmpty/@Min validators (F2/F14), guard moved after validation (F3), backend duplicate courseCode check (F4), moodleCategoryId zero-check (F6), unit tests added (F8), stable React keys (F10)
- Acknowledged without fix: duplicate date computation (F5 - intentional to avoid cross-module coupling), no filtering on GetSemesters (F11), century rollover (F12), date divergence by design (F13), mutation state reset (F15)
