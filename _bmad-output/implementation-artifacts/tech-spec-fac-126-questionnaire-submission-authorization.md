---
title: 'FAC-126 fix: enforce role-vs-type and scope on questionnaire submissions'
slug: 'fac-126-questionnaire-submission-authorization'
created: '2026-04-13'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - 'NestJS 11 / TypeScript 5.7'
  - 'MikroORM 6 / PostgreSQL'
  - 'Jest 30 (unit tests)'
  - 'CLS via @nestjs/cls (AsyncLocalStorage)'
files_to_modify:
  - 'src/modules/questionnaires/services/questionnaire.service.ts'
  - 'src/modules/questionnaires/services/questionnaire.service.spec.ts'
  - 'src/modules/questionnaires/services/__tests__/questionnaire-types.spec.ts'
  - 'src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts'
  - 'src/modules/admin/services/admin-generate.service.ts'
code_patterns:
  - 'Service-layer authorization (route guard sits on @UseJwtGuard, role checks live inside service)'
  - 'options bag for opt-out flags (existing skipAnalysis pattern at submitQuestionnaire signature)'
  - 'ScopeResolverService.ResolveDepartmentIds(semesterId) returns string[] | null (null = unrestricted super admin)'
  - 'CurrentUserService.getOrFail() reads from CLS, propagates through async/await'
test_patterns:
  - 'Test.createTestingModule with per-provider useValue mocks'
  - 'mockVersion / mockRespondent / mockFaculty fixtures in describe-scoped const'
  - 'em.findOne mocked via implementation switch on (entity, id)'
  - 'Existing submitQuestionnaire spec at questionnaire.service.spec.ts:198+ — extend, do not rewrite'
---

# Tech-Spec: FAC-126 fix: enforce role-vs-type and scope on questionnaire submissions

**Created:** 2026-04-13

## Overview

### Problem Statement

`QuestionnaireService.submitQuestionnaire` performs no authorization tying respondent role to questionnaire type or to faculty scope. Two concrete bugs:

1. **Scope hole (original ticket):** A dean or chairperson can POST a submission against _any_ faculty in the system. The respondent role is inferred from `respondent.roles` (lines 776–780) but the target faculty's department is never compared against the respondent's scoped departments.
2. **Type-vs-role hole (added during planning):** Any authenticated user can submit any questionnaire type. A student can submit `FACULTY_OUT_OF_CLASSROOM`. A dean can submit `FACULTY_FEEDBACK`. The submission route is `@UseJwtGuard()` with no role list and the service body never inspects `version.questionnaire.type.code` against `respondent.roles`.

Both bugs live in the same ~5 lines of `submitQuestionnaire` and ship together as one fix.

### Solution

Inject `ScopeResolverService` into `QuestionnaireService`. Inside `submitQuestionnaire`, after `respondent`, `faculty`, and `semester` are loaded (and `faculty.department` is populated), and **before** the existing `data.courseId` enrollment block, run a single `assertSubmissionAuthorization` step that:

1. **Role-vs-type matrix:** rejects with 403 if the respondent's role is not allowed to submit the version's questionnaire type.
2. **Scope check:** for `DEAN` / `CHAIRPERSON`, calls `ScopeResolverService.ResolveDepartmentIds(semesterId)` and 403s if `faculty.department.id` is not in the result. `null` (super admin) is unrestricted.

Super admin bypasses both checks. Students bypass scope (they have no scope concept) but are gated by the matrix.

### Scope

**In Scope:**

- Add `assertSubmissionAuthorization` private method on `QuestionnaireService`
- Codify the role-vs-type matrix as a single source of truth (a typed const map)
- Inject `ScopeResolverService` via constructor (already exported by `CommonModule`, already imported by `QuestionnaireModule` — no module wiring needed)
- Dean/chairperson scope check uses `faculty.department.id` (FAC-125 made this field reliably populated)
- Super admin bypasses everything
- Unit tests: the full matrix (16 cells), in-scope dean, out-of-scope dean (403), out-of-scope chairperson (403), super admin unrestricted, faculty with `null` department + dean (403)
- Update the GitHub issue title/body to reflect the bundled scope

**Out of Scope (deferred as tech debt):**

- Student `FACULTY_FEEDBACK` enrollment validation. Today students will be allowed to submit `FACULTY_FEEDBACK` for any faculty. The correct rule is "student must have an active enrollment in a course taught by the target faculty in the given semester," but that requires a new efficient query and an index review — tracked as a separate follow-up ticket.
- Refactoring the existing dean/chairperson enrollment-skip at lines 657–672 (still needed for ICE because the course-context check is independent of the new scope check).
- Frontend changes — the SPA should eventually only surface allowed types per role, but that is a separate ticket.
- Type-vs-role enforcement at the route guard layer (decorator). Doing it in the service keeps the matrix in one place and covers the ingestion + admin-generate callers too.

## Context for Development

### Codebase Patterns

