---
title: 'FAC-127 Admin UI for manual faculty home department override'
slug: 'fac-127-admin-manual-scope-override'
created: '2026-04-13'
revised: '2026-04-13 (post-adversarial-review, 13 findings addressed — 11 fixed, 1 skipped, 1 clarified)'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack:
  - NestJS 11 + MikroORM + PostgreSQL (api.faculytics)
  - BullMQ (audit queue — already wired, global module)
  - class-validator / class-transformer (request DTOs)
  - Jest + @nestjs/testing (unit tests)
  - React 19 + Vite + TypeScript strict (admin.faculytics)
  - TanStack Query v5 + shadcn/ui (new-york) + Tailwind 4
  - Native fetch via apiClient (NO Axios in admin console)
  - react-router v7 + sonner (toasts)
files_to_modify:
  - api.faculytics/src/modules/admin/admin.controller.ts
  - api.faculytics/src/modules/admin/admin.module.ts
  - api.faculytics/src/modules/admin/services/admin.service.ts
  - api.faculytics/src/modules/admin/services/admin.service.spec.ts
  - api.faculytics/src/modules/admin/admin.controller.spec.ts
  - api.faculytics/src/modules/admin/dto/requests/update-scope-assignment.request.dto.ts (NEW)
  - api.faculytics/src/modules/admin/dto/validators/at-least-one-field.validator.ts (NEW)
  - api.faculytics/src/modules/admin/dto/responses/admin-user-scope-assignment.response.dto.ts (NEW)
  - api.faculytics/src/modules/admin/dto/responses/admin-user-detail.response.dto.ts
  - api.faculytics/src/modules/audit/audit-action.enum.ts
  - admin.faculytics/src/types/api.ts
  - admin.faculytics/src/features/admin/user-detail-page.tsx
  - admin.faculytics/src/features/admin/scope-assignment-dialog.tsx (NEW)
  - admin.faculytics/src/features/admin/use-scope-assignment.ts (NEW)
code_patterns:
  - 'AdminController class-level @UseJwtGuard(SUPER_ADMIN) — inherits to new PATCH'
  - 'AdminController class-level @UseInterceptors(CurrentUserInterceptor) — REQUIRED for CurrentUserService to work (matches analytics/reports/enrollments/etc.)'
  - 'PascalCase service method naming (UpdateUserScopeAssignment)'
  - 'em.findOneOrFail with failHandler returning NotFoundException'
  - 'Nullable ManyToOne reset: em.assign(user, { department: null }) — NOT "user.department = undefined" (MikroORM gotcha)'
  - 'InstitutionalRoleSource enum from user-institutional-role.entity.ts — string cast for comparisons'
  - '@Audited decorator NOT used here — inline AuditService.Emit after flush for before/after capture'
  - 'DTO request validation: @IsOptional + @ValidateIf((_, v) => v !== null) + @IsUUID(4) for nullable-UUID fields'
  - 'Class-level DTO validation: custom @Validate(AtLeastOneField, [...fields]) for "at least one of N fields required"'
  - 'DTO response: static Map(entity) pattern — existing AdminUserDetailResponseDto.Map has 3 args (user, enrollments, institutionalRoles); new scope DTO Map has 1 arg (user)'
  - 'Mutation hook: useMutation + apiClient + sonner toast + queryClient.invalidateQueries(["admin-user", envId, userId])'
  - 'Dependent selects: reset child selection on parent change (users-page.tsx pattern)'
  - 'Source badge: amber styling for "manual" (mirrors institutional-roles card at user-detail-page.tsx:279-286)'
  - 'Constant SCOPE_FIELD_NAMES = ["department", "departmentSource", "program", "programSource"] as const — pins audit metadata.changedFields contract'
test_patterns:
  - 'Jest + NestJS TestingModule with plain object mocks keyed by jest.fn()'
  - 'em.findOneOrFail mock throws via opts.failHandler() for 404 paths'
  - 'describe block per method with nested scenarios'
  - 'Controller spec overrides AuthGuard("jwt") + RolesGuard with { canActivate: () => true }'
  - 'Controller spec overrides CurrentUserInterceptor with { intercept: (_, next) => next.handle() }'
  - 'Service spec mocks CurrentUserService as { get: jest.fn().mockReturnValue({ id, userName }) }'
  - 'AuditService mock: { Emit: jest.fn() } asserted via toHaveBeenCalledWith — metadata.changedFields uses literal strings from SCOPE_FIELD_NAMES'
---

# Tech-Spec: FAC-127 Admin UI for manual faculty home department override

**Created:** 2026-04-13
**GitHub Issue:** https://github.com/CtrlAltElite-Devs/api.faculytics/issues/300

## Overview

### Problem Statement

FAC-125 introduced enrollment-based auto-derivation for `user.department` and `user.program` with source-tracking columns (`departmentSource`, `programSource`). The derivation is necessarily imperfect for edge cases: cross-department faculty, visiting faculty, and historical data mismatches. Super admins currently have no UI to correct these assignments — the only remediation path is raw SQL, which is operationally unsafe.

FAC-127 delivers the safety net: a super-admin–only endpoint and console UI that flips a user's scope to `source='manual'`, preventing the next Moodle sync from clobbering the correction.

### Solution

**Backend (`api.faculytics`):** New `PATCH /admin/users/:id/scope-assignment` endpoint accepting `{ departmentId?, programId? }`. Explicit `null` resets the field to auto-derived. Updates `user.department` / `user.program` and sets the matching `*Source` column to `'manual'` (or back to `'auto'` on reset). Emits an audit log entry with before/after values via `AuditService.Emit`.

**Frontend (`admin.faculytics`):** New "Institutional Assignment" card on the existing user detail page showing department + source badge, program + source badge, an "Edit" button that opens a dialog with dependent dropdowns, and a "Reset to Auto" affordance per field.

### Scope

**In Scope:**

- **API (`api.faculytics`)**
  - New `PATCH /admin/users/:id/scope-assignment` endpoint on `AdminController` (super admin only — decorator already in place on the class).
  - New `UpdateScopeAssignmentDto` request with `departmentId?: string | null`, `programId?: string | null` — `null` = reset, `undefined` = leave untouched.
  - New `AdminService.UpdateUserScopeAssignment(userId, dto)` method.
  - New `ADMIN_USER_SCOPE_UPDATE` entry in `AuditAction` enum.
  - First inline `AuditService.Emit()` call in the codebase (`AdminService` constructor injects `AuditService`).
  - Extend `AdminUserDetailResponseDto` with `departmentSource`, `programSource` string fields.
  - New `AdminUserScopeAssignmentResponseDto` (minimal shape: `{ id, department, program, departmentSource, programSource }`) returned by the PATCH.
  - Unit tests for `AdminService.UpdateUserScopeAssignment` (happy path, reset, mismatched dept+program, no-op / empty body, 404, audit emit assertion).
  - Controller-level spec coverage consistent with existing `admin.controller.spec.ts`.

- **Frontend (`admin.faculytics`)**
  - Extend `AdminUserDetail` type in `src/types/api.ts` with `departmentSource`, `programSource`.
  - New "Institutional Assignment" `<Card>` on `src/features/admin/user-detail-page.tsx` displaying department + source badge and program + source badge, plus an "Edit" button.
  - New `src/features/admin/scope-assignment-dialog.tsx` — shadcn `Dialog` with two `Select` dropdowns (department, program), pre-filled from current values, with a "Reset to Auto" button per field. Program select refetches when department changes.
  - New `src/features/admin/use-scope-assignment.ts` — `useUpdateScopeAssignment` mutation + `useDepartmentOptions` / `useProgramOptions` queries (backed by existing `/admin/filters/departments` and `/admin/filters/programs`).
  - Toast feedback on success/error via `sonner`; invalidate `['admin-user', envId, userId]` on success.

**Out of Scope:**

- Changes to `AdminUserListResponseDto` (list-view source indicators deferred — issue scope is detail page only).
- Any changes to `EnrollmentSyncService.backfillUserScopes` — the `source='manual'` guard already exists there (`moodle-enrollment-sync.service.ts:405-410`).
- A "can't modify self" guard on super admins (no precedent in codebase; audit log is the accountability layer).
- New filter endpoints — existing `/admin/filters/departments` and `/admin/filters/programs` already return the options we need.
- Modifications to `app.faculytics/` (the public-facing Next.js frontend) — this ticket is admin-console only.

## Context for Development

### Codebase Patterns (verified in Step 2 investigation)

**Backend — api.faculytics**

