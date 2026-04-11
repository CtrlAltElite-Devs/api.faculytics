---
title: 'Fix Moodle Semester Category Name Generation & Add Category Preview'
slug: 'fix-moodle-semester-category-bugs'
created: '2026-04-11'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'MikroORM',
    'PostgreSQL',
    'React 19',
    'Vite',
    'TanStack Query',
    'shadcn/ui',
    'Tailwind 4',
  ]
files_to_modify:
  - 'src/modules/moodle/services/moodle-course-transform.service.ts'
  - 'src/modules/moodle/services/moodle-course-transform.service.spec.ts'
  - 'src/modules/moodle/services/moodle-provisioning.service.ts'
  - 'src/modules/moodle/services/moodle-provisioning.service.spec.ts'
  - 'src/modules/moodle/lib/moodle.client.ts'
  - 'src/modules/moodle/lib/moodle.client.spec.ts'
  - 'src/modules/moodle/controllers/moodle-provisioning.controller.ts'
  - '../admin.faculytics/src/types/api.ts'
  - '../admin.faculytics/src/features/moodle-provision/use-provision-categories.ts'
  - '../admin.faculytics/src/features/moodle-provision/components/categories-tab.tsx'
  - '../admin.faculytics/src/features/moodle-provision/components/provision-result-dialog.tsx'
code_patterns:
  - 'Preview-then-execute: PreviewCourses()/ExecuteCourseSeeding() pattern'
  - 'Guard pattern: acquireGuard()/releaseGuard() for concurrent op protection'
  - 'Batch pattern: MOODLE_PROVISION_BATCH_SIZE=50 for Moodle API calls'
  - 'Hierarchy walk: campus->semester->department->program with find-or-create per level'
  - 'Error details: each level catches errors independently, pushes to details[]'
  - 'NestJS TestingModule with real transform service + mocked MoodleService/EntityManager'
test_patterns:
  - 'Direct instantiation for stateless services (MoodleCourseTransformService)'
  - 'NestJS TestingModule with jest.Mocked<> for services with dependencies'
  - 'Mock MoodleService methods: GetCategoriesWithMasterKey, CreateCategories, etc.'
  - 'Test provisioning outcomes via result.details array assertions'
  - 'Plain class + mocked global fetch for MoodleClient (no NestJS DI — it is not an injectable provider)'
---

# Tech-Spec: Fix Moodle Semester Category Name Generation & Add Category Preview

**Created:** 2026-04-11

## Overview

### Problem Statement

Two bugs in Moodle category provisioning, plus a missing safety feature:

1. **Wrong semester tag generation:** The provisioning service at `moodle-provisioning.service.ts:65-66` extracts year values directly from `startDate`/`endDate` via `.slice(2, 4)` without accounting for the academic year. For semester 2 with `startDate=2026-01-20` and `endDate=2026-06-01`, both years resolve to `26`, producing `S22626` instead of the correct `S22526` (school year 2025-2026). The bug also affects semester 1 when selected alone — dates like `2025-08-01` to `2025-12-18` both yield `25`, producing `S12525` instead of `S12526`. `BuildSemesterTag` itself is correct — it's a dumb formatter. The bug is in the year inputs fed to it.

2. **Access control exception (RESOLVED):** The wrong semester tag caused the service to attempt _creating_ `S22626` instead of _skipping_ the existing `S22526`. The creation failed because the Moodle master key token was on the built-in "Moodle mobile web service" which doesn't include `core_course_create_categories`. **Resolution:** Migrated to a dedicated `faculytics_service` external service with all 13 required wsfunctions. New token deployed to local `.env`, VPS `.env.staging`, and VPS `.env.production`.

3. **No category preview:** Unlike courses (which have `PreviewCourses` / `PreviewQuickCourse`), category provisioning goes straight to execution with no preview step. Users can't see what will be created/skipped before committing.

### Solution

1. Fix the year derivation in the provisioning service to compute school-year-aware `startYY`/`endYY` per-semester inside the hierarchy walk loop.
2. Add a friendlier error message when Moodle returns `webservice_access_exception`.
3. Add a category preview endpoint (`POST /moodle/provision/categories/preview`) and corresponding UI in the admin console's categories tab, following the existing preview-then-execute pattern from courses.

