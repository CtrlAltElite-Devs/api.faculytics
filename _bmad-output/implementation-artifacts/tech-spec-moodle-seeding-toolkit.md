---
title: 'Moodle Seeding Toolkit'
slug: 'moodle-seeding-toolkit'
created: '2026-04-10'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'MikroORM 6',
    'PostgreSQL',
    'csv-parse 6',
    'multer',
    'Zod',
    'Jest',
    'React 19',
    'Vite 8',
    'Tailwind 4',
    'shadcn/ui',
    'TanStack React Query',
    'React Router v7',
  ]
files_to_modify:
  - 'src/modules/moodle/moodle.module.ts'
  - 'src/modules/moodle/lib/moodle.constants.ts'
  - 'src/modules/moodle/lib/moodle.client.ts'
  - 'src/modules/moodle/lib/moodle.types.ts'
  - 'src/modules/moodle/moodle.service.ts'
  - 'NEW: src/modules/moodle/services/moodle-provisioning.service.ts'
  - 'NEW: src/modules/moodle/services/moodle-course-transform.service.ts'
  - 'NEW: src/modules/moodle/controllers/moodle-provisioning.controller.ts'
  - 'NEW: src/modules/moodle/lib/provisioning.types.ts'
  - 'NEW: src/modules/moodle/dto/requests/provision-*.request.dto.ts'
  - 'NEW: src/modules/moodle/dto/responses/provision-*.response.dto.ts'
code_patterns:
  [
    'Service+Controller in MoodleModule',
    'FileInterceptor for CSV upload',
    'SyncPhaseResult for operation results',
    'PascalCase public methods',
    'class-validator DTOs',
    'In-memory concurrency guard',
  ]
test_patterns:
  [
    'Jest with TestingModule',
    'Mocked MoodleService + EntityManager',
    'Co-located .spec.ts files',
  ]
---

# Tech-Spec: Moodle Seeding Toolkit

**Created:** 2026-04-10

## Overview

### Problem Statement

Provisioning Moodle with institutional data (categories, courses, users) requires running a separate Rust CLI (`script.csv.faculytics`), manually crafting Moodle-formatted CSVs, and uploading them through Moodle's web UI. This is a multi-step, error-prone process that only one person can perform. The Rust script silently drops invalid rows, has hardcoded semester filters, and provides no feedback on failures.

### Solution

Build API endpoints (consumed by the admin console) that accept raw institutional data and handle all Moodle formatting and push logic server-side. Four operations: Provision Categories, Seed Courses (bulk CSV), Quick Course Create, and Seed Users. All Moodle-specific formatting (shortname patterns, category paths, semester dates, EDP codes) is derived server-side — the admin only provides raw curriculum data.

### Scope

**In Scope:**

- Category tree provisioning via form (campus, year, semesters, departments + programs) using `core_course_create_categories`
- Bulk course seeding via CSV upload (`Course Code`, `Descriptive Title`, `Program`, `Semester`) + form (campus, department, start/end dates) using `core_course_create_courses`
- Quick single-course creation via form with live shortname/category path preview
- User/faculty seeding with fake data generation + enrollment using `core_user_create_users` and `enrol_manual_enrol_users`
- Institutional shortname/category-path/date formatting logic (ported from Rust script)
- Preview-before-execute for bulk operations; inline live preview for quick create
- Explicit validation reporting — no silent drops (flag semester-0 rows, empty fields, etc.)
- Category path to ID resolution via existing `core_course_get_categories`
- Duplicate course codes allowed (e.g., `CS-EL` appearing multiple times — unique EDP suffix differentiates)

**Out of Scope:**

- PDF extraction / curriculum parsing (remains manual + AI-assisted)
- Editing/deleting Moodle entities (done directly in Moodle UI)
- Replacing the existing Moodle sync (read) pipeline
- Production user management — this is a seeding/bootstrap tool
- Course selector dropdown in Seed Users tab (admin enters course IDs manually for now)

## Context for Development

### Codebase Patterns

- **Module pattern**: `MoodleModule` registers providers (services) and controllers. New services go in `src/modules/moodle/services/`, new controllers in `src/modules/moodle/controllers/`. Add to `moodle.module.ts` `providers` and `controllers` arrays.
- **Service pattern**: Inject `MoodleService` (API client wrapper), `EntityManager`, `Logger`, and other module services as needed. Public methods use PascalCase and return typed results.
- **MoodleClient**: All Moodle API calls go through `MoodleService` → `MoodleClient.call<T>(functionName, params)`. The client handles timeout, error wrapping, JSON parsing. Uses `env.MOODLE_MASTER_KEY` for privileged operations.
- **CSV upload**: Existing pattern in `questionnaire.controller.ts` uses `FileInterceptor('file', { fileFilter: csvFileFilter, limits: { fileSize: 5MB } })`. `csv-parse` v6.2.0 handles streaming parse. Reuse same interceptor pattern.
- **Result reporting**: Sync services return `SyncPhaseResult { status, durationMs, fetched, inserted, updated, deactivated, errors, errorMessage }`. Adapt for provisioning operations.
- **Entity hierarchy**: Campus (depth 1) → Semester (depth 2) → Department (depth 3) → Program (depth 4) → Course. All have `moodleCategoryId` or `moodleCourseId` for Moodle external ID resolution.
- **Category path → ID resolution**: Normalized entities (Campus, Semester, Department, Program) each store `moodleCategoryId`. To resolve `UCMN / S12526 / CCS / BSCS`, query Program where code matches within the correct department/semester/campus chain and read its `moodleCategoryId`.
- **Controller guards**: Admin endpoints use `@UseJwtGuard(UserRole.SUPER_ADMIN)`. Audited actions use `@Audited({ action, resource })`.
- **DTO placement**: Request DTOs in `dto/requests/`, response DTOs in `dto/responses/`. Swagger decorators required on all endpoints and DTO properties.
- **Transactions**: Multi-step DB writes wrapped in `unitOfWork.runInTransaction(async (tx) => { ... })`.

### Files to Reference