- **Service-layer authorization.** The submission route is `@UseJwtGuard()` with no role list (`questionnaire.controller.ts:313-329`). All role/type/scope decisions live inside `QuestionnaireService.submitQuestionnaire`. Adding a new check there is the established pattern, not a route decorator.
- **Opt-out flag in options bag.** `submitQuestionnaire(data, options?: { skipAnalysis?: boolean })` already exists at line 587. The new `skipAuthorization?: boolean` flag follows the same pattern — non-HTTP callers (ingestion-engine, admin-generate) pass `true` to bypass the new gate.
- **`ScopeResolverService.ResolveDepartmentIds(semesterId)`** at `src/modules/common/services/scope-resolver.service.ts:21` returns `string[] | null`. `null` ⇒ super admin (unrestricted). Empty array ⇒ user has no scope (deny-all). It pulls the user from `CurrentUserService.getOrFail()` (CLS), so it only works when invoked from an HTTP request chain.
- **`CommonModule` already exports `ScopeResolverService`** (`common.module.ts:18`) and `QuestionnaireModule` already imports `CommonModule` (`questionnaires.module.ts:46`) — constructor injection only, no module wiring change.
- **`QuestionnaireType.code`** is `varchar` (`questionnaire-type.entity.ts:17`), values are bare strings `'FACULTY_IN_CLASSROOM'`, `'FACULTY_OUT_OF_CLASSROOM'`, `'FACULTY_FEEDBACK'` (no TS enum). The version is loaded with `populate: ['questionnaire.type']` (`questionnaire.service.ts:590`), so `version.questionnaire.type.code` is reachable inside `submitQuestionnaire`.
- **`RespondentRole` enum** at `src/modules/questionnaires/lib/questionnaire.types.ts` already imported by `questionnaire.service.ts`.
- **`UserRole` enum** at `src/modules/auth/roles.enum.ts` already imported.
- **CLS context propagation.** `AppClsModule` mounts global middleware (`src/modules/index.module.ts:68-71`). For HTTP requests, `CurrentUserInterceptor` populates the JWT principal. `RequestContext.create(forkedEm, ...)` in `ingestion-engine.service.ts:94` only sets MikroORM EM context — CLS context still propagates via AsyncLocalStorage **but** ingestion uses synthetic students for `respondentId`, so the matrix gate would block them regardless of CLS. Hence the `skipAuthorization` flag, not a CLS-presence test.

### Files to Reference