### Scope

**In Scope:**

- Backend: Fix semester year calculation in `moodle-provisioning.service.ts`
- Backend: Improve `webservice_access_exception` error message in `moodle.client.ts`
- Backend: Add `POST /moodle/provision/categories/preview` endpoint
- Frontend (`admin.faculytics`): Add preview-then-confirm flow to categories tab
- Unit tests for semester tag fix, error handling, and preview endpoint

**Out of Scope:**

- Changes to `ProvisionCategoriesRequest` DTO contract
- Moodle permission/token configuration (already resolved)
- Other provisioning features (courses, users)
- Same year-extraction bug in `buildSeedContext()` and `PreviewQuickCourse`/`ExecuteQuickCourse` for course seeding (tracked separately)

## Context for Development

### Codebase Patterns

**Year Extraction (the bug):**

- `moodle-provisioning.service.ts:65-66` does `input.startDate.slice(2, 4)` / `input.endDate.slice(2, 4)` once before the hierarchy walk
- These `startYY`/`endYY` values are passed to `BuildSemesterTag()` at lines 112-116, and reused for departments (165-168) and programs (218-221)
- When both semesters are selected, the frontend sends combined dates spanning the school year boundary (e.g., `2025-08-01` to `2026-06-01`), so the slice works. When a single semester is selected, both dates fall in the same year, and the slice produces wrong values.

**Hierarchy Walk:**

- `ProvisionCategories()` walks 4 depth levels: campus -> semester -> department -> program
- Each level does find-or-create: checks `existingByParentAndName` map, skips if found, batches missing ones for Moodle `CreateCategories` API call
- Parent IDs cascade: `campusIds` -> `semesterIds` -> `deptIds` -> program creation
- If a parent level fails, children are silently skipped (no `campusId` -> `continue`)

**Preview-then-Execute Pattern (reference):**

- `PreviewCourses()` (line 290): parses CSV, computes shortnames/paths, checks program entity exists, returns `CoursePreviewResult` with valid/skipped/errors
- `PreviewQuickCourse()` (line 411): synchronous, returns single `CoursePreviewRow`
- Frontend `courses-bulk-tab.tsx`: upload -> preview dialog -> user selects rows -> execute
- Preview does NOT acquire concurrency guard (read-only operation)

**Error Handling:**

- `MoodleClient.call()` at line 138-142: checks for `moodleError.exception`, throws generic `Error` with `Moodle API error ({exception}): {message}`
- Provisioning catch blocks at each depth level: `err instanceof Error ? err.message : String(err)` -> stored in `details[].reason`

**Testing:**

- `moodle-provisioning.service.spec.ts`: NestJS TestingModule, real `MoodleCourseTransformService`, mocked everything else
- `moodle-course-transform.service.spec.ts`: direct instantiation, no DI needed
- Tests use `jest.fn()` for mocked methods, `mockResolvedValue`/`mockRejectedValue` for async

### Files to Reference