| File                                                           | Purpose                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/modules/moodle/moodle.module.ts`                          | Module registration — add new providers/controllers here            |
| `src/modules/moodle/lib/moodle.client.ts`                      | Low-level Moodle API client — add write methods here                |
| `src/modules/moodle/lib/moodle.constants.ts`                   | `MoodleWebServiceFunction` enum — add 4 new write functions         |
| `src/modules/moodle/lib/moodle.types.ts`                       | Moodle type re-exports — add write response types                   |
| `src/modules/moodle/lib/sync-result.types.ts`                  | `SyncPhaseResult` type — reuse or extend for provisioning           |
| `src/modules/moodle/moodle.service.ts`                         | High-level API wrapper — add write method wrappers                  |
| `src/modules/moodle/controllers/moodle-sync.controller.ts`     | Pattern reference for admin controller (guards, audit, DTOs)        |
| `src/modules/moodle/services/moodle-category-sync.service.ts`  | Pattern reference for category hierarchy resolution                 |
| `src/modules/moodle/services/moodle-course-sync.service.ts`    | Pattern reference for course operations                             |
| `src/modules/questionnaires/questionnaire.controller.ts`       | Pattern reference for CSV file upload (FileInterceptor)             |
| `src/modules/questionnaires/ingestion/adapters/csv.adapter.ts` | Pattern reference for csv-parse streaming                           |
| `src/entities/campus.entity.ts`                                | Campus entity with `moodleCategoryId`                               |
| `src/entities/semester.entity.ts`                              | Semester entity with `moodleCategoryId`, `code`, `academicYear`     |
| `src/entities/department.entity.ts`                            | Department entity with `moodleCategoryId`                           |
| `src/entities/program.entity.ts`                               | Program entity with `moodleCategoryId`                              |
| `src/entities/course.entity.ts`                                | Course entity with `moodleCourseId`, `shortname`, `fullname`        |
| `src/entities/user.entity.ts`                                  | User entity with `moodleUserId`, `roles`, campus/dept/program scope |
| `src/entities/enrollment.entity.ts`                            | Enrollment entity with user+course composite unique                 |
| `src/entities/moodle-category.entity.ts`                       | Raw Moodle category mirror (depth, path, parentId)                  |

### Technical Decisions

- **Bulk per department**: The primary course seeding flow uploads one CSV per department, covering all programs and semesters in that department.
- **CSV format**: Accepts the raw curriculum CSV (same format as `ccs_course_mappings.csv`). Requires `Course Code`, `Descriptive Title`, `Program`, `Semester`. Extra columns (units, prerequisites, type) are silently ignored.
- **Semester-0 handling**: Elective/free elective rows with Semester=0 are flagged in the preview as "no semester assigned" but not silently dropped. They cannot be provisioned via bulk flow (no valid dates/category). Use Quick Course Create instead.
- **Direct Moodle REST API**: Uses `core_course_create_courses`, `core_user_create_users`, `enrol_manual_enrol_users`, `core_course_create_categories` — not CSV file upload. Requires Moodle web service token with write capabilities.
- **Category path resolution**: `core_course_create_courses` requires numeric `categoryid`, not path string. API resolves path via `core_course_get_categories` lookup.
- **All environments share one Moodle instance**: No environment gating needed for seeding operations.
- **Date format convention**: All date fields in request DTOs use **ISO 8601 format (`YYYY-MM-DD`)**. The controller/service layer extracts year portions as needed (e.g., `startDate: "2025-08-01"` → `startYear: "2025"`, `startYY: "25"`). The `SeedContext.startDate` and `endDate` represent the **academic year boundaries** — `GetSemesterDates()` derives per-semester dates from these year values (not from the DTO dates directly).
- **Institutional formatting conventions** (from Rust script):
  - Shortname: `{CAMPUS}-S{sem}{startYY}{endYY}-{CourseCode}-{random5digitEDP}`
  - Category path: `{CAMPUS} / S{sem}{startYY}{endYY} / {DEPT} / {PROGRAM}`
  - Semester 1 dates: `{startYear}-08-01` to `{startYear}-12-18`
  - Semester 2 dates: `{endYear}-01-20` to `{endYear}-06-01`
  - Student username: `{campus}-{YY}{MM}{DD}{random4digits}` — **zero-padded month and day**, uses `new Date()` at generation time (e.g., `ucmn-2601054321` for Jan 5, 2026 with random `4321`). This avoids ambiguity between e.g., Jan 5 (`0105`) and Oct 15 (`1015`).
  - Faculty username: `{campus}-t-{random5digits}`
  - Default password: `User123#`

### Moodle Write API Details

**New `MoodleWebServiceFunction` entries needed:**

| Function            | Moodle wsfunction               | Purpose                                                                        |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `CREATE_COURSES`    | `core_course_create_courses`    | Batch create courses (accepts array, returns `{id, shortname}[]`)              |
| `CREATE_CATEGORIES` | `core_course_create_categories` | Create category nodes (accepts array with `name`, `parent`, returns `{id}[]`)  |
| `CREATE_USERS`      | `core_user_create_users`        | Batch create users (accepts array, returns `{id, username}[]`)                 |
| `ENROL_USERS`       | `enrol_manual_enrol_users`      | Batch enrol users into courses (accepts array of `{userid, courseid, roleid}`) |

**Critical API details:**

- `core_course_create_courses` requires numeric `categoryid`, NOT path string. Must resolve via entity lookup.
- `core_course_create_categories` requires numeric `parent` ID. **Must be called one depth level at a time** — you need the parent's returned `id` before creating children. Cannot send the entire tree in a single batch.
- `core_user_create_users` requires password meeting Moodle's password policy. Default `User123#` includes uppercase, lowercase, digit, special char.
- `enrol_manual_enrol_users` returns **`null` on complete success** (no response body). Only returns a warnings structure on partial failure. Code must null-check before accessing response properties.
- Role IDs are **deployment-specific** Moodle defaults (student=5, editingteacher=3). Configured via env vars `MOODLE_ROLE_ID_STUDENT` and `MOODLE_ROLE_ID_EDITING_TEACHER` with those defaults.
- All write functions use array-indexed parameter encoding: `courses[0][shortname]=X&courses[0][fullname]=Y&courses[1][shortname]=Z...`
- **Error handling**: The existing `MoodleClient.call<T>()` already checks for `data.exception` in the response body, which catches Moodle application errors like `shortnametaken` and `invalidpassword`. For **batch operations**, a single item's error may reject the entire batch (Moodle version-dependent). Each batch call should be wrapped in try-catch to isolate failures to that batch.

**Moodle token requirement:** The `MOODLE_MASTER_KEY` token must have capabilities: `moodle/course:create`, `moodle/user:create`, `enrol/manual:enrol`, `moodle/category:manage`.

## Implementation Plan

### Tasks

#### Layer 1: Moodle Write API Foundation

- [ ] Task 1: Add write web service functions to constants
  - File: `src/modules/moodle/lib/moodle.constants.ts`
  - Action: Add `CREATE_COURSES`, `CREATE_CATEGORIES`, `CREATE_USERS`, `ENROL_USERS` to `MoodleWebServiceFunction` enum

- [ ] Task 2: Add array parameter serialization helper
  - File: `src/modules/moodle/lib/moodle.client.ts`
  - Action: Add a `serializeArrayParams(key: string, items: Record<string, string | number>[])` private method that converts an array of objects into Moodle's indexed format (e.g., `courses[0][shortname]=X&courses[0][fullname]=Y`). Returns `Record<string, string>` compatible with existing `call<T>()`.

- [ ] Task 3: Add write methods to MoodleClient
  - File: `src/modules/moodle/lib/moodle.client.ts`
  - Action: Add four new public methods:
    - `createCourses(courses: MoodleCreateCourseInput[]): Promise<MoodleCreateCourseResult[]>` — calls `CREATE_COURSES` with serialized array params
    - `createCategories(categories: MoodleCreateCategoryInput[]): Promise<MoodleCreateCategoryResult[]>` — calls `CREATE_CATEGORIES` with serialized array params. **Caller must send one depth level at a time** — this method sends a single batch, not a multi-depth tree.
    - `createUsers(users: MoodleCreateUserInput[]): Promise<MoodleCreateUserResult[]>` — calls `CREATE_USERS` with serialized array params
    - `enrolUsers(enrolments: MoodleEnrolmentInput[]): Promise<MoodleEnrolResult | null>` — calls `ENROL_USERS` with serialized array params. **Returns `null` on complete success** — Moodle does not return a body when all enrolments succeed. Only returns a warnings object on partial failure.
  - Notes: All methods reuse existing `call<T>()` with the array serializer. The existing `call<T>()` already checks for `data.exception` in the response, which covers Moodle application-level errors (e.g., `shortnametaken`, `invalidpassword`). For `enrolUsers`, add a null-check on the parsed response before returning. Timeout may need to be increased for large batches (>50 items).