| File                                                                                        | Purpose                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/questionnaires/services/questionnaire.service.ts` (line 577–)                  | `submitQuestionnaire` — primary edit site. New gate inserts after line 634 (semester load) and before line 636 (course/enrollment block).                                                                                                                                          |
| `src/modules/common/services/scope-resolver.service.ts` (line 21)                           | `ResolveDepartmentIds(semesterId): Promise<string[] \| null>` — call signature and `null`-means-unrestricted contract.                                                                                                                                                             |
| `src/modules/questionnaires/lib/questionnaire.types.ts`                                     | `RespondentRole` enum (`STUDENT`, `DEAN`, `CHAIRPERSON`).                                                                                                                                                                                                                          |
| `src/modules/auth/roles.enum.ts`                                                            | `UserRole` enum used to test `respondent.roles.includes(...)`.                                                                                                                                                                                                                     |
| `src/modules/common/common.module.ts` (line 18)                                             | Confirms `ScopeResolverService` is exported.                                                                                                                                                                                                                                       |
| `src/modules/questionnaires/questionnaires.module.ts` (line 46)                             | Confirms `CommonModule` is imported by `QuestionnaireModule`.                                                                                                                                                                                                                      |
| `src/modules/questionnaires/questionnaire.controller.ts` (line 313–329)                     | Submission HTTP route — no changes needed; reference only.                                                                                                                                                                                                                         |
| `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts` (line 179, 195) | Both `submitQuestionnaire` calls in `executeSubmission` need `skipAuthorization: true`.                                                                                                                                                                                            |
| `src/modules/admin/services/admin-generate.service.ts` (line 313)                           | The single `submitQuestionnaire` call in `CommitSubmissions` needs `skipAuthorization: true`.                                                                                                                                                                                      |
| `src/modules/questionnaires/services/questionnaire.service.spec.ts` (line 60–192)           | Constructor providers — add `ScopeResolverService` mock. Update `mockVersion.questionnaire.type.code` from `'T1'` to `'FACULTY_IN_CLASSROOM'`. Update `mockFaculty.department` to include `id: 'd1'`. Existing dean test at line 461 needs respondent role + scope mock alignment. |
| `src/modules/questionnaires/services/__tests__/questionnaire-types.spec.ts` (line 72–151)   | Constructor providers — add `ScopeResolverService` mock so the `TestingModule` still compiles.                                                                                                                                                                                     |
| `src/modules/common/services/scope-resolver.service.spec.ts`                                | Reference only — pattern for mocking `CurrentUserService` + `EntityManager`.                                                                                                                                                                                                       |

### Technical Decisions

1. **Single private method, not a separate service.** Add `private async assertSubmissionAuthorization(version, respondent, faculty, semesterId): Promise<void>` on `QuestionnaireService`. Inline-only — does not justify a new file or class. Three lines of matrix logic + one ScopeResolver call.

2. **Matrix as a `const` map at module scope.** Define `const ALLOWED_TYPES_BY_ROLE: Record<RespondentRole, ReadonlySet<string>>` at the top of `questionnaire.service.ts`. Single source of truth, easy to test by snapshot, no premature abstraction. Values: `STUDENT → {FACULTY_FEEDBACK}`, `DEAN → {FACULTY_IN_CLASSROOM, FACULTY_OUT_OF_CLASSROOM}`, `CHAIRPERSON → {FACULTY_IN_CLASSROOM, FACULTY_OUT_OF_CLASSROOM}`. Super admin is **not** in the map — it is short-circuited before lookup.

3. **Respondent-role inference is shared with the existing line 776-780 logic.** Extract a `private resolveRespondentRole(respondent: User): RespondentRole | 'SUPER_ADMIN'` helper used both by `assertSubmissionAuthorization` and by the existing `respondentRole:` field at line 776. Avoids the bug where the matrix and the recorded `submission.respondentRole` could diverge if someone changes one and not the other.

4. **`skipAuthorization` opt-out flag.** Extend the existing options bag: `options?: { skipAnalysis?: boolean; skipAuthorization?: boolean }`. When `true`, `assertSubmissionAuthorization` is not called. Only callers: `ingestion-engine.service.ts` (lines 179, 195) and `admin-generate.service.ts` (line 313). Both already run under elevated routes (ingestion: `SUPER_ADMIN/ADMIN/DEAN/CHAIRPERSON`, admin-generate: `SUPER_ADMIN`). HTTP controller never sets it.

5. **Insertion point.** Place the `await this.assertSubmissionAuthorization(...)` call **after** `semester` is loaded (line 634) and **before** the `if (data.courseId)` block at line 637. Rationale: cheapest-fail-first ordering — auth check runs before any enrollment query.

6. **403 message consistency.** Two distinct `ForbiddenException` messages so logs/clients can distinguish:
   - Matrix failure: `'Your role is not permitted to submit this questionnaire type.'`
   - Scope failure: `'Faculty is not within your scope.'` (do not introspect why — null department is the same as out-of-scope from the caller's perspective)

7. **Faculty with `null` department + dean/chair respondent → 403.** `faculty.department?.id` evaluated against `ResolveDepartmentIds` result. If `faculty.department` is null, the `id` is `undefined`, `string[].includes(undefined)` returns `false`, → 403. No special branch needed, but cover with a unit test.

8. **Existing happy-path tests need fixture updates.** `mockVersion.questionnaire.type.code` is currently `'T1'` (a placeholder that doesn't match any allowed type). Without the matrix it's harmless; with the matrix every existing happy-path test would 403. Update fixtures in **one** place (the describe-scoped `mockVersion` at `questionnaire.service.spec.ts:208`) to `'FACULTY_FEEDBACK'` so the default `STUDENT` respondent passes the matrix. The dean test at line 461 also gets a separate `mockVersion` clone with `'FACULTY_IN_CLASSROOM'` and a scope-resolver mock returning `[mockFaculty.department.id]`.

9. **Add `id: 'd1'` to `mockFaculty.department`** in the fixture. Currently only `code` and `name` are set — adding `id` is a 1-line change and lets the new tests assert the scope check on department id without touching every other test.

10. **`questionnaire-types.spec.ts` constructor mock also needs `ScopeResolverService`** — even though those tests don't exercise `submitQuestionnaire`, the `TestingModule` will fail to instantiate `QuestionnaireService` once the constructor adds the dep.

11. **No new migration, no entity change, no DTO change.** Pure service-layer fix.

## Implementation Plan

### Tasks

Tasks are ordered so that the service compiles and existing tests stay green at every intermediate state. Run `npm run lint` and `npm run test -- --testPathPattern=questionnaire.service.spec` after each task that touches `questionnaire.service.ts` or its specs.

> **Anchor-based locations (no line numbers).** Tasks reference symbol anchors — function names, variable declarations, comments — rather than line numbers, because the file drifts under unrelated edits. Every anchor listed below is greppable as an exact string in the current `master` @ `70ff454`.

- [x] **Task 1: Define the role-vs-type matrix at module scope in `questionnaire.service.ts`.**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Anchor: Just above `export class QuestionnaireService`, after the imports block.
  - Action:
    ```ts
    const SUBMISSION_TYPE_MATRIX: Record<
      RespondentRole,
      ReadonlySet<string>
    > = {
      [RespondentRole.STUDENT]: new Set(['FACULTY_FEEDBACK']),
      [RespondentRole.DEAN]: new Set([
        'FACULTY_IN_CLASSROOM',
        'FACULTY_OUT_OF_CLASSROOM',
      ]),
      [RespondentRole.CHAIRPERSON]: new Set([
        'FACULTY_IN_CLASSROOM',
        'FACULTY_OUT_OF_CLASSROOM',
      ]),
    };
    ```
  - Notes: `RespondentRole` is already imported from `../lib/questionnaire.types`. Bare strings are intentional — there is no TS enum for `QuestionnaireType.code` and inventing one is out of scope.

- [x] **Task 2: Inject `ScopeResolverService` into `QuestionnaireService`.**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Anchor: constructor parameter list (the `private readonly currentUserService: CurrentUserService,` line).
  - Action: Add `import { ScopeResolverService } from '../../common/services/scope-resolver.service';` to the imports. Add `private readonly scopeResolverService: ScopeResolverService,` to the constructor parameter list, immediately after `currentUserService`.
  - Notes: No module change needed — `CommonModule` already exports `ScopeResolverService` and `QuestionnaireModule` already imports `CommonModule`.

- [x] **Task 3: Add the `resolveRespondentRole` private helper.**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Anchor: bottom of `QuestionnaireService` class body, next to other private methods.
  - Action:
    ```ts
    private resolveRespondentRole(respondent: User): RespondentRole {
      if (respondent.roles.includes(UserRole.DEAN)) return RespondentRole.DEAN;
      if (respondent.roles.includes(UserRole.CHAIRPERSON)) return RespondentRole.CHAIRPERSON;
      return RespondentRole.STUDENT;
    }
    ```
  - Notes: **Single responsibility — classifier only.** Does NOT handle SUPER_ADMIN. The gate's SUPER_ADMIN early-return happens at the caller level using `respondent.roles.includes(UserRole.SUPER_ADMIN)`. This preserves the pre-fix ordering at the existing `respondentRole:` mapping anchor (`DEAN > CHAIRPERSON > STUDENT`) and lets the same helper drive both the matrix lookup and the recorded `submission.respondentRole` field without any conditional mapping wrapper.

- [x] **Task 4: Add the `assertSubmissionAuthorization` private method.**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Anchor: immediately above `resolveRespondentRole`.
  - Action:

    ```ts
    private async assertSubmissionAuthorization(
      respondent: User,
      faculty: User,
      typeCode: string,
      semesterId: string,
    ): Promise<void> {
      if (respondent.roles.includes(UserRole.SUPER_ADMIN)) return;

      const role = this.resolveRespondentRole(respondent);
      if (!SUBMISSION_TYPE_MATRIX[role].has(typeCode)) {
        throw new ForbiddenException(
          'Your role is not permitted to submit this questionnaire type.',
        );
      }

      if (role === RespondentRole.DEAN || role === RespondentRole.CHAIRPERSON) {
        const allowedDepartmentIds =
          await this.scopeResolverService.ResolveDepartmentIds(semesterId);
        if (allowedDepartmentIds === null) return; // defensive: super admin already returned above
        if (allowedDepartmentIds.length === 0) {
          this.logger.warn(
            `Respondent ${respondent.id} (role=${role}) has an empty department scope for semester ${semesterId} — likely mis-provisioned.`,
          );
        }
        if (!allowedDepartmentIds.includes(faculty.department?.id ?? '')) {
          throw new ForbiddenException('Faculty is not within your scope.');
        }
      }
    }
    ```

  - Notes: Super admin short-circuits on the raw role check — does **not** go through `resolveRespondentRole`. `faculty.department?.id ?? ''` handles null department uniformly (empty string fails `includes` → 403). The `logger.warn` on empty-scope (from party mode) gives ops a signal when a user is mis-provisioned vs. legitimately out of scope — same 403 externally, distinct log internally.

- [x] **Task 5: Refactor the existing `respondentRole:` field to use the new helper.**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Anchor: the `respondentRole:` property inside the `this.submissionRepo.create({ ... })` call. Currently an inline ternary mapping `respondent.roles.includes(UserRole.DEAN) ? RespondentRole.DEAN : respondent.roles.includes(UserRole.CHAIRPERSON) ? RespondentRole.CHAIRPERSON : RespondentRole.STUDENT`.
  - Action: Replace the inline ternary with `respondentRole: this.resolveRespondentRole(respondent),`
  - Notes: Clean drop-in — `resolveRespondentRole` preserves exact pre-fix ordering and return shape.

- [x] **Task 6: Extend the `submitQuestionnaire` `options` bag with `skipAuthorization`.**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Anchor: the `submitQuestionnaire(data: {...}, options?: { skipAnalysis?: boolean })` signature.
  - Action: Change `options?: { skipAnalysis?: boolean }` to `options?: { skipAnalysis?: boolean; skipAuthorization?: boolean }`.

- [x] **Task 7: Wire the gate call inside `submitQuestionnaire`.**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Anchor: after the `const semester = await this.em.findOne(Semester, ...)` block and the subsequent `NotFoundException` guard, and **before** the `// 1. Context and Enrollment Validation` comment marking the course/enrollment block.
  - Action:
    ```ts
    if (options?.skipAuthorization) {
      this.logger.warn(
        `submitQuestionnaire called with skipAuthorization=true (respondentId=${data.respondentId}, versionId=${data.versionId})`,
      );
    } else {
      await this.assertSubmissionAuthorization(
        respondent,
        faculty,
        version.questionnaire.type.code,
        semester.id,
      );
    }
    ```
  - Notes:
    - `version.questionnaire.type` is already populated via `populate: ['questionnaire.type']` at the `versionRepo.findOne` call above.
    - `faculty.department` is already populated via `populate: ['campus', 'department', 'program']` at the `faculty` `findOne` call above.
    - **Pass `semester.id`, not `data.semesterId`** — defense in depth, uses the loaded entity's validated id.
    - The `logger.warn` on `skipAuthorization=true` is the audit trail for the security escape hatch. If a new caller is added accidentally, staging logs will show it before production.