- **Class-level auth:** `AdminController` is `@UseJwtGuard(UserRole.SUPER_ADMIN)` at the class (`admin.controller.ts:32`). The new PATCH inherits without extra decoration.
- **Method naming:** PascalCase (`AssignInstitutionalRole`, `GetUserDetail`, `ListUsers`). New method: `UpdateUserScopeAssignment`.
- **Entity lookup:** `em.findOneOrFail(User, { id }, { failHandler: () => new NotFoundException('User not found') })` — same pattern used throughout `AssignInstitutionalRole`.
- **Source flag values:** Entity columns `user.departmentSource` / `user.programSource` are declared as plain `string` (see the cycle-import comment at `user.entity.ts:63-65`). Assign values using `InstitutionalRoleSource.AUTO` / `.MANUAL` from `user-institutional-role.entity.ts:6`, and compare using `as string` cast — same approach `backfillUserScopes` uses at `moodle-enrollment-sync.service.ts:405-407`.
- **Write-then-flush:** Mutations change entity properties directly, then call `await em.flush()`. No explicit `em.persist` needed for already-managed entities.
- **Audit emission pattern (establishing new precedent):** Inject `AuditService` (from the `@Global()` `AuditModule`, no module imports required). Snapshot primitives **before** flush — entity references are live and will mutate otherwise. Call `auditService.Emit({ action, resourceType: 'User', resourceId, metadata })` **after** `em.flush()` succeeds, wrapped in try/catch that logs and swallows. `AuditService.Emit` already has its own internal try/catch around the BullMQ `queue.add`, so the outer try/catch is belt-and-suspenders defense.
- **DTO validation — nullable UUIDs:** class-validator pattern for "field may be omitted OR explicitly null OR a UUID":
  ```ts
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  departmentId?: string | null;
  ```
  Reference for existing DTOs: `list-users-query.dto.ts` (uses `@IsUUID() + @IsOptional()` without null support). This new DTO extends the pattern because `null` is meaningful.
- **DTO response mapping:** Static `Map(entity)` method on each response class. `AdminUserDetailResponseDto.Map` at `admin-user-detail.response.dto.ts:135` is the template.
- **`AdminService` constructor today:** Only `private readonly em: EntityManager`. Will extend to `(em: EntityManager, auditService: AuditService)`.

**Frontend — admin.faculytics**

- **Existing route:** `/users/:userId` → `UserDetailPage` (`routes.tsx:29`). No router changes.
- **Existing detail query:** `useUserDetail(userId)` keyed `['admin-user', activeEnvId, userId]`. Mutation invalidates with the same key.
- **Mutation hook template:** `use-institutional-roles.ts` — `useMutation` + `apiClient('/admin/...', { method, body })` + `sonner` `toast.success` / `toast.error` + `queryClient.invalidateQueries({ queryKey: ['admin-users', envId] })`. Replicate shape, swap the query key.
- **Dialog component template:** `role-action-dialog.tsx` — shadcn `Dialog` + `Select` + `Label` + `isPending` button state. For "Reset to Auto", reuse the `AlertDialog` pattern from the same file for destructive confirmation.
- **Dependent selects:** `users-page.tsx:204-242` — changing department resets program selection. Same pattern applies inside the scope-assignment dialog.
- **Filter hooks already exist:** `useDepartments(campusId?)` and `usePrograms(departmentId?)` in `use-admin-filters.ts`. Both return `FilterOption[]` (shape `{ id, code, name }`). Reuse directly — no new hooks required.
- **Source badge styling:** existing institutional-roles card at `user-detail-page.tsx:279-286` already renders a `'manual'` badge with `border-amber-500/50 text-amber-600`. Mirror that for the new scope-source badges for visual consistency.
- **Tailwind stagger class:** `dashboard-stagger` on the root `<div>` for the existing detail page. Keep it.
- **TypeScript strictness:** `erasableSyntaxOnly` is enabled — no `public` parameter properties. Not a risk for functional components, noted for completeness.

### Files to Reference