- [ ] Task 4: Add write types
  - File: `src/modules/moodle/lib/moodle.types.ts`
  - Action: Add input/result types for write operations:
    - `MoodleCreateCourseInput { shortname, fullname, categoryid, startdate?, enddate?, visible? }`
    - `MoodleCreateCourseResult { id: number, shortname: string }`
    - `MoodleCreateCategoryInput { name, parent?: number, description?, idnumber? }`
    - `MoodleCreateCategoryResult { id: number, name: string }`
    - `MoodleCreateUserInput { username, password, firstname, lastname, email }`
    - `MoodleCreateUserResult { id: number, username: string }`
    - `MoodleEnrolmentInput { userid: number, courseid: number, roleid: number }`
    - `MoodleEnrolResult { warnings?: Array<{ item, itemid, warningcode, message }> } | null` — **Note: `enrol_manual_enrol_users` returns `null` on complete success.** All code consuming this response must null-check before accessing `.warnings`.
    - Moodle role IDs: Do NOT hardcode. Read from env vars `MOODLE_ROLE_ID_STUDENT` (default: `5`) and `MOODLE_ROLE_ID_EDITING_TEACHER` (default: `3`). Add these to the Zod env schema with sensible defaults. These are Moodle install defaults but can be changed by Moodle admins.

- [ ] Task 5: Add write method wrappers to MoodleService
  - File: `src/modules/moodle/moodle.service.ts`
  - Action: Add wrapper methods following existing pattern (accept DTO with token, call client method):
    - `CreateCourses(dto): Promise<MoodleCreateCourseResult[]>`
    - `CreateCategories(dto): Promise<MoodleCreateCategoryResult[]>`
    - `CreateUsers(dto): Promise<MoodleCreateUserResult[]>`
    - `EnrolUsers(dto): Promise<MoodleEnrolResult | null>` — mirrors client return type; callers must null-check

#### Layer 1b: Internal Provisioning Types

- [ ] Task 5b: Create provisioning types barrel file
  - File: NEW `src/modules/moodle/lib/provisioning.types.ts`
  - Action: Define all internal types used across provisioning services (follows pattern of `sync-result.types.ts`):
    - `SeedContext { campus: string, department: string, startDate: string, endDate: string }` — derived from `SeedCoursesContextDto`; the controller maps DTO → SeedContext, extracting year portions (`startYear`, `endYear`, `startYY`, `endYY`) for the transform service.
    - `CurriculumRow { courseCode: string, descriptiveTitle: string, program: string, semester: string }` — output of CSV parser
    - `CoursePreviewRow { shortname: string, fullname: string, categoryPath: string, categoryId: number, startDate: string, endDate: string, program: string, semester: string, courseCode: string }` — preview output
    - `ConfirmedCourseRow { courseCode: string, descriptiveTitle: string, program: string, semester: string, categoryId: number }` — input to execute endpoint (subset of preview, minus example shortname)
    - `SkippedRow { rowNumber: number, courseCode: string, reason: string }`
    - `ParseError { rowNumber: number, message: string }`
    - `SeedUserRecord { username: string, firstname: string, lastname: string, email: string, password: string }`
    - `ProvisionCategoriesInput`, `QuickCourseInput`, `SeedUsersInput` — service-level input types mapped from controller DTOs

#### Layer 2: Course Transformation Engine

- [ ] Task 6: Create course transformation service
  - File: NEW `src/modules/moodle/services/moodle-course-transform.service.ts`
  - Action: Create `MoodleCourseTransformService` (injectable, stateless) with methods:
    - `GenerateShortname(campus: string, semester: string, startYear: string, endYear: string, courseCode: string): string` — produces `{CAMPUS}-S{sem}{startYY}{endYY}-{CourseCode}-{random5digitEDP}`. Strips spaces from course code. EDP is `crypto.randomInt(0, 100000)` zero-padded to 5 digits.
    - `BuildCategoryPath(campus: string, semester: string, dept: string, program: string, startYear: string, endYear: string): string` — produces `{CAMPUS} / S{sem}{startYY}{endYY} / {DEPT} / {PROGRAM}`.
    - `GetSemesterDates(semester: string, startYear: string, endYear: string): { startDate: string, endDate: string } | null` — Semester 1: `{startYear}-08-01` to `{startYear}-12-18`. Semester 2: `{endYear}-01-20` to `{endYear}-06-01`. Returns null for unrecognized semesters.
    - `ComputePreview(row: CurriculumRow, context: SeedContext): CoursePreviewRow` — combines all the above for a single row. `SeedContext` holds campus, dept, startDate, endDate.
    - `GenerateStudentUsername(campus: string): string` — `{campus}-{YY}{MM}{DD}{random4digits}` (zero-padded month/day)
    - `GenerateFacultyUsername(campus: string): string` — `{campus}-t-{random5digits}`
    - `GenerateFakeUser(campus: string, role: 'student' | 'faculty'): SeedUserRecord` — generates username (using role-appropriate format), fake first/last name, email, default password `User123#`.
  - Notes: Pure functions, no DB access. Uses **`@faker-js/faker`** (install as regular dependency — needed at runtime in all environments). All string formatting ported from Rust `utils.rs`.

- [ ] Task 7: Add unit tests for transformation service
  - File: NEW `src/modules/moodle/services/moodle-course-transform.service.spec.ts`
  - Action: Test all transformation methods:
    - Shortname format correctness for both semesters
    - Category path construction
    - Semester date mapping (sem 1, sem 2, invalid)
    - Username format for students and faculty
    - EDP code is 5 digits zero-padded
    - Course code space stripping (e.g., `BSCS 101` → `BSCS101`)

#### Layer 3: CSV Parsing

- [ ] Task 8: Create curriculum CSV parser
  - File: NEW `src/modules/moodle/services/moodle-csv-parser.service.ts`
  - Action: Create `MoodleCsvParserService` that:
    - Accepts a `Buffer` (from multer) and parses via `csv-parse`
    - Validates required headers exist: `Course Code`, `Descriptive Title`, `Program`, `Semester`
    - Ignores extra columns
    - Normalizes headers (trim whitespace)
    - Returns `{ rows: CurriculumRow[], errors: ParseError[] }` where `CurriculumRow = { courseCode, descriptiveTitle, program, semester }`
    - Flags rows with empty required fields in errors (with row number)
    - Flags semester-0 rows as warnings (not errors) — included in output but marked
  - Notes: Reuse `csv-parse` patterns from `csv.adapter.ts`. No streaming needed — curriculum CSVs are <200 rows.

#### Layer 4: Provisioning Service