- [x] **Task 8: Set `skipAuthorization: true` in both ingestion-engine call sites.**
  - File: `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts`
  - Anchor: inside `private async executeSubmission(...)` — both `await this.questionnaireService.submitQuestionnaire(mapped, { skipAnalysis: true })` (dry-run branch inside `em.transactional`) and `return this.questionnaireService.submitQuestionnaire(mapped, { skipAnalysis: false })` (commit branch).
  - Action: Add `skipAuthorization: true` to both options bags alongside the existing `skipAnalysis` flag.
  - Notes: Route-level `@UseJwtGuard(SUPER_ADMIN, ADMIN, DEAN, CHAIRPERSON)` is the current trust boundary. Row-level scope enforcement during bulk import is tracked as tech debt.

- [x] **Task 9: Set `skipAuthorization: true` in the admin-generate caller.**
  - File: `src/modules/admin/services/admin-generate.service.ts`
  - Anchor: inside `CommitSubmissions` — the `await this.questionnaireService.submitQuestionnaire({ versionId: dto.versionId, respondentId: student.id, facultyId, ... })` call.
  - Action: Add a second argument `{ skipAuthorization: true }` to the call.
  - Notes: Route is gated to SUPER_ADMIN only, so bypass is intentional.

- [x] **Task 10: Update `questionnaire.service.spec.ts` constructor providers and shared fixtures.**
  - File: `src/modules/questionnaires/services/questionnaire.service.spec.ts`
  - Anchor: the `Test.createTestingModule({ providers: [...] })` block inside `beforeEach`, and the describe-scoped `mockVersion` / `mockFaculty` const declarations inside `describe('submitQuestionnaire')`.
  - Action:
    1. Add `import { ScopeResolverService } from '../../common/services/scope-resolver.service';`.
    2. Add a `ScopeResolverService` provider mock to the providers array, immediately after the `CurrentUserService` provider:
       ```ts
       {
         provide: ScopeResolverService,
         useValue: {
           ResolveDepartmentIds: jest.fn().mockResolvedValue(['fac126-dept-1']),
         },
       },
       ```
       Expose it as `let scopeResolverService: { ResolveDepartmentIds: jest.Mock };` at the top of the describe, then `scopeResolverService = module.get(ScopeResolverService);` next to the other `module.get` calls.
    3. Change `mockVersion.questionnaire.type.code` from `'T1'` to `'FACULTY_FEEDBACK'`. The default respondent role is `STUDENT`, so the matrix stays green for all existing happy-path tests.
    4. Add `id: 'fac126-dept-1'` to `mockFaculty.department`.
  - Notes: The unique id `'fac126-dept-1'` avoids collision with any other test fixture using short ids like `'d1'`. After this task, run `npm run test -- --testPathPattern=questionnaire.service.spec` and confirm zero regressions before writing new tests.

