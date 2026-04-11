---
title: 'Enhance Seed Users Provision UX'
slug: 'enhance-seed-users-provision-ux'
created: '2026-04-12'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'React 19',
    'Vite',
    'TanStack Query',
    'shadcn/ui',
    'Radix Select',
    'Tailwind 4',
    'NestJS 11',
    'MikroORM 6',
    'Zod',
  ]
files_to_modify:
  - 'api: src/modules/admin/dto/responses/program-filter-option.response.dto.ts (NEW)'
  - 'api: src/modules/admin/services/admin-filters.service.ts'
  - 'api: src/modules/admin/services/admin-filters.service.spec.ts (NEW)'
  - 'api: src/modules/admin/admin-filters.controller.ts'
  - 'api: src/modules/admin/admin-filters.controller.spec.ts'
  - 'admin: src/features/moodle-provision/components/seed-users-tab.tsx'
  - 'admin: src/features/moodle-provision/use-seed-users.ts'
  - 'admin: src/features/moodle-provision/use-programs-by-department.ts'
  - 'admin: src/features/moodle-provision/provision-page.tsx'
  - 'admin: src/types/api.ts'
code_patterns:
  - 'Cascading dropdowns: useSemesters → useDepartmentsBySemester → useProgramsByDepartment with reset-on-change'
  - 'View state machine: type View = "input" | "preview"'
  - 'Category course fetch: useCategoryCourses(categoryId) with keepPreviousData'
  - 'Checkbox selection: checked Set<number> with toggleRow/toggleAll'
  - 'onBrowse prop pattern for MoodleTreeSheet integration'
  - 'Standalone dedicated DTOs per entity (SemesterFilterResponseDto pattern): flat class, own @ApiProperty decorators, static mapper'
  - 'PascalCase public service methods'
  - 'Swagger decorators on all DTO properties'
test_patterns:
  - 'Jest with NestJS TestingModule'
  - 'Controller spec mocks service methods as jest.fn()'
  - 'admin-filters.controller.spec.ts exists; no service spec for admin-filters (service spec added in this work)'
---

# Tech-Spec: Enhance Seed Users Provision UX

**Created:** 2026-04-12

## Overview

### Problem Statement

The Seed Users tab in the admin Moodle provisioning feature has a bare-bones UX compared to the recently enhanced Bulk Course Insert tab. Users must type raw comma-separated Moodle course IDs into a text input, pick campus from a static dropdown with no relationship to course selection, and execute with only a basic AlertDialog confirmation. There is no visual course selection, no preview step, and results are displayed as inline badges. This is friction-heavy, error-prone, and inconsistent with the improved UX patterns established in the bulk course flow.

### Solution

Rebuild the Seed Users tab with cascading dropdowns (Semester > Department > Program) that scope the user to a specific Moodle category, a visual course picker table fetched from the Moodle category tree API, a client-side preview/confirm step showing exactly what will happen, and a dedicated result panel. One API change: create a standalone `ProgramFilterOptionResponseDto` (same pattern as `SemesterFilterResponseDto`) that includes `moodleCategoryId`, keeping `FilterOptionResponseDto` untouched. Retain a small "Add by ID" escape hatch for power users.

### Scope

**In Scope:**

- `admin.faculytics` — Rewrite `seed-users-tab.tsx` with cascading dropdowns, course picker table, preview view, and result panel
- `admin.faculytics` — Wire `onBrowse` prop to `SeedUsersTab` in `provision-page.tsx`
- `admin.faculytics` — Add `ProgramFilterOption` type in `api.ts`; update `useProgramsByDepartment` return type
- `admin.faculytics` — Remove `onSuccess` toast from `useSeedUsers` hook (result panel replaces it)
- `api.faculytics` — Create standalone `ProgramFilterOptionResponseDto` with `moodleCategoryId`
- Small "Add by ID" input for manual course entry as an escape hatch

**Out of Scope:**

- New backend preview endpoint (client-side preview only for this iteration)
- Multi-program selection (single program per operation; run twice for cross-program seeding)
- Changes to the `POST /moodle/provision/users` API request/response contract
- Changes to other provisioning tabs (categories, bulk courses, quick course)
- Changes to `FilterOptionResponseDto` — it stays untouched to avoid polluting campus/department responses

## Context for Development

### Codebase Patterns

