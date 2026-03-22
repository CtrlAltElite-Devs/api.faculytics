---
title: 'FAC-58 feat: add submission count query endpoint'
slug: 'submission-count-query-endpoint'
created: '2026-03-19'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [NestJS v11, MikroORM v6.6, PostgreSQL, Jest v30, class-validator, Swagger]
files_to_modify: [src/modules/faculty/faculty.controller.ts, src/modules/faculty/services/faculty.service.ts, src/modules/faculty/faculty.module.ts, src/modules/faculty/dto/requests/get-submission-count-query.dto.ts (new), src/modules/faculty/dto/responses/submission-count.response.dto.ts (new), src/modules/faculty/services/faculty.service.spec.ts]
code_patterns: [PascalCase public methods, @UseJwtGuard decorator for auth+role, class-validator DTOs, em.count for filtered counts, global soft-delete filter (auto-applied), NotFoundException for missing entities, Swagger decorators on all endpoints/DTOs]
test_patterns: [Jest mocks via NestJS TestingModule, .spec.ts colocated with source, mock EntityManager with jest.fn(), mock ScopeResolverService]
---

# Tech-Spec: FAC-58 feat: add submission count query endpoint

**Created:** 2026-03-19

## Overview

### Problem Statement

The frontend faculty cards need a submission count per faculty member. The scoped faculty list endpoint (FAC-53) explicitly deferred this as a separate query because it hits the `questionnaire_submission` table — a heavier analytics query that doesn't belong in the faculty listing pipeline.

### Solution

A per-card GET endpoint that returns the submission count for a single faculty in a given semester. Simple contract, individually cacheable, fits the React component-per-card pattern naturally with TanStack Query.

### Scope

**In Scope:**

- `GET /faculty/:facultyId/submission-count?semesterId=X`
- Auth: `DEAN`, `SUPER_ADMIN` roles only via `@UseJwtGuard()`
- Response: `{ count: number }` — returns `0` for a valid faculty with no submissions
- UUID validation on `facultyId` path param and `semesterId` query param
- Faculty existence validation — return 404 if `facultyId` does not correspond to an existing user
- Semester existence validation — return 404 if `semesterId` does not exist
- Count query must respect soft-delete filter (`deleted_at IS NULL`) on submissions
- Leverages existing `[faculty, semester]` composite index on `questionnaire_submission`

**Out of Scope:**

- Bulk endpoint (future optimization if N+1 becomes a bottleneck)
- Questionnaire version filtering
- FACULTY self-view (separate user story)
- Per-course breakdown

## Context for Development

### Codebase Patterns

- Faculty controller/service pattern established in FAC-53 (`src/modules/faculty/`)
- Controller-level `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN)` applies to all routes in the controller
- `@UseInterceptors(CurrentUserInterceptor)` is already on the controller (provides `cls.get('user')`)
- Public service methods use `PascalCase` (e.g., `ListFaculty`)
- Semester validation pattern: `em.findOne(Semester, { id })` → throw `NotFoundException` if null
- MikroORM global soft-delete filter (`{ deletedAt: null, default: true }`) in `mikro-orm.config.ts` — auto-applied on `em.count()`, `em.find()`, etc.
- `QuestionnaireSubmission` entity has `[faculty, semester]` composite index — `em.count()` with `{ faculty, semester }` filter hits this index directly
- `QuestionnaireSubmissionRepository` is empty — use `em.count(QuestionnaireSubmission, ...)` directly
- DTOs use `class-validator` for validation and `@nestjs/swagger` decorators for docs
- Request DTOs in `dto/requests/`, response DTOs in `dto/responses/`

### Files to Reference