- [x] **Task 11: Update the existing dean test (`'should allow Dean to submit without enrollment'`) to align with the matrix.**
  - File: `src/modules/questionnaires/services/questionnaire.service.spec.ts`
  - Anchor: the `it('should allow Dean to submit without enrollment', ...)` inside `describe('submitQuestionnaire')`.
  - Action: Inside that test, build a local `deanVersion = { ...mockVersion, questionnaire: { ...mockVersion.questionnaire, type: { code: 'FACULTY_IN_CLASSROOM' } } }` and call `versionRepo.findOne.mockResolvedValue(deanVersion as any)` so the dean's role lines up with an allowed type. The default `ScopeResolverService` mock already returns `['fac126-dept-1']`, matching `mockFaculty.department.id`.
  - Notes: The matrix gate fires before the enrollment check, so the test must satisfy the matrix to still reach the enrollment-skip branch the test is actually exercising.

- [x] **Task 12: Add new unit tests for the authorization gate.**
  - File: `src/modules/questionnaires/services/questionnaire.service.spec.ts`
  - Anchor: inside `describe('submitQuestionnaire', ...)`, after the existing tests and before the closing brace.
  - Action: Add a nested `describe('authorization gate', ...)` containing all cases listed in the **Testing Strategy** table below, plus the three "consensus additions" from party mode:
    1. **Matrix exhaustiveness test** — asserts every known `QuestionnaireType.code` value (`FACULTY_IN_CLASSROOM`, `FACULTY_OUT_OF_CLASSROOM`, `FACULTY_FEEDBACK`) is either in some `SUBMISSION_TYPE_MATRIX` entry or handled by the SUPER_ADMIN bypass path. This is drift insurance — if a new type is added later, the test fails until the matrix is updated.
    2. **Dean + ICE + course sequence test** — dean, in-scope, `FACULTY_IN_CLASSROOM`, courseId provided → both the new matrix+scope gates AND the existing dean-enrollment-skip branch are exercised in the same call. Assert the submission persists, `scopeResolverService.ResolveDepartmentIds` was called exactly once, and `enrollmentRepo.findOne` was called exactly once (for the faculty-enrollment check, not the respondent-enrollment check).
    3. **`it.todo('student FACULTY_FEEDBACK must validate enrollment — tracked as follow-up ticket')`** — free pending test as a permanent reminder for the deferred tech debt.
  - Notes: Reuse existing `mockData` / `mockVersion` / `mockRespondent` / `mockFaculty` / `mockSemester` / `mockCourse` fixtures. Override only the relevant fields per test. Every rejection-case test must also assert `enrollmentRepo.findOne` was **not** called (cheapest-fail-first invariant, AC16).