- [ ] Task 9: Create provisioning service
  - File: NEW `src/modules/moodle/services/moodle-provisioning.service.ts`
  - Action: Create `MoodleProvisioningService` with:
    - Constructor injects: `MoodleService`, `EntityManager`, `MoodleCourseTransformService`, `MoodleCsvParserService`, `MoodleCategorySyncService`, `Logger`
    - Note: No `UnitOfWork` — this service writes to Moodle only, no local DB transactions.
    - **Concurrency guard**: Maintain an in-memory `Set<string>` of active operation types (e.g., `'categories'`, `'courses'`, `'users'`). Before executing any write operation, check if the operation type is in-flight. If so, throw `ConflictException('A provisioning operation is already in progress')`. Add to set on start, remove in `finally` block. This prevents double-clicks and concurrent admins from creating duplicates.
    - `ProvisionCategories(input: ProvisionCategoriesInput): Promise<ProvisionResult>`:
      1. Fetch existing categories from Moodle via `MoodleService.GetCategories()`
      2. Build the desired tree from input (campus × semester-tag × dept × program combinations)
      3. Diff against existing — collect missing nodes, grouped by depth level. **Matching rule**: exact case-sensitive string match on `name` field within the same `parent` ID. Moodle category names are case-sensitive. Since all names are generated from uppercase institutional codes (e.g., `UCMN`, `S12526`, `CCS`, `BSCS`), matching is deterministic.
      4. Create missing nodes **one depth level at a time** (4 sequential API calls max): depth 1 (campuses) → await response to get new IDs → depth 2 (semesters, using parent IDs from depth 1) → await → depth 3 (departments) → await → depth 4 (programs). Each call to `MoodleService.CreateCategories()` sends all nodes at that depth as one batch.
      5. **Auto-sync local entities**: After all categories are created in Moodle, call `MoodleCategorySyncService.SyncAndRebuildHierarchy()` to populate local Campus/Semester/Department/Program entities with the new `moodleCategoryId` values. This eliminates the manual sync step — the admin can proceed directly to course seeding.
      6. Return result with per-item details: each category name + status (`created` | `skipped` | `error`) + reason if error. Include a `syncCompleted: true` flag.
    - `PreviewCourses(file: Buffer, context: SeedContext): Promise<CoursePreviewResult>`:
      1. Parse CSV via `MoodleCsvParserService`
      2. Transform each valid row via `MoodleCourseTransformService.ComputePreview()` — note: shortnames generated here are **examples only** (EDP suffixes will be regenerated at execution time)
      3. Resolve category path → `moodleCategoryId` for each row via entity query (Program → Department → Semester → Campus chain)
      4. Flag rows where category doesn't exist in local DB
      5. Return `{ valid: PreviewRow[], skipped: SkippedRow[], errors: ParseError[] }`. Include a note in the response: `"shortnameNote": "EDP codes are examples. Final codes are generated at execution time."`
    - `ExecuteCourseSeeding(confirmedRows: ConfirmedCourseRow[]): Promise<ProvisionResult>`:
      - `ConfirmedCourseRow` contains: `courseCode`, `descriptiveTitle`, `program`, `semester`, `categoryId` (from preview resolution). The controller maps incoming `CoursePreviewRowDto[]` to `ConfirmedCourseRow[]`, dropping preview-only fields (example shortname, categoryPath string).
      1. **Regenerate EDP suffixes** — build fresh `MoodleCreateCourseInput[]` from confirmed rows, generating new random EDP codes for each shortname (preview codes are discarded). Reuse `categoryId` from preview (already resolved). This avoids TOCTOU race conditions on shortnames.
      2. Call `MoodleService.CreateCourses()` in batches (max 50 per call). **Per-batch error handling**: wrap each batch call in try-catch. On success, record all items as `created`. On failure (e.g., `shortnametaken`), record all items in that batch as `error` with the Moodle error message. Accumulate results across batches.
      3. Return `ProvisionResult` with per-item `details` array populated: each course shortname + status + moodleCourseId (if created) + error reason (if failed).
    - `PreviewQuickCourse(input: QuickCourseInput): CoursePreviewRow`:
      1. Apply transformation to single course input (generates example EDP)
      2. Resolve category ID
      3. Return preview (shortname, category path, dates). Shortname is an example.
    - `ExecuteQuickCourse(input: QuickCourseInput): Promise<ProvisionResult>`:
      1. Transform single course (fresh EDP generated). **Re-resolve category ID** from form inputs (campus, dept, program, semester, dates) — do not trust any client-supplied category ID. This avoids stale category references.
      2. Call `MoodleService.CreateCourses()` with single-item array
      3. Return result with per-item detail
    - `SeedUsers(input: SeedUsersInput): Promise<SeedUsersResult>`:
      1. Generate `input.count` fake users via `MoodleCourseTransformService.GenerateFakeUser()`. If a generated username collides (checked via `Set`), regenerate up to 3 times before marking as failed.
      2. Call `MoodleService.CreateUsers()` in batches (max 50 per call). **Per-batch error handling**: same pattern as course seeding — track created users (with Moodle user IDs) and failed users per batch.
      3. Build enrolments: each **successfully created** user × each target course, with roleid from env config.
      4. Call `MoodleService.EnrolUsers()` in batches. Handle null success response (see F5).
      5. Return `SeedUsersResult` with: `usersCreated`, `usersFailed`, `enrolmentsCreated`, per-user details, any warnings.

#### Layer 5: DTOs

- [ ] Task 10: Create request DTOs
  - File: NEW `src/modules/moodle/dto/requests/provision-categories.request.dto.ts`
  - Action: `ProvisionCategoriesRequestDto` with fields: `campuses: string[]`, `semesters: number[]` (1 and/or 2), `startDate: string` (ISO 8601 `YYYY-MM-DD`), `endDate: string` (ISO 8601 `YYYY-MM-DD`), `departments: { code: string, programs: string[] }[]`. Use **class-validator** decorators (consistent with existing DTOs in the codebase). Swagger decorators.
  - File: NEW `src/modules/moodle/dto/requests/seed-courses.request.dto.ts`
  - Action: `SeedCoursesContextDto` with fields: `campus: string`, `department: string`, `startDate: string` (ISO 8601), `endDate: string` (ISO 8601). Add cross-field validation: `startDate` must be before `endDate`. Used alongside file upload (multipart form body fields).
  - File: NEW `src/modules/moodle/dto/requests/quick-course.request.dto.ts`
  - Action: `QuickCourseRequestDto` with fields: `courseCode: string`, `descriptiveTitle: string`, `campus: string`, `department: string`, `program: string`, `semester: number`, `startDate: string` (ISO 8601), `endDate: string` (ISO 8601). Add cross-field validation: `startDate` must be before `endDate`.
  - File: NEW `src/modules/moodle/dto/requests/seed-users.request.dto.ts`
  - Action: `SeedUsersRequestDto` with fields: `count: number` (1-200), `role: 'student' | 'faculty'`, `campus: string`, `courseIds: number[]` (Moodle course IDs to enrol into, `@ArrayMinSize(1)` — at least one course required).

- [ ] Task 11: Create response DTOs
  - File: NEW `src/modules/moodle/dto/responses/provision-result.response.dto.ts`
  - Action: `ProvisionResultDto` with fields: `created: number`, `skipped: number`, `errors: number`, `details: { name: string, status: 'created' | 'skipped' | 'error', reason?: string, moodleId?: number }[]`, `durationMs: number`, `syncCompleted?: boolean` (only present on category provisioning responses).
  - File: NEW `src/modules/moodle/dto/responses/course-preview.response.dto.ts`
  - Action: `CoursePreviewResultDto` with: `valid: CoursePreviewRowDto[]` (shortname, fullname, categoryPath, categoryId, startDate, endDate, program, semester, courseCode), `skipped: SkippedRowDto[]` (row number, courseCode, reason), `errors: ParseErrorDto[]` (row number, message), `shortnameNote: string` ("EDP codes are examples. Final codes are generated at execution time.").
  - File: NEW `src/modules/moodle/dto/responses/seed-users-result.response.dto.ts`
  - Action: `SeedUsersResultDto` with: `usersCreated: number`, `usersFailed: number`, `enrolmentsCreated: number`, `warnings: string[]`, `durationMs: number`.