| File                                                                                         | Action     | Purpose                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.faculytics/src/modules/admin/admin.controller.ts:32,108-112`                            | Edit       | Add `@UseInterceptors(CurrentUserInterceptor)` at class level (**required for F1 audit actor**); add `@Patch('users/:id/scope-assignment')` handler                               |
| `api.faculytics/src/modules/admin/services/admin.service.ts:26`                              | Edit       | Constructor gains `AuditService` + `CurrentUserService`; add `UpdateUserScopeAssignment(userId, dto)` method; add `SCOPE_FIELD_NAMES` module-level const                          |
| `api.faculytics/src/modules/admin/admin.module.ts:24-41`                                     | Edit       | Add `CommonModule` + `DataLoaderModule` to `imports` (CommonModule re-exports AppClsModule → CurrentUserService; DataLoaderModule provides UserLoader for CurrentUserInterceptor) |
| `api.faculytics/src/modules/admin/dto/validators/at-least-one-field.validator.ts`            | **Create** | Custom class-validator `@ValidatorConstraint` for "at least one of N fields required", applied as `@Validate(AtLeastOneField, ['departmentId', 'programId'])` on DTO class        |
| `api.faculytics/src/modules/admin/dto/requests/update-scope-assignment.request.dto.ts`       | **Create** | Request DTO: `@IsOptional + @ValidateIf(v !== null) + @IsUUID('4')` on both fields                                                                                                |
| `api.faculytics/src/modules/admin/dto/responses/admin-user-scope-assignment.response.dto.ts` | **Create** | Minimal response `{ id, department, program, departmentSource, programSource }` with static `Map(user)`                                                                           |
| `api.faculytics/src/modules/admin/dto/responses/admin-user-detail.response.dto.ts:120-170`   | Edit       | Add `departmentSource: string` and `programSource: string` to class + `Map`                                                                                                       |
| `api.faculytics/src/modules/audit/audit-action.enum.ts:1-19`                                 | Edit       | Add `ADMIN_USER_SCOPE_UPDATE: 'admin.user.scope.update'`                                                                                                                          |
| `api.faculytics/src/entities/user.entity.ts:46-70`                                           | Reference  | Confirms `department`, `program`, `departmentSource`, `programSource` shape (FAC-125)                                                                                             |
| `api.faculytics/src/entities/user-institutional-role.entity.ts:6-9`                          | Reference  | `InstitutionalRoleSource` enum values                                                                                                                                             |
| `api.faculytics/src/modules/moodle/services/moodle-enrollment-sync.service.ts:405-410`       | Reference  | Source-guard already honors `manual` — confirms no sync changes needed                                                                                                            |
| `api.faculytics/src/modules/audit/audit.service.ts:16-36`                                    | Reference  | `AuditService.Emit(EmitParams)` signature                                                                                                                                         |
| `api.faculytics/src/modules/audit/audit.module.ts:14`                                        | Reference  | `@Global()` — AuditService available without explicit import                                                                                                                      |
| `api.faculytics/src/modules/common/interceptors/current-user.interceptor.ts`                 | Reference  | Depends on `UserLoader` (DataLoaderModule) + `CurrentUserService` (AppClsModule via CommonModule)                                                                                 |
| `api.faculytics/src/modules/common/common.module.ts:19`                                      | Reference  | Re-exports `AppClsModule` → `CurrentUserService` transitively                                                                                                                     |
| `api.faculytics/src/modules/common/data-loaders/index.module.ts`                             | Reference  | Provides `UserLoader` via `ClsModule.forFeatureAsync`                                                                                                                             |
| `api.faculytics/src/modules/analytics/analytics.controller.ts:28-31`                         | Reference  | **Canonical pattern** — class decorated with `@UseJwtGuard + @UseInterceptors(CurrentUserInterceptor)`                                                                            |
| `api.faculytics/src/modules/analytics/analytics.module.ts:12-18`                             | Reference  | **Canonical pattern** — module imports `CommonModule + DataLoaderModule`                                                                                                          |
| `api.faculytics/src/configurations/app/index.ts:8-15`                                        | Reference  | Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — confirms class-validator errors come out in standard shape                            |
| `api.faculytics/src/modules/admin/dto/responses/admin-user-item.response.dto.ts:5`           | Reference  | `AdminUserScopedRelationDto` — **confirmed exported**, reuse for new scope DTO                                                                                                    |
| `api.faculytics/src/modules/admin/services/admin-filters.service.ts:82-96`                   | Reference  | `GetDepartments(undefined, undefined)` returns all departments — confirms dialog no-args path works                                                                               |
| `api.faculytics/src/modules/audit/dto/emit-params.dto.ts:1-13`                               | Reference  | `EmitParams` shape — metadata is `Record<string, unknown>`                                                                                                                        |
| `api.faculytics/src/modules/admin/services/admin.service.spec.ts`                            | Edit       | Add `describe('UpdateUserScopeAssignment')` block; mock `AuditService.Emit`                                                                                                       |
| `api.faculytics/src/modules/admin/admin.controller.spec.ts`                                  | Edit       | Add delegation test for the new route                                                                                                                                             |
| `admin.faculytics/src/features/admin/user-detail-page.tsx:159-173`                           | Edit       | Remove dept/program from MetaCell grid; add new "Institutional Assignment" `<Card>` below profile card                                                                            |
| `admin.faculytics/src/features/admin/scope-assignment-dialog.tsx`                            | **Create** | shadcn `Dialog` + two dependent `Select`s + per-field "Reset to Auto" + submit                                                                                                    |
| `admin.faculytics/src/features/admin/use-scope-assignment.ts`                                | **Create** | `useUpdateScopeAssignment()` mutation with sonner toast + detail invalidation                                                                                                     |
| `admin.faculytics/src/features/admin/use-user-detail.ts:14`                                  | Reference  | `['admin-user', activeEnvId, userId]` query key to invalidate                                                                                                                     |
| `admin.faculytics/src/features/admin/use-institutional-roles.ts:29-51`                       | Reference  | Mutation hook template                                                                                                                                                            |
| `admin.faculytics/src/features/admin/use-admin-filters.ts:25-49`                             | Reference  | `useDepartments(campusId?)` + `usePrograms(departmentId?)` — reuse directly                                                                                                       |
| `admin.faculytics/src/features/admin/role-action-dialog.tsx`                                 | Reference  | Dialog + Select + dependent field pattern                                                                                                                                         |
| `admin.faculytics/src/features/admin/users-page.tsx:182-242`                                 | Reference  | Dependent select pattern (dept change resets program)                                                                                                                             |
| `admin.faculytics/src/types/api.ts:169-186`                                                  | Edit       | Extend `AdminUserDetail` interface with `departmentSource`, `programSource`                                                                                                       |
| `admin.faculytics/src/lib/api-client.ts:31-54`                                               | Reference  | Supports any HTTP method via `options.method`; auto-prefixes `/api/v1`                                                                                                            |
| `admin.faculytics/src/routes.tsx:29`                                                         | Reference  | `/users/:userId` route already wired — no changes                                                                                                                                 |

### Technical Decisions (Party-Mode Consensus)

1. **PATCH with `null` = reset**: Single endpoint, merge-patch semantics. `undefined` leaves untouched, explicit `null` resets the field to auto. Empty body (`{}`) → `400 Bad Request` "At least one field required".
2. **Independence, not cascade**: If only `programId` is provided, only `program` + `programSource` change. No implicit department cascade (even though the sync does cascade). This preserves admin intent.
3. **Consistency guard (both fields in one request)**: If both `departmentId` and `programId` are provided AND non-null, validate `program.department.id === departmentId` → 400 on mismatch. No cross-request guard (divergence across separate PATCH calls is admin-owned).
4. **Response shape**: Minimal `{ id, department, program, departmentSource, programSource }`. Frontend calls `queryClient.invalidateQueries` to refetch full detail — avoids re-populating enrollments and institutional roles for a scope-only write.
5. **Detail DTO extension**: `AdminUserDetailResponseDto` gains `departmentSource`, `programSource`. `AdminUserItemResponseDto` untouched.
6. **Audit emit — first inline usage**: Inject `AuditService` into `AdminService`. Snapshot `{ departmentId, departmentSource, programId, programSource }` primitives before flush; emit after flush succeeds with metadata `{ before, after, changedFields: string[] }`. New action: `ADMIN_USER_SCOPE_UPDATE`. Wrap emit in try-catch that logs and swallows — the request must succeed even if audit queuing fails.
7. **No self-assignment guard**: Super admin can modify their own scope. Audit log captures actor ID.
8. **Source enum casting**: Entity columns are `string` (not the `InstitutionalRoleSource` enum — see the comment at `user.entity.ts:63-65` explaining the circular-import workaround). Assign enum values but compare with `as string` cast. Same pattern as `backfillUserScopes`.
9. **Detail page cleanup**: The existing `UserDetailPage` renders `Department` / `Program` as plain `MetaCell`s in the profile card (`user-detail-page.tsx:162-163`). These become redundant once the new "Institutional Assignment" card exists. Decision: **remove the two MetaCells** to eliminate duplication; keep `Campus` + `Moodle ID` + timestamps in the meta grid.
10. **Dialog dependent-select UX**: Inside the edit dialog, changing department clears the program selection (matches `users-page.tsx` filter pattern). The program select is scoped to the chosen department via `usePrograms(departmentId)`. "Save" disabled until at least one field has a pending change.
11. **Reset-to-Auto UX**: Two approaches considered — (a) separate button per field inside the edit dialog that submits `{ fieldName: null }` immediately, or (b) in-dialog "Clear" that only takes effect on save. Going with **(a)** because it's an explicit, semantically distinct action and matches the issue's "Reset to Auto" affordance in the AC. Confirmation via `AlertDialog` is optional — skip it, since the action is recoverable (next sync or a fresh edit restores values).
12. **Actor capture in audit log — full plumbing** (revised post-F1 review): `CurrentUserService.get()` reads `currentUser` from the CLS store, which is only populated when `CurrentUserInterceptor` runs on the request. The codebase convention (verified in `analytics.controller.ts:30`, `reports.controller.ts`, `enrollments.controller.ts`, `faculty.controller.ts`, `questionnaire.controller.ts`, `moodle-*.controller.ts`, `auth.controller.ts` — 11 controllers total) is:
    - Decorate the controller class with `@UseInterceptors(CurrentUserInterceptor)`.
    - Import `CommonModule` (re-exports `AppClsModule` which provides `CurrentUserService`) AND `DataLoaderModule` (provides `UserLoader` which `CurrentUserInterceptor` depends on) into the feature module.
    - `AdminModule` currently imports **neither**. Both must be added.
    - Reference implementation: `src/modules/analytics/analytics.module.ts:13-17` imports both modules, and `src/modules/analytics/analytics.controller.ts:30` applies the interceptor. Copy this pattern exactly.
    - **Without this plumbing, `metadata.actorId` will be `undefined` on every audit row** — which nullifies the "audit log is the accountability layer" defense for skipping the self-assignment guard (Decision #7). This is NOT optional.

13. **`changedFields` contract — pinned literals** (new, post-F7 review): To prevent drift in audit metadata shape (this being the first inline `AuditService.Emit` usage sets precedent for every future inline emit), introduce a typed constant in the service file:

    ```ts
    const SCOPE_FIELD_NAMES = [
      'department',
      'departmentSource',
      'program',
      'programSource',
    ] as const;
    type ScopeFieldName = (typeof SCOPE_FIELD_NAMES)[number];
    ```

    `metadata.changedFields: ScopeFieldName[]` is computed as the subset of `SCOPE_FIELD_NAMES` whose before/after values differ. Tests assert the exact string literals. Downstream audit-log consumers can `WHERE metadata->>'changedFields' @> '["departmentSource"]'`-style query reliably.

14. **Empty-body validation — DTO-level, not service-level** (revised post-F8 review): Originally the service was going to throw `BadRequestException('At least one required')` which produces `{ message: string }`. But class-validator errors (invalid UUID etc.) produce `{ message: string[], error: 'Bad Request', statusCode: 400 }`. Inconsistent shapes break the frontend's single `onError` path. **Decision: create a custom class-validator** `AtLeastOneField` that validates at the DTO class level. This keeps all 400 error shapes uniform. Verified: global `ValidationPipe` at `src/configurations/app/index.ts:8-15` has `whitelist: true, forbidNonWhitelisted: true, transform: true, enableImplicitConversion: true` — custom validators run through it.

15. **Nullable ManyToOne reset — `em.assign` not property set** (new, post-F3 review): MikroORM treats `user.department = undefined` as "unchanged" in some flush paths (known gotcha). The correct reset is `em.assign(user, { department: null })`. The TypeScript type `department?: Department` doesn't accept `null` literally — use `em.assign` which bypasses the type check safely since the column is declared `nullable: true`. Do not change the entity's TypeScript type (convention break not worth it for one entity).

16. **Post-reset divergence is intentional** (new, post-F3 review): Resetting only `departmentId` while `programId` is untouched leaves `user.program.department` pointing at the just-cleared department. This is intentional per Decision #2 (independence). The next Moodle sync cycle re-derives `department` from `program` only if `programSource === 'auto'`. Admins who want a clean slate should reset both fields. Documented in AC and test cases.

17. **Dialog department dropdown is NOT campus-scoped** (revised post-F4 review): In the edit dialog, call `useDepartments()` with no arguments. The admin-filters endpoint already handles no-args (`admin-filters.service.ts:82-96` — empty `campusId` / `semesterId` returns all departments ordered by code). Campus scoping in the filter bar on `users-page.tsx` is intentional there (narrowing a list view). In the edit dialog, campus scoping would block legitimate cross-campus remediation and break pre-fill when the user's current department isn't in the filtered set. Implementation note: if the user's current department somehow isn't in the fetched list (race condition, soft-deleted, etc.), splice it in as a synthetic option so the Select pre-fills correctly.

## Implementation Plan

### Tasks

**Ordering rationale:** Backend lowest-level first (enum → DTOs → module wiring → service → controller → tests), then frontend (types → hook → dialog → page wiring), then validation. This order lets each step compile and test without forward references.

#### Phase 1 — API (api.faculytics)

- [x] **Task 1: Add new audit action constant**
  - File: `api.faculytics/src/modules/audit/audit-action.enum.ts`
  - Action: Add `ADMIN_USER_SCOPE_UPDATE: 'admin.user.scope.update',` to the `AuditAction` object (place alphabetically near existing `ADMIN_SYNC_*` entries).
  - Notes: No type work needed — the derived `type AuditAction` picks it up automatically.

- [x] **Task 2a: Create custom class-validator for "at least one field required"**
  - File: `api.faculytics/src/modules/admin/dto/validators/at-least-one-field.validator.ts` (**new**)
  - Action: Create a class-validator constraint:

    ```ts
    import {
      ValidatorConstraint,
      ValidatorConstraintInterface,
      ValidationArguments,
    } from 'class-validator';

    @ValidatorConstraint({ name: 'atLeastOneField', async: false })
    export class AtLeastOneField implements ValidatorConstraintInterface {
      validate(_value: unknown, args: ValidationArguments): boolean {
        const object = args.object as Record<string, unknown>;
        const fieldNames = args.constraints as string[];
        return fieldNames.some((name) => object[name] !== undefined);
      }

      defaultMessage(args: ValidationArguments): string {
        const fieldNames = args.constraints as string[];
        return `At least one of the following fields is required: ${fieldNames.join(', ')}`;
      }
    }
    ```

  - Notes: Applied at the class level of the DTO via `@Validate(AtLeastOneField, ['departmentId', 'programId'])`. Produces class-validator-shaped errors (`{ message: string[], error: 'Bad Request', statusCode: 400 }`), consistent with every other 400 response. `undefined` is treated as "not provided"; `null` counts as provided (explicit reset).

- [x] **Task 2b: Create request DTO for scope assignment update**
  - File: `api.faculytics/src/modules/admin/dto/requests/update-scope-assignment.request.dto.ts` (**new**)
  - Action: Create `UpdateScopeAssignmentDto` with two fields + class-level `@Validate`:

    ```ts
    import { ApiPropertyOptional } from '@nestjs/swagger';
    import { IsOptional, IsUUID, Validate, ValidateIf } from 'class-validator';
    import { AtLeastOneField } from '../validators/at-least-one-field.validator';

    @Validate(AtLeastOneField, ['departmentId', 'programId'])
    export class UpdateScopeAssignmentDto {
      @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'Target department UUID, or null to reset to auto-derived',
      })
      @IsOptional()
      @ValidateIf((_, value) => value !== null)
      @IsUUID('4')
      departmentId?: string | null;

      @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'Target program UUID, or null to reset to auto-derived',
      })
      @IsOptional()
      @ValidateIf((_, value) => value !== null)
      @IsUUID('4')
      programId?: string | null;
    }
    ```

  - Notes: `@IsOptional` accepts both `null` and `undefined`. `@ValidateIf((_, value) => value !== null)` bypasses `@IsUUID` when the value is explicitly `null`, allowing the reset semantic. Empty-body (both `undefined`) rejected by the class-level `@Validate(AtLeastOneField, ...)` with a class-validator-shaped error. No service-level empty-body guard needed.

- [x] **Task 3: Create minimal response DTO for scope assignment PATCH**
  - File: `api.faculytics/src/modules/admin/dto/responses/admin-user-scope-assignment.response.dto.ts` (**new**)
  - Action: Create `AdminUserScopeAssignmentResponseDto` class with fields `{ id, department, program, departmentSource, programSource }`. Reuse `AdminUserScopedRelationDto` — **confirmed exported** from `admin-user-item.response.dto.ts:5` — for the nested `department` and `program` fields. Include a static **single-arg** `Map(user: User): AdminUserScopeAssignmentResponseDto` method (NOT the 3-arg signature used by `AdminUserDetailResponseDto`).
  - Notes: Minimal shape avoids re-populating enrollments + institutional roles on a scope-only write. Frontend invalidates the full detail query on success to refetch the heavy data. The `Map()` method reads `user.department?.id` / `.code` / `.name`, same for program, plus the two source strings.

- [x] **Task 4: Extend user detail response DTO with source fields**
  - File: `api.faculytics/src/modules/admin/dto/responses/admin-user-detail.response.dto.ts`
  - Action: Add two fields to `AdminUserDetailResponseDto` class: `departmentSource: string` and `programSource: string`, both with `@ApiProperty({ enum: ['auto', 'manual'] })`. Place them immediately after `program` (line ~127) for locality. **The existing `Map()` signature is 3-arg** (`Map(user: User, enrollments: Enrollment[], institutionalRoles: UserInstitutionalRole[])` at line 135) — do NOT change the signature, only update the return body to include `departmentSource: user.departmentSource` and `programSource: user.programSource`.
  - Notes: All existing callers pass three args — leave them alone. The response interface change is additive and backward-compatible.

- [x] **Task 5: Wire `CommonModule` + `DataLoaderModule` into `AdminModule`**
  - File: `api.faculytics/src/modules/admin/admin.module.ts`
  - Action: Add two imports to the `imports: [...]` array (after `MikroOrmModule.forFeature(...)`, before `QuestionnaireModule`):
    ```ts
    import { CommonModule } from '../common/common.module';
    import DataLoaderModule from '../common/data-loaders/index.module';
    // ...
    imports: [
      MikroOrmModule.forFeature([...]),
      CommonModule,        // provides CurrentUserService via re-exported AppClsModule
      DataLoaderModule,    // provides UserLoader for CurrentUserInterceptor
      QuestionnaireModule,
    ],
    ```
  - Notes: **This is the canonical plumbing** — same pair used by `analytics.module.ts:12-18`, `reports.module.ts`, `enrollments.module.ts`, etc. `CommonModule` re-exports `AppClsModule` (line 19 of `common.module.ts`) which provides `CurrentUserService`. `DataLoaderModule` provides `UserLoader` which `CurrentUserInterceptor` depends on. Importing only one of the two will cause the interceptor to fail at runtime. **Without both, `CurrentUserInterceptor` cannot run and `metadata.actorId` will be undefined in every audit row** — F1 critical fix.

- [x] **Task 6: Extend `AdminService` constructor with audit dependencies**
  - File: `api.faculytics/src/modules/admin/services/admin.service.ts`
  - Action: Update constructor to inject `AuditService` and `CurrentUserService`:
    ```ts
    constructor(
      private readonly em: EntityManager,
      private readonly auditService: AuditService,
      private readonly currentUserService: CurrentUserService,
    ) {}
    ```
  - Notes: Add imports: `AuditService` from `src/modules/audit/audit.service`, `CurrentUserService` from `src/modules/common/cls/current-user.service`, `AuditAction` from `src/modules/audit/audit-action.enum`.

- [x] **Task 7: Implement `UpdateUserScopeAssignment` on `AdminService`**
  - File: `api.faculytics/src/modules/admin/services/admin.service.ts`
  - Action: Add a module-level constant + new public method.

    **Module-level constant** (top of file, after imports):

    ```ts
    const SCOPE_FIELD_NAMES = [
      'department',
      'departmentSource',
      'program',
      'programSource',
    ] as const;
    type ScopeFieldName = (typeof SCOPE_FIELD_NAMES)[number];
    ```

    **Method flow** (empty-body validation already handled by the DTO's `@Validate(AtLeastOneField, ...)` — no service-level guard needed):
    1. Load user: `em.findOneOrFail(User, { id: userId }, { populate: ['department', 'program'], failHandler: () => new NotFoundException('User not found') })`.
    2. Snapshot `before` into a plain object using primitives only (no entity references, which mutate):
       ```ts
       const before = {
         department: user.department?.id ?? null,
         departmentSource: user.departmentSource,
         program: user.program?.id ?? null,
         programSource: user.programSource,
       };
       ```
    3. **Cross-field consistency guard**: if both `dto.departmentId` and `dto.programId` are truthy (non-null, non-undefined), load `Program` with `populate: ['department']`, verify `program.department?.id === dto.departmentId`, else throw `BadRequestException('Program does not belong to the specified department')`.
    4. **Apply `departmentId`**:
       - `undefined`: leave untouched.
       - `null`: `em.assign(user, { department: null })` (MikroORM-safe nullable reset — see Decision #15); `user.departmentSource = InstitutionalRoleSource.AUTO as string`.
       - UUID string: `em.findOneOrFail(Department, { id: dto.departmentId }, { failHandler: () => new NotFoundException('Department not found') })`; `user.department = department`; `user.departmentSource = InstitutionalRoleSource.MANUAL as string`.
    5. **Apply `programId`** — mirror the structure for `Program` entity with its own 404 (`'Program not found'`).
    6. Compute `after` snapshot with the same shape as `before`.
    7. Compute `changedFields: ScopeFieldName[]`:
       ```ts
       const changedFields: ScopeFieldName[] = SCOPE_FIELD_NAMES.filter(
         (name) => before[name] !== after[name],
       );
       ```
    8. `await em.flush()`.
    9. Emit audit event (forward-compat try/catch — see Decision #14):
       ```ts
       try {
         const actor = this.currentUserService.get();
         await this.auditService.Emit({
           action: AuditAction.ADMIN_USER_SCOPE_UPDATE,
           actorId: actor?.id,
           actorUsername: actor?.userName,
           resourceType: 'User',
           resourceId: user.id,
           metadata: { before, after, changedFields },
         });
       } catch (err) {
         this.logger.warn(
           `Audit emit failed for scope update: ${(err as Error).message}`,
         );
       }
       ```
    10. Return `AdminUserScopeAssignmentResponseDto.Map(user)`.

  - Notes: Add imports for `Department`, `Program`, `AuditAction`, `AuditService`, `CurrentUserService`, `AdminUserScopeAssignmentResponseDto`. Check if `Logger` is imported — add it if not. Current consistency guard does NOT fire when only one of the two fields is provided (Decision #2 independence). Source enum assignment uses `as string` cast (circular-import workaround per `user.entity.ts:63-65`).

- [x] **Task 8: Add `PATCH` handler on `AdminController` + wire `CurrentUserInterceptor`**
  - File: `api.faculytics/src/modules/admin/admin.controller.ts`
  - Action: Two edits:
    1. **Add class-level `@UseInterceptors(CurrentUserInterceptor)`** below the existing `@UseJwtGuard(UserRole.SUPER_ADMIN)` at line 32. Import `UseInterceptors` from `@nestjs/common` and `CurrentUserInterceptor` from `src/modules/common/interceptors/current-user.interceptor`. This is the F1 critical fix — without this line, `CurrentUserService.get()` returns null and audit rows lose actor attribution.
    2. **Add `@Patch('users/:id/scope-assignment')`** handler `UpdateUserScopeAssignment` that takes `@Param('id', ParseUUIDPipe) id: string` + `@Body() dto: UpdateScopeAssignmentDto` and delegates to `this.adminService.UpdateUserScopeAssignment(id, dto)`. Include Swagger decorators (`@ApiOperation`, `@ApiParam`, `@ApiResponse` for 200 / 400 / 404).
  - Notes: Place the new handler after `GetUserDetail` to keep user-scoped routes grouped. Add `Patch` to the `@nestjs/common` imports. Import `UpdateScopeAssignmentDto` and `AdminUserScopeAssignmentResponseDto`. The class-level interceptor will also run for every existing endpoint on the controller — this is a no-op enhancement for them (they currently ignore `CurrentUserService`) but puts actor context in CLS for any future additions.

- [x] **Task 9: Unit tests for `UpdateUserScopeAssignment`**
  - File: `api.faculytics/src/modules/admin/services/admin.service.spec.ts`
  - Action: Add `describe('UpdateUserScopeAssignment')` block. Update the `beforeEach` to also mock `AuditService` (`{ Emit: jest.fn().mockResolvedValue(undefined) }`) and `CurrentUserService` (`{ get: jest.fn().mockReturnValue({ id: 'actor-1', userName: 'admin' }) }`), and pass them into the TestingModule providers array. Also extend the `em` mock with `assign: jest.fn()` (for the nullable reset path). Test cases — all `changedFields` assertions use literal strings from `SCOPE_FIELD_NAMES`:
    1. **Happy path — set department only**: user exists with auto department+program; dto `{ departmentId: 'new-dept-uuid' }`; expect `em.flush` called once, `user.department === newDept`, `user.departmentSource === 'manual'`, `user.program` and `user.programSource` untouched, `auditService.Emit` called with `metadata.changedFields` equal to exactly `['department', 'departmentSource']` and `metadata.before.department === 'old-dept-uuid'`, `metadata.after.department === 'new-dept-uuid'`, `metadata.actorId === 'actor-1'`.
    2. **Happy path — set program only**: symmetric. `metadata.changedFields === ['program', 'programSource']`.
    3. **Happy path — set both matching**: dto with both fields where `program.department.id === dto.departmentId`; mock Program lookup to return `{ id: 'prog', department: { id: 'dept' } }`; expect both updated to manual, `metadata.changedFields === ['department', 'departmentSource', 'program', 'programSource']` (order per `SCOPE_FIELD_NAMES`).
    4. **Reject mismatch**: dto with both fields but `program.department.id !== dto.departmentId`; expect `BadRequestException` with message containing 'does not belong'; `em.flush` NOT called; `auditService.Emit` NOT called.
    5. **Reset department to auto — program unchanged**: user with `departmentSource='manual'`, `program` still set; dto `{ departmentId: null }`; expect `em.assign` called with `(user, { department: null })`, `user.departmentSource === 'auto'`, `user.program` and `user.programSource` untouched, `metadata.changedFields === ['department', 'departmentSource']`. **This test covers the intentional post-reset divergence** (user.program may still point to a program whose department is the just-cleared department — acceptable per Decision #16).
    6. **Reset both to auto**: dto `{ departmentId: null, programId: null }`; expect `em.assign` called twice (once per field), both sources flip to `'auto'`, `metadata.changedFields === ['department', 'departmentSource', 'program', 'programSource']`.
    7. **User not found**: `em.findOneOrFail` (User lookup) throws via `opts.failHandler()`; expect `NotFoundException('User not found')`; no flush, no emit.
    8. **Department not found**: valid user but `em.findOneOrFail` (Department lookup) throws; expect `NotFoundException('Department not found')`; no flush, no emit.
    9. **Program not found**: symmetric to case 8.
    10. **Audit emit contract resilience (forward-compat)**: mock `auditService.Emit` to reject with an error; expect the service method still resolves successfully, the DTO is returned, and `logger.warn` was called. Named comment in the test: "defensive against future Emit signature changes — Emit currently swallows queue failures internally".
    11. **Response shape**: assert returned object has exactly the keys `['id', 'department', 'program', 'departmentSource', 'programSource']` (no enrollments, no institutionalRoles, no campus).
    12. **Actor missing (CLS empty)**: mock `currentUserService.get` to return `null`; expect service still succeeds, `auditService.Emit` called with `actorId: undefined, actorUsername: undefined`. (Documents the edge case where the CLS isn't populated — should not happen in production with F1's interceptor wiring, but test the degraded path.)

  - Notes: Follow existing mock style (`em = { findOneOrFail: jest.fn(), flush: jest.fn(), assign: jest.fn(), ... }`). Chain `.mockResolvedValueOnce` for sequential lookups. For the mismatch test (#4), mock the Program lookup to return `{ department: { id: 'other-dept' } }`. **Empty-body validation is NOT tested here** — it's a DTO-level validation that fires in the `ValidationPipe` before the service is called. Test it in a controller-level spec or e2e test (see Task 10).

- [x] **Task 10: Controller spec — delegation + interceptor override + authorization cases**
  - File: `api.faculytics/src/modules/admin/admin.controller.spec.ts`
  - Action: Four edits:
    1. **Add `UpdateUserScopeAssignment`** to the `adminService` mock: `UpdateUserScopeAssignment: jest.fn().mockResolvedValue({ id: 'user-1', department: null, program: null, departmentSource: 'auto', programSource: 'auto' })`.
    2. **Override `CurrentUserInterceptor`** in the TestingModule builder chain:
       ```ts
       .overrideInterceptor(CurrentUserInterceptor)
       .useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })
       ```
       Required because Task 8 adds `@UseInterceptors(CurrentUserInterceptor)` at the class level. Without this override, the test harness tries to instantiate the real interceptor and fails because `UserLoader` isn't provided. Import `CurrentUserInterceptor` at the top of the spec file.
    3. **Delegation test**:
       ```ts
       it('should delegate scope assignment update to the admin service', async () => {
         const dto: UpdateScopeAssignmentDto = { departmentId: 'dept-uuid' };
         await controller.UpdateUserScopeAssignment('user-1', dto);
         expect(adminService.UpdateUserScopeAssignment).toHaveBeenCalledWith(
           'user-1',
           dto,
         );
       });
       ```
    4. **Authorization tests** (new `describe('authorization')` block):
       - **401 unauthenticated**: override `AuthGuard('jwt')` with `{ canActivate: () => false }`; expect the request to reject (use supertest-less approach: assert `canActivate` returned false and the controller method was never called). In this spec harness style, just document the guard layering; detailed 401 behavior is framework-level.
       - **403 non-super-admin**: override `RolesGuard` with `{ canActivate: () => { throw new ForbiddenException(); } }`; wrap the controller call in `expect(...).rejects.toThrow(ForbiddenException)`.
  - Notes: Matches existing delegation-test style. The 401/403 tests are lightweight — deep E2E auth verification is out of scope (no admin e2e harness). These tests prove the guard + interceptor chain is wired, not that Passport issues 401 on a bad token.

#### Phase 2 — Frontend (admin.faculytics)

- [x] **Task 11: Extend `AdminUserDetail` type + add scope-assignment types**
  - File: `admin.faculytics/src/types/api.ts`
  - Action: Three edits:
    1. Add `departmentSource: string` and `programSource: string` fields to the existing `AdminUserDetail` interface (at line 169), placed after `program`.
    2. Add new exported interface:
       ```ts
       export interface AdminUserScopeAssignment {
         id: string;
         department: AdminUserScopedRelation | null;
         program: AdminUserScopedRelation | null;
         departmentSource: string;
         programSource: string;
       }
       ```
    3. Add new exported request type:
       ```ts
       export interface UpdateScopeAssignmentRequest {
         departmentId?: string | null;
         programId?: string | null;
       }
       ```
  - Notes: Type-only change. `AdminUserScopedRelation` is **confirmed exported** at `types/api.ts:109` so the reuse works. `null` on the interface fields matches the backend's union type and lets the frontend TS type-check the reset path.

- [x] **Task 12: Create `useUpdateScopeAssignment` mutation hook**
  - File: `admin.faculytics/src/features/admin/use-scope-assignment.ts` (**new**)
  - Action: Export `useUpdateScopeAssignment(userId)` that wraps `useMutation`:
    ```ts
    mutationFn: (body: UpdateScopeAssignmentRequest) =>
      apiClient<AdminUserScopeAssignment>(`/admin/users/${userId}/scope-assignment`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      const envId = useEnvStore.getState().activeEnvId;
      toast.success('Scope assignment updated');
      queryClient.invalidateQueries({ queryKey: ['admin-user', envId, userId] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const message = extractErrorMessage(err.body);
        if (err.status === 400) toast.error(message ?? 'Invalid request');
        else if (err.status === 404) toast.error(message ?? 'User or target not found');
        else toast.error(message ?? 'Failed to update scope assignment');
      } else {
        toast.error('Failed to update scope assignment');
      }
    },
    ```
    Also export a tiny helper that normalizes the class-validator array shape:
    ```ts
    function extractErrorMessage(body: unknown): string | undefined {
      if (!body || typeof body !== 'object') return undefined;
      const msg = (body as { message?: unknown }).message;
      if (Array.isArray(msg)) return msg.join(', ');
      if (typeof msg === 'string') return msg;
      return undefined;
    }
    ```
  - Notes: Mirrors `use-institutional-roles.ts` shape. Import `toast` from `sonner`, `apiClient` + `ApiError` from `@/lib/api-client`, `useEnvStore` from `@/stores/env-store`, `useMutation` + `useQueryClient` from `@tanstack/react-query`. The `extractErrorMessage` helper handles both class-validator array format (from DTO validation failures like empty body, invalid UUID) AND string format (from service-layer NestJS exceptions like NotFoundException) — see Risk #7 for background.

- [x] **Task 13: Create `ScopeAssignmentDialog` component**
  - File: `admin.faculytics/src/features/admin/scope-assignment-dialog.tsx` (**new**)
  - Action: Export `ScopeAssignmentDialog({ user, open, onOpenChange })`. Structure:
    - Props: `{ user: AdminUserDetail; open: boolean; onOpenChange: (open: boolean) => void }`.
    - Local state: `const [departmentId, setDepartmentId] = useState(user.department?.id ?? '')` and `const [programId, setProgramId] = useState(user.program?.id ?? '')`. Reset these when `open` transitions to `true` via `useEffect` so reopening picks up fresh data.
    - Queries: **`useDepartments()` with NO arguments** (not campus-scoped — see Decision #17) and `usePrograms(departmentId || undefined)`. When department changes, clear `programId`.
    - **Current-value fallback for department**: if `user.department?.id` is set but not present in the fetched `departments` list (race condition, soft-delete, cross-campus, etc.), splice it in as a synthetic option so the `Select` can pre-fill correctly:
      ```ts
      const departmentOptions = useMemo(() => {
        const list = departments ?? [];
        if (
          user.department &&
          !list.find((d) => d.id === user.department!.id)
        ) {
          return [user.department, ...list];
        }
        return list;
      }, [departments, user.department]);
      ```
      Apply the same fallback for program against `programOptions`.
    - Mutation: `const updateMutation = useUpdateScopeAssignment(user.id)`.
    - Submit handler: diff `departmentId` vs `user.department?.id` and `programId` vs `user.program?.id`, build body with only changed fields, call `updateMutation.mutate(body, { onSuccess: () => onOpenChange(false) })`. Disable the button if no diff.
    - "Reset to Auto" per field: two small buttons that call `updateMutation.mutate({ departmentId: null })` or `({ programId: null })` directly and close the dialog on success. Only shown when the current field's source is `'manual'`.
    - Layout: shadcn `Dialog` → `DialogContent` → `DialogHeader` (title "Edit Institutional Assignment") → body with two `<Label>` + `<Select>` pairs inside a `grid grid-cols-1 gap-4` → `DialogFooter` (implied) with Cancel + Save.
    - Loading state on Save button: `updateMutation.isPending` → `<Loader2 className="size-3.5 animate-spin" />`.
  - Notes: Reference `role-action-dialog.tsx` for overall shape. Reference `users-page.tsx:204-242` for dependent-select wiring. Imports: `Dialog` family, `Select` family, `Label`, `Button`, `Badge`, `Loader2` from lucide, `useDepartments`, `usePrograms`, `useUpdateScopeAssignment`, types. The no-args `useDepartments()` path is verified safe — `admin-filters.service.ts:82-96` returns all departments when `campusId` + `semesterId` are both undefined.

- [x] **Task 14: Wire new "Institutional Assignment" card into user detail page**
  - File: `admin.faculytics/src/features/admin/user-detail-page.tsx`
  - Action: Two edits:
    1. **Remove redundant MetaCells** for `Department` and `Program` from the profile card meta grid (lines 162-163 in the current file) — they'll be owned by the new card.
    2. **Add new "Institutional Assignment" `<Card>`** between the profile card and the Enrollments card. Structure:
       - Header with `Building2` (or similar) icon + title "Institutional Assignment" + description "Department and program assignments — used for analytics scoping".
       - Body with two rows (grid cols-2):
         - Row 1: **Department** — large value (name/code or "—") + source badge (`auto` uses default outline, `manual` uses `border-amber-500/50 text-amber-600`, mirroring existing institutional-roles card).
         - Row 2: **Program** — same structure.
       - "Edit" button in the header (right-aligned) that opens `ScopeAssignmentDialog`.
    - Add local `[dialogOpen, setDialogOpen] = useState(false)` state.
    - Render `<ScopeAssignmentDialog user={user} open={dialogOpen} onOpenChange={setDialogOpen} />` at the bottom of the component tree.
  - Notes: Keep the existing stagger class. Use the same `Card` / `CardHeader` / `CardContent` pattern as the Enrollments and Institutional Roles cards. Source-badge classname pattern already established.

#### Phase 3 — Validation

- [x] **Task 15: Run backend quality gates**
  - Directory: `api.faculytics`
  - Actions: `npm run lint` (auto-fix), `npm run build` (tsc check), `npm run test -- --testPathPattern=admin` (targeted test run).
  - Notes: All three must pass. No new migrations needed — schema is unchanged.

- [x] **Task 16: Run frontend quality gates**
  - Directory: `admin.faculytics`
  - Actions: `bun run build` (runs `tsc && vite build`), `bun run lint`.
  - Notes: Admin console has no unit test harness — type-check + build is the automated gate.

- [x] **Task 17: Manual smoke test against local API**
  - Setup:
    1. Start `api.faculytics` with `docker compose up` (Redis + mock worker) and `npm run start:dev`.
    2. Start `admin.faculytics` with `bun dev`.
    3. Log in as super admin, capture the access token (from localStorage or a `curl -X POST /api/v1/auth/login`).

  - **Frontend flow** (covers ACs 15–22): 4. Navigate to `/users/:userId` for a known user. 5. Verify "Institutional Assignment" card renders with correct source badges. 6. Click Edit → verify department / program dropdowns pre-fill; change department → verify program select clears; save → verify toast fires, card refreshes, source badge flips to `manual`. 7. Reopen Edit dialog → click "Reset to Auto" on department → verify source badge flips back to `auto`. 8. Try mismatching department+program in one save → verify 400 toast shows the API's error message.

  - **Backend error-path curl commands** (covers ACs 6, 7, 8, 9, 10, 11a, 11b — the paths manual UI flow cannot reach):

    Set `TOKEN=<super-admin-access-token>` and `API=http://localhost:5200/api/v1` first.

    **AC 6 — mismatch 400:**

    ```bash
    curl -i -X PATCH "$API/admin/users/<user-uuid>/scope-assignment" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"departmentId":"<dept-A>","programId":"<program-belonging-to-dept-B>"}'
    # Expected: HTTP/1.1 400 Bad Request, body includes "Program does not belong"
    ```

    **AC 7 — empty body 400:**

    ```bash
    curl -i -X PATCH "$API/admin/users/<user-uuid>/scope-assignment" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{}'
    # Expected: HTTP/1.1 400, body.message includes "At least one of the following fields is required: departmentId, programId"
    ```

    **AC 8 — invalid UUID 400:**

    ```bash
    curl -i -X PATCH "$API/admin/users/<user-uuid>/scope-assignment" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"departmentId":"not-a-uuid"}'
    # Expected: HTTP/1.1 400, body.message is an array including "departmentId must be a UUID"
    ```

    **AC 8b — explicit null must NOT be rejected:**

    ```bash
    curl -i -X PATCH "$API/admin/users/<user-uuid>/scope-assignment" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"departmentId":null}'
    # Expected: HTTP/1.1 200, response body departmentSource: "auto"
    ```

    **AC 9 — user not found 404:**

    ```bash
    curl -i -X PATCH "$API/admin/users/00000000-0000-4000-8000-000000000000/scope-assignment" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"departmentId":"<valid-dept-uuid>"}'
    # Expected: HTTP/1.1 404, body.message = "User not found"
    ```

    **AC 10 — department not found 404:**

    ```bash
    curl -i -X PATCH "$API/admin/users/<user-uuid>/scope-assignment" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"departmentId":"00000000-0000-4000-8000-000000000000"}'
    # Expected: HTTP/1.1 404, body.message = "Department not found"
    ```

    **AC 11a — unauthenticated 401:**

    ```bash
    curl -i -X PATCH "$API/admin/users/<user-uuid>/scope-assignment" \
      -H "Content-Type: application/json" \
      -d '{"departmentId":"<valid>"}'
    # Expected: HTTP/1.1 401 Unauthorized
    ```

    **AC 11b — non-super-admin 403:** Set `FACULTY_TOKEN=<faculty-access-token>` and:

    ```bash
    curl -i -X PATCH "$API/admin/users/<user-uuid>/scope-assignment" \
      -H "Authorization: Bearer $FACULTY_TOKEN" -H "Content-Type: application/json" \
      -d '{"departmentId":"<valid>"}'
    # Expected: HTTP/1.1 403 Forbidden
    ```

  - **Audit verification** (covers AC 1's audit log assertion): 9. Open the `/audit-logs` page in the admin console (or query `audit_log` table directly). 10. Verify `admin.user.scope.update` rows exist for each successful PATCH. Spot-check one row — `metadata.before`, `metadata.after`, `metadata.changedFields` must all be populated. `actor_id` must equal the super admin's user UUID (**F1 verification** — if this is NULL, the `CurrentUserInterceptor` is not wired correctly, Task 5 / Task 8 need review).

  - Notes: Document any frontend issues as follow-up tickets. The `actor_id` check in step 10 is the key integration proof for F1. A fresh admin e2e harness (Jest + supertest on a real NestJS instance) is out of scope for this ticket — captured in Future Considerations.

### Acceptance Criteria

**API — PATCH /admin/users/:id/scope-assignment**

- [x] **AC 1 — Happy path set both**: Given a user with `departmentSource='auto'` and `programSource='auto'`, when a super admin sends `PATCH /admin/users/:id/scope-assignment` with `{ departmentId: <deptUuid>, programId: <programUuid> }` where `program.department.id === deptUuid`, then the response is 200 with the minimal scope DTO, both fields reflect the new assignment, both `*Source` columns are `'manual'`, and one `admin.user.scope.update` audit log row exists with `metadata.before`, `metadata.after`, and `metadata.changedFields` populated. **`metadata.changedFields` is exactly `['department', 'departmentSource', 'program', 'programSource']`** (in this order, per `SCOPE_FIELD_NAMES`). **The audit row's `actor_id` column equals the super admin's user UUID** (F1 integration proof — confirms `CurrentUserInterceptor` is wired).

- [x] **AC 2 — Partial update (department only)**: Given an existing user, when the admin sends `{ departmentId: <deptUuid> }` without `programId`, then `user.department` and `user.departmentSource='manual'` update while `user.program` and `user.programSource` remain untouched. **`metadata.changedFields` is exactly `['department', 'departmentSource']`** (the literal strings from `SCOPE_FIELD_NAMES`, in that order).

- [x] **AC 3 — Partial update (program only)**: Symmetric to AC 2.

- [x] **AC 4 — Reset to auto (department)**: Given a user with `departmentSource='manual'` and `department` set, when the admin sends `{ departmentId: null }`, then `user.department` becomes `null` (via `em.assign(user, { department: null })` — MikroORM-safe nullable reset) and `user.departmentSource='auto'`. `user.program` and `user.programSource` are untouched. On the next Moodle sync cycle, `EnrollmentSyncService.backfillUserScopes` re-derives the department from enrollments (verified by the existing source-guard at `moodle-enrollment-sync.service.ts:405-410`) — **but only if `programSource` is also `'auto'`**.

- [x] **AC 4b — Post-reset divergence is intentional**: Given a user where `user.program.department.id === X`, when the admin sends `{ departmentId: null }` (resetting department only), then `user.program` remains pointing at the program whose department was just cleared. This is intentional per Decision #2 (field independence) and #16. Admins who want a clean slate must reset both fields. This state is allowed by the schema and the spec; downstream consumers that assume `user.program.department.id === user.department?.id` are responsible for handling it.

- [x] **AC 5 — Reset to auto (both)**: When the admin sends `{ departmentId: null, programId: null }`, both fields clear and both sources revert to `'auto'`.

- [x] **AC 6 — Mismatch rejection**: Given a user, when the admin sends `{ departmentId: <dept-A-uuid>, programId: <program-B-uuid> }` where `program-B.department !== dept-A`, then the response is 400 "Program does not belong to the specified department" and no entity is modified, no audit event is emitted.

- [x] **AC 7 — Empty body rejection**: When the admin sends `{}`, the response is 400 from the global `ValidationPipe` with `body.message` as an **array** containing the string `'At least one of the following fields is required: departmentId, programId'` (class-validator shape, NOT a service-layer string). This error comes from the class-level `@Validate(AtLeastOneField, ...)` on the DTO, not from the service.

- [x] **AC 8 — Invalid UUID rejection**: When the admin sends `{ departmentId: 'not-a-uuid' }`, the global `ValidationPipe` returns 400 with `body.message` as an array containing `'departmentId must be a UUID'`. Explicit `{ departmentId: null }` must NOT be rejected by validation (bypassed via `@ValidateIf((_, v) => v !== null)`) and must reach the service for the reset path.

- [x] **AC 9 — User not found**: When the admin targets a nonexistent user ID, the response is 404 "User not found".

- [x] **AC 10 — Target not found**: When the admin sends `{ departmentId: '<valid-uuid-not-in-db>' }`, the response is 404 "Department not found".

- [x] **AC 11a — Unauthenticated rejection**: When an unauthenticated client (no `Authorization` header, or an invalid/expired token) sends the request, the response is 401 Unauthorized. Enforced by `JwtAuthGuard` (inherited from class-level `@UseJwtGuard`).

- [x] **AC 11b — Non-super-admin rejection**: When an authenticated user with a non-SUPER_ADMIN role (e.g., FACULTY) sends the request, the response is 403 Forbidden. `RolesGuard` throws `ForbiddenException` explicitly (verified at `src/security/guards/roles.guard.ts`).

- [x] **AC 12 — Audit emit forward-compat resilience**: Given the service is designed to tolerate future changes to `AuditService.Emit`'s error contract (today `Emit` swallows queue failures internally and never rejects), when `Emit` is mocked to reject in unit tests, then the service still returns the updated DTO (the request succeeds) and `logger.warn` is called. This is forward-compat insurance, not a reachable production branch.

- [x] **AC 12b — Audit `changedFields` contract pinning**: Given any successful PATCH, `metadata.changedFields` is a subset of the literal array `['department', 'departmentSource', 'program', 'programSource']` (exact strings from `SCOPE_FIELD_NAMES`). No other field names appear. Order matches `SCOPE_FIELD_NAMES` declaration order.

- [x] **AC 13 — Response shape**: Successful PATCH response body matches exactly `{ id, department, program, departmentSource, programSource }` — no extra fields, no enrollments, no institutional roles.

- [x] **AC 14 — Detail endpoint exposes sources**: `GET /admin/users/:id` response now includes `departmentSource` and `programSource` string fields with values from `'auto' | 'manual'`.

**Frontend — admin.faculytics user detail page**

- [x] **AC 15 — Source badges render**: Given a user with `departmentSource='manual'`, when an admin loads `/users/:userId`, the Institutional Assignment card displays the department name and an amber "manual" badge next to it. Auto-derived fields show a default outline badge labeled "auto".

- [x] **AC 16 — Edit dialog pre-fills**: When the admin clicks "Edit" on the Institutional Assignment card, a shadcn `Dialog` opens with the department and program `Select` components pre-populated with the user's current values (or empty if null). **The pre-fill is robust to filter/list mismatches**: if `user.department.id` is not present in the fetched department options (race condition, soft-delete, cross-campus assignment, etc.), the synthetic fallback in `ScopeAssignmentDialog` (Task 13) splices the current value into the option list so the Select never shows empty when `user.department` is non-null.

- [x] **AC 17 — Dependent selects**: When the admin changes the department inside the dialog, the program selection clears and the program dropdown re-fetches to scope to the new department.

- [x] **AC 18 — Save invalidates detail cache**: When the admin clicks Save with a valid change, a success toast appears, the dialog closes, the React Query cache for `['admin-user', envId, userId]` is invalidated, and the user detail page re-renders with the new values and source badges.

- [x] **AC 19 — Reset to Auto affordance**: When a field's source is `'manual'`, a "Reset to Auto" button appears inside the edit dialog next to that field. Clicking it sends `{ <field>: null }` and, on success, the source badge flips back to "auto".

- [x] **AC 20 — Error toast on mismatch**: When the admin submits a department/program pair that violates the backend consistency check, the toast shows the 400 message from the API and the dialog stays open with the previous selection.

- [x] **AC 21 — Save disabled with no diff**: The Save button is disabled when neither the department nor the program selection differs from the current user state.

- [x] **AC 22 — No duplicate dept/program in profile card**: The redundant `Department` and `Program` MetaCells previously in the profile card meta grid are removed. Campus, Moodle ID, Last login, and Created remain.

**Integration — F1 audit actor proof**

- [x] **AC 23 — Audit `actor_id` is populated**: Given a super admin performs any successful scope assignment PATCH, when the corresponding `admin.user.scope.update` row is inspected in the `audit_log` table, then `actor_id` equals the super admin's user UUID (not NULL, not an empty string). This is the integration-level proof that `CurrentUserInterceptor` is wired on `AdminController`. If this AC fails, Task 5 (`AdminModule` imports) and Task 8 (`@UseInterceptors` decorator) need review. **Manual verification only** (checked in Task 17 step 10) — no unit test covers this because the unit tests mock `CurrentUserService.get()` directly.

## Additional Context

### Dependencies

- **Depends on:** FAC-125 (source columns `department_source` / `program_source` — already landed and in production schema).
- **Does not require:** FAC-125 derivation logic — this endpoint is useful as a manual seeding tool even before auto-derivation is trustworthy.
- **Downstream impact:** None. Existing `backfillUserScopes` already skips users with `source='manual'` — no sync pipeline changes needed.

### Testing Strategy

**API — Unit tests (Jest + `@nestjs/testing`)**

Location: `api.faculytics/src/modules/admin/services/admin.service.spec.ts` and `admin.controller.spec.ts`.

Extend the existing `beforeEach` with new mock providers:

```ts
auditService = { Emit: jest.fn() };
currentUserService = { get: jest.fn().mockReturnValue({ id: 'actor-1', userName: 'admin' }) };

providers: [
  AdminService,
  { provide: EntityManager, useValue: em },
  { provide: AuditService, useValue: auditService },
  { provide: CurrentUserService, useValue: currentUserService },
],
```

Test cases (11 for service + 1 for controller — enumerated in Task 9 & 10). These map directly to ACs 1–13.

**API — Manual verification**

No E2E test for this endpoint (no existing admin E2E harness). Local manual verification:

1. `docker compose up` + `npm run start:dev` in `api.faculytics`.
2. Use REST client / Swagger at `/api/v1/docs` (if `OPENAPI_MODE=true`) to exercise PATCH with various bodies against a known user.
3. Query the DB directly to verify `departmentSource` / `programSource` transitions, and the `audit_log` table to verify the emitted rows.

**Frontend — Manual smoke test**

Admin console has no Vitest/Playwright harness — the type-checker and Vite build are the automated gates. Manual steps listed in Task 17 cover ACs 15-22.

**Integration — Sync interaction**

Not part of this ticket's test scope, but the integration guarantee is verified by existing `moodle-enrollment-sync.service.spec.ts` coverage of the source-guard. To confirm end-to-end in dev:

1. Set a user's department to manual via the new PATCH.
2. Run `POST /moodle/sync` to trigger a full sync.
3. Verify `user.department` did NOT revert, `user.departmentSource` still `'manual'`.

### Notes

**Constraints and guardrails:**

- Admin console uses **native fetch** via `apiClient`. Do not introduce Axios.
- Admin console tsconfig has `erasableSyntaxOnly` — no `public` parameter properties in constructors (applies to any class component, not hit here since we're using functional components).
- Do NOT modify `EnrollmentSyncService.backfillUserScopes` — the `source='manual'` skip-guard already protects the new manual overrides.

**Risks identified (pre-mortem, revised post-adversarial review):**

1. **First inline `AuditService.Emit` usage — precedent risk.** Every future inline emit will copy this shape. The `{ before, after, changedFields }` metadata shape is pinned via `SCOPE_FIELD_NAMES` (Decision #13) and asserted by AC 12b. Code review should confirm any future inline emit follows the same contract. **Mitigation:** Decision #13 + AC 12b; the literal field-name constant makes downstream audit-log queries reliable.
2. **CLS actor capture depends on interceptor wiring (F1 — fixed in this spec).** `CurrentUserService.get()` only returns the actor if `CurrentUserInterceptor` ran on the request. This requires `@UseInterceptors(CurrentUserInterceptor)` on the controller class AND both `CommonModule` + `DataLoaderModule` in the module imports. Tasks 5 and 8 wire this explicitly; AC 23 verifies the integration manually against the database. If AC 23 fails at smoke-test time, the fix is to re-check those two tasks — do NOT ship until actor_id is populated, because Decision #7 (no self-assignment guard) depends on the audit trail being trustworthy.
3. **Cross-request divergence.** Admin sets department=D1 in one request, program=P2 (belongs to D2) in a later request. Service allows it. Downstream consumers that assume `user.program.department === user.department` could break. **Mitigation:** None in this ticket — flagged as a follow-up ticket for downstream consumer audit. Documented as a known limitation and captured in AC 4b.
4. **No bulk operation.** Each PATCH targets a single user. Correcting many users at once requires scripting against this endpoint. Acceptable for MVP — bulk flow is out of scope for FAC-127.
5. **Frontend dependent-select race.** If the admin rapidly changes department while the previous `usePrograms` query is in flight, React Query dedupes by query key but the UI may briefly show stale options. Acceptable — standard TanStack Query behavior.
6. **Dialog no-args department list is unbounded.** `useDepartments()` with no filter returns every department in the system. For installations with hundreds of departments, the `Select` could become unwieldy. **Mitigation:** None in this ticket. Future enhancement: add a search input inside the dialog or use a `Combobox` component. Current installations have <50 departments — acceptable for now.
7. **Error body shape consistency.** All 400 responses now come from the global `ValidationPipe` in class-validator array format. Frontend `onError` in `use-scope-assignment.ts` must handle both array-shape messages (coerce to string via `.join(', ')` or pick first) and string-shape legacy messages. Documented in Task 12's mutation hook notes.

**Known limitations (accepted):**

- No self-assignment guard — super admin can modify their own scope. Audit log is the accountability layer.
- No bulk PATCH — one user at a time.
- Cross-request divergence (dept from one dept, program from another) is allowed.
- List page (`users-page.tsx`) does NOT show source badges in this ticket. Deferred.

**Future considerations (out of scope):**

- Add source badges to the users list view for at-a-glance "which users have manual overrides".
- Add a dedicated "Manual Overrides" filter to the list page.
- Background job that periodically flags cross-request divergences for admin review.
- Bulk PATCH endpoint for mass correction (would require its own scope and tests).
- **Admin E2E test harness** (Jest + supertest on a real NestJS instance). Currently no admin-module E2E exists; Task 17 covers the gap with manual curl commands. A real E2E suite would convert ACs 6/7/8/9/10/11a/11b/23 into automated assertions.
- **Department picker with search/combobox** — see Risk #6. Upgrade `Select` to `Combobox` if department count grows.
- **Campus-scoped department picker with "show all" toggle** — compromise between the current unbounded dialog and the filter-bar's campus scope. Useful when the UI needs both workflows.