- [x] **Task 13: Update `questionnaire-types.spec.ts` constructor providers.**
  - File: `src/modules/questionnaires/services/__tests__/questionnaire-types.spec.ts`
  - Anchor: the `Test.createTestingModule({ providers: [...] })` block inside `beforeEach`.
  - Action: Add `import { ScopeResolverService } from '../../../common/services/scope-resolver.service';` and add the same `ScopeResolverService` mock provider used in Task 10 (no-op `jest.fn()` is sufficient — these tests don't exercise `submitQuestionnaire`).
  - Notes: Without this, the `TestingModule` will fail to construct `QuestionnaireService` once the constructor adds the new dependency.

- [x] **Task 14: Run lint, full test suite, and verify clean diff.**
  - Commands:
    - `npm run lint`
    - `npm run test -- --testPathPattern=questionnaire`
    - `npm run test` (full suite — confirms no other consumer of `QuestionnaireService` broke)
  - Notes: No type errors, no test regressions, no eslint warnings introduced.

### Acceptance Criteria

- [x] **AC1 (matrix · student happy path):** Given a STUDENT respondent and a `FACULTY_FEEDBACK` questionnaire version, when `submitQuestionnaire` is called with valid data, then it succeeds and a submission row is persisted.
- [x] **AC2 (matrix · student rejected):** Given a STUDENT respondent and a `FACULTY_IN_CLASSROOM` or `FACULTY_OUT_OF_CLASSROOM` questionnaire version, when `submitQuestionnaire` is called, then it throws `ForbiddenException` with message `'Your role is not permitted to submit this questionnaire type.'`
- [x] **AC3 (matrix · dean happy path):** Given a DEAN respondent whose scoped departments include `faculty.department.id`, and a `FACULTY_IN_CLASSROOM` or `FACULTY_OUT_OF_CLASSROOM` questionnaire version, when `submitQuestionnaire` is called with valid data, then it succeeds.
- [x] **AC4 (matrix · dean rejected by type):** Given a DEAN respondent and a `FACULTY_FEEDBACK` questionnaire version, when `submitQuestionnaire` is called, then it throws `ForbiddenException` with the type message.
- [x] **AC5 (matrix · chairperson rejected by type):** Same as AC4 for CHAIRPERSON.
- [x] **AC6 (scope · dean out-of-scope):** Given a DEAN respondent whose scoped departments do NOT include `faculty.department.id`, and an allowed questionnaire type, when `submitQuestionnaire` is called, then it throws `ForbiddenException` with message `'Faculty is not within your scope.'`
- [x] **AC7 (scope · chairperson out-of-scope):** Same as AC6 for CHAIRPERSON.
- [x] **AC8 (scope · faculty has null department):** Given a DEAN respondent and a faculty whose `department` is `null`, and an allowed questionnaire type, when `submitQuestionnaire` is called, then it throws `ForbiddenException` with the scope message (not `BadRequestException`).
- [x] **AC9 (super admin unrestricted):** Given a SUPER_ADMIN respondent and any questionnaire type, when `submitQuestionnaire` is called with valid data, then it succeeds and `ScopeResolverService.ResolveDepartmentIds` is **not** called. (This covers both the type and scope paths — the gate short-circuits on the SUPER_ADMIN check before touching the matrix or the resolver.)
- [x] **AC10 (matrix exhaustiveness — drift insurance):** Given every `QuestionnaireType.code` value currently seeded in the database, when the exhaustiveness test runs, then each code is either a member of some `SUBMISSION_TYPE_MATRIX` entry or is covered by the SUPER_ADMIN bypass path. (A new type added later without a matrix update must fail this test.)
- [x] **AC11 (`skipAuthorization` bypass — both gates):** Given a respondent/type combination that would otherwise be rejected (e.g., STUDENT + `FACULTY_IN_CLASSROOM`, OR DEAN + out-of-scope faculty), when `submitQuestionnaire` is called with `options.skipAuthorization === true`, then **no** `ForbiddenException` is thrown from the authorization gate, `scopeResolverService.ResolveDepartmentIds` is not called, and a `logger.warn` audit entry is emitted mentioning `skipAuthorization`. Verified in two tests — one for the matrix path, one for the scope path — to prove both gates are bypassed, not just one.
- [x] **AC12 (CSV ingestion unchanged semantics):** Given a CSV ingestion run, when the engine calls `submitQuestionnaire` with `skipAuthorization: true`, then the rows process successfully and existing ingestion tests remain green.
- [x] **AC13 (admin-generate unchanged semantics):** Given the admin test data generator, when it calls `submitQuestionnaire` with `skipAuthorization: true`, then existing admin-generate tests remain green.
- [x] **AC14 (existing tests unchanged in semantics):** Given the pre-existing `submitQuestionnaire` tests after fixture updates (Task 10/11), when the suite runs, then all tests pass with zero behavioral regressions outside the new authorization layer.
- [x] **AC15 (recorded `respondentRole` unchanged):** Given any respondent role, when a submission is persisted, then `submission.respondentRole` matches the value the pre-fix code produced:
  - `[DEAN]` → `DEAN`
  - `[CHAIRPERSON]` → `CHAIRPERSON`
  - `[STUDENT]` or no role match → `STUDENT`
  - `[SUPER_ADMIN, DEAN]` → `DEAN` (pre-fix ordering preserved — DEAN check wins because `resolveRespondentRole` checks DEAN before CHAIRPERSON and never inspects SUPER_ADMIN)
  - `[SUPER_ADMIN]` → `STUDENT` (falls through like pre-fix code)
  - Verified by assertions inside matrix happy-path tests AND one explicit test for the `[SUPER_ADMIN, DEAN]` overlap case.
- [x] **AC16 (cheapest fail first):** Given an unauthorized respondent, when `submitQuestionnaire` is called, then the `ForbiddenException` is thrown before any `enrollmentRepo.findOne` query runs. (Verified by asserting `enrollmentRepo.findOne` is not called in every matrix-rejection and scope-rejection test.)
- [x] **AC17 (dean + ICE + course sequence):** Given a DEAN respondent in-scope for the target faculty and a `FACULTY_IN_CLASSROOM` submission with a `courseId`, when `submitQuestionnaire` is called, then: (a) the matrix gate passes, (b) the scope gate passes, (c) `scopeResolverService.ResolveDepartmentIds` is called exactly once, (d) the existing dean enrollment-skip branch is exercised so `enrollmentRepo.findOne` is called exactly once (for the faculty-enrollment check only), and (e) the submission persists.

### AC → Test mapping

Drift insurance: every AC should have at least one test covering it. If any row below is empty, the AC is not covered.

| AC   | Test case (inside `describe('submitQuestionnaire') > describe('authorization gate')` unless noted)                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | `student FACULTY_FEEDBACK succeeds` (also exercised by every existing happy-path test under the updated fixture)                                                                                  |
| AC2  | `student FACULTY_IN_CLASSROOM rejected with type message` + `student FACULTY_OUT_OF_CLASSROOM rejected with type message`                                                                         |
| AC3  | `dean in-scope FACULTY_IN_CLASSROOM succeeds` + `dean in-scope FACULTY_OUT_OF_CLASSROOM succeeds`                                                                                                 |
| AC4  | `dean FACULTY_FEEDBACK rejected with type message`                                                                                                                                                |
| AC5  | `chairperson FACULTY_FEEDBACK rejected with type message`                                                                                                                                         |
| AC6  | `dean out-of-scope rejected with scope message`                                                                                                                                                   |
| AC7  | `chairperson out-of-scope rejected with scope message`                                                                                                                                            |
| AC8  | `dean + null faculty.department rejected with scope message`                                                                                                                                      |
| AC9  | `super admin any type succeeds and ScopeResolver NOT called`                                                                                                                                      |
| AC10 | `matrix exhaustiveness — every seeded type code is covered`                                                                                                                                       |
| AC11 | `skipAuthorization bypasses matrix (student + FACULTY_IN_CLASSROOM succeeds)` + `skipAuthorization bypasses scope (dean + out-of-scope faculty succeeds)` + `skipAuthorization emits logger.warn` |
| AC12 | Existing `ingestion-engine.service.spec.ts` suite remains green                                                                                                                                   |
| AC13 | Existing `admin-generate.service.spec.ts` suite remains green                                                                                                                                     |
| AC14 | Existing `questionnaire.service.spec.ts > submitQuestionnaire` suite (pre-existing tests only) remains green after Task 10/11                                                                     |
| AC15 | `recorded respondentRole matches pre-fix mapping` (parameterized over the 5 role combinations, including `[SUPER_ADMIN, DEAN]` overlap)                                                           |
| AC16 | Assertion on `enrollmentRepo.findOne` NOT called inside every matrix-rejection and scope-rejection test                                                                                           |
| AC17 | `dean in-scope FACULTY_IN_CLASSROOM with course — both gates and enrollment-skip run in sequence`                                                                                                 |

## Additional Context

### Dependencies

- **FAC-125** (already merged, `70ff454`): `user.department` is now reliably populated via enrollment-derived `department_source: 'auto' | 'manual'`. Without this, `faculty.department` would frequently be null and the scope guard would 403 legitimate submissions.
- **No new npm packages.**
- **No DB migrations.** Pure service-layer change.
- **`ScopeResolverService`** is already wired through `CommonModule` and reachable from `QuestionnaireService` without module-level edits.

### Testing Strategy

**Unit tests** (added to `questionnaire.service.spec.ts` inside a new `describe('authorization gate')` nested in the existing `describe('submitQuestionnaire')`):

| #   | Case                                                                                         | Setup overrides                                                                                                                                                                  | Expected                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Student + FACULTY_FEEDBACK                                                                   | default fixtures                                                                                                                                                                 | success, ScopeResolver NOT called, recorded `respondentRole === STUDENT`                                                   |
| 2   | Student + FACULTY_IN_CLASSROOM                                                               | `mockVersion.questionnaire.type.code = 'FACULTY_IN_CLASSROOM'`                                                                                                                   | 403 type message, `enrollmentRepo.findOne` NOT called                                                                      |
| 3   | Student + FACULTY_OUT_OF_CLASSROOM                                                           | `'FACULTY_OUT_OF_CLASSROOM'`                                                                                                                                                     | 403 type message, `enrollmentRepo.findOne` NOT called                                                                      |
| 4   | Dean + FACULTY_IN_CLASSROOM, in-scope, no course                                             | dean role, type `FACULTY_IN_CLASSROOM`, ScopeResolver returns `['fac126-dept-1']`, `courseId` omitted                                                                            | success, ScopeResolver called once, recorded `respondentRole === DEAN`                                                     |
| 5   | Dean + FACULTY_IN_CLASSROOM, out-of-scope                                                    | dean role, ScopeResolver returns `['other-dept']`                                                                                                                                | 403 scope message, `enrollmentRepo.findOne` NOT called                                                                     |
| 6   | Dean + FACULTY_OUT_OF_CLASSROOM, in-scope                                                    | dean role, type `FACULTY_OUT_OF_CLASSROOM`, ScopeResolver returns `['fac126-dept-1']`                                                                                            | success                                                                                                                    |
| 7   | Dean + FACULTY_FEEDBACK                                                                      | dean role, type `FACULTY_FEEDBACK`                                                                                                                                               | 403 type message, ScopeResolver NOT called, `enrollmentRepo.findOne` NOT called                                            |
| 8   | Chairperson + FACULTY_IN_CLASSROOM, out-of-scope                                             | chair role, ScopeResolver returns `[]`                                                                                                                                           | 403 scope message, `logger.warn` emitted for empty-scope                                                                   |
| 9   | Chairperson + FACULTY_FEEDBACK                                                               | chair role, type `FACULTY_FEEDBACK`                                                                                                                                              | 403 type message                                                                                                           |
| 10  | Dean + faculty.department null                                                               | dean role, type `FACULTY_IN_CLASSROOM`, faculty with `department: null`, ScopeResolver returns `['fac126-dept-1']`                                                               | 403 scope message (not BadRequestException)                                                                                |
| 11  | Super admin + FACULTY_FEEDBACK                                                               | super admin role                                                                                                                                                                 | success, ScopeResolver NOT called                                                                                          |
| 12  | Super admin + FACULTY_IN_CLASSROOM                                                           | super admin role                                                                                                                                                                 | success, ScopeResolver NOT called (no mock return value to reason about)                                                   |
| 13  | skipAuthorization bypasses matrix                                                            | student role, type `FACULTY_IN_CLASSROOM`, `options: { skipAuthorization: true }`, mock enrollment to pass downstream                                                            | submission succeeds, ScopeResolver NOT called, `logger.warn` emitted mentioning `skipAuthorization`                        |
| 14  | skipAuthorization bypasses scope                                                             | dean role, type `FACULTY_IN_CLASSROOM`, ScopeResolver returns `['other-dept']`, `options: { skipAuthorization: true }`                                                           | submission succeeds, ScopeResolver NOT called                                                                              |
| 15  | Matrix exhaustiveness                                                                        | n/a — static unit test                                                                                                                                                           | every seeded `QuestionnaireType.code` is covered by some matrix entry OR by the SUPER_ADMIN bypass                         |
| 16  | Dean + ICE + course sequence                                                                 | dean role, type `FACULTY_IN_CLASSROOM`, courseId provided, ScopeResolver returns `['fac126-dept-1']`, `enrollmentRepo.findOne` mocked to return `{ isActive: true }` for faculty | success, ScopeResolver called exactly 1×, `enrollmentRepo.findOne` called exactly 1× (faculty-enrollment only)             |
| 17  | Recorded role for `[SUPER_ADMIN, DEAN]` overlap                                              | respondent.roles = `[SUPER_ADMIN, DEAN]`, type `FACULTY_FEEDBACK`                                                                                                                | succeeds (super admin bypass), recorded `respondentRole === DEAN` (pre-fix ordering preserved via `resolveRespondentRole`) |
| 18  | `it.todo('student FACULTY_FEEDBACK must validate enrollment — tracked as follow-up ticket')` | n/a                                                                                                                                                                              | pending (permanent reminder for deferred tech debt)                                                                        |

For every rejection case (#2, 3, 5, 7, 8, 9, 10), also assert `enrollmentRepo.findOne` was **not** called (cheapest-fail-first invariant — AC16).

**Existing test updates:**

- Update `mockVersion.questionnaire.type.code` from `'T1'` to `'FACULTY_FEEDBACK'` (default STUDENT respondent then passes the matrix under existing fixtures).
- Add `id: 'fac126-dept-1'` to `mockFaculty.department`.
- Update the `'should allow Dean to submit without enrollment'` test to use a `FACULTY_IN_CLASSROOM` version override (see Task 11).
- Add `ScopeResolverService` mock to the constructor providers in both `questionnaire.service.spec.ts` and `__tests__/questionnaire-types.spec.ts`.

**Integration / E2E:** No changes. The HTTP route signature is unchanged; new behavior is observable via 403 responses covered at the unit-test layer.

**Manual verification** (in `npm run start:dev` with mock worker via `docker compose up`):

1. Log in as a dean. POST `/questionnaires/submissions` for a faculty in the dean's department → 200.
2. Log in as the same dean. POST for a faculty in another department → 403 with `'Faculty is not within your scope.'`
3. Log in as a chairperson. Same two cases → same outcomes.
4. Log in as a student. POST a `FACULTY_FEEDBACK` submission → 200. POST a `FACULTY_IN_CLASSROOM` submission → 403 with the type message.
5. Log in as super admin. POST any combination → 200.
6. Run a CSV ingestion as super admin → all rows process successfully.
7. **Known gap verification (tech debt):** Run a CSV ingestion as a _dean_ targeting out-of-scope faculty → currently succeeds (row-level scope enforcement during bulk import is deferred and tracked as a follow-up ticket). Confirm this matches the `skipAuthorization` bypass design so reviewers don't mistake it for a bug in this PR.

### Notes

- Original ticket text scoped this only to OCE; user clarified during planning that the scope check applies to **both ICE and OCE** for dean/chairperson, since the question is "is this faculty in your scope?" not "is this submission type in your scope?"
- **CLS / ingestion verification (Step 2 finding):** `ResolveDepartmentIds` reads from CLS via `CurrentUserService.getOrFail()`. CLS context propagates through the ingestion engine's async chain (`@nestjs/cls` uses AsyncLocalStorage), so it would technically be available there. **However**, ingestion creates rows on behalf of synthetic students using `respondentId: student.id` — the matrix gate would block every imported row regardless of CLS state. Hence the `skipAuthorization` flag is the right escape hatch: it bypasses both the matrix check and the scope check uniformly for trusted bulk-import paths.
- **Helper design (post-adversarial-review refinement):** `resolveRespondentRole` is a pure classifier — `DEAN > CHAIRPERSON > STUDENT`, no SUPER_ADMIN branch. The SUPER_ADMIN short-circuit lives at the top of `assertSubmissionAuthorization` using `respondent.roles.includes(UserRole.SUPER_ADMIN)`. This preserves the pre-fix `[SUPER_ADMIN, DEAN]` → `DEAN` recording behavior and eliminates any risk that the recorded `submission.respondentRole` diverges from pre-fix behavior (AC15).
- **Temporal scope contract (F3 from adversarial review):** `ResolveDepartmentIds(semesterId)` takes a semester argument and queries `department.semester = semesterId`, so scope is computed **per the target submission's semester**, not the dean's "current" scope. A dean promoted between semesters retains their scope for prior semesters where they had institutional roles (assuming those institutional roles exist for that semester). If that temporal contract ever changes in `ScopeResolverService`, this gate needs to be re-reviewed.
- **`logger.warn` audit trail:** Two distinct warn-level events exist after this change — one when `skipAuthorization: true` is passed (audit trail for the security escape hatch; any new caller becomes visible in staging logs), and one when `ResolveDepartmentIds` returns an empty array for an authenticated dean/chair (signals a mis-provisioned user vs. a legitimately out-of-scope faculty). Both emit the same external 403 message — distinction is server-side only.
- **Tech debt to track as a follow-up ticket** (post-merge):
  - Row-level scope enforcement during CSV ingestion when a dean/chairperson is the importer (today: bypassed via `skipAuthorization`, with `logger.warn` audit trail in service logs)
  - Student `FACULTY_FEEDBACK` enrollment validation (must have active enrollment in a course taught by target faculty in the given semester) — represented in the spec as an `it.todo` pending test
  - Frontend should hide questionnaire types disallowed by the user's role
- The new `assertSubmissionAuthorization` method is also a natural future home for any per-questionnaire-type authorization that arises (e.g. once enrollment validation lands for `FACULTY_FEEDBACK`).

## Review Notes

- Adversarial review completed 2026-04-13.
- Findings: 16 total, 0 fixed, 16 acknowledged (user chose `[S] Skip` — proceed to commit, track follow-ups separately).
- **Critical findings deferred as follow-up tickets:**
  - **F1 (body-trust identity split):** `submitQuestionnaire` reads `respondent` from the body-supplied `data.respondentId` while `ScopeResolverService` reads the JWT principal from CLS. Pre-existing trust-the-body substrate the new gate inherits. Needs either a controller-level `body.respondentId === req.user.id` assertion or service-level identity anchoring on `CurrentUserService.getOrFail()`.
  - **F2 (super-admin spoof bypass):** SUPER_ADMIN short-circuit evaluates the body-respondent's roles, so any authenticated user who knows a super-admin UUID can disable the entire gate by setting `respondentId` to it. Same root cause as F1 and resolved by the same fix.
  - **F3 (silent role misclassification):** `resolveRespondentRole` falls FACULTY/ADMIN through to STUDENT. Should explicitly deny unknown roles.
- **High/Medium/Low findings (F4–F16):** matrix mutability via export, vacuous exhaustiveness test, empty-string deny sentinel, missing ingestion-engine assertion, double-signal warn, per-row warn spam, AC15 `[SUPER_ADMIN]`-alone uncovered, defensive `?.has`, shared `schemaSnapshot` reference in test cloner, dangling `mockResolvedValueOnce`, ungated `it.todo` ticket reference, etc.
- All findings catalogued in conversation history; track in a follow-up ticket before next security review.