#### Layer 6: Controller & Module Wiring

- [ ] Task 12: Create provisioning controller
  - File: NEW `src/modules/moodle/controllers/moodle-provisioning.controller.ts`
  - Action: Create `MoodleProvisioningController` under `@Controller('moodle/provision')` with endpoints:
    - `POST /moodle/provision/categories` — `@UseJwtGuard(UserRole.SUPER_ADMIN)`. Body: `ProvisionCategoriesRequestDto`. Calls `ProvisioningService.ProvisionCategories()`. Returns `ProvisionResultDto`.
    - `POST /moodle/provision/courses/preview` — `@UseJwtGuard(UserRole.SUPER_ADMIN)`. Multipart: CSV file + `SeedCoursesContextDto` body fields. Uses `FileInterceptor('file', { fileFilter: csvFileFilter, limits: { fileSize: 2MB } })`. Calls `ProvisioningService.PreviewCourses()`. Returns `CoursePreviewResultDto`.
    - `POST /moodle/provision/courses/execute` — `@UseJwtGuard(UserRole.SUPER_ADMIN)`. Body: confirmed preview rows (array of `CoursePreviewRowDto`). Calls `ProvisioningService.ExecuteCourseSeeding()`. Returns `ProvisionResultDto`.
    - `POST /moodle/provision/courses/quick` — `@UseJwtGuard(UserRole.SUPER_ADMIN)`. Body: `QuickCourseRequestDto`. Calls `ProvisioningService.ExecuteQuickCourse()`. Returns `ProvisionResultDto`.
    - `POST /moodle/provision/courses/quick/preview` — `@UseJwtGuard(UserRole.SUPER_ADMIN)`. Body: `QuickCourseRequestDto`. Calls `ProvisioningService.PreviewQuickCourse()`. Returns single `CoursePreviewRowDto`. (Used for live preview in admin console.)
    - `POST /moodle/provision/users` — `@UseJwtGuard(UserRole.SUPER_ADMIN)`. Body: `SeedUsersRequestDto`. Calls `ProvisioningService.SeedUsers()`. Returns `SeedUsersResultDto`.
  - Notes: All endpoints require `SUPER_ADMIN` role. Add `@Audited()` decorator on execute endpoints (not preview). Add Swagger decorators on all endpoints and parameters.

- [ ] Task 13: Register in MoodleModule
  - File: `src/modules/moodle/moodle.module.ts`
  - Action:
    - Add to `providers`: `MoodleCourseTransformService`, `MoodleCsvParserService`, `MoodleProvisioningService`
    - Add to `controllers`: `MoodleProvisioningController`
    - Add `MoodleProvisioningService` to `exports` (optional, for potential use by other modules)

#### Layer 7: Testing

- [ ] Task 14: Unit tests for CSV parser
  - File: NEW `src/modules/moodle/services/moodle-csv-parser.service.spec.ts`
  - Action: Test:
    - Valid CSV with 4 required columns parses correctly
    - Extra columns are ignored
    - Missing required header throws descriptive error
    - Empty required fields flagged per row
    - Semester-0 rows flagged as warnings
    - Whitespace in headers is trimmed

- [ ] Task 15: Unit tests for provisioning service
  - File: NEW `src/modules/moodle/services/moodle-provisioning.service.spec.ts`
  - Action: Test with mocked `MoodleService`, `EntityManager`, `MoodleCourseTransformService`, `MoodleCsvParserService`, `MoodleCategorySyncService`:
    - Category provisioning: creates categories one depth level at a time (4 sequential calls), skips existing, triggers auto-sync after creation
    - Course preview: valid rows transformed, semester-0 flagged, missing category flagged, preview note present
    - Course execution: regenerates EDP suffixes (not reused from preview), batches calls in groups of 50, per-batch error handling populates details array
    - Quick course: single course transform + create
    - User seeding: generates correct count, handles username collisions with retry, enrols only successfully created users, handles null enrol response
    - Concurrency guard: second concurrent request throws ConflictException
    - Partial failure: batch 1 succeeds + batch 2 fails → response shows both created and failed items

- [ ] Task 16: Unit tests for provisioning controller
  - File: NEW `src/modules/moodle/controllers/moodle-provisioning.controller.spec.ts`
  - Action: Test endpoint routing, guard enforcement, DTO validation, file upload handling. Mock `MoodleProvisioningService`.

### Acceptance Criteria

#### Category Provisioning

- [ ] AC-1: Given valid campus/semester/dept/program inputs, when `POST /moodle/provision/categories` is called, then categories are created depth-first in Moodle and the response shows created count and names.
- [ ] AC-2: Given some categories already exist in Moodle, when provisioning the same tree, then existing categories are skipped and only missing nodes are created.
- [ ] AC-3: Given a campus code that does not match any existing top-level category in Moodle (checked via `GetCategories()` in step 1), when provisioning categories, then the campus is created as a new top-level category in Moodle (not rejected). Validation is limited to DTO format — the provisioning service creates whatever the admin requests.

#### Bulk Course Seeding