| File                                                             | Purpose                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/modules/faculty/faculty.controller.ts`                      | Add new `GET /:facultyId/submission-count` route                 |
| `src/modules/faculty/services/faculty.service.ts`                | Add `GetSubmissionCount()` method                                |
| `src/modules/faculty/faculty.module.ts`                          | Add `QuestionnaireSubmission` to `MikroOrmModule.forFeature()`   |
| `src/modules/faculty/dto/requests/list-faculty-query.dto.ts`     | Reference for DTO patterns (class-validator + Swagger)           |
| `src/modules/faculty/dto/responses/faculty-card.response.dto.ts` | Reference for response DTO patterns                              |
| `src/modules/faculty/services/faculty.service.spec.ts`           | Add test cases for `GetSubmissionCount()`                        |
| `src/entities/questionnaire-submission.entity.ts`                | Entity with `faculty` + `semester` relations and composite index |
| `src/entities/base.entity.ts`                                    | `CustomBaseEntity` with soft-delete (`deletedAt`)                |
| `mikro-orm.config.ts`                                            | Global soft-delete filter config (auto-applied)                  |
| `src/security/decorators/index.ts`                               | `UseJwtGuard` decorator implementation                           |

### Technical Decisions

- **GET over POST**: This is a read operation. GET is semantically correct, cacheable, and avoids the anti-pattern of POST-for-reads.
- **Per-card over bulk**: Simpler contract (no array parsing/validation), individually cacheable, matches the React component-per-card pattern. TanStack Query handles parallel fetches with deduplication. Realistic page sizes (10-20 faculty) won't cause performance issues.
- **Role guard only, no scope re-derivation**: The faculty IDs are already scoped by the `GET /faculty` endpoint. Re-checking department scope per count request is wasteful. Role guard (`DEAN`, `SUPER_ADMIN`) is sufficient. Full department-level scope enforcement is deferred to the future bulk endpoint where it will be natural to implement.
- **Simple User existence check**: Validate `facultyId` exists via `em.findOne(User, { id })`. A non-faculty UUID (e.g., student) will return `{ count: 0 }` — this is acceptable because the frontend only supplies faculty IDs from the scoped `GET /faculty` response. An enrollment-based check was considered but rejected because: (a) `Enrollment` has no direct `semester` relation (requires a 4-table deep join), (b) it doesn't solve the department scope concern anyway, and (c) the count query itself is the source of truth.
- **Return 0 for valid user, 404 for non-existent**: Zero submissions is a valid state (return `{ count: 0 }`). A non-existent `facultyId` or `semesterId` returns 404 with a distinct error message — helps the frontend detect stale data.
- **Accepted risk — no department scope enforcement**: A dean can technically query submission counts for faculty outside their department scope. The data exposed is a bare count (not PII). Full scope enforcement is deferred to the future bulk endpoint where it integrates naturally.
- **`ParseUUIDPipe` for path params**: Intentionally introduces this NestJS-standard pattern for path param validation, even though existing controllers use bare `@Param()`. This is the correct approach for path params; `class-validator` DTOs remain the pattern for query params.
- **Soft-delete awareness**: The count query must exclude soft-deleted submissions. Using `em.count()` ensures the global soft-delete filter applies automatically — no raw SQL needed.

## Implementation Plan

### Tasks

- [x] Task 1: Create request DTO
  - File: `src/modules/faculty/dto/requests/get-submission-count-query.dto.ts` (new)
  - Action: Create `GetSubmissionCountQueryDto` with a single validated field:
    - `semesterId: string` — `@IsUUID()`, `@IsNotEmpty()`, `@ApiProperty()`
  - Notes: The `facultyId` comes from the path param and is validated via `@Param('facultyId', ParseUUIDPipe)`

- [x] Task 2: Create response DTO
  - File: `src/modules/faculty/dto/responses/submission-count.response.dto.ts` (new)
  - Action: Create `SubmissionCountResponseDto` with:
    - `count: number` — `@ApiProperty({ description: 'Number of submissions for this faculty in the given semester' })`

- [x] Task 3: Register `QuestionnaireSubmission` entity in faculty module (if needed)
  - File: `src/modules/faculty/faculty.module.ts`
  - Action: Add `QuestionnaireSubmission` to the `MikroOrmModule.forFeature([...])` array
  - Notes: Verify at implementation time whether this is required. The analysis module uses `em.count(QuestionnaireSubmission, ...)` without registering it in `forFeature()`. If `em.count()` works without registration (likely — `forFeature` is for repository injection, not EntityManager usage), skip this task.

- [x] Task 4: Add `GetSubmissionCount()` service method
  - File: `src/modules/faculty/services/faculty.service.ts`
  - Action: Add a new public method `GetSubmissionCount(facultyId: string, semesterId: string): Promise<SubmissionCountResponseDto>` that:
    1. Validates semester exists: `em.findOne(Semester, { id: semesterId })` → throw `NotFoundException('Semester with id ... not found')` if null
    2. Validates faculty exists: `em.findOne(User, { id: facultyId })` → throw `NotFoundException('Faculty with id ... not found')` if null
    3. Counts submissions: `em.count(QuestionnaireSubmission, { faculty: facultyId, semester: semesterId })`
    4. Returns `{ count }` as `SubmissionCountResponseDto`
  - Notes: `em.count()` auto-applies the global soft-delete filter. The `[faculty, semester]` composite index makes this query efficient. A non-faculty user ID (e.g., student) will pass validation but return `{ count: 0 }` — this is acceptable since the frontend only supplies IDs from the scoped faculty list.

- [x] Task 5: Add controller route
  - File: `src/modules/faculty/faculty.controller.ts`
  - Action: Add a new route method:
    - `@Get(':facultyId/submission-count')`
    - `@ApiOperation({ summary: 'Get submission count for a faculty member in a semester' })`
    - `@ApiResponse({ status: 200, type: SubmissionCountResponseDto })`
    - Method signature: `getSubmissionCount(@Param('facultyId', ParseUUIDPipe) facultyId: string, @Query() query: GetSubmissionCountQueryDto): Promise<SubmissionCountResponseDto>`
    - Delegates to `this.facultyService.GetSubmissionCount(facultyId, query.semesterId)`
  - Notes: Auth and interceptor are inherited from the class-level decorators. Import `ParseUUIDPipe` from `@nestjs/common`. This intentionally introduces `ParseUUIDPipe` as the standard pattern for path param UUID validation.

- [x] Task 6: Add unit tests
  - File: `src/modules/faculty/services/faculty.service.spec.ts`
  - Action: Add a new `describe('GetSubmissionCount')` block with test cases:
    1. Returns `{ count: 0 }` when user and semester exist but no submissions
    2. Returns correct count when submissions exist
    3. Throws `NotFoundException` when semester does not exist
    4. Throws `NotFoundException` when user does not exist
    5. Verifies `em.count` is called with correct filter shape `{ faculty: facultyId, semester: semesterId }` (soft-delete coverage for AC 8)
  - Notes: Follow existing test patterns — mock `em.findOne` for semester/user lookups, mock `em.count` for submission count. Use the existing `beforeEach` setup; add `em.count = jest.fn()` to the mock EntityManager.

### Acceptance Criteria

- [ ] AC 1: Given a valid `facultyId` and `semesterId` with 5 submissions, when `GET /faculty/:facultyId/submission-count?semesterId=X` is called by a DEAN, then the response is `200 OK` with `{ "count": 5 }`
- [ ] AC 2: Given a valid `facultyId` and `semesterId` with 0 submissions, when the endpoint is called, then the response is `200 OK` with `{ "count": 0 }`
- [ ] AC 3: Given a non-existent `facultyId`, when the endpoint is called, then the response is `404 Not Found` with message `'Faculty with id ... not found'`
- [ ] AC 4: Given a non-existent `semesterId`, when the endpoint is called, then the response is `404 Not Found` with message `'Semester with id ... not found'`
- [ ] AC 5: Given an invalid UUID for `facultyId` or `semesterId`, when the endpoint is called, then the response is `400 Bad Request` (validation pipe)
- [ ] AC 6: Given a user with STUDENT or FACULTY role, when the endpoint is called, then the response is `403 Forbidden`
- [ ] AC 7: Given no auth token, when the endpoint is called, then the response is `401 Unauthorized`
- [ ] AC 8: Given soft-deleted submissions exist for the faculty+semester pair, when the endpoint is called, then soft-deleted submissions are excluded from the count

## Additional Context

### Dependencies

- FAC-53 scoped faculty list endpoint (provides the faculty IDs consumed by this endpoint)
- No new npm packages required — uses existing MikroORM, class-validator, and NestJS infrastructure

### Testing Strategy

- **Unit tests** (Task 6): Mock `EntityManager.findOne` and `EntityManager.count` via NestJS TestingModule. Covers happy path, 404s, and count accuracy.
- **Role guard coverage**: AC 6 and AC 7 are covered by the class-level `@UseJwtGuard(SUPER_ADMIN, DEAN)` which is already tested at the framework level. No additional unit test needed for role checks unless the controller moves to method-level guards.
- **Soft-delete coverage**: Verified by the global filter in `mikro-orm.config.ts`. AC 8 is implicitly covered by using `em.count()` rather than raw SQL. A targeted unit test can mock `em.count` to verify the call shape.

### Edge Cases (Pre-mortem)

| Scenario                                      | Expected Behavior                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Non-existent facultyId                        | 404 — `'Faculty with id ... not found'`                                                            |
| Non-faculty user UUID (e.g., student)         | `{ count: 0 }` — valid user, no submissions. Acceptable since frontend only sends faculty IDs      |
| Non-existent semesterId                       | 404 — `'Semester with id ... not found'`                                                           |
| Soft-deleted semester                         | 404 — global soft-delete filter excludes it from `em.findOne(Semester, ...)`                       |
| Soft-deleted user                             | 404 — global soft-delete filter excludes it from `em.findOne(User, ...)`                           |
| Dean queries out-of-scope faculty             | Returns count — accepted risk, bare number is not PII. Scope enforcement deferred to bulk endpoint |
| Valid faculty, zero submissions               | `{ count: 0 }`                                                                                     |
| Soft-deleted submissions exist                | Excluded from count by global filter                                                               |
| Faculty transferred departments mid-semester  | Count remains accurate — query is by faculty_id, not department                                    |
| Stale frontend cache with removed faculty IDs | 404 helps frontend detect staleness                                                                |

### Notes

- Party Mode discussion concluded that a bulk `POST /faculty/submission-counts` endpoint can be added later if the per-card approach becomes a bottleneck — YAGNI for now. Full department-level scope enforcement should be implemented with the bulk endpoint.
- Pre-mortem analysis identified faculty/semester existence validation as the highest-priority preventions — both are included in the implementation plan.
- The controller already applies `@UseJwtGuard(SUPER_ADMIN, DEAN)` at class level, so the new route inherits auth+role guards automatically.
- **Implementation review (11 findings, 2 fixed, 9 noise/accepted)**: F4 (parallelize findOne calls) and F5 (add Swagger 400/404 decorators) fixed. Remaining 9 findings were noise — matching pre-existing patterns or explicitly accepted risks per spec.
- **Adversarial review (2 rounds, 26 findings total)**: Round 1 introduced enrollment-based validation; Round 2 revealed the enrollment check was flawed (no semester relation on Enrollment entity, 4-table deep join needed) and didn't solve the scope concern. Final resolution: reverted to simple `em.findOne(User, ...)`, accepted the scope risk as documented, and deferred full scope enforcement to the bulk endpoint. Key accepted findings: F2-02 (IDOR accepted — bare count is not PII), F2-03 (forFeature registration — verify at impl time), F2-06 (plain object return — acceptable for single-field DTO).
