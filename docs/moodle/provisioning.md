# Moodle Provisioning & Seeding Toolkit

The Moodle provisioning API (introduced in FAC-116, extended by FAC-117, FAC-119, FAC-120, FAC-121) lets super admins seed and inspect a live Moodle instance from the API. It replaces a previous external Rust CLI workflow and is used by the admin console for one-off course creation, bulk course provisioning, and test-environment bootstrapping.

All endpoints are mounted on `MoodleProvisioningController` under `/moodle/provision` and require the `SUPER_ADMIN` role. Write endpoints emit audit events — see [Audit Trail action codes](../architecture/audit-trail.md#action-codes).

## Write Endpoints

| Method | Path                                      | Purpose                                                 | Audit action                    |
| ------ | ----------------------------------------- | ------------------------------------------------------- | ------------------------------- |
| POST   | `/moodle/provision/categories/preview`    | Dry-run a category hierarchy plan                       | —                               |
| POST   | `/moodle/provision/categories`            | Provision campus → semester → department → program tree | `moodle.provision.categories`   |
| POST   | `/moodle/provision/courses/preview`       | Multipart CSV preview (≤ 2 MB, `.csv` only)             | —                               |
| POST   | `/moodle/provision/courses/execute`       | Execute bulk course creation from preview rows          | `moodle.provision.courses`      |
| POST   | `/moodle/provision/courses/bulk/preview`  | JSON bulk course preview (cascading selectors)          | —                               |
| POST   | `/moodle/provision/courses/bulk/execute`  | JSON bulk course execute                                | `moodle.provision.bulk-courses` |
| POST   | `/moodle/provision/courses/quick/preview` | Single course preview                                   | —                               |
| POST   | `/moodle/provision/courses/quick`         | Create a single course                                  | `moodle.provision.quick-course` |
| POST   | `/moodle/provision/users`                 | Generate fake users and enrol them                      | `moodle.provision.users`        |

### Category Provisioning

`ProvisionCategoriesRequestDto` models the hierarchy to build:

- `campuses: string[]`
- `semesters: number[]` — each entry must be `1` or `2`
- `startDate`, `endDate` — ISO 8601; `startDate` must precede `endDate` (enforced by the custom `IsBeforeEndDate` validator)
- `departments: { code, programs: string[] }[]`

The preview endpoint walks the hierarchy against a live Moodle fetch (`GetCategoriesWithMasterKey`), marking each campus / semester tag / department / program node as `created` or `skipped`. Both endpoints share an error pipeline in `handleCategoryOperation()`:

| Condition                                        | Status                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| `MoodleConnectivityError`                        | `502 Bad Gateway`                                |
| Error message starting with `"Invalid semester"` | `400 Bad Request`                                |
| Any other unexpected error                       | `503 Service Unavailable` (with operation label) |

**Semester code derivation.** Each semester row is tagged via `ComputeSchoolYears(semester, startDate, endDate)` inside `MoodleCourseTransformService`. If `startYear !== endYear`, the spanned years are used directly (`S1{startYY}{endYY}` / `S2{startYY}{endYY}`). If both dates fall in the same calendar year, semester 1 implies `(year, year+1)` (starts in August) and semester 2 implies `(year-1, year)` (starts in January). The helper is called once **per semester iteration** — not once for the whole range — because a single start/end range covers different school years per semester (a common bug prior to FAC-119 produced tags like `S22626` for S2 ranges).

### Bulk Course Provisioning (JSON flow)

Introduced in FAC-120 and now the preferred flow for admin-console bulk creation. Replaces (but does not delete) the earlier CSV upload path.

**Request shape:**

```ts
BulkCoursePreviewRequestDto {
  semesterId: UUID,
  departmentId: UUID,
  programId: UUID,
  startDate: ISO,
  endDate: ISO,   // must satisfy IsBeforeEndDate
  courses: CourseEntryDto[]  // non-empty, ≤ 500 entries
}

BulkCourseExecuteRequestDto {
  // same header fields
  courses: ConfirmedCourseEntryDto[]  // each row echoed back from the preview, with categoryId
}
```

`MoodleProvisioningService.PreviewBulkCourses` enforces four server-side invariants against the `Program → Department → Semester → Campus` chain:

1. `program.department.id === departmentId`
2. `program.department.semester.id === semesterId`
3. Semester `code` matches `^S([12])(\d{2})(\d{2})$`
4. `program.moodleCategoryId` is not null (categories must have been provisioned first)

Plus a batch-level check: duplicate `courseCode` entries in the same request fail preview with 400.

`categoryId` is **derived server-side** from `program.moodleCategoryId` and echoed to the client in the preview response. The execute endpoint re-validates the chain and re-derives the category — clients cannot forge a categoryId in the execute call. Execute takes a provisioning guard lock only after validation passes; bulk create calls are batched in groups of `MOODLE_PROVISION_BATCH_SIZE` (= 50), wrapping `MoodleConnectivityError` to `502` at the controller layer.

### CSV Course Flow (legacy)

The multipart upload path (`/courses/preview` + `/courses/execute`) predates the JSON flow and is kept for backfill scenarios. It expects a CSV body plus a `SeedCoursesContextDto { campus, department, startDate, endDate }`, derives `startYear/endYear/startYY/endYY` from the context via `buildSeedContext`, and returns a `CoursePreviewResultDto { valid, skipped, errors, shortnameNote }`. The response note literally reads `"EDP codes are examples. Final codes are generated at execution time."` because shortnames are recomputed at execute time from the program code and the final school year.

### Seeded Users

`POST /moodle/provision/users` generates fake users and enrols them:

```ts
SeedUsersRequestDto {
  count: 1..200,
  role: 'student' | 'faculty',
  campus: string,
  courseIds: number[]  // non-empty
}
```

Resolves the Moodle role ID from two new env vars (see below) before enrolling. Returns `SeedUsersResultDto { usersCreated, usersFailed, enrolmentsCreated, warnings[], durationMs }`.

## Live Moodle Inspection (read-only)

Introduced in FAC-117. These endpoints do not write to either database and carry no audit decorator — their purpose is to let the admin console show live Moodle state before dispatching a provisioning call.

| Method | Path                                         | Purpose                                       |
| ------ | -------------------------------------------- | --------------------------------------------- |
| GET    | `/moodle/provision/tree`                     | Recursive Moodle category tree                |
| GET    | `/moodle/provision/tree/:categoryId/courses` | Live Moodle courses under a category (id ≥ 1) |

Both endpoints catch `MoodleConnectivityError` and re-throw as `BadGatewayException('Moodle is unreachable')`; any other failure becomes `ServiceUnavailableException`. The distinction lets the admin UI show different retry affordances for "Moodle is down" vs. "something else went wrong".

**Response shapes:**

```ts
MoodleCategoryTreeResponseDto {
  tree: MoodleCategoryTreeNodeDto[],   // recursive { id, name, depth, coursecount, visible, children[] }
  fetchedAt: string,                    // ISO
  totalCategories: number,
}

MoodleCategoryCoursesResponseDto {
  categoryId: number,
  courses: MoodleCoursePreviewDto[],    // { id, shortname, fullname, enrolledusercount?, visible, startdate, enddate }
}
```

## Admin Filter Cascade

The bulk course flow relies on cascading selectors powered by `AdminFiltersController`:

| Method | Path                         | Change                                                                                                                                                           |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/filters/semesters`   | **New** (FAC-120). Returns `{ id, code, label, academicYear, campusCode, startDate, endDate }[]` — dates are computed from the semester code, not stored columns |
| GET    | `/admin/filters/departments` | Now accepts an optional `semesterId` query param (in addition to `campusId`)                                                                                     |
| GET    | `/admin/filters/programs`    | Response element changed (FAC-121) from the shared `FilterOptionResponseDto` to `ProgramFilterOptionResponseDto { id, code, name?, moodleCategoryId }`           |

Embedding `moodleCategoryId` directly in the program filter response lets the frontend chain `/admin/filters/programs` → `/moodle/provision/tree/:categoryId/courses` without an extra round-trip, and lets the bulk preview/execute endpoints resolve the Moodle category server-side from the selected program UUID.

## Environment Variables

| Variable                         | Default | Purpose                                            |
| -------------------------------- | ------- | -------------------------------------------------- |
| `MOODLE_ROLE_ID_STUDENT`         | `5`     | Moodle role ID used when enrolling seeded students |
| `MOODLE_ROLE_ID_EDITING_TEACHER` | `3`     | Moodle role ID used when enrolling seeded faculty  |

`MOODLE_PROVISION_BATCH_SIZE` (compile-time constant, currently `50`) governs how many course-create calls are issued per batch — tuned to avoid Moodle REST rate limits.

## Error Hints

`MoodleClient` surfaces an explicit hint when the Moodle REST response carries `exception === 'webservice_access_exception'`:

> _"<original message>. Ensure the wsfunction is added to your Moodle external service (Site admin > Server > External services)."_

This typically fires the first time a new Moodle instance is pointed at the API and a required `wsfunction` has not been whitelisted.