**Cascading Dropdowns (established in `courses-bulk-tab.tsx`):**

- Three hooks chained: `useSemesters()` → `useDepartmentsBySemester(semesterId)` → `useProgramsByDepartment(departmentId)`
- Each hook uses `useQuery` with `enabled: !!parentId && isAuth` for conditional fetching
- Semester change resets department + program; department change resets program
- Semester selection auto-fills `startDate`/`endDate` from `SemesterFilterOption` and derives `campusCode`
- All hooks depend on `activeEnvId` from `useEnvStore` and `isAuthenticated` from `useAuthStore`

**Category Course Fetching:**

- `useCategoryCourses(categoryId: number | null)` fetches `GET /moodle/provision/tree/:categoryId/courses`
- Returns `MoodleCategoryCoursesResponse { categoryId, courses: MoodleCoursePreview[] }`
- `MoodleCoursePreview` has: `id`, `shortname`, `fullname`, `enrolledusercount?`, `visible`, `startdate`, `enddate`
- Uses `keepPreviousData` and 3-minute stale time
- **Important**: The hook uses `keepPreviousData`, meaning stale data from the previous category persists during fetch transitions. Components must snapshot courses into local state and eagerly clear the snapshot on program change to prevent showing stale courses with a new program label.

**View State Machine:**

- `type View = 'input' | 'preview'` pattern used by bulk courses
- Input view: form with cascade + data entry
- Preview view: read-only summary + execute button + back button
- Result shown inline after execution within the preview view

**Checkbox Selection:**

- `checked` as `Set<number>` (indices into a **stable local snapshot**, not the live query data)
- `toggleRow(idx)` and `toggleAll()` handlers
- Select-all checkbox in table header

**Standalone Dedicated Filter DTO Pattern (precedent: `SemesterFilterResponseDto`):**

- When an entity needs fields beyond `{ id, code, name }`, a **standalone flat DTO class** is created with its own `@ApiProperty` decorators and static mapper
- `SemesterFilterResponseDto` is a standalone class — it does NOT extend `FilterOptionResponseDto`. It has its own `id`, `code`, `label`, `academicYear`, `campusCode`, `startDate`, `endDate` properties and decorators
- `FilterOptionResponseDto` stays unchanged for campuses and departments
- New `ProgramFilterOptionResponseDto` follows this exact same pattern: standalone flat class, own decorators, own `MapProgram()` static mapper
- **Why standalone**: NestJS Swagger metadata scanner relies on class prototypes. Spreading a plain object from `FilterOptionResponseDto.Map()` into a return value strips the prototype, making `@ApiProperty` decorators invisible. Standalone classes avoid this entirely.

**Seed Users API (unchanged):**

- `POST /moodle/provision/users` accepts `{ count, role, campus, courseIds }`
- `campus` is a plain string (e.g., `'UCMN'`) — the API calls `.toLowerCase()` internally in `GenerateFakeUser()`
- API generates users via `GenerateFakeUser(campus, role)`:
  - Student username: `campus-YYMMDD####` (date + 4-digit random)
  - Faculty username: `campus-t-#####` (5-digit random)
  - Email: `username@faculytics.seed`, password: `User123#`
- Enrollments use Moodle role IDs from env: `MOODLE_ROLE_ID_STUDENT` / `MOODLE_ROLE_ID_EDITING_TEACHER`
- Batch size: 50 (users and enrolments)
- Operation guard prevents concurrent seed operations

**`useSeedUsers` Hook Behavior:**

- The hook defines both `onSuccess` (toast) and `onError` (409 check + generic toast) callbacks at the hook level
- TanStack Query executes hook-level AND component-level `onSuccess` callbacks. With the new result panel as primary success feedback, the hook-level `onSuccess` toast must be removed to avoid double feedback.

### Files to Reference