| File                                                                                    | Purpose                                                              | Key Lines                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/modules/moodle/services/moodle-provisioning.service.ts`                            | Category provisioning + year extraction bug                          | 51-288 (ProvisionCategories), 65-66 (year bug)                  |
| `src/modules/moodle/services/moodle-provisioning.service.spec.ts`                       | Provisioning tests — pattern reference                               | 58-118 (ProvisionCategories tests)                              |
| `src/modules/moodle/services/moodle-course-transform.service.ts`                        | `BuildSemesterTag()`, `GetSemesterDates()`                           | 36-58                                                           |
| `src/modules/moodle/services/moodle-course-transform.service.spec.ts`                   | Transform service tests                                              | Full file                                                       |
| `src/modules/moodle/controllers/moodle-provisioning.controller.ts`                      | Controller endpoints, `buildSeedContext()` bug                       | 66-79 (buildSeedContext), 90-108 (ProvisionCategories endpoint) |
| `src/modules/moodle/lib/moodle.client.ts`                                               | Moodle API error handling                                            | 138-142 (exception check)                                       |
| `src/modules/moodle/lib/provisioning.types.ts`                                          | `ProvisionResult`, `ProvisionDetailItem`, `ProvisionCategoriesInput` | Full file                                                       |
| `src/modules/moodle/dto/responses/provision-result.response.dto.ts`                     | `ProvisionResultDto` — reusable for preview response                 | 17+                                                             |
| `admin.faculytics/src/features/moodle-provision/components/categories-tab.tsx`          | Category provisioning UI — needs preview step                        | 105-116 (handleSubmit)                                          |
| `admin.faculytics/src/features/moodle-provision/use-provision-categories.ts`            | Mutation hook — needs preview mutation                               | Full file                                                       |
| `admin.faculytics/src/features/moodle-provision/components/provision-result-dialog.tsx` | Result dialog — extend with preview mode                             | Full file                                                       |
| `admin.faculytics/src/types/api.ts`                                                     | TypeScript interfaces                                                | 320-459                                                         |
| `admin.faculytics/src/lib/constants.ts`                                                 | `getSemesterDates()` with correct academic year logic                | 19-37                                                           |

### Technical Decisions

- **Per-semester year computation via `ComputeSchoolYears` on transform service:** New method `ComputeSchoolYears(semester, startDate, endDate)` on `MoodleCourseTransformService` computes school-year-aware `startYY`/`endYY`. Placed on the transform service (not provisioning) because it's a stateless utility, matching the service's role, and is reusable when the course seeding year bug is fixed later.
- **`BuildSemesterTag` unchanged:** It remains a dumb formatter. The fix is in the caller.
- **API contract unchanged:** `ProvisionCategoriesRequest` DTO stays the same. Preview uses the same request shape and returns `ProvisionResultDto`.
- **Preview as a separate method:** `PreviewCategories()` does a read-only hierarchy walk against existing Moodle categories. No `CreateCategories` calls, no concurrency guard, no auto-sync. When a parent doesn't exist (will be created), all children are marked as "will create" too.
- **Reuse `ProvisionResult`/`ProvisionResultDto` for preview:** In preview context, `status: 'created'` means "will create" and `status: 'skipped'` means "exists, will skip". No new types needed. Frontend differentiates based on which endpoint was called.
- **Extend `ProvisionResultDialog` with preview mode:** Add `mode` prop ('preview' | 'result') and optional `onConfirm` callback. Preview mode shows "Confirm & Provision" + "Cancel" buttons. Result mode shows "Close" (existing behavior).
- **Error improvement in `MoodleClient.call()`:** Check `moodleError.exception` for `webservice_access_exception` specifically. Append hint: "Ensure the wsfunction is added to your Moodle external service." Other exceptions unchanged.

## Implementation Plan

### Tasks

- [x] **Task 1: Add `ComputeSchoolYears` method to transform service**
  - File: `src/modules/moodle/services/moodle-course-transform.service.ts`
  - Action: Add new method after `BuildSemesterTag` (line 58):

    ```typescript
    ComputeSchoolYears(
      semester: number,
      startDate: string,
      endDate: string,
    ): { startYY: string; endYY: string } {
      const startYear = parseInt(startDate.slice(0, 4));
      const endYear = parseInt(endDate.slice(0, 4));

      // If dates span different years, the school year boundary is explicit
      if (startYear !== endYear) {
        return {
          startYY: String(startYear).slice(-2),
          endYY: String(endYear).slice(-2),
        };
      }

      // Same year — derive school year from semester number
      if (semester === 1) {
        // Semester 1 starts in Aug — year is school start year
        return {
          startYY: String(startYear).slice(-2),
          endYY: String(startYear + 1).slice(-2),
        };
      }
      if (semester === 2) {
        // Semester 2 starts in Jan — year is school end year
        return {
          startYY: String(startYear - 1).slice(-2),
          endYY: String(startYear).slice(-2),
        };
      }
      throw new Error(`Invalid semester: ${semester}. Must be 1 or 2.`);
    }
    ```

- [x] **Task 2: Add unit tests for `ComputeSchoolYears`**
  - File: `src/modules/moodle/services/moodle-course-transform.service.spec.ts`
  - Action: Add new `describe('ComputeSchoolYears')` block with test cases:
    - Sem 2 only (the reported bug): `(2, '2026-01-20', '2026-06-01')` -> `{ startYY: '25', endYY: '26' }`
    - Sem 1 only (same bug): `(1, '2025-08-01', '2025-12-18')` -> `{ startYY: '25', endYY: '26' }`
    - Both semesters (already works): `(1, '2025-08-01', '2026-06-01')` -> `{ startYY: '25', endYY: '26' }`
    - Both semesters sem 2: `(2, '2025-08-01', '2026-06-01')` -> `{ startYY: '25', endYY: '26' }`
    - Next year sem 1: `(1, '2026-08-01', '2026-12-18')` -> `{ startYY: '26', endYY: '27' }`
    - Next year sem 2: `(2, '2027-01-20', '2027-06-01')` -> `{ startYY: '26', endYY: '27' }`

- [x] **Task 3: Fix year derivation in `ProvisionCategories`**
  - File: `src/modules/moodle/services/moodle-provisioning.service.ts`
  - Action:
    1. **Remove** lines 65-66 (`const startYY = ...` / `const endYY = ...`)
    2. **Semester loop (line 111)** — compute per-semester years at the top of each iteration:
       ```typescript
       for (const sem of input.semesters) {
         const { startYY, endYY } = this.transformService.ComputeSchoolYears(
           sem, input.startDate, input.endDate,
         );
         const tag = this.transformService.BuildSemesterTag(String(sem), startYY, endYY);
         // ... rest of semester handling
       ```
    3. **Department loop (line 164)** — same `ComputeSchoolYears` call to reconstruct the semester tag for map lookups:
       ```typescript
       for (const sem of input.semesters) {
         const { startYY, endYY } = this.transformService.ComputeSchoolYears(
           sem, input.startDate, input.endDate,
         );
         const tag = this.transformService.BuildSemesterTag(String(sem), startYY, endYY);
         const semId = semesterIds.get(`${campus.toUpperCase()}:${tag}`);
         if (!semId) continue;
         // ... rest of department handling
       ```
    4. **Program loop (line 217)** — same pattern:
       ```typescript
       for (const sem of input.semesters) {
         const { startYY, endYY } = this.transformService.ComputeSchoolYears(
           sem, input.startDate, input.endDate,
         );
         const tag = this.transformService.BuildSemesterTag(String(sem), startYY, endYY);
         // ... rest of program handling
       ```
  - Notes: All three loops iterate over `input.semesters` and call `BuildSemesterTag` to reconstruct the semester tag for composite key lookups. Each must compute `{ startYY, endYY }` via `ComputeSchoolYears` at the top of its semester iteration. The campus loop (depth 1) does not use semester tags and needs no change.

- [x] **Task 4: Update `ProvisionCategories` unit tests for year fix**
  - File: `src/modules/moodle/services/moodle-provisioning.service.spec.ts`
  - Action: Add test cases to the existing `describe('ProvisionCategories')` block:
    - **Sem 2 only with same-year dates** — the reported bug scenario: `semesters: [2], startDate: '2026-01-20', endDate: '2026-06-01'`. Verify `BuildSemesterTag` is called with `startYY='25', endYY='26'` (resulting tag `S22526`, not `S22626`). Mock existing categories to include the campus, assert the semester tag in details.
    - **Sem 1 only with same-year dates** — `semesters: [1], startDate: '2025-08-01', endDate: '2025-12-18'`. Verify tag is `S12526` not `S12525`.

- [x] **Task 5: Improve `webservice_access_exception` error message**
  - File: `src/modules/moodle/lib/moodle.client.ts`
  - Action: In the `call()` method at line 138-142, replace the generic error throw with a check for `webservice_access_exception`:
    ```typescript
    const moodleError = data as { exception?: string; message?: string };
    if (moodleError.exception) {
      const hint =
        moodleError.exception === 'webservice_access_exception'
          ? ' Ensure the wsfunction is added to your Moodle external service (Site admin > Server > External services).'
          : '';
      throw new Error(
        `Moodle API error (${moodleError.exception}): ${moodleError.message || 'Unknown error'}${hint}`,
      );
    }
    ```

- [x] **Task 5b: Add unit test for `webservice_access_exception` hint**
  - File: `src/modules/moodle/lib/moodle.client.spec.ts` (new file)
  - Action: Create test file with a focused test:
    1. Construct a `MoodleClient` instance with a test base URL and token
    2. Mock global `fetch` to return a JSON response with `{ exception: 'webservice_access_exception', message: 'Access control exception' }`
    3. Call `client.call('some_function')` and assert the thrown error message includes "Ensure the wsfunction is added to your Moodle external service"
    4. Add a second test: mock `fetch` with a different exception (e.g., `dml_write_exception`), assert the hint is NOT appended

- [x] **Task 6: Add `PreviewCategories` method to provisioning service**
  - File: `src/modules/moodle/services/moodle-provisioning.service.ts`
  - Action: Add new method after `ProvisionCategories` (after line 288):

    ```typescript
    async PreviewCategories(input: ProvisionCategoriesInput): Promise<ProvisionResult> {
      const start = Date.now();
      const details: ProvisionDetailItem[] = [];

      const existing = await this.moodleService.GetCategoriesWithMasterKey();
      const byParentAndName = new Map<string, MoodleCategoryResponse>();
      for (const cat of existing) {
        byParentAndName.set(`${cat.parent}:${cat.name}`, cat);
      }

      for (const campus of input.campuses) {
        const campusName = campus.toUpperCase();
        const campusCat = byParentAndName.get(`0:${campusName}`);
        const campusId = campusCat?.id;
        details.push({ name: campusName, status: campusCat ? 'skipped' : 'created' });

        for (const sem of input.semesters) {
          const { startYY, endYY } = this.transformService.ComputeSchoolYears(
            sem, input.startDate, input.endDate,
          );
          const tag = this.transformService.BuildSemesterTag(String(sem), startYY, endYY);
          const semCat = campusId ? byParentAndName.get(`${campusId}:${tag}`) : undefined;
          const semId = semCat?.id;
          details.push({ name: tag, status: semCat ? 'skipped' : 'created' });

          for (const dept of input.departments) {
            const deptName = dept.code.toUpperCase();
            const deptCat = semId ? byParentAndName.get(`${semId}:${deptName}`) : undefined;
            const deptId = deptCat?.id;
            details.push({ name: deptName, status: deptCat ? 'skipped' : 'created' });

            for (const prog of dept.programs) {
              const progName = prog.toUpperCase();
              const progCat = deptId ? byParentAndName.get(`${deptId}:${progName}`) : undefined;
              details.push({ name: progName, status: progCat ? 'skipped' : 'created' });
            }
          }
        }
      }

      const created = details.filter((d) => d.status === 'created').length;
      const skipped = details.filter((d) => d.status === 'skipped').length;
      return { created, skipped, errors: 0, details, durationMs: Date.now() - start };
    }
    ```

  - Notes: No concurrency guard (read-only). No auto-sync. No `CreateCategories` calls. When a parent doesn't exist (no ID), all children are automatically marked as `'created'` because they can't be looked up.

- [x] **Task 7: Add `PreviewCategories` unit tests**
  - File: `src/modules/moodle/services/moodle-provisioning.service.spec.ts`
  - Action: Add new `describe('PreviewCategories')` block:
    - **All exist** — mock existing categories with full hierarchy (UCMN -> S22526 -> CCS -> BSCSAI). Assert all items have `status: 'skipped'`, `errors: 0`.
    - **Leaf missing** — mock existing campus/semester/department, program BSCSAI missing. Assert 3 skipped, 1 created.
    - **Parent missing cascades** — mock only campus exists, semester missing. Assert campus skipped, semester/department/program all created.
    - **Does not call CreateCategories** — verify `moodleService.CreateCategories` was never called.
    - **No concurrency guard** — two concurrent `PreviewCategories` calls should both resolve (no `ConflictException`). Use a delayed mock to ensure true concurrency:
      ```typescript
      moodleService.GetCategoriesWithMasterKey.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );
      const input = {
        campuses: ['UCMN'],
        semesters: [1],
        startDate: '2025-08-01',
        endDate: '2026-06-01',
        departments: [],
      };
      const [a, b] = await Promise.all([
        service.PreviewCategories(input),
        service.PreviewCategories(input),
      ]);
      expect(a.errors).toBe(0);
      expect(b.errors).toBe(0);
      ```

- [x] **Task 8: Add preview endpoint to controller**
  - File: `src/modules/moodle/controllers/moodle-provisioning.controller.ts`
  - Action: Add new endpoint near the existing `ProvisionCategories` endpoint:
    ```typescript
    @Post('categories/preview')
    @HttpCode(HttpStatus.OK)
    @UseJwtGuard(UserRole.SUPER_ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Preview Moodle category provisioning (dry run)' })
    @ApiResponse({ status: 200, type: ProvisionResultDto })
    async PreviewCategories(
      @Body() dto: ProvisionCategoriesRequestDto,
    ): Promise<ProvisionResultDto> {
      try {
        return await this.provisioningService.PreviewCategories(dto);
      } catch (e) {
        if (e instanceof MoodleConnectivityError) {
          throw new BadGatewayException('Moodle is unreachable');
        }
        if (e instanceof Error && e.message.startsWith('Invalid semester')) {
          throw new BadRequestException(e.message);
        }
        this.logger.error(
          'Failed to preview categories',
          e instanceof Error ? e.stack : e,
        );
        throw new ServiceUnavailableException(
          'Failed to preview Moodle categories',
        );
      }
    }
    ```
  - Notes: Same DTO, same response type. Includes `@ApiBearerAuth()` for Swagger docs. Wraps `MoodleConnectivityError` the same way `GetCategoryTree` does (controller lines 233-247). Validation errors from `ComputeSchoolYears` (e.g., "Invalid semester: 3") are rethrown as `BadRequestException` (400), not swallowed into 503. No audit decorator (read-only). No MetaDataInterceptor/CurrentUserInterceptor/AuditInterceptor needed.

- [x] **Task 8b: Add error wrapping to existing `ProvisionCategories` endpoint**
  - File: `src/modules/moodle/controllers/moodle-provisioning.controller.ts`
  - Action: Wrap the existing `ProvisionCategories` handler (lines 104-108) in the same try/catch pattern as the preview and `GetCategoryTree` endpoints:
    ```typescript
    async ProvisionCategories(
      @Body() dto: ProvisionCategoriesRequestDto,
    ): Promise<ProvisionResultDto> {
      try {
        return await this.provisioningService.ProvisionCategories(dto);
      } catch (e) {
        if (e instanceof MoodleConnectivityError) {
          throw new BadGatewayException('Moodle is unreachable');
        }
        if (e instanceof Error && e.message.startsWith('Invalid semester')) {
          throw new BadRequestException(e.message);
        }
        this.logger.error(
          'Failed to provision categories',
          e instanceof Error ? e.stack : e,
        );
        throw new ServiceUnavailableException(
          'Failed to provision Moodle categories',
        );
      }
    }
    ```
  - Notes: Pre-existing gap — the execute endpoint had no `MoodleConnectivityError` handling while the preview does. Fixes the asymmetry so both endpoints handle connectivity and validation errors consistently.

- [x] **Task 9: Add frontend preview hook**
  - File: `admin.faculytics/src/features/moodle-provision/use-provision-categories.ts`
  - Action: Add `usePreviewCategories` mutation alongside existing `useProvisionCategories`:
    ```typescript
    // No onSuccess toast — preview results are shown in the dialog, not via toast
    export function usePreviewCategories() {
      return useMutation({
        mutationFn: (data: ProvisionCategoriesRequest) =>
          apiClient<ProvisionResultResponse>(
            '/moodle/provision/categories/preview',
            {
              method: 'POST',
              body: JSON.stringify(data),
            },
          ),
        onError: () => {
          toast.error('Failed to preview categories');
        },
      });
    }
    ```

- [x] **Task 10: Extend `ProvisionResultDialog` with preview mode**
  - File: `admin.faculytics/src/features/moodle-provision/components/provision-result-dialog.tsx`
  - Action: Add `mode` prop and optional `onConfirm` callback:
    - Props: `mode?: 'preview' | 'result'` (default `'result'`), `onConfirm?: () => void`, `isConfirming?: boolean`
    - Title: `mode === 'preview' ? 'Category Preview' : 'Provisioning Result'`
    - **Display-only label mapping** (does NOT mutate data, only affects rendered text): Add a `statusLabel` map alongside existing `statusVariant`:
      ```typescript
      const statusLabel: Record<string, Record<string, string>> = {
        preview: { created: 'will create', skipped: 'exists', error: 'error' },
        result: { created: 'created', skipped: 'skipped', error: 'error' },
      };
      ```
      Use it in the Badge render: `{statusLabel[mode][d.status]}` instead of `{d.status}`. The `statusVariant` badge colors remain unchanged.
    - Footer: if `onConfirm` provided, show `"Confirm & Provision"` button (with loading state via `isConfirming`) + `"Cancel"` button. Otherwise show existing `"Close"` button.

- [x] **Task 11: Update `categories-tab.tsx` with preview-then-confirm flow**
  - File: `admin.faculytics/src/features/moodle-provision/components/categories-tab.tsx`
  - Action:
    1. Import and use `usePreviewCategories` alongside existing `useProvisionCategories`
    2. Add state for preview result AND captured request payload:
       ```typescript
       const [preview, setPreview] = useState<ProvisionResultResponse | null>(
         null,
       );
       const [previewPayload, setPreviewPayload] =
         useState<ProvisionCategoriesRequest | null>(null);
       ```
    3. Change submit handler to call preview first, capturing the payload:
       ```typescript
       const handlePreview = () => {
         const payload: ProvisionCategoriesRequest = {
           campuses: selectedCampuses,
           semesters: selectedSemesters,
           startDate,
           endDate,
           departments,
         };
         previewMutation.mutate(payload, {
           onSuccess: (data) => {
             setPreviewPayload(payload);
             setPreview(data);
           },
         });
       };
       ```
    4. Add confirm handler that reuses the **captured payload** (not current form state) to prevent TOCTOU race:
       ```typescript
       const handleConfirm = () => {
         if (!previewPayload) return;
         provisionMutation.mutate(previewPayload, {
           onSuccess: (data) => {
             setPreview(null);
             setPreviewPayload(null);
             setResult(data);
           },
           onError: () => {
             toast.error('Provisioning failed. You can retry or cancel.');
           },
         });
       };
       ```
    5. Update the submit button: label `"Preview Categories"`, calls `handlePreview`, disabled when `!isValid || previewMutation.isPending`
    6. Add preview dialog:
       ```tsx
       <ProvisionResultDialog
         result={preview}
         open={!!preview}
         onClose={() => {
           setPreview(null);
           setPreviewPayload(null);
         }}
         mode="preview"
         onConfirm={handleConfirm}
         isConfirming={provisionMutation.isPending}
       />
       ```
    7. Keep existing result dialog unchanged (shows after confirm completes).
  - Notes: The `previewPayload` state captures the exact request used for preview. The confirm handler reuses this captured payload rather than rebuilding from current form state, preventing a TOCTOU race where the user modifies the form between preview and confirm.

### Acceptance Criteria

- [x] **AC 1:** Given a category provision request with `semesters: [2], startDate: '2026-01-20', endDate: '2026-06-01'`, when the provisioning service processes it, then the generated semester tag is `S22526` (not `S22626`).
- [x] **AC 2:** Given a category provision request with `semesters: [1], startDate: '2025-08-01', endDate: '2025-12-18'`, when the provisioning service processes it, then the generated semester tag is `S12526` (not `S12525`).
- [x] **AC 3:** Given a category provision request with `semesters: [1, 2], startDate: '2025-08-01', endDate: '2026-06-01'`, when processed, then tags are `S12526` and `S22526` (existing behavior preserved).
- [x] **AC 3b:** Given a category provision request with `semesters: [1], startDate: '2026-08-01', endDate: '2026-12-18'`, when processed, then the tag is `S12627` (boundary year coverage).
- [x] **AC 3c:** Given a category provision request with `semesters: [2], startDate: '2027-01-20', endDate: '2027-06-01'`, when processed, then the tag is `S22627` (boundary year coverage).
- [x] **AC 4:** Given a Moodle API response with `exception: 'webservice_access_exception'`, when `MoodleClient.call()` throws, then the error message includes a hint about adding the wsfunction to the Moodle external service.
- [x] **AC 5:** Given a valid category provision request, when `POST /moodle/provision/categories/preview` is called, then the response returns a `ProvisionResult` with each category's status (`skipped` for existing, `created` for missing) without creating anything in Moodle.
- [x] **AC 6:** Given a preview where a parent category doesn't exist (e.g., campus is missing), when the preview walks child levels, then all children are marked as `created` (since they can't exist without the parent).
- [x] **AC 7:** Given two concurrent `POST /moodle/provision/categories/preview` requests, when both are processed, then both succeed without `ConflictException` (no concurrency guard on preview).
- [x] **AC 8:** Given the admin console categories tab, when the user fills the form and clicks "Preview Categories", then a preview dialog shows the expected create/skip results before any Moodle changes are made.
- [x] **AC 9:** Given the preview dialog, when the user clicks "Confirm & Provision", then the actual provisioning executes and the result dialog shows the final outcome.
- [x] **AC 10:** Given the preview dialog, when the user clicks "Cancel", then no provisioning occurs and the dialog closes.

## Additional Context

### Dependencies

- Moodle LMS API (`core_course_create_categories`, `core_course_get_categories`) — both authorized on `faculytics_service`
- Admin frontend (`admin.faculytics`) for preview UI
- shadcn/ui components (Dialog, Table, Badge, Button, ScrollArea) — already installed and in use

### Testing Strategy

**Unit tests (backend):**

- `moodle-course-transform.service.spec.ts`: 6 new test cases for `ComputeSchoolYears` covering all semester/date combinations
- `moodle-provisioning.service.spec.ts`: 2 new test cases for year-fix in `ProvisionCategories`, 5 new test cases for `PreviewCategories`
- `moodle.client.spec.ts` (new file): 2 test cases — verify `webservice_access_exception` hint is appended, verify other exceptions don't get the hint

**Manual testing:**

1. Start admin console dev server (`cd admin.faculytics && bun dev`)
2. Start API dev server (`cd api.faculytics && npm run start:dev`)
3. Navigate to Moodle Provision > Categories tab
4. Select UCMN campus, semester 2, add CCS/BSCSAI
5. Click "Preview Categories" — verify preview shows correct tag `S22526` and correct skip/create statuses
6. Click "Confirm & Provision" — verify BSCSAI is created under existing hierarchy
7. Check Moodle tree browser to confirm the new category exists

### Notes

- The request that triggered the bug: `{"campuses":["UCMN"],"semesters":[2],"startDate":"2026-01-20","endDate":"2026-06-01","departments":[{"code":"CCS","programs":["BSCSAI"]}]}`
- API response: `{"created":0,"skipped":1,"errors":1,"details":[{"name":"UCMN","status":"skipped"},{"name":"S22626","status":"error","reason":"Moodle API error (webservice_access_exception): Access control exception"}]}`
- Expected correct flow: UCMN (skip) -> S22526 (skip) -> CCS (skip) -> BSCSAI (create)
- Moodle token migration completed: mobile web service -> dedicated `faculytics_service` with 13 functions
- VPS credentials updated: `.env.staging` and `.env.production` at `185.201.9.190`
- **Future UX enhancement:** Preview details are rendered as a flat list. Adding a `depth` field to `ProvisionDetailItem` and indenting items by depth in the dialog would better communicate the tree hierarchy. Not blocking — the execute endpoint returns the same flat list. Track separately if needed.
- **Known related issue (out of scope):** Same `.slice()` year-extraction bug exists in `buildSeedContext()` (controller:66-79) and `PreviewQuickCourse`/`ExecuteQuickCourse` (service:411-457) for course seeding. Unlike the category fix (where `ComputeSchoolYears` is called per-semester in a loop), the course fix is more involved: `buildSeedContext` creates a single `SeedContext` for the entire request, but each CSV row has its own semester. The fix requires per-row year computation in `ComputePreview`, `GenerateShortname`, and `BuildCategoryPath`, which touches the `SeedContext` interface. Track as a separate issue.

## Review Notes

- Adversarial review completed with 12 findings
- 8 fixed: F1 (DRY controller), F2 (controller spec tests), F3 (@ApiBearerAuth), F5 (NaN guard), F7 (error surfacing), F8 (confirm error UX), F10 (test cleanup), F12 (explicit via no-change — correct as-is)
- 3 acknowledged (design-level, no code fix): F4 (cascade UX), F6 (error semantics), F11 (Moodle TOCTOU)
- 1 noise: F9 (no guard on preview — intentional)
- Resolution approach: auto-fix