- [ ] AC-4: Given a valid curriculum CSV with `Course Code`, `Descriptive Title`, `Program`, `Semester` columns and valid form context (campus, dept, dates), when `POST /moodle/provision/courses/preview` is called, then a preview is returned with transformed shortnames, category paths, and dates for each valid row.
- [ ] AC-5: Given a CSV containing semester-0 rows (electives), when previewing, then those rows appear in the `skipped` array with reason "No semester assigned — use Quick Course Create".
- [ ] AC-6: Given a CSV with extra columns (units, prerequisites, type), when previewing, then extra columns are silently ignored and only required columns are processed.
- [ ] AC-7: Given a CSV with rows where the category path cannot be resolved (category doesn't exist in Moodle), when previewing, then those rows appear in `skipped` with reason "Category not found: {path}. Provision categories first."
- [ ] AC-8: Given confirmed preview rows, when `POST /moodle/provision/courses/execute` is called, then courses are created in Moodle and the response includes Moodle course IDs and shortnames.
- [ ] AC-9: Given duplicate course codes (e.g., `CS-EL` appearing 3 times), when previewing, then each gets a unique shortname (different EDP suffix) and all are included in the valid preview.
- [ ] AC-10: Given a file that is not CSV or exceeds 2MB, when uploading, then a 400 error is returned.

#### Quick Course Create

- [ ] AC-11: Given all required fields (course code, title, campus, dept, program, semester, dates), when `POST /moodle/provision/courses/quick/preview` is called, then the response includes the generated shortname, category path, and dates.
- [ ] AC-12: Given the same fields, when `POST /moodle/provision/courses/quick` is called, then the course is created in Moodle and the response includes the Moodle course ID.
- [ ] AC-13: Given a semester value that doesn't produce valid dates (not 1 or 2), when calling quick create, then a 400 error with descriptive message is returned.

#### User Seeding

- [ ] AC-14: Given count=10, role=student, campus=ucmn, and a list of Moodle course IDs, when `POST /moodle/provision/users` is called, then 10 fake users are created in Moodle with `ucmn-{date-based}` usernames and enrolled into all specified courses with student role.
- [ ] AC-15: Given role=faculty, when seeding users, then usernames follow the `{campus}-t-{5digits}` pattern and enrolments use `editingteacher` role (roleid=3).
- [ ] AC-16: Given count exceeds 200, when seeding users, then a 400 validation error is returned.

#### Cross-Cutting

- [ ] AC-17: Given a non-SUPER_ADMIN user, when calling any provisioning endpoint, then a 403 Forbidden response is returned.
- [ ] AC-18: Given the Moodle instance is unreachable, when any provisioning endpoint is called, then a `MoodleConnectivityError` is raised and returned as a clear error response.
- [ ] AC-19: Given a batch of 80 courses where batch 2 (items 51-80) fails due to a Moodle error, when executing course seeding, then the response reports items 1-50 as `created` with their Moodle IDs and items 51-80 as `error` with the failure reason. The admin knows exactly what succeeded and what didn't.
- [ ] AC-20: Given a provisioning operation is already in progress (e.g., courses being seeded), when another admin hits the same execute endpoint, then a 409 Conflict response is returned.
- [ ] AC-21: Given category provisioning completes successfully, when the response is returned, then the local entities (Campus, Semester, Department, Program) are already populated with `moodleCategoryId` values (auto-sync completed). The admin can proceed directly to course seeding without manual sync.
- [ ] AC-22: Given category provisioning creates categories in Moodle but `SyncAndRebuildHierarchy()` fails, when the response is returned, then the response includes `syncCompleted: false` and a warning: "Categories created in Moodle but local sync failed. Trigger a manual sync before seeding courses." The Moodle-side creation is not rolled back.
- [ ] AC-23: Given a request with `startDate` after `endDate`, when calling any provisioning endpoint that accepts dates, then a 400 validation error is returned.
- [ ] AC-24: Given a CSV with headers but zero data rows, when calling the preview endpoint, then a 200 response is returned with `valid: [], skipped: [], errors: []`. This is not an error — just nothing to process.
- [ ] AC-25: Given `courseIds: []` (empty array) in the seed users request, when calling `POST /moodle/provision/users`, then a 400 validation error is returned ("At least one course ID is required").

## Admin Console Implementation

**Project:** `admin.faculytics` (React 19, Vite 8, Tailwind 4, shadcn/ui, TanStack React Query, Zustand, native `fetch`)

### Admin Console Context

- **API client**: `apiClient<T>(path, options)` in `src/lib/api-client.ts` — native `fetch` wrapper with Bearer token injection and silent 401 refresh. **Important for file uploads**: `apiClient` auto-sets `Content-Type: application/json` when body is present. For `FormData` bodies (CSV upload), the auto Content-Type must be skipped so the browser sets the multipart boundary. **Check `apiClient` implementation**: if it always sets `Content-Type`, add a guard: `if (!(options.body instanceof FormData))` before setting the header. If it only sets Content-Type for string bodies, it already works. Document which case applies and patch if needed (Task 18a).
- **React Query**: `useQuery` for reads, `useMutation` for writes. Hooks live alongside feature components.
- **Forms**: Simple `useState` — no react-hook-form or Zod. Controlled inputs with shadcn/ui components.
- **Feature folder pattern**: `src/features/moodle-provision/` with hooks, components, and the page.
- **Routing**: React Router v7 in `src/routes.tsx`. Protected routes inside `AuthGuard` children.
- **Navigation**: `navItems` array in `src/components/layout/app-shell.tsx`.
- **Types**: All API DTOs in `src/types/api.ts`.
- **Pattern reference**: `src/features/moodle-sync/` (sync dashboard) and `src/features/submission-generator/` (multi-step form with preview → confirm).
- **Toast notifications**: `toast` from `sonner` for success/error feedback.

### Admin Console Files to Reference

| File                                                             | Purpose                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/api-client.ts`                                          | Fetch wrapper — understand auth injection and Content-Type behavior |
| `src/routes.tsx`                                                 | Add new route here                                                  |
| `src/components/layout/app-shell.tsx`                            | Add nav item to `navItems` array                                    |
| `src/types/api.ts`                                               | Add provisioning response/request types here                        |
| `src/features/moodle-sync/sync-dashboard.tsx`                    | Pattern reference: Moodle feature page layout                       |
| `src/features/moodle-sync/use-trigger-sync.ts`                   | Pattern reference: useMutation with toast + error handling          |
| `src/features/submission-generator/generator-page.tsx`           | Pattern reference: multi-step form (selection → preview → commit)   |
| `src/features/submission-generator/components/preview-panel.tsx` | Pattern reference: preview table with confirm button                |

### Admin Console Tasks

#### Layer 8: Types & API Hooks

- [ ] Task 17: Add provisioning types to admin console
  - File: `admin.faculytics/src/types/api.ts`
  - Action: Add TypeScript types mirroring the API response/request DTOs exactly:
    - `ProvisionCategoriesRequest { campuses: string[], semesters: number[], startDate: string, endDate: string, departments: { code: string, programs: string[] }[] }`
    - `ProvisionResultResponse { created: number, skipped: number, errors: number, details: ProvisionDetailItem[], durationMs: number, syncCompleted?: boolean }`
    - `ProvisionDetailItem { name: string, status: 'created' | 'skipped' | 'error', reason?: string, moodleId?: number }`
    - `SeedCoursesContext { campus: string, department: string, startDate: string, endDate: string }`
    - `CoursePreviewResponse { valid: CoursePreviewRow[], skipped: SkippedRow[], errors: ParseError[], shortnameNote: string }`
    - `CoursePreviewRow { shortname: string, fullname: string, categoryPath: string, categoryId: number, startDate: string, endDate: string, program: string, semester: string, courseCode: string }`
    - `SkippedRow { rowNumber: number, courseCode: string, reason: string }`
    - `ParseError { rowNumber: number, message: string }`
    - `ExecuteCoursesRequest { rows: ConfirmedCourseRow[] }` — sent to the execute endpoint
    - `ConfirmedCourseRow { courseCode: string, descriptiveTitle: string, program: string, semester: string, categoryId: number }` — subset of `CoursePreviewRow`, minus preview-only fields (shortname, categoryPath, dates). The admin frontend maps checked `CoursePreviewRow` objects to `ConfirmedCourseRow` by picking these 5 fields.
    - `QuickCourseRequest { courseCode: string, descriptiveTitle: string, campus: string, department: string, program: string, semester: number, startDate: string, endDate: string }`
    - `SeedUsersRequest { count: number, role: 'student' | 'faculty', campus: string, courseIds: number[] }`
    - `SeedUsersResponse { usersCreated: number, usersFailed: number, enrolmentsCreated: number, warnings: string[], durationMs: number }`

- [ ] Task 18: Create React Query hooks
  - File: NEW `admin.faculytics/src/features/moodle-provision/use-provision-categories.ts`
  - Action: `useMutation` calling `POST /moodle/provision/categories`. On success: `toast.success()`, invalidate relevant queries. On 409: `toast.error('Operation already in progress')`.
- [ ] Task 18a: Patch apiClient for FormData support (if needed)
  - File: `admin.faculytics/src/lib/api-client.ts`
  - Action: Check how `apiClient` sets `Content-Type`. If it unconditionally sets `application/json` when body is present, add a guard: `if (options.body && !(options.body instanceof FormData)) { headers['Content-Type'] = 'application/json' }`. This lets the browser set the multipart boundary for FormData bodies automatically. If it already only sets Content-Type for string bodies, no change needed — just document this in a comment.

  - File: NEW `admin.faculytics/src/features/moodle-provision/use-preview-courses.ts`
  - Action: `useMutation` calling `POST /moodle/provision/courses/preview`. Must send `FormData` (file + context fields). The `apiClient` (patched in Task 18a) will not set Content-Type for FormData bodies. Example:
    ```
    const formData = new FormData()
    formData.append('file', csvFile)
    formData.append('campus', context.campus)
    formData.append('department', context.department)
    formData.append('startDate', context.startDate)
    formData.append('endDate', context.endDate)
    return apiClient<CoursePreviewResponse>('/moodle/provision/courses/preview', {
      method: 'POST',
      body: formData,
    })
    ```
  - File: NEW `admin.faculytics/src/features/moodle-provision/use-execute-courses.ts`
  - Action: `useMutation` calling `POST /moodle/provision/courses/execute` with `ExecuteCoursesRequest` body. The component maps checked `CoursePreviewRow[]` to `ConfirmedCourseRow[]` by picking `{ courseCode, descriptiveTitle, program, semester, categoryId }` from each row. The preview-only fields (shortname, categoryPath, dates) are discarded.
  - File: NEW `admin.faculytics/src/features/moodle-provision/use-quick-course.ts`
  - Action: Two hooks in one file:
    - `useQuickCoursePreview()` — `useMutation` calling `POST /moodle/provision/courses/quick/preview`. The component debounces by holding form values in a debounced state (300ms) and calling `mutation.mutate(debouncedValues)` in a `useEffect` when all required fields are filled. Pattern:
      ```
      const [debounced] = useDebouncedValue(formValues, 300)
      const preview = useQuickCoursePreview()
      useEffect(() => {
        if (allFieldsFilled(debounced)) preview.mutate(debounced)
      }, [debounced])
      // preview.data holds the current preview result
      ```
      Implement `useDebouncedValue` as a small utility hook (useState + useEffect with setTimeout/clearTimeout) in the same file or in `src/lib/utils.ts`.
    - `useQuickCourseCreate()` — `useMutation` calling `POST /moodle/provision/courses/quick`.
  - File: NEW `admin.faculytics/src/features/moodle-provision/use-seed-users.ts`
  - Action: `useMutation` calling `POST /moodle/provision/users`.

#### Layer 9: Shared Components

- [ ] Task 19: Create CSV drop zone component
  - File: NEW `admin.faculytics/src/features/moodle-provision/components/csv-drop-zone.tsx`
  - Action: Reusable file upload component that:
    - Accepts drag-and-drop or click-to-browse
    - Filters to `.csv` files only
    - Shows selected filename + size
    - Has a "Remove" button to clear selection
    - Passes `File` object to parent via `onFileSelect(file: File | null)` callback
    - Uses shadcn/ui `Button` and basic Tailwind styling (dashed border drop area)
  - Notes: Keep it simple — no progress bars (file is sent in one shot). Style with Tailwind dashed border, upload icon, drag-over highlight.

- [ ] Task 20: Create provision result dialog
  - File: NEW `admin.faculytics/src/features/moodle-provision/components/provision-result-dialog.tsx`
  - Action: Shared dialog for showing operation results. Props: `result: ProvisionResultResponse`, `open`, `onClose`. Shows:
    - Summary: "{created} created, {skipped} skipped, {errors} errors" with color badges
    - Duration: "Completed in {durationMs}ms"
    - Details table: scrollable list of per-item results (name, status badge, reason if error)
    - If `syncCompleted === false`: warning alert "Local sync failed. Trigger manual sync."
    - Close button
  - Uses shadcn/ui `Dialog`, `Table`, `Badge`, `Alert`.

#### Layer 10: Tab Components

- [ ] Task 21: Create Categories tab
  - File: NEW `admin.faculytics/src/features/moodle-provision/components/categories-tab.tsx`
  - Action: Form with:
    - Campus multi-select (checkboxes for known campuses). Define `CAMPUSES = ['UCMN', 'UCLM', 'UCB', 'UCMETC', 'UCPT']` as a constant in `admin.faculytics/src/lib/constants.ts` — these are institutional constants. Add a comment: `// Update when new campuses are added to the institution`.
    - Semester checkboxes (1, 2)
    - Start date + end date inputs (ISO 8601, with validation that start < end)
    - Department + program builder: a list where admin adds department codes, and under each adds program codes. Use a simple input + "Add" button pattern with removable chips/tags.
    - "Provision" button — calls `useProvisionCategories` mutation. Button shows loading spinner and is disabled during mutation.
    - Shows `ProvisionResultDialog` on completion
    - **On result dialog close**: reset form to initial state (all selections cleared)
  - Notes: Follow the Submission Generator's selection → confirm pattern. No preview table needed — the form inputs are explicit enough.

- [ ] Task 22: Create Courses Bulk tab
  - File: NEW `admin.faculytics/src/features/moodle-provision/components/courses-bulk-tab.tsx`
  - Action: Two-step flow:
    - **Step 1 (Upload + Preview)**: Context form (campus, department, start date, end date) + `CsvDropZone`. "Preview" button calls `usePreviewCourses` mutation. On success, show preview results.
    - **Step 2 (Review + Confirm)**: Show `shortnameNote` banner. Split display:
      - Green table: valid rows (shortname, fullname, categoryPath, dates). Each row has a checkbox (all selected by default). Admin can deselect rows.
      - Yellow section: skipped rows with reasons
      - Red section: parse errors with row numbers
      - "Create {n} Courses" button — sends only checked valid rows to `useExecuteCourses` mutation
      - Shows `ProvisionResultDialog` on completion
  - **Interaction states**:
    - "Preview" button disabled if any required field is empty or no file selected. Shows loading spinner during mutation.
    - On preview mutation error (400 — invalid file, bad headers): stay on Step 1, show toast error with the API error message. Do NOT transition to Step 2.
    - "Create N Courses" button disabled during execution. Shows loading spinner.
    - Tab navigation disabled during in-flight mutations (prevent abandonment).
    - **On result dialog close**: reset to Step 1 (clear form, clear file, clear preview data).
  - Notes: Use shadcn/ui `Table`, `Checkbox`, `Badge`. Back button to return to Step 1.

- [ ] Task 23: Create Quick Course tab
  - File: NEW `admin.faculytics/src/features/moodle-provision/components/quick-course-tab.tsx`
  - Action: Single form with live preview:
    - Fields: courseCode, descriptiveTitle, campus (select), department (input), program (input), semester (select: 1 or 2), startDate, endDate
    - **Live preview card** below the form: shows generated shortname, category path, start/end dates. Updates automatically as fields change (debounced via `useQuickCoursePreview` hook). Shows loading spinner while fetching. Shows nothing if required fields are incomplete.
    - **Preview card states**: Loading spinner while fetching. Empty if required fields incomplete. On error (e.g., category not found): show red inline error message in the preview card (NOT a toast — the admin is watching the card). On success: show shortname, categoryPath, dates.
    - "Create Course" button — calls `useQuickCourseCreate` mutation. Disabled until all fields filled and preview is successful. Shows loading spinner during mutation.
    - Shows `ProvisionResultDialog` on completion
    - **On result dialog close**: keep form filled (admin may want to create another similar course). Only the result dialog closes.
  - Notes: Preview card uses shadcn/ui `Card` with monospace font for shortname.

- [ ] Task 24: Create Seed Users tab
  - File: NEW `admin.faculytics/src/features/moodle-provision/components/seed-users-tab.tsx`
  - Action: Form with:
    - Count: number input (1-200)
    - Role: toggle or select (Student / Faculty)
    - Campus: select dropdown
    - Course IDs: text input where admin enters comma-separated Moodle course IDs. **Parsing logic**: trim whitespace around commas, filter empty strings, parse each to `parseInt()`, reject `NaN` values, deduplicate. Show inline validation error below the input if any value is non-numeric (e.g., "Invalid course ID: 'abc'"). Validate at least one valid ID present.
    - "Generate & Enrol" button — calls `useSeedUsers` mutation. Show confirmation dialog before executing ("Generate {count} {role} users and enrol into {n} courses?"). Button disabled during mutation, shows loading spinner.
    - Shows result: users created, users failed, enrolments created, any warnings
    - **On result dialog close**: clear form to initial state
  - Notes: Use shadcn/ui `Input`, `Select`, `AlertDialog` for confirmation. Future improvement: replace manual course ID input with a course selector dropdown (out of scope per spec).

#### Layer 11: Page & Routing

- [ ] Task 25: Create provision page with tabs
  - File: NEW `admin.faculytics/src/features/moodle-provision/provision-page.tsx`
  - Action: Page component with:
    - Page title: "Moodle Provisioning"
    - Tabbed layout using shadcn/ui `Tabs` (add via `bunx shadcn add tabs` if not installed)
    - 4 tabs: Categories, Courses (Bulk), Quick Course, Seed Users
    - Each tab renders its respective component
    - Default tab: Categories (first step in the workflow)

- [ ] Task 26: Add route and navigation
  - File: `admin.faculytics/src/routes.tsx`
  - Action: Add `{ path: '/moodle-provision', element: <ProvisionPage /> }` inside AuthGuard children, after the `/sync` route.
  - File: `admin.faculytics/src/components/layout/app-shell.tsx`
  - Action: Add to `navItems` array: `{ to: '/moodle-provision', label: 'Moodle Provision', icon: Hammer }` (or `Wrench`, `Database` — pick an appropriate lucide icon). Place it after "Moodle Sync" in the nav order.

### Admin Console Acceptance Criteria

#### Navigation & Layout

- [ ] AC-26: Given an authenticated SUPER_ADMIN, when viewing the sidebar, then "Moodle Provision" appears as a nav item below "Moodle Sync" and navigating to it shows a tabbed page with 4 tabs.

#### Categories Tab

- [ ] AC-27: Given the admin selects campuses, semesters, dates, and adds departments with programs, when clicking "Provision", then the API is called and a result dialog shows created/skipped counts per category.
- [ ] AC-28: Given the result includes `syncCompleted: false`, when the result dialog is shown, then a warning alert is displayed about manual sync needed.

#### Courses Bulk Tab

- [ ] AC-29: Given the admin fills context fields and uploads a CSV, when clicking "Preview", then a split table shows valid rows (green), skipped rows (yellow with reason), and errors (red with row number).
- [ ] AC-30: Given a preview with valid rows, when the admin deselects some rows and clicks "Create", then only the checked rows are sent to the execute endpoint.
- [ ] AC-31: Given the preview response, then a `shortnameNote` banner is displayed above the table explaining that EDP codes are examples.

#### Quick Course Tab

- [ ] AC-32: Given the admin fills all required fields, when typing, then a live preview card shows the generated shortname and category path (debounced, updates automatically).
- [ ] AC-33: Given the admin clicks "Create Course", when the API returns success, then a result dialog shows the created course with its Moodle ID.

#### Seed Users Tab

- [ ] AC-34: Given the admin enters count, role, campus, and course IDs, when clicking "Generate & Enrol", then a confirmation dialog appears before executing.
- [ ] AC-35: Given the operation completes, when the result is shown, then it displays users created, enrolments created, and any warnings.

#### Error Handling

- [ ] AC-36: Given a 409 Conflict response (operation in progress), when any execute button is clicked, then a toast error "A provisioning operation is already in progress" is shown.
- [ ] AC-37: Given a Moodle connectivity error, when any operation fails, then a toast error with the failure message is shown.

## Additional Context

### Dependencies

- **`@faker-js/faker`**: Install as a **regular dependency** (not devDependency — needed at runtime for user seeding in all environments). Used for generating realistic first/last names and emails.
- **New env vars** (add to Zod env schema with defaults):
  - `MOODLE_ROLE_ID_STUDENT` (default: `5`) — Moodle role ID for student enrolment
  - `MOODLE_ROLE_ID_EDITING_TEACHER` (default: `3`) — Moodle role ID for faculty enrolment
- **Moodle web service capabilities**: The `MOODLE_MASTER_KEY` token must have write capabilities enabled: `moodle/course:create`, `moodle/user:create`, `enrol/manual:enrol`, `moodle/category:manage`. This is a Moodle admin configuration step, not a code change.
- **Existing local entities**: The `ProvisionCategories` endpoint **auto-syncs** local entities after creating categories in Moodle (calls `MoodleCategorySyncService.SyncAndRebuildHierarchy()`). No manual sync step needed. Course seeding preview depends on these local entities existing (for category path → ID resolution). Order of operations: provision categories → (auto-sync happens) → seed courses.
- **No new database migrations**: This feature only writes to Moodle via REST API. No new local entities or DB schema changes needed.

### Testing Strategy

- **Unit tests** (primary): All three new services (`MoodleCourseTransformService`, `MoodleCsvParserService`, `MoodleProvisioningService`) and the controller get co-located `.spec.ts` files. Mock `MoodleService` and `EntityManager` — never hit real Moodle in unit tests.
- **Manual integration testing**: After implementation, manually test against the real Moodle instance:
  1. Provision a small category tree (1 campus × 1 semester × 1 dept × 1 program)
  2. Upload a curriculum CSV with 5 courses and verify preview
  3. Execute and verify courses appear in Moodle
  4. Quick-create an elective course
  5. Seed 5 students, verify they appear enrolled in Moodle
- **No E2E tests**: Moodle dependency makes E2E unreliable. Unit test coverage + manual verification is sufficient.

### Notes

- **Batch size**: Define a named constant `MOODLE_PROVISION_BATCH_SIZE = 50` in `provisioning.types.ts`. All batch operations reference this constant. Adjust if the Moodle instance rejects larger batches.
- **Idempotency**: Course creation is NOT idempotent — Moodle will reject duplicate shortnames. The random EDP suffix makes collisions very unlikely (1 in 100,000), but the API handles `MoodleException` with `shortnametaken` gracefully via per-batch error catching and reports which courses failed in the `details` array.
- **Preview vs. execution shortnames**: Preview generates example EDP codes for display purposes. Execution regenerates fresh EDP codes. The admin is warned in the preview response that final shortnames will differ slightly.
- **Username collision handling**: Student usernames use zero-padded date + 4 random digits (10,000 combinations per day). For large seeding runs (>100 on same day), collisions are possible. The service retries generation up to 3 times per user on collision.
- **Future consideration**: If the admin console needs to show available courses for user enrollment (in the Seed Users form), a `GET /moodle/provision/courses` endpoint that lists recently-created courses could be useful. Out of scope for now — the admin can get course IDs from the course seeding response.
- **Concurrency guard limitation**: The in-memory `Set<string>` guard assumes a single API instance. If the API runs behind a load balancer with multiple instances, the guard is ineffective. This is acceptable for a seeding tool used by 1-2 super admins. The guard auto-clears on process restart.
- **Rust script retirement**: Once this feature is stable, `script.csv.faculytics` can be archived. The API fully replaces its functionality with better validation and error reporting.