| File                                                                         | Purpose                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin: src/features/moodle-provision/components/seed-users-tab.tsx`         | **PRIMARY TARGET** — current seed users component to rewrite                                                                                                                                                                                        |
| `admin: src/features/moodle-provision/components/courses-bulk-tab.tsx`       | Reference implementation for cascading dropdowns + preview pattern                                                                                                                                                                                  |
| `admin: src/features/moodle-provision/provision-page.tsx`                    | Tab orchestrator — needs `onBrowse` wired to SeedUsersTab                                                                                                                                                                                           |
| `admin: src/features/moodle-provision/use-seed-users.ts`                     | Mutation hook — remove `onSuccess` toast (result panel replaces it)                                                                                                                                                                                 |
| `admin: src/features/moodle-provision/use-semesters.ts`                      | Cascade level 1 hook — reuse as-is                                                                                                                                                                                                                  |
| `admin: src/features/moodle-provision/use-departments-by-semester.ts`        | Cascade level 2 hook — reuse as-is                                                                                                                                                                                                                  |
| `admin: src/features/moodle-provision/use-programs-by-department.ts`         | Cascade level 3 hook — return type changes to `ProgramFilterOption[]`                                                                                                                                                                               |
| `admin: src/features/moodle-provision/use-category-courses.ts`               | Course fetcher by category — reuse as-is                                                                                                                                                                                                            |
| `admin: src/features/moodle-provision/components/moodle-tree-sheet.tsx`      | Browse existing tree — wired via `onBrowse` prop                                                                                                                                                                                                    |
| `admin: src/types/api.ts`                                                    | Add `ProgramFilterOption` type with required `moodleCategoryId: number`                                                                                                                                                                             |
| `admin: src/features/admin/use-admin-filters.ts`                             | **NOT MODIFIED** — contains `usePrograms()` typed as `FilterOption[]`. This is a separate consumer for admin user management and does not need `moodleCategoryId`. The type divergence is intentional (structural typing makes it safe at runtime). |
| `api: src/modules/admin/dto/responses/filter-option.response.dto.ts`         | **UNCHANGED** — existing DTO stays clean                                                                                                                                                                                                            |
| `api: src/modules/admin/dto/responses/program-filter-option.response.dto.ts` | **NEW** — standalone flat class with `moodleCategoryId`                                                                                                                                                                                             |
| `api: src/modules/admin/dto/responses/semester-filter.response.dto.ts`       | **Pattern reference** — standalone flat DTO with own decorators and mapper                                                                                                                                                                          |
| `api: src/modules/admin/services/admin-filters.service.ts`                   | `GetPrograms()` — return type changes to `ProgramFilterOptionResponseDto[]`                                                                                                                                                                         |
| `api: src/modules/admin/admin-filters.controller.ts`                         | Programs endpoint — return type annotation changes                                                                                                                                                                                                  |
| `api: src/modules/admin/admin-filters.controller.spec.ts`                    | Controller test — needs updated mock and assertion                                                                                                                                                                                                  |
| `api: src/entities/program.entity.ts`                                        | Source of truth: `moodleCategoryId` is a required `number` field on `Program`                                                                                                                                                                       |
| `api: src/modules/moodle/services/moodle-provisioning.service.ts:608-714`    | `SeedUsers()` method — unchanged, for reference                                                                                                                                                                                                     |

### Technical Decisions

- **Standalone `ProgramFilterOptionResponseDto` (not extending `FilterOptionResponseDto`)**: NestJS Swagger metadata scanner relies on class prototypes. Spreading a plain object from `Map()` strips the prototype, making `@ApiProperty` decorators invisible. `SemesterFilterResponseDto` uses a standalone flat class — `ProgramFilterOptionResponseDto` follows the same pattern. (Adversarial review R1-F1, R2-F1, R2-F2)
- **Client-side preview over server-side**: The course picker already shows live Moodle data (fetched via `useCategoryCourses`), so the preview is a confirmation of user selections, not a validation step. If server-side preview is needed later, the view structure supports swapping the data source.
- **Course list snapshot for stable checkbox indices**: The `useCategoryCourses` hook uses `keepPreviousData`, meaning stale data persists during transitions. Indexing `checked: Set<number>` directly into live query data creates a race condition. Snapshot courses into `useState` on load, clear eagerly on program change via `handleProgramChange`. (Adversarial review R1-F7, R2-F4, R2-F5)
- **Eager clearing on program change**: A dedicated `handleProgramChange` handler clears `courseSnapshot` and `checked` immediately, before the async fetch completes. This prevents stale courses from appearing under a new program label during the `keepPreviousData` transition. (Adversarial review R2-F5)
- **Remove hook-level success toast**: `useSeedUsers` defines `onSuccess: toast.success(...)` at hook level. TanStack Query fires both hook-level and component-level `onSuccess`. With the result panel as primary success feedback, the hook toast causes double feedback. Remove it. (Adversarial review R2-F3)
- **Deduplication via `Set`**: All course IDs (from picker + manual input) are merged into a `new Set<number>()` before submission to prevent duplicate enrollments. (Adversarial review R1-F3)
- **Campus sent as uppercase**: `SemesterFilterOption.campusCode` is uppercase (e.g., `'UCMN'`). Send it as-is to the API — the API's `GenerateFakeUser()` calls `.toLowerCase()` internally. Matching the current behavior avoids any contract ambiguity. (Adversarial review R1-F2)
- **Single-program scoping**: Matches the Rust script's directory-based scoping (`enrolments/ucmn/ccs/bscs/`). The "Add by ID" escape hatch covers cross-program edge cases.
- **Dedicated result panel over shared dialog**: `SeedUsersResponse` (`usersCreated`, `usersFailed`, `enrolmentsCreated`, `warnings[]`, `durationMs`) doesn't map to `ProvisionResultResponse` (`created`, `skipped`, `errors`, `details[]`, `durationMs`). An inline panel avoids conditional rendering complexity.
- **`mutation.reset()` on form reset**: TanStack Query mutations hold internal state (`isSuccess`, `data`, `error`). The reset handler must call `mutation.reset()` to clear stale mutation state before the user starts a new form session. (Adversarial review R2-F12)

## Implementation Plan

### Tasks

#### Task 1: Create `ProgramFilterOptionResponseDto`

- File: `api: src/modules/admin/dto/responses/program-filter-option.response.dto.ts` **(NEW)**
- Action:
  1. Create a **standalone flat DTO class** `ProgramFilterOptionResponseDto` (do NOT extend `FilterOptionResponseDto`)
  2. Add properties with Swagger decorators:
     - `@ApiProperty()` `id: string`
     - `@ApiProperty()` `code: string`
     - `@ApiPropertyOptional({ nullable: true })` `name: string | null`
     - `@ApiProperty({ description: 'Moodle category ID for this program' })` `moodleCategoryId: number`
  3. Add a static mapper method:
     ```typescript
     static MapProgram(entity: {
       id: string;
       code: string;
       name?: string;
       moodleCategoryId: number;
     }): ProgramFilterOptionResponseDto {
       const dto = new ProgramFilterOptionResponseDto();
       dto.id = entity.id;
       dto.code = entity.code;
       dto.name = entity.name ?? null;
       dto.moodleCategoryId = entity.moodleCategoryId;
       return dto;
     }
     ```
- Notes: `FilterOptionResponseDto` is **not modified**. This follows the exact same pattern as `SemesterFilterResponseDto` — standalone flat class, own decorators, own mapper. Do NOT use extends or spread.

#### Task 2: Use `ProgramFilterOptionResponseDto` in `GetPrograms()`

- **Depends on**: Task 1
- File: `api: src/modules/admin/services/admin-filters.service.ts`
- Action:
  1. Import `ProgramFilterOptionResponseDto`
  2. Change `GetPrograms()` return type from `Promise<FilterOptionResponseDto[]>` to `Promise<ProgramFilterOptionResponseDto[]>`
  3. Change the mapper call from `FilterOptionResponseDto.Map(p)` to `ProgramFilterOptionResponseDto.MapProgram(p)` — the `Program` entity already has `moodleCategoryId` loaded from `em.find()`

#### Task 3: Add service-level test for `GetPrograms()` mapping

- **Depends on**: Task 1, Task 2
- File: `api: src/modules/admin/services/admin-filters.service.spec.ts` **(NEW)**
- Action:
  1. Create a new spec file for `AdminFiltersService`
  2. Add a test: `'GetPrograms should map moodleCategoryId via ProgramFilterOptionResponseDto'`
  3. Mock `EntityManager.find()` to return a program entity with `{ id: 'p-1', code: 'BSCS', name: 'Computer Science', moodleCategoryId: 42 }`
  4. Assert `result[0].moodleCategoryId` equals `42`
  5. Assert `result[0]` is an instance of `ProgramFilterOptionResponseDto` (verifies real mapper, not mock passthrough)
- Notes: This is the critical mapping that the entire feature depends on. The controller test bypasses the mapper via mock; this test exercises the real `MapProgram()` method.

#### Task 4: Update controller return type and test

- **Depends on**: Task 1
- File: `api: src/modules/admin/admin-filters.controller.ts`
- Action:
  1. Import `ProgramFilterOptionResponseDto`
  2. Change the `GetPrograms()` method return type annotation from `Promise<FilterOptionResponseDto[]>` to `Promise<ProgramFilterOptionResponseDto[]>`
  3. Update `@ApiResponse` decorator from `{ status: 200, type: [FilterOptionResponseDto] }` to `{ status: 200, type: [ProgramFilterOptionResponseDto] }`
- File: `api: src/modules/admin/admin-filters.controller.spec.ts`
- Action:
  1. Update the mock program data to include `moodleCategoryId`: `{ id: 'p-1', code: 'BSCS', name: 'Computer Science', moodleCategoryId: 42 }`
  2. Update assertion to expect `moodleCategoryId: 42` in the result

#### Task 5: Add `ProgramFilterOption` type on frontend

- File: `admin: src/types/api.ts`
- Action:
  1. Add a new interface below `FilterOption`:
     ```typescript
     export interface ProgramFilterOption extends FilterOption {
       moodleCategoryId: number;
     }
     ```
  2. `FilterOption` is **not modified**.

#### Task 6: Update `useProgramsByDepartment` return type

- **Depends on**: Task 5
- File: `admin: src/features/moodle-provision/use-programs-by-department.ts`
- Action:
  1. Import `ProgramFilterOption` instead of `FilterOption`
  2. Change the `apiClient` generic from `FilterOption[]` to `ProgramFilterOption[]`
- Notes: This is the only provision hook that changes. `useSemesters` and `useDepartmentsBySemester` remain unchanged. A separate `usePrograms()` hook in `use-admin-filters.ts` also calls the programs endpoint but is typed as `FilterOption[]` — this is intentional. That hook serves admin user management which does not need `moodleCategoryId`. TypeScript structural typing makes the runtime safe; the type divergence is acceptable.

#### Task 7: Remove `onSuccess` toast from `useSeedUsers` hook

- File: `admin: src/features/moodle-provision/use-seed-users.ts`
- Action:
  1. Remove the `onSuccess` callback from the `useMutation` options (lines 13-15: `onSuccess: (data) => { toast.success(...) }`)
  2. Keep the `onError` callback unchanged — error toasts (409 and generic) are still appropriate
- Notes: The result panel (Task 10) replaces the success toast as the sole success feedback. TanStack Query fires both hook-level and component-level `onSuccess` callbacks; removing the hook-level one prevents double feedback.

#### Task 8: Wire `onBrowse` to `SeedUsersTab` in provision page

- File: `admin: src/features/moodle-provision/provision-page.tsx`
- Action:
  1. Change `<SeedUsersTab />` to `<SeedUsersTab onBrowse={onBrowse} />`

#### Task 9: Rewrite `seed-users-tab.tsx` — Input View

- File: `admin: src/features/moodle-provision/components/seed-users-tab.tsx`
- Action: Full rewrite of the component. This task covers the **input view**:
  1. **Component signature**: Accept `{ onBrowse: () => void }` prop
  2. **State**:
     - Cascade: `semesterId`, `departmentId`, `programId` (all `string | undefined`)
     - View: `type View = 'input' | 'preview'`
     - Course snapshot: `courseSnapshot: MoodleCoursePreview[]` (local state, not live query)
     - Selection: `checked: Set<number>` (indices into `courseSnapshot`)
     - Manual IDs: `manualIdsInput: string` (default: `''`), `manualIdsExpanded: boolean` (default: `false`)
     - Form: `role: 'student' | 'faculty' | ''`, `count: string`
     - Result: `result: SeedUsersResponse | null`
  3. **Cascade dropdowns section** (full-width semester, then 2-col department + program):
     - Import and use `useSemesters()`, `useDepartmentsBySemester(semesterId)`, `useProgramsByDepartment(departmentId)`
     - `handleSemesterChange(id)`: set semesterId, reset departmentId + programId + courseSnapshot + checked
     - `handleDepartmentChange(id)`: set departmentId, reset programId + courseSnapshot + checked
     - `handleProgramChange(id)`: set programId, **immediately clear `courseSnapshot` to `[]` and `checked` to `new Set()`** — this prevents stale courses from appearing under a new program label during the `keepPreviousData` transition
     - Disable department until semester selected; disable program until department selected
  4. **Role + Count row** (2-col grid below cascade):
     - Role: `Select` with `student` / `faculty` options (same as current)
     - Count: `Input type="number"` min=1 max=200 (same as current)
  5. **Course picker section** (appears when programId is set):
     - Derive `moodleCategoryId` from selected program: `programs?.find(p => p.id === programId)?.moodleCategoryId ?? null`
     - Call `useCategoryCourses(moodleCategoryId)`
     - **Snapshot pattern**: When `categoryCourses` data arrives with a new `categoryId` (different from the current snapshot's source), copy `categoryCourses.courses` into `courseSnapshot` via `useEffect` and reset `checked` to empty `Set`. Dependency: `categoryCourses?.categoryId` — but note the snapshot is already eagerly cleared by `handleProgramChange`, so this effect only populates, never clears.
     - **Loading state**: Show `Loader2` spinner while `useCategoryCourses` is loading AND `courseSnapshot` is empty
     - **Error state**: If `useCategoryCourses` returns an error, show a bordered error box: "Failed to load courses from Moodle" with a "Retry" button that calls `refetch()`
     - **Empty state**: Show "No courses found in this category" if fetch succeeded and `courseSnapshot.length === 0`
     - **Course table**: Render checkbox table from `courseSnapshot` with columns: Checkbox, ID, Shortname, Fullname, Enrolled
     - Select-all checkbox in header
     - `toggleRow(idx)` and `toggleAll()` handlers using `checked: Set<number>` indexing into `courseSnapshot`
  6. **"Add by ID" escape hatch** (below course table, visible only when programId is set):
     - Collapsible section toggled by a text link: "Add courses by ID"
     - **Initial state**: collapsed (`manualIdsExpanded: false`)
     - **Collapse behavior**: collapsing does NOT clear the input (preserves typed IDs)
     - **State persistence**: `manualIdsInput` and `manualIdsExpanded` persist across view transitions (preview and back)
     - When expanded: text `Input` for comma-separated IDs
     - Parsing logic:
       ```
       parsedManualIds = input.split(',').map(s => s.trim()).filter(Boolean).map(s => parseInt(s, 10))
       invalidIds = input.split(',').map(s => s.trim()).filter(s => s && isNaN(parseInt(s, 10)))
       validManualIds = parsedManualIds.filter(n => !isNaN(n))
       ```
     - Show inline error listing ALL invalid IDs: `Invalid course IDs: {invalidIds.join(', ')}` when `invalidIds.length > 0`
  7. **Derived values for submission**:
     - `pickerIds = checked indices mapped to courseSnapshot[i].id`
     - `allCourseIds = [...new Set([...pickerIds, ...validManualIds])]` — **deduplicated via Set**
     - `campusCode = semesters?.find(s => s.id === semesterId)?.campusCode`
  8. **Action buttons row**:
     - "Preview" button — enabled when ALL of: role is set, `parsedCount >= 1 && parsedCount <= 200`, `allCourseIds.length > 0`, **`invalidIds.length === 0`** (manual IDs must be valid or empty)
     - On click: set `view = 'preview'`
     - "Browse existing" button with `FolderTree` icon — calls `onBrowse()`
  9. **Remove**: `CAMPUSES` import, static campus dropdown, raw courseIdsInput text field as the sole input, `AlertDialog` confirmation, inline badge result display

#### Task 10: Rewrite `seed-users-tab.tsx` — Preview View

- File: `admin: src/features/moodle-provision/components/seed-users-tab.tsx`
- Action: Add the **preview view** (rendered when `view === 'preview'` and `result` is null):
  1. **Back button**: `<Button variant="ghost">` with `ArrowLeft` icon, sets `view = 'input'`
  2. **Summary card**: Styled bordered box showing:
     - "Generate **{count}** **{role}** users on campus **{campusCode}**"
     - "Enrol into **{allCourseIds.length}** courses:"
  3. **Selected courses table** (read-only, shown when picker courses exist in `checked`):
     - Columns: Shortname, Fullname, Enrolled Count
     - Populated from `courseSnapshot` filtered by `checked` set
  4. **Manual IDs section** (shown when `validManualIds.length > 0`):
     - If picker courses also selected: show as secondary info line: "Additionally enrolling into {n} courses by ID: {id1, id2, ...}"
     - If **only** manual IDs (zero picker courses): show as primary content: "Enrolling into {n} courses by ID: {id1, id2, ...}" — no empty table rendered
  5. **"Generate & Enrol" button**:
     - Label: `Generate {count} {Role}s` (e.g., "Generate 10 Students")
     - On click: call `mutation.mutate()` from `useSeedUsers()` with `{ count: parsedCount, role, campus: campusCode, courseIds: allCourseIds }`
     - Pass `{ onSuccess: (data) => setResult(data) }` as the component-level callback
     - Show `Loader2` spinner when `mutation.isPending`
  6. **Error recovery**: On non-409 mutation errors, the user stays on the preview view. The `useSeedUsers` hook shows a toast ("Failed to seed users"). The user can retry by clicking "Generate & Enrol" again, or click Back to adjust inputs.

#### Task 11: Rewrite `seed-users-tab.tsx` — Result Panel

- File: `admin: src/features/moodle-provision/components/seed-users-tab.tsx`
- Action: Add the **result panel** (rendered inline when `view === 'preview'` and `result` is not null, replacing the preview content):
  1. Rendered within the preview view area when `result` is not null
  2. **Result card** with:
     - `Badge variant="default"`: `{usersCreated} users created`
     - `Badge variant="destructive"` (conditional): `{usersFailed} failed` (only if > 0)
     - `Badge variant="secondary"`: `{enrolmentsCreated} enrolments`
     - Duration: `in {durationMs}ms`
  3. **Warnings list** (if any): amber-colored text list of `warnings[]`
  4. **Reset button**: `Button variant="outline"` — clears all state back to initial (cascade, selections, courseSnapshot, view, result, manual IDs) **and calls `mutation.reset()`** to clear stale TanStack Query mutation state

### Acceptance Criteria

- [ ] AC 1: Given the Seed Users tab is open, when the user selects a semester, then the department dropdown is enabled and the program dropdown remains disabled.
- [ ] AC 2: Given a semester is selected, when the user changes to a different semester, then department and program selections are reset and the course picker is hidden.
- [ ] AC 3: Given semester + department + program are all selected, when the program has a `moodleCategoryId`, then courses are fetched from `GET /moodle/provision/tree/:categoryId/courses` and displayed in a checkbox table.
- [ ] AC 4: Given courses are displayed in the picker, when the user checks individual rows or uses "Select All", then the checked set updates accordingly and the Preview button reflects the selected count.
- [ ] AC 5: Given no courses are selected (neither from picker nor manual IDs), when the user tries to click Preview, then the button is disabled.
- [ ] AC 6: Given the "Add by ID" section is expanded, when the user enters valid comma-separated IDs (e.g., `42, 43`), then those IDs are deduplicated with picker selections and included in the final `courseIds` array.
- [ ] AC 7: Given the "Add by ID" section has invalid input (e.g., `42, abc, def`), then an inline error lists all invalid IDs ("Invalid course IDs: abc, def") and the Preview button is disabled until the invalid input is corrected or removed — even if valid picker courses are selected.
- [ ] AC 8: Given valid form state (role, count 1-200, at least 1 course, no invalid manual IDs), when the user clicks Preview, then the view switches to a read-only preview showing the summary card and selected courses table.
- [ ] AC 9: Given the preview view, when the user clicks "Back", then the view returns to input with all previous selections intact (including manual IDs input and collapsible state).
- [ ] AC 10: Given the preview view, when the user clicks "Generate & Enrol", then `POST /moodle/provision/users` is called with `{ count, role, campus: campusCode, courseIds: allCourseIds }` and a loading spinner is shown.
- [ ] AC 11: Given a successful seed operation, then the result panel displays users created, enrolments, optional failures, warnings, and duration. A Reset button is available. No success toast appears (result panel is the sole success feedback).
- [ ] AC 12: Given a 409 Conflict response, then a toast shows "A provisioning operation is already in progress" and the user remains on the preview view (existing behavior from `useSeedUsers` hook).
- [ ] AC 13: Given the Seed Users tab, when the user clicks "Browse existing", then the `MoodleTreeSheet` opens (same behavior as other tabs).
- [ ] AC 14: Given the `GET /admin/filters/programs?departmentId=X` endpoint, when programs are returned, then each program includes `moodleCategoryId: number` in the response via `ProgramFilterOptionResponseDto`.
- [ ] AC 15: Given the category has no courses, when the course picker loads, then an empty state message "No courses found in this category" is shown.
- [ ] AC 16: Given the course fetch for a category fails (network error, Moodle connectivity failure), then an error message "Failed to load courses from Moodle" is shown with a "Retry" button.
- [ ] AC 17: Given only manual course IDs are entered (zero picker courses selected), when the user clicks Preview, then the preview shows the manual IDs as the primary content without an empty courses table.
- [ ] AC 18: Given a non-409 mutation error (e.g., 500, network timeout), then a toast shows "Failed to seed users" and the user remains on the preview view with the ability to retry or go back.
- [ ] AC 19: Given the user enters duplicate IDs in the "Add by ID" input (e.g., `42, 42, 43`), then duplicates are silently collapsed via `Set` deduplication before submission.
- [ ] AC 20: Given a program is selected with courses displayed, when the user switches to a different program within the same department, then the old courses disappear immediately (not after fetch completes) and a loading spinner is shown.

## Additional Context

### Dependencies

- **API must be deployed before frontend**: The frontend relies on `moodleCategoryId` in the program filter response. The API change (Tasks 1-4) must be deployed before the frontend change (Tasks 5-11) can work in production. In local dev, both can be developed and tested together.
- **Existing hooks**: `useSemesters`, `useDepartmentsBySemester`, `useCategoryCourses` are reused as-is. `useProgramsByDepartment` has a return type change (Task 6). `useSeedUsers` has `onSuccess` toast removed (Task 7).
- **Existing API endpoint**: `POST /moodle/provision/users` is unchanged. The frontend just needs to assemble `courseIds` from the picker + manual input.

### Testing Strategy

**API (unit tests):**

- **NEW**: `admin-filters.service.spec.ts` — test that `GetPrograms()` maps `moodleCategoryId` via real `ProgramFilterOptionResponseDto.MapProgram()` and returns a class instance (Task 3)
- Update `admin-filters.controller.spec.ts` to verify `moodleCategoryId` appears in program filter responses (Task 4)
- Manual verification: run the API locally and hit `GET /admin/filters/programs?departmentId=<uuid>` to confirm Swagger shows `moodleCategoryId` in the schema

**Frontend (manual testing):**

1. Open Moodle Provisioning > Seed Users tab
2. Verify cascading dropdowns work: Semester -> Department -> Program
3. Verify course picker populates after program selection
4. Verify switching program within same department clears old courses immediately (not after fetch)
5. Verify checkbox select/deselect and Select All
6. Verify "Add by ID" collapsible: starts collapsed, collapse preserves input, visible only when program selected
7. Verify invalid manual IDs show ALL invalid IDs (not just first), and block Preview button
8. Verify duplicate manual IDs are collapsed (enter `42, 42, 43` -> preview shows 2 courses)
9. Verify Preview button enables only when form is fully valid
10. Verify preview view shows correct summary and course table
11. Verify preview view with only manual IDs (no picker courses) shows IDs as primary content
12. Verify Back button preserves all state including manual IDs and collapsible state
13. Verify "Generate & Enrol" calls the API with correct payload (campus uppercase)
14. Verify NO success toast appears — only the result panel
15. Verify result panel shows correct counts, warnings, and reset works
16. Verify reset clears ALL state (form returns to initial, no stale mutation state)
17. Verify "Browse existing" opens the Moodle tree sheet
18. Verify 409 toast keeps user on preview view
19. Verify non-409 error toast keeps user on preview view with retry available
20. Verify course picker shows error state with retry button on Moodle fetch failure

### Notes

- **Future upgrade path**: If server-side preview is needed later (e.g., to validate course existence at execution time), add a `POST /moodle/provision/users/preview` endpoint. The frontend view structure already supports swapping the preview data source from local state to an API response.
- **Multi-program seeding**: If users frequently need to seed across programs, consider adding a "remember selections" feature that accumulates courses across program switches. This is out of scope for now.
- **Adversarial review applied**: All findings from two rounds of adversarial review (13 from R1, 12 from R2) have been addressed. Key fixes: R1-F1 (dedicated DTO), R1-F7 (course snapshot), R1-F3 (deduplication), R2-F1/F2 (standalone DTO, not extends), R2-F3 (remove hook toast), R2-F5 (handleProgramChange), R2-F12 (mutation.reset). See Technical Decisions for full rationale.
