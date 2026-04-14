---
title: 'Campus Head Role (with non-enrolled user provisioning primitive)'
slug: 'fac-131-campus-head-role'
created: '2026-04-14'
updated: '2026-04-14 (post-Round-4 T1/T2/T3 remediation; T4/T5/T6 deferred as known polish items — see Step 3.9 in Notes)'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 'implementation']
implementation_date: '2026-04-14'
implementation_baseline_commit: 'fce6388'
implementation_note: 'All 27 code tasks complete; Task 28 (manual E2E) deferred to user verification. T6 known-issue (seed-users-tab client-side rejection) confirmed no-op as tech-spec predicted (form has no username input).'
adversarial_review_rounds: 4
adversarial_review_final_verdict: 'Ready — 3 known polish items deferred (T4 stale Step 2 snapshot, T5 AC numbering gaps, T6 Task 10.75 Part B client-side no-op). Dev should follow individual task bodies as ground truth.'
tech_stack:
  - 'NestJS 11'
  - 'MikroORM 6'
  - 'PostgreSQL 15 (with pgvector)'
  - 'bcrypt (via JWT_BCRYPT_ROUNDS)'
  - 'class-validator + @nestjs/swagger (DTO validation)'
  - 'BullMQ / Redis (untouched by this work)'
  - 'React 19 (admin.faculytics)'
  - 'Vite + TanStack Query + shadcn/ui + React Router (admin.faculytics)'
  - 'Native React state with TanStack Query mutations (admin forms)'
  - 'Next.js 16 (app.faculytics)'
  - 'Zustand (auth store, draft store)'
  - 'TanStack Query (app.faculytics data fetching)'
files_to_modify:
  # --- api.faculytics (backend) ---
  - 'api: src/modules/auth/roles.enum.ts (add CAMPUS_HEAD)'
  - 'api: src/modules/audit/audit-action.enum.ts (add ADMIN_USER_CREATE: "admin.user.create")'
  - 'api: src/modules/admin/admin.controller.ts (add POST /admin/users; add GET /admin/institutional-roles/campus-head-eligible-categories)'
  - 'api: src/modules/admin/admin.controller.spec.ts'
  - 'api: src/modules/admin/services/admin.service.ts (extend AssignInstitutionalRole with CAMPUS_HEAD depth-1 branch; add GetCampusHeadEligibleCategories method)'
  - 'api: src/modules/admin/services/admin-user.service.ts (NEW — CreateLocalUser method with manual AuditService.Emit)'
  - 'api: src/modules/admin/services/admin-user.service.spec.ts (NEW)'
  - 'api: src/modules/admin/admin.module.ts (register AdminUserService provider — no module imports needed: AuditModule is @Global per audit.module.ts:14, and CurrentUserService/RequestMetadataService come via CommonModule → AppClsModule which is already imported)'
  - 'api: src/modules/admin/dto/requests/create-user.request.dto.ts (NEW — class-validator DTO: username/firstName/lastName/password?/campusId? with @Matches(/^local-/) username validation)'
  - 'api: src/modules/admin/dto/responses/create-user.response.dto.ts (NEW)'
  - 'api: src/modules/admin/dto/requests/assign-institutional-role.request.dto.ts (add CAMPUS_HEAD to enum allow-list)'
  - 'api: src/modules/admin/dto/responses/campus-head-eligible-category.response.dto.ts (NEW)'
  - 'api: src/modules/common/services/scope-resolver.service.ts (add CAMPUS_HEAD branch to ResolveDepartmentIds ONLY — no ResolveDepartmentCodes method exists on this service)'
  - 'api: src/modules/common/services/scope-resolver.service.spec.ts'
  - 'api: src/entities/user.entity.ts (add campusSource property mirroring departmentSource/programSource at lines 69-70)'
  - 'api: src/migrations/Migration{timestamp}_fac-131a-campus-source.ts (NEW — generate via `npx mikro-orm migration:create`; ALTER TABLE "user" ADD COLUMN "campus_source" varchar NOT NULL DEFAULT auto)'
  - 'api: src/modules/moodle/services/moodle-enrollment-sync.service.ts (add campusSource: "auto" to fork.create User payload; add local-* skip guard in uniqueUsers loop)'
  - 'api: src/modules/moodle/services/moodle-provisioning.service.ts (add local-* rejection to SeedUsers DTO validation or service — prevents Moodle-side creation of reserved prefix)'
  - 'api: src/modules/questionnaires/services/questionnaire.service.ts (add explicit CAMPUS_HEAD denial at line 934 — ~4 LOC)'
  - 'api: src/modules/questionnaires/services/questionnaire.service.spec.ts (add spec test for CAMPUS_HEAD denial)'
  # --- Task 15.5: controller JWT guards (Round 4 T2 fix) ---
  - 'api: src/modules/analytics/analytics.controller.ts:29 (Task 15.5 — add CAMPUS_HEAD to @UseJwtGuard allowlist)'
  - 'api: src/modules/faculty/faculty.controller.ts:21 (Task 15.5 — add CAMPUS_HEAD to @UseJwtGuard allowlist)'
  - 'api: src/modules/reports/reports.controller.ts:28 (Task 15.5 — add CAMPUS_HEAD to @UseJwtGuard allowlist)'
  - 'api: src/modules/curriculum/curriculum.controller.ts:16 (Task 15.5 — add CAMPUS_HEAD to @UseJwtGuard allowlist)'
  # --- Task 10.75: additional local- namespace enforcement files (Round 4 T2 fix) ---
  - 'api: src/modules/moodle/dto/requests/seed-users.request.dto.ts (Task 10.75 — server-side @Matches rejection of local-* at API boundary)'
  # --- admin.faculytics ---
  - 'admin: src/types/api.ts (add CAMPUS_HEAD to UserRole const near line 98-107; extend InstitutionalRole union near line 213; add CampusHeadEligibleCategory interface; add ProvisionUserRequest/ProvisionUserResponse types)'
  - 'admin: src/features/admin/use-institutional-roles.ts (add useCampusHeadEligibleCategories hook mirroring useDeanEligibleCategories at line 12)'
  - 'admin: src/features/admin/role-action-dialog.tsx (extend INSTITUTIONAL_ROLES with CAMPUS_HEAD; campus picker branch)'
  - 'admin: src/features/admin/users-page.tsx (extend ROLE_COLORS map with CAMPUS_HEAD badge color)'
  - 'admin: src/features/admin/user-detail-page.tsx (extend ROLE_COLORS map if present)'
  - 'admin: src/features/user-provisioning/provision-user-page.tsx (NEW)'
  - 'admin: src/features/user-provisioning/use-provision-user.ts (NEW — TanStack Query mutation hook)'
  - 'admin: src/features/user-provisioning/provision-user-form.tsx (NEW — native React state form with firstName/lastName fields, local- prefix helper text)'
  - 'admin: src/features/moodle-provision/components/seed-users-tab.tsx (add client-side rejection for usernames matching /^local-/)'
  - 'admin: src/routes.tsx (add /provision-users route)'
  - 'admin: src/components/layout/app-shell.tsx (add Provision User navItem — verified path, not src/app-shell.tsx)'
  # --- app.faculytics (frontend) ---
  - 'app: constants/roles.ts (add CAMPUS_HEAD to APP_ROLES)'
  - 'app: features/auth/lib/role-route.ts (add ROLE_CONFIG[CAMPUS_HEAD] entry — 2 navItems: Dashboard + Faculties; ALSO verify ROLE_CONFIG is exported or migrate to getRoleConfig accessor)'
  - 'app: app/(dashboard)/campus-head/layout.tsx (NEW — RoleGuard wrapper)'
  - 'app: app/(dashboard)/campus-head/page.tsx (NEW — redirect to /campus-head/dashboard)'
  - 'app: app/(dashboard)/campus-head/dashboard/page.tsx (NEW — wraps ScopedAnalyticsDashboardScreen with scopeLabel="Campus")'
  - 'app: app/(dashboard)/campus-head/faculties/page.tsx (NEW — wraps ScopedFacultyListScreen)'
  - 'app: app/(dashboard)/campus-head/faculties/[facultyId]/analysis/page.tsx (NEW — wraps FacultyReportScreen)'
  - 'app: features/faculty-analytics/components/dean-dashboard-screen.tsx → rename to scoped-analytics-dashboard-screen.tsx (add scopeLabel prop + parameterize hardcoded "department analytics" strings)'
  - 'app: features/faculty-analytics/components/dean-faculty-analytics-screen.tsx → rename to scoped-faculty-list-screen.tsx (add scopeLabel prop)'
  - 'app: features/faculty-analytics/hooks/use-dean-dashboard-view-model.ts → rename to use-scoped-analytics-dashboard-view-model.ts'
  - 'app: features/faculty-analytics/hooks/use-dean-faculty-analytics-list-view-model.ts → rename to use-scoped-faculty-analytics-list-view-model.ts'
  # Nine additional dean-* sibling files to rename per Task 20.75:
  - 'app: features/faculty-analytics/components/dean-analytics-async-content.tsx → scoped-analytics-async-content.tsx'
  - 'app: features/faculty-analytics/components/dean-analytics-empty-state.tsx → scoped-analytics-empty-state.tsx'
  - 'app: features/faculty-analytics/components/dean-analytics-error-state.tsx → scoped-analytics-error-state.tsx'
  - 'app: features/faculty-analytics/components/dean-analytics-loading-state.tsx → scoped-analytics-loading-state.tsx'
  - 'app: features/faculty-analytics/components/dean-attention-card.tsx → scoped-attention-card.tsx'
  - 'app: features/faculty-analytics/components/dean-charts.tsx → scoped-charts.tsx'
  - 'app: features/faculty-analytics/components/dean-dashboard-header.tsx → scoped-dashboard-header.tsx'
  - 'app: features/faculty-analytics/components/dean-faculty-analysis-table.tsx → scoped-faculty-analysis-table.tsx'
  - 'app: features/faculty-analytics/components/dean-metrics-grid.tsx → scoped-metrics-grid.tsx'
  # FacultyReportScreen relocation per Task 20.5:
  - 'app: app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-screen.tsx → RELOCATE to features/faculty-analytics/components/faculty-report-screen.tsx (plus 5 sibling _components: FacultyReportComments, FacultyReportHeader, FacultyReportSectionPerformanceChart, FacultyReportSections, FacultyReportSummaryCards)'
  - 'app: features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts (REFACTOR lines 117 + 159 — destructure useActiveRole(), use getRoleConfig accessor for route prefix)'
  - 'app: features/faculty-analytics/index.ts (update barrel exports for renamed/relocated components)'
  - 'app: app/(dashboard)/dean/dashboard/page.tsx (update import + pass scopeLabel="Department")'
  - 'app: app/(dashboard)/dean/faculties/page.tsx (update import + pass scopeLabel="Department")'
  - 'app: app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx (update import — FacultyReportScreen now comes from @/features/faculty-analytics)'
code_patterns:
  - 'Local account provisioning uses reserved `local-` username prefix. Enforcement is triple: (1) class-validator `@Matches(/^local-[a-z0-9][a-z0-9._-]*$/)` in `CreateLocalUserDto`; (2) Moodle sync skip guard at `moodle-enrollment-sync.service.ts:131-136` rejects Moodle users with `local-*` usernames; (3) admin-console Seed Users tab refuses to submit `local-*` Moodle usernames. Together these make the `local-` namespace a hard contract, preventing collisions with the `user_user_name_unique` constraint.'
  - 'Reuse UserInstitutionalRole table — already keyed to MoodleCategory at any depth; Dean uses depth 3, Campus Head uses depth 1. Zero schema change for the promotion table.'
  - 'Extend `ScopeResolverService.ResolveDepartmentIds` with ONE CAMPUS_HEAD branch — no new method required. The resolver takes `semesterId`; a Campus Head with promotion on moodleCategoryId X returns all departments in the semester IF the semester belongs to that campus, else empty. The downstream analytics service (`analytics.service.ts:1072`) has a private `ResolveDepartmentCodes` method that internally re-queries from IDs, so the codes path inherits automatically. Critical correction after adversarial review: `ScopeResolverService.ResolveDepartmentCodes` does NOT exist — that was an earlier fabrication.'
  - 'Reuse LocalLoginStrategy (priority 10, bcrypt) — reads `user.password` column (NOT `passwordHash`). No auth strategy changes.'
  - 'Reuse FAC-127 source-tracking pattern via new `campusSource` column (auto|manual) — prevents Moodle sync clobber of manually assigned campuses. New migration adds the column with DEFAULT "auto".'
  - 'Extend existing POST /admin/institutional-roles — allow-list is a class-validator enum in the DTO ([DEAN, CHAIRPERSON] today) plus a service-level depth switch. CAMPUS_HEAD extension is ~15 LOC in DTO + service.'
  - 'Manual audit emission from `AdminUserService.CreateLocalUser` via `AuditService.Emit({ action, actorId, resourceType, resourceId, metadata, browserName, os, ipAddress })` — NOT via `@Audited()` decorator, because the `AuditInterceptor` reads only `request.params`/`request.query` (not `request.body`) and cannot populate the `metadata: { campusId, authMode: "local", defaultPasswordAssigned }` shape required by AC-1.12. Inject `AuditService`, `CurrentUserService` (CLS-based), and `RequestMetadataService` (CLS-based) into `AdminUserService`.'
  - 'Frontend screen reuse with `scopeLabel` prop — neutral naming (`ScopedAnalyticsDashboardScreen`) with role-specific wrapper routes under `/campus-head/*`. Reuse is NOT trivial: 11 `dean-*` sibling files in `features/faculty-analytics/components/` must be renamed/parameterized to avoid leaking "Dean"/"department" string literals into Campus Head pages. Additionally `FacultyReportScreen` must be relocated from `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/` into the shared feature for true reuse.'
  - 'Role switcher reads labels from `getRoleConfig(role).label` accessor — NOT from `ROLE_CONFIG` directly (the const is not exported). Adding a `ROLE_CONFIG` entry and ensuring accessor coverage is sufficient for Campus Head to render automatically.'
  - '`useActiveRole()` hook returns an object `{ me, roles, activeRole, ... }` — callers must destructure `const { activeRole } = useActiveRole()`. Do NOT treat the return as the role string directly (common mistake).'
  - 'Implicit campus scoping via `useMe().data.campus.id` — same mechanism Dean already uses; Campus Head uses the same hook with no frontend data-flow change.'
  - 'Admin console form pattern: native React useState + TanStack Query useMutation (no react-hook-form, no Zod on the client) — mirror `seed-users-tab.tsx` structure.'
  - 'Admin console routing: React Router config in `src/routes.tsx` + navItems in `src/components/layout/app-shell.tsx` (verified path, not `src/app-shell.tsx`).'
test_patterns:
  - 'Jest with NestJS TestingModule — controller specs mock service methods as jest.fn()'
  - 'Service specs test business logic in isolation — mirror admin.service.spec.ts pattern'
  - 'Scope resolver spec — table-driven tests for single/multi-campus resolution and each role branch'
  - 'admin.controller.spec.ts extended with POST /admin/users cases and campus-head-eligible-categories cases'
  - 'Migration test — verify campusSource column added with default auto and existing rows backfilled'
  - 'Moodle enrollment sync regression — verify local account (moodleUserId=null) is not touched across one sync cycle'
  - 'Frontend regression — Dean /dean/dashboard and /dean/faculties render identically after screen rename'
  - 'Manual E2E — SuperAdmin creates local Campus Head via admin console, logs in, lands on /campus-head/dashboard, sees campus-scoped data'
---

# Tech-Spec: Campus Head Role (with non-enrolled user provisioning primitive)

**Created:** 2026-04-14
**Related issue:** [FAC-131 feat: add Campus Head Role](https://github.com/CtrlAltElite-Devs/issue/321)
**Proposed ticket split:** FAC-131a (provisioning primitive) + FAC-131b (Campus Head role)
**Step 2 status:** Deep investigation complete. One new blocker surfaced (`FacultyReportScreen` hardcoded backHref); one new scope item added (`User.campusSource` migration); multiple uncertainties resolved in favor of the existing plan.

## Overview

### Problem Statement

Faculytics currently supports role-based scoping at two levels: **Dean** at department scope (Moodle category depth 3) and **SuperAdmin** at global scope. There is no role between these two that scopes analytics to a single campus. An institution operating multiple campuses cannot designate a Campus Head who needs to see faculty analytics aggregated across every department in their campus without seeing data from other campuses.

Compounding this, Faculytics has a **pre-existing blocking gap**: users can enter the system only via Moodle enrollment sync. A pure Campus Head — an institutional administrator who does not teach or study — has no course enrollments in Moodle and therefore cannot exist in Faculytics today. The pilot institution has confirmed they have no existing Moodle accounts with category-manage permission at depth 1, so Moodle-side hydration is not a viable path. This gap must be solved before a Campus Head can log in at all, and the same gap will apply to any future non-enrolled administrative role (Registrar, Compliance Officer, Institutional Research).

### Solution

Split the work into two coordinated tickets:

**FAC-131a — Non-enrolled user provisioning primitive (backend + admin console):** Add a general-purpose `POST /admin/users` endpoint that creates Faculytics-local users with bcrypt-hashed passwords, independent of Moodle. SuperAdmin authenticates and provides `{ username, firstName, lastName, password?, campusId? }`. The endpoint creates a row in the existing `user` table using **existing columns only** — verified at `src/entities/user.entity.ts:21-89`:

- `userName` (unique)
- `firstName`, `lastName` (both NOT NULL)
- `fullName` (nullable, computed server-side as `${firstName} ${lastName}`)
- `password` (nullable, hidden) — **the column is literally named `password`, NOT `passwordHash`**; bcrypt-hashed at creation time via `bcrypt.hash(plain, JWT_BCRYPT_ROUNDS)`
- `userProfilePicture` (NOT NULL, set to empty string)
- `lastLoginAt` (NOT NULL, set to `new Date()` at creation)
- `isActive` (NOT NULL, set to `true`)
- `campus` (nullable, set from `dto.campusId` if provided)
- `campusSource` (NEW column added by this ticket's migration, default `'auto'`, set to `'manual'` if `campusId` is provided)
- `roles: []`, `moodleUserId: null`

**No `email` or `displayName` columns** exist on the User entity and MVP explicitly defers email-based flows (password reset, notifications) to a future ticket. Users are identified by username only; SuperAdmin shares credentials out-of-band.

**All locally-provisioned usernames must start with a reserved `local-` prefix**, enforced via `@Matches(/^local-[a-z0-9][a-z0-9._-]*$/)` in the `CreateLocalUserDto`. **Triple enforcement** is required (not defense-in-depth) because `Migration20260214122722.ts:9` adds a `user_user_name_unique` constraint on `user_name` — the `moodleUserId`-keyed upsert does NOT prevent unique-violation exceptions if a Moodle user ever has a colliding `user_name`. The three enforcement points:

1. **DTO validator** — `@Matches` regex rejects non-`local-` usernames at the API boundary with 400
2. **Moodle sync skip guard** — `moodle-enrollment-sync.service.ts:131-136` rejects (with warn log) any Moodle user whose `username` starts with `local-`, preventing sync-time collisions even if a Moodle sysadmin creates such an account
3. **Seed Users tab rejection** — the admin-console Seed Users form refuses to submit `local-*` Moodle usernames, preventing our own provisioning tool from creating reservable names

The existing SUPER_ADMIN account (seeded at boot via `UserSeeder.ts:18-27`, not via this endpoint) is grandfathered and retains its `superadmin` username; the unique-collision risk for SUPER_ADMIN is documented as a known latent edge case but considered low-probability.

The user authenticates via the existing `LocalLoginStrategy` (priority 10, which reads `localUser.password` at `src/modules/auth/strategies/local-login.strategy.ts:13,27`). **Creation is audited via manual `AuditService.Emit()` from the service** — NOT via the `@Audited()` decorator — because the `AuditInterceptor` at `src/modules/audit/interceptors/audit.interceptor.ts:60-79` builds its metadata from `request.params`/`request.query` only and cannot read the request body for the `{ campusId, authMode, defaultPasswordAssigned }` metadata shape AC-1.12 requires. `AdminUserService` injects `AuditService`, `CurrentUserService` (CLS-based, reads the JWT'd actor), and `RequestMetadataService` (CLS-based, reads IP/browser/OS), then after `em.persistAndFlush(user)` calls:

```typescript
await this.auditService.Emit({
  action: AuditAction.ADMIN_USER_CREATE,
  actorId: currentUser.id,
  actorUsername: currentUser.userName,
  resourceType: 'User',
  resourceId: user.id,
  metadata: {
    campusId: campus?.id ?? null,
    authMode: 'local',
    defaultPasswordAssigned,
  },
  browserName: requestMeta?.browserName,
  os: requestMeta?.os,
  ipAddress: requestMeta?.ipAddress,
});
```

The new `ADMIN_USER_CREATE: 'admin.user.create'` enum value is added to `src/modules/audit/audit-action.enum.ts` (verified the enum does not contain this value today). The controller registers `MetaDataInterceptor` and `CurrentUserInterceptor` to populate CLS before the service runs but omits `@Audited()` and `AuditInterceptor`.

The admin console (`admin.faculytics`) gains a "Provision User" form at a new `/provision-users` route, mirroring the existing `seed-users-tab.tsx` form pattern. A default password seed (`Head123#`) is assigned when SuperAdmin omits the password field. A **new migration** adds `User.campusSource` mirroring the existing `departmentSource`/`programSource` pattern (verified the column does NOT exist today).

**FAC-131b — Campus Head role (all three subprojects):** Add `CAMPUS_HEAD` to the roles enum. Extend the existing `ScopeResolverService.ResolveDepartmentIds()` method with a **single** `CAMPUS_HEAD` branch (a parallel `ResolveDepartmentCodes` method does NOT exist on this service — it is a private method on `AnalyticsService` that re-queries from IDs, so the codes path inherits automatically). The CAMPUS_HEAD branch resolves to "all departments in the caller's given semester, IF the semester belongs to one of the user's promoted campuses, else an empty array." This single-campus-per-semester semantics reflects the schema: `Department` has no direct `campus` FK — it joins via `Semester → Campus`, and each `Semester` belongs to exactly one `Campus`. A multi-campus Campus Head therefore sees different campuses by switching the semester dropdown in the UI (which is already the de-facto campus switcher since semesters are campus-scoped).

Extend `POST /admin/institutional-roles` to accept `role: CAMPUS_HEAD` with a depth-1 Moodle category validation (the existing DTO enum is `[DEAN, CHAIRPERSON]`; we add `CAMPUS_HEAD`). Add a new `GET /admin/institutional-roles/campus-head-eligible-categories` endpoint listing depth-1 categories not yet assigned to the target user. Add an explicit CAMPUS_HEAD denial at `questionnaire.service.ts:934` (immediately after the SUPER_ADMIN bypass) to produce a clear error message for the analytics-only scope boundary.

On the frontend, rename `DeanDashboardScreen` and `DeanFacultyAnalyticsScreen` to neutral `ScopedAnalyticsDashboardScreen` and `ScopedFacultyListScreen` with a `scopeLabel: "Campus" | "Department"` prop. **Additionally rename and parameterize 9 sibling `dean-*` component files** in `features/faculty-analytics/components/` — the original spec under-scoped this work; each sibling contains hardcoded "Dean"/"department" string literals that would leak into Campus Head pages. **Additionally relocate `FacultyReportScreen` and its 5 `_components` siblings** from `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/` into `features/faculty-analytics/components/` — the screen currently lives under Next.js private-folder scope inside the Dean route and cannot be imported from a Campus Head page without relocation. **Additionally refactor `use-faculty-report-detail-view-model.ts`** at lines 117 and 159 to derive its `backHref` from `getRoleConfig(activeRole).routePrefix` (using the `getRoleConfig` accessor — `ROLE_CONFIG` is NOT exported from `role-route.ts`) via the existing `useActiveRole()` hook (which returns an object and must be destructured: `const { activeRole } = useActiveRole()`). Create three parallel route files under `app/(dashboard)/campus-head/*` that reuse the renamed/relocated screens. Add `APP_ROLES.CAMPUS_HEAD` and a `ROLE_CONFIG[CAMPUS_HEAD]` entry exposing two nav items (Dashboard + Faculties — no Evaluation). The existing `RoleSwitcher` and sidebar render Campus Head automatically via `getRoleConfig(role).label` (confirmed).

The two tickets are independently reviewable: FAC-131a can be developed, merged, and tested without ever touching `app.faculytics`. FAC-131b depends on 131a for its "create the Campus Head account" step but is otherwise isolated.

### Scope

**In Scope (MVP):**

_FAC-131a — Provisioning primitive:_

- `POST /admin/users` endpoint accepting `{ username, firstName, lastName, password?, campusId? }` with bcrypt password hashing (uses existing `JWT_BCRYPT_ROUNDS` env var)
- **No email or displayName fields** — User entity has no such columns; `fullName` is computed server-side as `${firstName} ${lastName}`
- **Reserved `local-` username prefix** enforced via `@Matches(/^local-[a-z0-9][a-z0-9._-]*$/)` class-validator decorator in `CreateLocalUserDto`. Admin console form shows helper text `"Must start with 'local-' (e.g., local-kmartinez)"` under the Username field.
- **Moodle sync skip guard** in `moodle-enrollment-sync.service.ts:131-136` rejects any Moodle user whose `username.startsWith('local-')` with a warn log — structural enforcement of the prefix namespace
- **Seed Users tab rejection** (admin console): client-side validation rejects `local-*` on submission so our own admin tooling can't violate the namespace
- Default password seed `Head123#` when password is omitted; response indicates `defaultPasswordAssigned: true` so the admin console can prompt to share credentials out-of-band
- Password policy: minimum 6 characters (intentional MVP choice)
- Username uniqueness validation (409 on conflict; enforced at the DB level by existing `user_user_name_unique` constraint plus an explicit pre-check in the service for better error UX)
- Optional `campusId` — if provided, assigned with `campusSource: 'manual'`
- **Service-created User row populates ALL NOT NULL columns** — `userName`, `firstName`, `lastName`, `userProfilePicture` (empty string), `lastLoginAt` (`new Date()`), `isActive: true`, plus nullable `fullName` (computed), `password` (bcrypt), `campus`, `moodleUserId: null`
- **New migration**: add `User.campusSource` column (default `'auto'`, backfill existing rows) — mirrors `departmentSource` / `programSource` pattern
- **Update `moodle-enrollment-sync.service.ts` user creation payload** to explicitly set `campusSource: 'auto'` alongside the existing `departmentSource`/`programSource` setters (safety for strict MikroORM modes)
- Audit log entry on user creation via **manual `AuditService.Emit()`** call from `AdminUserService.CreateLocalUser` after persistence — bypasses the `@Audited()` decorator because the `AuditInterceptor` cannot read request body for metadata. Emits `action: ADMIN_USER_CREATE`, `actorId`/`actorUsername` from `CurrentUserService.getOrFail()`, `resourceType: 'User'`, `resourceId: user.id`, `metadata: { campusId, authMode: 'local', defaultPasswordAssigned }`, plus IP/browser/OS from `RequestMetadataService.get()`
- **New `ADMIN_USER_CREATE` audit action** added to `audit-action.enum.ts` as `'admin.user.create'`
- Admin console `/provision-users` route with form (fields: Username, First Name, Last Name, Password, Confirm Password, Campus dropdown) using native React state + TanStack Query mutation pattern from `seed-users-tab.tsx`
- `AdminUserService` (NEW service in `src/modules/admin/services/`) with `CreateLocalUser` method; injects `UserRepository`, `CampusRepository`, `EntityManager`, `ConfigService`, `AuditService`, `CurrentUserService`, `RequestMetadataService`; registered in `admin.module.ts` providers
- Unit and integration tests: controller spec, service spec, migration test, Moodle sync regression (deliberate `local-*` collision test)

_FAC-131b — Campus Head role:_

- `CAMPUS_HEAD` added to `UserRole` enum in `api/src/modules/auth/roles.enum.ts`
- `CAMPUS_HEAD` added to `UserRole` const in `admin/src/types/api.ts:98-107` and extend `InstitutionalRole` union at line 213
- `APP_ROLES.CAMPUS_HEAD` added in `app/constants/roles.ts`
- `ROLE_CONFIG[CAMPUS_HEAD]` added in `app/features/auth/lib/role-route.ts` with `label: "Campus Head"`, `homePath: "/campus-head/dashboard"`, `routePrefix: "/campus-head"`, `navItems: [Dashboard, Faculties]`
- `ScopeResolverService.ResolveDepartmentIds()` extended with **one** `CAMPUS_HEAD` branch: `resolveCampusHeadDepartmentIds(userId, semesterId)` → loads the given Semester via `em.findOne(Semester, { id: semesterId }, { populate: ['campus'] })`, reads `semester.campus.moodleCategoryId`, checks it's in the user's CAMPUS_HEAD-promoted category set, and if so returns all `Department` UUIDs for that semester. If the semester's campus is not in the promoted set, returns `[]`.
- **No `ResolveDepartmentCodes` branch** — that method does NOT exist on `ScopeResolverService`. The analytics service has its own private `ResolveDepartmentCodes` at `analytics.service.ts:1072` that translates IDs → codes internally, so the codes path inherits automatically from the `ResolveDepartmentIds` branch.
- `POST /admin/institutional-roles` DTO enum allow-list updated to include `CAMPUS_HEAD`
- `admin.service.ts:220-237` depth validation extended: `if (role === CAMPUS_HEAD) { depth must be 1, else 400 }` — mirrors existing Dean depth-3 check
- New endpoint `GET /admin/institutional-roles/campus-head-eligible-categories?userId=X` returns depth-1 Moodle categories not yet assigned to the user
- Authorization extension on `GET /api/v1/analytics/faculty/:id/report` — Campus Head allowed when target faculty's home department belongs to their campus scope
- Evaluation submission denial (`POST /questionnaires/submissions`) — **Step 2.5 RESOLVED by reading the actual service**: Without the fix, a Campus Head calling `assertSubmissionAuthorization` at `questionnaire.service.ts:928-956` would bypass SUPER_ADMIN at line 934, hit `resolveRespondentRole()` which returns `RespondentRole.STUDENT` (the fall-through default), then at line 937 check `SUBMISSION_TYPE_MATRIX[STUDENT]`. Non-`FACULTY_FEEDBACK` submissions would fail at line 939 with `"Your role is not permitted to submit this questionnaire type."`; `FACULTY_FEEDBACK` submissions would proceed further but hit the enrollment check in `submitQuestionnaire` (lines 687-700) with `"Respondent is not actively enrolled as a student in this course."` Both error messages are misleading for a Campus Head. **Fix**: insert 4 LOC at line 934 (immediately after the SUPER_ADMIN bypass) that throws `ForbiddenException("Campus Heads are not permitted to submit faculty evaluations.")` for any user with `UserRole.CAMPUS_HEAD` in `respondent.roles`. Spec test asserts the explicit message.
- **Frontend screen rename + FacultyReportScreen relocation + 9-sibling parameterization**:
  - Rename `DeanDashboardScreen` → `ScopedAnalyticsDashboardScreen` with `scopeLabel: "Campus" | "Department"` prop
  - Rename `DeanFacultyAnalyticsScreen` → `ScopedFacultyListScreen` with same prop
  - Rename 9 additional sibling files (`dean-analytics-async-content.tsx`, `dean-analytics-empty-state.tsx`, `dean-analytics-error-state.tsx`, `dean-analytics-loading-state.tsx`, `dean-attention-card.tsx`, `dean-charts.tsx`, `dean-dashboard-header.tsx`, `dean-faculty-analysis-table.tsx`, `dean-metrics-grid.tsx`) to `scoped-*` prefix and parameterize any hardcoded "department"/"Dean" string literals via the `scopeLabel` prop propagated from parent
  - Corresponding view-model hook renames: `use-scoped-analytics-dashboard-view-model.ts`, `use-scoped-faculty-analytics-list-view-model.ts`
  - **Relocate `FacultyReportScreen` + 5 `_components` siblings** from `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/` into `features/faculty-analytics/components/`. Update `features/faculty-analytics/index.ts` barrel exports. Update the Dean analysis route page to import from the feature. Without this relocation, Campus Head cannot import `FacultyReportScreen` under `@/features/faculty-analytics` — it lives under a Next.js private-folder scope scoped to the Dean route.
- **Frontend refactor (Step 2 finding, Option 1 locked, Step 3.5 code correction)**: `use-faculty-report-detail-view-model.ts:117,159` currently hardcodes `backHref: "/dean/faculties"` and `router.push("/dean/faculties")`. Refactor via **Option 1 corrected**: destructure `const { activeRole } = useActiveRole()`, then derive `backHref = activeRole ? \`${getRoleConfig(activeRole).routePrefix}/faculties\` : "/dean/faculties"`. Use the `getRoleConfig()`accessor function — NOT`ROLE_CONFIG[...]`directly, because the const is not exported from`role-route.ts`. Replace both the `backHref`assignment and the`router.push()`call. Rationale: single source of truth via`getRoleConfig`; graceful fallback if `activeRole === null` during auth transition.
- Dean routes (`app/(dashboard)/dean/dashboard/page.tsx`, `app/(dashboard)/dean/faculties/page.tsx`) updated to import renamed components and pass `scopeLabel="Department"` — regression-safe
- New frontend routes under `app/(dashboard)/campus-head/`:
  - `layout.tsx` — `<RoleGuard allowedRoles={[APP_ROLES.CAMPUS_HEAD]}>{children}</RoleGuard>`
  - `page.tsx` — `redirect("/campus-head/dashboard")`
  - `dashboard/page.tsx` — `<ScopedAnalyticsDashboardScreen scopeLabel="Campus" />`
  - `faculties/page.tsx` — `<ScopedFacultyListScreen scopeLabel="Campus" />`
  - `faculties/[facultyId]/analysis/page.tsx` — `<FacultyReportScreen facultyId={facultyId} />`
- Admin console: `role-action-dialog.tsx` extended with a `CAMPUS_HEAD` branch that uses the new `useCampusHeadEligibleCategories()` hook (mirroring the existing `useDeanEligibleCategories` at `use-institutional-roles.ts:12`) with a depth-1 campus picker
- Unit, integration, and regression tests across all three subprojects

**Out of Scope (explicitly deferred or excluded):**

- **Evaluation submissions for Campus Head** — team confirmed Campus Head does not submit faculty evaluations; they are an analytics-only role
- **Campus Head promoting Deans** — promotion remains SuperAdmin-only; Campus Head has no delegation authority
- **Password reset flow for local accounts** — if a Campus Head forgets their password, SuperAdmin must manually delete and recreate the user; a proper reset flow is a separate future ticket
- **Moodle category-manager sync (Option C)** — no new WS function integration for `core_role_get_users_with_capability`
- **Moodle on-demand hydration (Option B)** — not applicable; no Moodle accounts exist to hydrate from
- **Username-prefix-based role derivation** — rejected during brainstorming
- **Multi-role switcher UX polish** — the switcher reads from `ROLE_CONFIG` and renders Campus Head automatically (Step 2 confirmed). Label disambiguation like "Campus Head — UCMN" for multi-scoped users is deferred to a future UX ticket.
- **Orphaned institutional role defensive handling** — deferred; `ResolveDepartmentIds` returning `[]` on a dangling `moodleCategoryId` is acceptable for MVP
- **Attention-list grouping by department at campus scope** — flagged by UX but deferred
- **Chairperson analytics screens** — Step 2 confirmed `/chairperson/dashboard` and `/chairperson/faculties` exist today as static placeholder stubs that do NOT import Dean screens. The rename of `DeanDashboardScreen` → `ScopedAnalyticsDashboardScreen` does NOT automatically cover Chairperson. Chairperson screen implementation is a separate future ticket.
- **FAC-130 materialized view migration** — **Step 2 confirmed the MV preserves `department_code_snapshot`** in its grain, so Campus Head aggregation works via the existing MV. No MV migration needed.

## Context for Development

### Codebase Patterns

**Backend (api.faculytics):**

- **Entities extend `CustomBaseEntity`** (UUID primary key, timestamps, soft delete). `User` entity at `src/entities/user.entity.ts` has:
  - `campus?: Campus` FK at lines 43-44 (nullable)
  - `password` column (nullable, hidden; used today by SUPER_ADMIN seeding from env vars) — **NOT `passwordHash`**
  - `departmentSource!: string` (default `'auto'`) at line 68 — FAC-127 pattern
  - `programSource!: string` (default `'auto'`) at line 69
  - **NO `campusSource` column** — Step 2 confirmed this is missing and must be added via migration
- **Institutional roles** in `UserInstitutionalRole` table, keyed to a `MoodleCategory` at any depth (1 campus, 3 department, 4 program). The table already supports CAMPUS_HEAD at depth 1 without schema change.
- **Scope Resolver** at `src/modules/common/services/scope-resolver.service.ts` is the single gate for role-based query filtering. Existing methods:
  - `ResolveDepartmentIds(semesterId): Promise<string[] | null>` — returns null for SuperAdmin, UUID array for Dean/Chairperson
  - `ResolveProgramIds(semesterId)`, `ResolveProgramCodes(semesterId)` — program-level variants (used by `curriculum.service.ts:117` and by `analytics.service.ts:IsProgramCodeInScope:1061-1067` respectively)
  - **There is NO `ResolveDepartmentCodes` on this service** — it's a private method on `AnalyticsService` at `analytics.service.ts:1072` that re-queries from IDs. (Round 2 cross-layer audit correction.)
  - **Three methods need CAMPUS_HEAD handling**: `ResolveDepartmentIds` does real filtering via Semester → Campus traversal (Task 16); `ResolveProgramIds` and `ResolveProgramCodes` return `null` (unrestricted at program level, matching Dean semantics at `scope-resolver.service.ts:52-53`). Campus Head's program scope is implicitly the union of all programs in their campuses — the department filter from `ResolveDepartmentIds` is the true scope boundary.
- **Login strategies** via `LOGIN_STRATEGIES` injection token. `LocalLoginStrategy` (priority 10) handles bcrypt password comparison; no auth changes needed for Campus Head.
- **FAC-127 source-tracking**: `User.departmentSource` / `programSource` (values `'auto'` | `'manual'`). When `'manual'`, Moodle sync does not overwrite. **Parallel `campusSource` added in this work.**
- **Admin endpoint convention**: controllers use `@UseJwtGuard(UserRole.SUPER_ADMIN)` to restrict to SuperAdmin. `POST /admin/users` must use this pattern.
- **DTO convention**: admin module uses class-validator + `@nestjs/swagger @ApiProperty` decorators (NOT Zod). Existing example: `assign-institutional-role.request.dto.ts`.
- **Audit infrastructure** at `src/modules/audit/`: `AuditLog` entity, `AuditService`, `@Audited()` decorator, `AuditInterceptor` (captures request context: IP, browser, OS), `AuditAction` enum. Use by annotating endpoint with `@Audited({ action: AuditAction.<CODE>, resource: '<Name>' })` + `@UseInterceptors(AuditInterceptor)`.

**Frontend (app.faculytics):**

- **Feature-sliced structure** mandated per `app.faculytics/docs/ARCHITECTURE.md`. Campus Head work stays within `features/faculty-analytics/*` (screens + hooks) and `app/(dashboard)/campus-head/*` (routes).
- **Role enum**: `APP_ROLES` in `constants/roles.ts` (string-literal object); `ROLE_CONFIG` in `features/auth/lib/role-route.ts:55-64` is the single source of truth for `label`, `homePath`, `routePrefix`, `navItems` per role.
- **`getRoleLabel(role)`** at `features/auth/lib/role-route.ts:124-126` reads from `ROLE_CONFIG[role].label` — adding a role-config entry is sufficient for the role switcher to display Campus Head.
- **`RoleGuard`** at `app/(dashboard)/_guards/role-guard.tsx` — layout-level gate. Campus Head layout uses `<RoleGuard allowedRoles={[APP_ROLES.CAMPUS_HEAD]}>`.
- **Implicit campus scoping** via `useMe().data?.campus?.id` — Campus Head uses the same hook; no frontend data-flow change.
- **Screen reuse pattern**: Dean screens are gated by the route layout's `RoleGuard`, not by component-level role checks. Renaming to neutral names and passing `scopeLabel` as a prop keeps the screens reusable.
- **Sidebar** at `components/layout/app-sidebar.tsx` calls `getNavItemsForRole(activeRole)` which reads `ROLE_CONFIG`. Adding a new role means editing `ROLE_CONFIG` only.
- **Role switcher** at `components/layout/role-switcher.tsx:55-59` maps over `roles` from `useActiveRole()` and renders via `getRoleLabel(role)`. Step 2 confirmed zero switcher code changes are needed.
- **GOTCHA (Step 2 finding)**: `features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts:117` hardcodes `backHref: "/dean/faculties"` and line 159 hardcodes `router.push("/dean/faculties")`. This must be refactored to derive the prefix from `activeRole` or from `usePathname()` (the hook already imports `usePathname` on line 25).
- **Chairperson stubs**: `app/(dashboard)/chairperson/dashboard/page.tsx` and `app/(dashboard)/chairperson/faculties/page.tsx` are static placeholder pages that do NOT import Dean screens. They are not affected by the rename. `ROLE_CONFIG[CHAIRPERSON]` at `role-route.ts:55-64` has 3 nav items (Dashboard, Faculties, Evaluation) — use this entry as the template shape for `ROLE_CONFIG[CAMPUS_HEAD]` (but with only 2 items, omitting Evaluation).

**Admin console (admin.faculytics):**

- **React 19 + Vite + TanStack Query + shadcn/ui + React Router** (from react-router-dom). Routing config at `src/routes.tsx`; nav items at `src/app-shell.tsx:41-47`.
- **Protected routes** wrapped in `<AuthGuard>` and nested under `<AppShell>`.
- **Form pattern**: native React `useState` + TanStack Query `useMutation` + manual inline validation (no react-hook-form, no client-side Zod). Example: `src/features/moodle-provision/components/seed-users-tab.tsx` (515 lines).
- **Error handling**: `ApiError instanceof` checks in `onError` callback + `sonner` toasts.
- **API client**: `apiClient<T>(path, { method, body })` from `lib/api-client` — auto-injects Bearer token, handles 401 refresh.
- **Roles enum**: `UserRole` const at `src/types/api.ts:98-107` (NOT the same file as api/app — admin console has its own copy). Currently missing `CAMPUS_HEAD`. Also has `InstitutionalRole` union type at line 213 restricting promotion-target roles to `[DEAN, CHAIRPERSON]` — must be extended.
- **Institutional roles feature**: `src/features/admin/role-action-dialog.tsx` (342 lines), `src/features/admin/use-institutional-roles.ts` with `useDeanEligibleCategories()` at line 12. New `useCampusHeadEligibleCategories()` hook is a direct copy of the Dean version with different query key and endpoint path.

### Files to Reference

_Split into two sub-tables per Step 2.5 file-list audit: **Files to Modify** (actual code changes) vs **Files to Reference Only** (read during implementation but no edits — behavior inherits via upstream changes like the scope resolver branching)._

#### Files to Modify

| File                                                                           | Purpose                                                                                                                                                                                                                                             | Lines to note                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **api.faculytics**                                                             |                                                                                                                                                                                                                                                     |                                                                         |
| `src/modules/auth/roles.enum.ts`                                               | Add `CAMPUS_HEAD = 'CAMPUS_HEAD'`                                                                                                                                                                                                                   | enum values                                                             |
| `src/entities/user.entity.ts`                                                  | Add `campusSource` property mirroring `departmentSource`/`programSource`                                                                                                                                                                            | 43-44 (campus FK), 68-69 (source columns)                               |
| `src/modules/common/services/scope-resolver.service.ts`                        | Add CAMPUS_HEAD branch to `ResolveDepartmentIds` ONLY (Semester traversal) + `return null` branches to `ResolveProgramIds` and `ResolveProgramCodes`. **`ResolveDepartmentCodes` does NOT exist on this service** — don't look for it. See Task 16. | existing Dean logic at lines 36-38, 52-53; Semester populate at Task 16 |
| `src/modules/admin/admin.controller.ts`                                        | Add `POST /admin/users` and `GET /admin/institutional-roles/campus-head-eligible-categories`                                                                                                                                                        | ~161 (existing institutional-roles)                                     |
| `src/modules/admin/services/admin.service.ts`                                  | Extend `AssignInstitutionalRole` depth validation with CAMPUS_HEAD depth-1 branch                                                                                                                                                                   | 205-237                                                                 |
| `src/modules/admin/services/admin-user.service.ts`                             | **NEW** — `CreateLocalUser` method                                                                                                                                                                                                                  | new file                                                                |
| `src/modules/admin/admin.module.ts`                                            | Register `AdminUserService` provider                                                                                                                                                                                                                | 26-58                                                                   |
| `src/modules/admin/dto/requests/assign-institutional-role.request.dto.ts`      | Add `CAMPUS_HEAD` to enum allow-list                                                                                                                                                                                                                | 1-20                                                                    |
| `src/modules/admin/dto/requests/create-user.request.dto.ts`                    | **NEW** — class-validator DTO with `@Matches(/^local-/)` username validation, 6-char password min, optional campusId                                                                                                                                | new file                                                                |
| `src/modules/admin/dto/responses/create-user.response.dto.ts`                  | **NEW** — response DTO with `defaultPasswordAssigned` flag                                                                                                                                                                                          | new file                                                                |
| `src/modules/questionnaires/services/questionnaire.service.ts`                 | Add explicit CAMPUS_HEAD denial after SUPER_ADMIN bypass                                                                                                                                                                                            | **934**                                                                 |
| `src/modules/questionnaires/services/questionnaire.service.spec.ts`            | Add spec case for CAMPUS_HEAD denial                                                                                                                                                                                                                | —                                                                       |
| `src/migrations/Migration{timestamp}_fac-131-campus-source-and-campus-head.ts` | **NEW** — generate via `npx mikro-orm migration:create`; add `campus_source` column with default `'auto'`; backfill                                                                                                                                 | new file                                                                |
| `src/modules/audit/audit-action.enum.ts`                                       | Add `ADMIN_USER_CREATE` action code if not already present                                                                                                                                                                                          | —                                                                       |
| `src/modules/moodle/services/moodle-enrollment-sync.service.ts`                | (Task 10.75) Add `local-*` skip guard in the `uniqueUsers` loop + set `campusSource: InstitutionalRoleSource.AUTO` in the existing `fork.create(User, {...})` call                                                                                  | 131-136 (skip guard insertion), 148-161 (fork.create)                   |
| `src/modules/moodle/services/moodle-enrollment-sync.service.spec.ts`           | (Task 10.75) Extend with `local-*` collision test OR rely on Task 11                                                                                                                                                                                | —                                                                       |
| `src/modules/moodle/services/moodle-provisioning.service.ts`                   | (Task 10.75) Belt-and-suspenders rejection of `local-*` generated usernames in `SeedUsers`                                                                                                                                                          | search for `SeedUsers` method                                           |
| `src/modules/moodle/dto/requests/seed-users.request.dto.ts`                    | (Task 10.75) Server-side rejection of `local-*` at the API boundary                                                                                                                                                                                 | existing DTO                                                            |
| `src/modules/analytics/analytics.controller.ts`                                | (Task 15.5) Add `UserRole.CAMPUS_HEAD` to `@UseJwtGuard` allowlist                                                                                                                                                                                  | **29**                                                                  |
| `src/modules/faculty/faculty.controller.ts`                                    | (Task 15.5) Add `UserRole.CAMPUS_HEAD` to `@UseJwtGuard` allowlist                                                                                                                                                                                  | **21**                                                                  |
| `src/modules/reports/reports.controller.ts`                                    | (Task 15.5) Add `UserRole.CAMPUS_HEAD` to `@UseJwtGuard` allowlist                                                                                                                                                                                  | **28**                                                                  |
| `src/modules/curriculum/curriculum.controller.ts`                              | (Task 15.5) Add `UserRole.CAMPUS_HEAD` to `@UseJwtGuard` allowlist                                                                                                                                                                                  | **16**                                                                  |

#### Files to Reference Only (inherit via upstream changes, zero code changes)

| File                                              | Why it's referenced                                                                                                                                                                                                                                                                                                                                                                                                         | Lines to note              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `src/entities/user-institutional-role.entity.ts`  | Promotion table — no schema change                                                                                                                                                                                                                                                                                                                                                                                          | —                          |
| `src/entities/audit-log.entity.ts`                | Audit entity shape — metadata JSONB field                                                                                                                                                                                                                                                                                                                                                                                   | 1-44                       |
| `src/modules/faculty/services/faculty.service.ts` | `ListFaculty` uses `ResolveDepartmentIds()` — CAMPUS_HEAD inherits via resolver branch, **zero code changes**                                                                                                                                                                                                                                                                                                               | 30-164, 358                |
| `src/modules/analytics/analytics.service.ts`      | `GetDepartmentOverview` (74-187), `GetAttentionList` (189-396), `GetFacultyReport` all use `scopeResolver.ResolveDepartmentIds()` (directly or via `IsProgramCodeInScope`/the private `AnalyticsService.ResolveDepartmentCodes` at 1072). CAMPUS_HEAD inherits via Task 16's resolver branches, **zero code changes**. Note: `ResolveDepartmentCodes` is a private method on AnalyticsService, NOT on ScopeResolverService. | 74-187, 189-396, 1061-1080 |

<!-- S1 fix: moodle-enrollment-sync.service.ts MOVED to Files to Modify — Task 10.75 (post-Round-3 merge of 10.5 + 25.5) adds the local-* skip guard and campusSource setter. It is no longer "zero code changes." -->

| `src/modules/questionnaires/questionnaire.controller.ts` | Submission endpoint — `@UseJwtGuard()` with no role list; authorization in service layer | 313-329 |
| `src/modules/audit/audit.service.ts` | Audit event emission — use existing `Emit()` method | — |
| `src/modules/audit/decorators/audited.decorator.ts` | `@Audited({ action, resource })` decorator | — |
| `src/modules/audit/audit-action.enum.ts` | Add `ADMIN_USER_CREATE` action code | — |
| `src/migrations/Migration20260413232204_fac-130-mv-home-department.ts` | Reference MV definition — `department_code_snapshot` preserved at grain | 20-83 |
| **app.faculytics** | | |
| `constants/roles.ts` | Add `CAMPUS_HEAD` to `APP_ROLES` | — |
| `features/auth/lib/role-route.ts` | Add `ROLE_CONFIG[CAMPUS_HEAD]` entry (2 nav items) | 55-64 (CHAIRPERSON template), 124-126 (getRoleLabel) |
| `features/faculty-analytics/components/dean-dashboard-screen.tsx` | Rename to `scoped-analytics-dashboard-screen.tsx`; add `scopeLabel` prop; derive page title from label | 57-62 (empty-state guard), 63-76 (charts) |
| `features/faculty-analytics/components/dean-faculty-analytics-screen.tsx` | Rename to `scoped-faculty-list-screen.tsx`; add `scopeLabel` prop | — |
| `features/faculty-analytics/hooks/use-dean-dashboard-view-model.ts` | Rename | 50-53, 91-99 (fallback summary) |
| `features/faculty-analytics/hooks/use-dean-faculty-analytics-list-view-model.ts` | Rename | — |
| `features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts` | **REFACTOR backHref** — derive from `activeRole` or `usePathname()` instead of hardcoded `/dean/faculties` | **117 (backHref), 159 (router.push), 25 (usePathname already imported)** |
| `features/faculty-analytics/components/faculty-report-screen.tsx` | No rename; stays neutral. Uses `backHref` from view model | 32, 66 |
| `app/(dashboard)/_guards/role-guard.tsx` | Existing RoleGuard — referenced only | — |
| `app/(dashboard)/dean/layout.tsx` | Reference for Campus Head layout template | — |
| `app/(dashboard)/dean/dashboard/page.tsx` | Update import + pass `scopeLabel="Department"` | — |
| `app/(dashboard)/dean/faculties/page.tsx` | Update import + pass `scopeLabel="Department"` | — |
| `app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx` | Reference for Campus Head parallel route | — |
| `app/(dashboard)/chairperson/dashboard/page.tsx` | Static stub — reference but NOT affected by rename | — |
| `components/layout/role-switcher.tsx` | Reads from `ROLE_CONFIG` — no code changes | 25, 49, 55-59 |
| **admin.faculytics** | | |
| `src/types/api.ts` | Add `CAMPUS_HEAD` to `UserRole` const + extend `InstitutionalRole` union | 98-107 (UserRole), 213 (InstitutionalRole) |
| `src/features/admin/use-institutional-roles.ts` | Add `useCampusHeadEligibleCategories` hook (copy of existing at line 12) | 12 (useDeanEligibleCategories) |
| `src/features/admin/role-action-dialog.tsx` | Extend with CAMPUS_HEAD branch (depth-1 campus picker) | 342 lines total |
| `src/features/moodle-provision/components/seed-users-tab.tsx` | **Reference pattern** for new provisioning form | 515 lines |
| `src/features/moodle-provision/use-seed-users.ts` | Reference mutation hook pattern | — |
| `src/features/user-provisioning/*` | **NEW** — provisioning form + hook + page | new directory |
| `src/routes.tsx` | Add `/provision-users` route entry | existing structure |
| `src/app-shell.tsx` | Add nav item for Provision Users | 41-47 |
| `src/lib/api-client.ts` | Reference — existing API client with bearer token + 401 refresh | — |

### Technical Decisions

1. **Ticket split: FAC-131a (provisioning primitive) + FAC-131b (Campus Head role).** Rationale: 131a is a general-purpose capability that will serve future non-enrolled roles. Bundling would hide it in the Campus Head ticket's title and prevent parallel development. 131a can be merged independently.

2. **Local accounts over Moodle hydration.** Rationale: The pilot institution confirmed no Moodle accounts have category-manage at depth 1, so hydration has nothing to pull from. Creating Moodle accounts for users who never touch Moodle is ceremonial coupling without value.

3. **Reuse `UserInstitutionalRole` instead of a new table.** Rationale: The table is already keyed to MoodleCategory at any depth. Dean uses depth 3, Campus Head uses depth 1. Zero schema change.

4. **Extend existing `ResolveDepartmentIds` (ONLY) instead of adding `ResolveCampusIds`.** _(Refined in Step 2, corrected in Step 3.5 post-adversarial.)_ Rationale: The FAC-130 materialized view grain preserves `department_code_snapshot`, so the analytics endpoints filter by department code. `ScopeResolverService` exposes `ResolveDepartmentIds` as the single gate. The **analytics service has its own private `ResolveDepartmentCodes` method at `analytics.service.ts:1072`** that translates IDs → codes internally via `scopeResolver.ResolveDepartmentIds` + a SQL lookup — this is NOT a resolver-service method, despite an earlier version of this spec claiming it was. Adding a `CAMPUS_HEAD` branch inside `ResolveDepartmentIds` is sufficient; the analytics codes path inherits automatically. **Additional schema finding**: `Department` has no `campus` FK; the traversal is `Department.semester.campus`. Since each `Semester` belongs to exactly one `Campus`, a call like `ResolveDepartmentIds(semesterId)` for a multi-campus Campus Head returns departments from the ONE campus that owns the given semester — multi-campus scope is expressed by the user switching semesters in the UI (semester dropdown IS the campus switcher). This is actually fine UX and is encoded in the revised AC-2.8/AC-2.8a/AC-2.8b.

5. **Reuse Dean screens with neutral naming.** Rationale: Screens are gated by route layout, not by component role check. The rename + `scopeLabel` prop makes them reusable.

6. **Default password `Head123#` with 6-char minimum policy.** Rationale: Explicit MVP choice. SuperAdmin overrides at creation; if omitted, default is assigned and the admin console surfaces a one-time credential-sharing prompt.

7. **Moodle sync compatibility REQUIRES a new skip guard** _(Step 2 was wrong; corrected in Round 2 per F10 and finalized in Round 3 S1 per Task 10.75)._ The original Step 2 claim was "no code change required — the `moodleUserId` upsert key makes local accounts invisible." Rounds 1-2 adversarial review proved this wrong: the `user_user_name_unique` constraint at `Migration20260214122722.ts:9` would throw a unique-violation exception if a Moodle user ever had a colliding `user_name`, regardless of the `moodleUserId` upsert conflict handler. Task 10.75 (merged from former Tasks 10.5 + 25.5 in Round 3 per Option C) adds a skip guard at `moodle-enrollment-sync.service.ts:131-136` that rejects Moodle users whose `username.startsWith('local-')` with a warn log. Task 10.75 also adds the `campusSource: InstitutionalRoleSource.AUTO` setter to the existing `fork.create(User, {...})` call at lines 148-161 for safety after the Task 1 migration lands. **This is a code change, not a regression-test-only item** — `moodle-enrollment-sync.service.ts` is in `Files to Modify`, not `Files to Reference Only`.

8. **CAMPUS_HEAD nav excludes Evaluation.** Rationale: Analytics-only per product decision. Nav includes Dashboard + Faculties only.

9. **SuperAdmin-only promotion for Campus Head.** Rationale: Preserves existing governance pattern. Campus Heads cannot delegate.

10. **Screen rename treated as regression risk.** Rationale: Dean screens must render identically after the rename. Regression AC-2.18 is the gate.

11. **`FacultyReportScreen` backHref refactor is in-scope — Option 1 locked with corrected syntax.** _(Step 2 finding; refined in Step 2.5 party; code corrected in Step 3.5 post-adversarial.)_ `use-faculty-report-detail-view-model.ts:117,159` hardcodes `/dean/faculties`. **Correct refactor**: `const { activeRole } = useActiveRole()` (MUST destructure — the hook returns an object, not a role string), then `const routePrefix = activeRole ? getRoleConfig(activeRole).routePrefix : "/dean"`. **Use the `getRoleConfig()` accessor** — NOT `ROLE_CONFIG[activeRole]` directly, because `const ROLE_CONFIG` at `role-route.ts:29` is declared _without_ the `export` keyword. Replace both the `backHref` assignment (line 117) and the `router.push()` call (line 159). Rationale: single source of truth via `getRoleConfig`, graceful fallback if `activeRole === null` during auth transition. Without this refactor, Campus Head users clicking "Back" on a faculty analysis page would navigate to `/dean/faculties` — wrong route, blocked by RoleGuard. **ALSO**: `FacultyReportScreen` itself must be relocated from `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/` into `features/faculty-analytics/components/` before any Campus Head route can import it — see Technical Decision #18 and Task 20.5.

12. **`User.campusSource` migration is required.** _(NEW — Step 2 finding.)_ The column does not exist today despite being referenced in the original plan. Add via migration with default `'auto'`, backfill existing rows, mirror `departmentSource`/`programSource` pattern. This is trivial work but must be explicit.

13. **Audit infrastructure exists but `@Audited()` is the wrong mechanism for this endpoint.** _(Step 2 claimed "use `@Audited()`"; Step 3.5 post-adversarial corrects this.)_ The `AuditInterceptor` at `src/modules/audit/interceptors/audit.interceptor.ts:60-79` builds `rawMetadata` from `request.params` and `request.query` only — NOT from `request.body`. `resourceId` is extracted from path UUIDs via regex. `POST /admin/users` has no params, no query, and the new user's UUID is not in the URL. The decorator-based approach would produce an audit row with `metadata: undefined` and `resourceId: undefined`, failing AC-1.12. **Correct approach**: manual `AuditService.Emit()` call from `AdminUserService.CreateLocalUser` after `em.persistAndFlush(user)`. Inject `AuditService`, `CurrentUserService` (reads actor from CLS), and `RequestMetadataService` (reads IP/browser/OS from CLS). Controller uses `@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor)` to populate CLS but omits `@Audited()` and `AuditInterceptor`. Add `ADMIN_USER_CREATE: 'admin.user.create'` to `src/modules/audit/audit-action.enum.ts` (verified missing as of 2026-04-14). Verified shape: `EmitParams` interface at `src/modules/audit/dto/emit-params.dto.ts` supports `{ action, actorId, actorUsername, resourceType, resourceId, metadata, browserName, os, ipAddress }`.

14. **Chairperson screens are out of scope.** _(Refined in Step 2.)_ The stubs at `/chairperson/dashboard` and `/chairperson/faculties` do not import Dean screens, so the rename does not affect them. Whether to wire Chairperson to `ScopedAnalyticsDashboardScreen` is a separate future ticket.

15. **Evaluation submission endpoint authorization — RESOLVED with corrected fall-through analysis.** _(Step 2 finding, resolved in Step 2.5, corrected in Step 3.5 post-adversarial.)_ `POST /questionnaires/submissions` uses `@UseJwtGuard()` with no role arg. The authorization lives in `questionnaire.service.ts:assertSubmissionAuthorization()` starting at line 928. Current flow: SUPER_ADMIN bypass (line 934), then `resolveRespondentRole()` maps to `RespondentRole.DEAN`/`CHAIRPERSON`/`STUDENT` (fallback). **Corrected fall-through analysis**: A Campus Head would be mapped to `STUDENT`. At line 937, `SUBMISSION_TYPE_MATRIX[STUDENT]` would be checked. If the submitted `typeCode` is not in the STUDENT-allowed set, line 939 throws `"Your role is not permitted to submit this questionnaire type."` If the typeCode IS allowed for STUDENT, execution would continue to a _separate_ enrollment check earlier in `submitQuestionnaire` (lines 687-700) which would throw `"Respondent is not actively enrolled as a student in this course."` **Both error messages are misleading for a Campus Head.** **Fix**: add explicit CAMPUS_HEAD denial at line 934 immediately after the SUPER_ADMIN bypass with a clear `ForbiddenException("Campus Heads are not permitted to submit faculty evaluations.")`. ~4 LOC production + 1 spec test. Exact code in AC-2.17 and Task 17.

16. **Local account username convention: reserved `local-` prefix — enforced in three places, not one.** _(Step 2.5 decision; enforcement model corrected in Step 3.5 post-adversarial.)_ All locally-provisioned usernames must match `^local-[a-z0-9][a-z0-9._-]*$`. **Originally I claimed the DTO `@Matches()` was sufficient because "the `moodleUserId`-keyed upsert makes collision impossible anyway." This was wrong.** The `user_user_name_unique` constraint at `Migration20260214122722.ts:9` means a Moodle user with a colliding `user_name` would throw a unique-violation exception on sync, NOT hit the `moodleUserId` conflict handler. Therefore: **three enforcement points required**: (1) DTO `@Matches()` at creation time; (2) `MoodleEnrollmentSyncService` skip guard rejects Moodle users with `username.startsWith('local-')` with a warn log; (3) `MoodleProvisioningService.SeedUsers` or equivalent rejects `local-*` requests at the admin-console Seed Users tab so we can't violate our own convention. SUPER_ADMIN `superadmin` is grandfathered with a documented latent-collision risk (a Moodle user literally named `superadmin` would still break sync — low probability but real). The convention also opens future prefixes (`sso-`, `csv-`, `api-import-`) for other provisioning sources. Midge's tripwire regression test is upgraded from optional to mandatory — Task 11 covers it.

17. **Post-adversarial review remediation tracker.** _(NEW — Step 3.5.)_ The spec underwent a 20-finding adversarial review on 2026-04-14 that exposed 7 Critical and 5 High factual errors in the original Step 3 version. The remediation cycle (1) corrected factual claims against actual source files (`user.entity.ts` has no `email`/`displayName`/`passwordHash`, `scope-resolver.service.ts` has no `ResolveDepartmentCodes`, `Department` has no direct `campus` FK, `ROLE_CONFIG` is not exported, `useActiveRole()` returns an object, `FacultyReportScreen` lives under Dean's `_components` folder, `AuditInterceptor` cannot read request body), (2) expanded scope to include 9 additional `dean-*` component renames and the `FacultyReportScreen` relocation, (3) added two new tasks (Task 10.5 — Seed Users tab `local-*` rejection, Task 25.5 — Moodle sync skip guard), and (4) corrected several AC code blocks with verified syntax. Every claim in this post-remediation version references a file path and line number verified via Grep/Read before being written. Future edits to this spec MUST follow the same discipline: no "CONFIRMED" markers without a verbatim file-read citation.

18. **`FacultyReportScreen` relocation is in-scope.** _(NEW — Step 3.5 finding F7.)_ The screen at `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-screen.tsx` imports 5 sibling components from `./` (FacultyReportComments, FacultyReportHeader, FacultyReportSectionPerformanceChart, FacultyReportSections, FacultyReportSummaryCards). Next.js private-folder scoping means these are not importable from outside the Dean route tree — so Campus Head cannot import `FacultyReportScreen` without either (a) relocating the screen and its siblings into `features/faculty-analytics/components/`, or (b) duplicating the entire screen tree under `campus-head/faculties/[facultyId]/analysis/_components/`. Option (b) is a DRY violation; Option (a) is the correct refactor. Task 20.5 is added for the relocation. Budget: 6 file moves, ~15-20 import rewrites.

19. **9 additional `dean-*` siblings must rename/parameterize.** _(NEW — Step 3.5 finding F11.)_ `features/faculty-analytics/components/` contains 11 `dean-*` prefixed files, not 2. The original Task 20 renamed only `dean-dashboard-screen.tsx` and `dean-faculty-analytics-screen.tsx`. The remaining 9 (`dean-analytics-async-content.tsx`, `dean-analytics-empty-state.tsx`, `dean-analytics-error-state.tsx`, `dean-analytics-loading-state.tsx`, `dean-attention-card.tsx`, `dean-charts.tsx`, `dean-dashboard-header.tsx`, `dean-faculty-analysis-table.tsx`, `dean-metrics-grid.tsx`) are imported by the renamed screens and contain hardcoded "Dean"/"department" string literals that would surface on Campus Head pages. Task 20.75 adds them to the rename scope. This changes the rename budget from "trivial 2-file rename" to "substantive 11-file refactor + string parameterization via `scopeLabel` prop propagation."

## Implementation Plan

### Tasks

_Tasks are ordered by dependency (lowest-level foundation first). Grouped by ticket: FAC-131a tasks are independently mergeable; FAC-131b tasks require FAC-131a to be merged first._

---

#### FAC-131a — Non-enrolled User Provisioning Primitive

##### Backend foundation (api.faculytics)

- [ ] **Task 1 — Add `campusSource` column to User entity and generate migration**
  - Files:
    - `src/entities/user.entity.ts` (edit around lines 68-69)
    - `src/migrations/Migration{timestamp}_fac-131a-campus-source.ts` (NEW)
  - Action:
    - In `user.entity.ts`, add `@Property({ default: 'auto' }) campusSource!: string;` below the existing `programSource` property (around line 69), mirroring the `departmentSource`/`programSource` pattern.
    - Run `npx mikro-orm migration:create` to generate the migration file with the actual timestamp. Review the generated SQL — it should be `ALTER TABLE "user" ADD COLUMN "campus_source" varchar NOT NULL DEFAULT 'auto';`. Existing rows are backfilled to `'auto'` automatically by the DEFAULT clause.
    - Run `npx mikro-orm migration:up` locally to verify it applies cleanly.
  - Notes: This column is not consumed by any existing code path; it becomes meaningful when `AdminUserService.CreateLocalUser` sets it to `'manual'` on creation with an explicit `campusId`.

- [ ] **Task 2 — Add `ADMIN_USER_CREATE` audit action code**
  - File: `src/modules/audit/audit-action.enum.ts`
  - Action: Check if `ADMIN_USER_CREATE` already exists in the enum. If not, add it. Commit only if changed.
  - Notes: Used by Task 6's `@Audited()` decorator. If the enum does not yet have this value, the decorator call will be a type error until this task is done.

- [ ] **Task 3 — Create `CreateLocalUserRequestDto` (Option 2B: firstName/lastName, no email) with `local-` prefix validator**
  - Files:
    - `src/modules/admin/dto/requests/create-user.request.dto.ts` (NEW)
    - `src/modules/admin/dto/responses/create-user.response.dto.ts` (NEW)
  - Action:
    - **Request DTO** — class-validator + `@ApiProperty` (NOT Zod), mirroring `assign-institutional-role.request.dto.ts` style. **No email, no displayName** — User entity has no such columns (verified at `user.entity.ts:21-89`):

      ```typescript
      export class CreateLocalUserRequestDto {
        @ApiProperty({
          example: 'local-kmartinez',
          description: 'Username (must start with "local-" prefix)',
        })
        @IsString()
        @Matches(/^local-[a-z0-9][a-z0-9._-]*$/, {
          message:
            'username must start with "local-" prefix and contain only lowercase alphanumerics, dots, dashes, or underscores',
        })
        username: string;

        @ApiProperty({ example: 'K' })
        @IsString()
        @MinLength(1)
        firstName: string;

        @ApiProperty({ example: 'Martinez' })
        @IsString()
        @MinLength(1)
        lastName: string;

        @ApiPropertyOptional({
          description:
            'Password (min 6 chars). Omit to assign default "Head123#".',
        })
        @IsOptional()
        @IsString()
        @MinLength(6, { message: 'password must be at least 6 characters' })
        password?: string;

        @ApiPropertyOptional({
          description:
            'Optional UUID of the campus to assign. Sets campusSource="manual".',
        })
        @IsOptional()
        @IsUUID()
        campusId?: string;
      }
      ```

    - **Response DTO** — `{ id: string; username: string; firstName: string; lastName: string; fullName: string; campus: { id: string; code: string } | null; defaultPasswordAssigned: boolean; createdAt: string; }` with static mapper `FromUser(user: User, defaultPasswordAssigned: boolean): CreateLocalUserResponseDto`.

  - Notes: The `@Matches` regex is one of three enforcement points for the `local-` convention (see Technical Decision #16). The service does NOT duplicate this validation but DOES enforce username uniqueness via pre-check + DB constraint. (S4 fix: removed stale "username/email" phrasing — email is not a User column.)

- [ ] **Task 4 — Create `AdminUserService` with `CreateLocalUser` method (verified field list + manual audit emission)**
  - Files:
    - `src/modules/admin/services/admin-user.service.ts` (NEW)
    - `src/modules/admin/services/admin-user.service.spec.ts` (NEW)
  - Action:
    - Constructor injects: `UserRepository`, `CampusRepository`, `EntityManager`, `ConfigService`, `AuditService`, `CurrentUserService`, `RequestMetadataService`.
    - Import `bcrypt from 'bcrypt'`, `User from 'src/entities/user.entity'`, `Campus from 'src/entities/campus.entity'`, `AuditAction from 'src/modules/audit/audit-action.enum'`, `InstitutionalRoleSource from 'src/entities/user-institutional-role.entity'` (or wherever the enum lives — the existing `moodle-enrollment-sync.service.ts:157-158` imports it; mirror that import path).
    - Method `async CreateLocalUser(dto: CreateLocalUserRequestDto): Promise<CreateLocalUserResponseDto>`:

      ```typescript
      async CreateLocalUser(
        dto: CreateLocalUserRequestDto,
      ): Promise<CreateLocalUserResponseDto> {
        // 1. Username uniqueness (explicit pre-check for clean error UX;
        //    the user_user_name_unique DB constraint is the safety net)
        const existingByUsername = await this.userRepository.findOne({
          userName: dto.username,
        });
        if (existingByUsername) {
          throw new ConflictException('username already exists');
        }

        // 2. Optional campus resolution
        let campus: Campus | null = null;
        if (dto.campusId) {
          campus = await this.campusRepository.findOne({ id: dto.campusId });
          if (!campus) {
            throw new BadRequestException('campus not found');
          }
        }

        // 3. Password determination
        const passwordPlain = dto.password ?? 'Head123#';
        const defaultPasswordAssigned = dto.password === undefined;

        // 4. Bcrypt hash (column is literally named `password`, not passwordHash)
        const rounds = this.configService.get<number>('JWT_BCRYPT_ROUNDS') ?? 10;
        const passwordHashed = await bcrypt.hash(passwordPlain, rounds);

        // 5. Compute fullName server-side
        const fullName = `${dto.firstName} ${dto.lastName}`.trim();

        // 6. Create User — populate ALL NOT NULL columns per user.entity.ts:21-89
        //    Use InstitutionalRoleSource enum for source fields to match the
        //    existing moodle-enrollment-sync.service.ts:157-158 convention (S5 fix).
        const user = this.em.create(User, {
          userName: dto.username,
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName,
          userProfilePicture: '',
          password: passwordHashed,
          campus: campus ?? null,
          campusSource: campus
            ? InstitutionalRoleSource.MANUAL
            : InstitutionalRoleSource.AUTO,
          roles: [],
          moodleUserId: null,
          isActive: true,
          lastLoginAt: new Date(),
          departmentSource: InstitutionalRoleSource.AUTO,
          programSource: InstitutionalRoleSource.AUTO,
        });
        await this.em.persistAndFlush(user);

        // 7. Manual audit emission (see Technical Decision #13 — @Audited() cannot read body)
        const currentUser = this.currentUserService.getOrFail();
        const requestMeta = this.requestMetadataService.get();
        await this.auditService.Emit({
          action: AuditAction.ADMIN_USER_CREATE,
          actorId: currentUser.id,
          actorUsername: currentUser.userName,
          resourceType: 'User',
          resourceId: user.id,
          metadata: {
            campusId: campus?.id ?? null,
            authMode: 'local',
            defaultPasswordAssigned,
          },
          browserName: requestMeta?.browserName,
          os: requestMeta?.os,
          ipAddress: requestMeta?.ipAddress,
        });

        return CreateLocalUserResponseDto.FromUser(user, defaultPasswordAssigned);
      }
      ```

    - **Spec tests** (`admin-user.service.spec.ts`): happy path with campus; happy path without campus; username conflict returns 409; invalid campus returns 400; default password assignment (`defaultPasswordAssigned: true`); password override (`defaultPasswordAssigned: false`); bcrypt rounds read from config; firstName/lastName both required; `fullName` is set to `"${firstName} ${lastName}"`; audit emission is called with correct metadata shape; `isActive` and `lastLoginAt` are populated so the row doesn't violate NOT NULL.

  - Notes: Authorization is at the controller level; service assumes caller is SuperAdmin. Do NOT reference `passwordHash` — the column is `password`. Do NOT reference `email` or `displayName` — they don't exist.

- [ ] **Task 5 — Register `AdminUserService` in `admin.module.ts`**
  - File: `src/modules/admin/admin.module.ts:26-58`
  - Action: Add `AdminUserService` to the `providers` array after `AdminService`. No `exports` needed — it is only used by the admin controller. Add the class import at the top of the file.
  - **Module imports**: NO NEW imports required. Verified in Round 2 cross-layer audit: `AuditModule` is `@Global()` (per `audit.module.ts:14`) and already exports `AuditService`; `CurrentUserService` and `RequestMetadataService` come via `CommonModule → AppClsModule` which `admin.module.ts` already imports. Round 2 R6 fix.

- [ ] **Task 6 — Add `POST /admin/users` endpoint to admin controller (no `@Audited` — manual emission from service)**
  - Files:
    - `src/modules/admin/admin.controller.ts`
    - `src/modules/admin/admin.controller.spec.ts`
  - Action:
    - Inject `AdminUserService` into the controller constructor.
    - Add the endpoint with `MetaDataInterceptor` + `CurrentUserInterceptor` to populate CLS, but **NO `@Audited()` decorator and NO `AuditInterceptor`** — audit emission happens manually inside the service (see Technical Decision #13):
      ```typescript
      @Post('users')
      @UseJwtGuard(UserRole.SUPER_ADMIN)
      @UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor)
      @ApiOperation({
        summary: 'Create a Faculytics-local user (non-Moodle, bcrypt auth)',
      })
      @ApiResponse({ status: 201, type: CreateLocalUserResponseDto })
      async CreateLocalUser(
        @Body() dto: CreateLocalUserRequestDto,
      ): Promise<CreateLocalUserResponseDto> {
        return this.adminUserService.CreateLocalUser(dto);
      }
      ```
    - **Controller spec** cases: 201 happy path; 400 on non-`local-` username (class-validator rejection); 400 on short password; 400 on empty firstName/lastName; 409 on duplicate username; 400 on invalid campusId; 403 when caller is DEAN (not SuperAdmin).
  - Notes: `MetaDataInterceptor` populates `requestMetadata` in CLS (IP, browser, OS); `CurrentUserInterceptor` populates `currentUser`. The service reads these via `RequestMetadataService.get()` and `CurrentUserService.getOrFail()` and passes them to `AuditService.Emit()`. **Do NOT add `@Audited()`** — the interceptor reads only params/query, not body, and would produce `metadata: undefined`.

##### Admin console (admin.faculytics) — provisioning UI

- [ ] **Task 7 — Add API types for user provisioning (Option 2B: firstName/lastName, no email)**
  - File: `admin/src/types/api.ts`
  - Action: Add two TypeScript types that **match the backend DTO shape from Task 3 exactly**:

    ```typescript
    export interface ProvisionUserRequest {
      username: string; // must start with "local-"
      firstName: string;
      lastName: string;
      password?: string; // optional; omit to assign "Head123#"
      campusId?: string; // UUID
    }

    export interface ProvisionUserResponse {
      id: string;
      username: string;
      firstName: string;
      lastName: string;
      fullName: string; // computed server-side as `${firstName} ${lastName}`
      campus: { id: string; code: string } | null;
      defaultPasswordAssigned: boolean;
      createdAt: string;
    }
    ```

  - Notes: Place alongside existing provisioning types (near `SeedUsersRequest`). **NO `email` or `displayName` fields** — the User entity has no such columns. This was a Round 2 adversarial fix (R2).

- [ ] **Task 8 — Create `useProvisionUser` mutation hook**
  - File: `admin/src/features/user-provisioning/use-provision-user.ts` (NEW)
  - Action:

    ```typescript
    import { useMutation } from '@tanstack/react-query';
    import { toast } from 'sonner';
    import { apiClient, ApiError } from '@/lib/api-client';
    import type {
      ProvisionUserRequest,
      ProvisionUserResponse,
    } from '@/types/api';

    export function useProvisionUser() {
      return useMutation({
        mutationFn: (data: ProvisionUserRequest) =>
          apiClient<ProvisionUserResponse>('/admin/users', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.status === 409) {
              toast.error(err.message || 'User already exists');
            } else if (err.status === 400) {
              toast.error(err.message || 'Invalid input');
            } else if (err.status === 403) {
              toast.error('Only SuperAdmin can provision users');
            } else {
              toast.error('Failed to provision user');
            }
          } else {
            toast.error('Failed to provision user');
          }
        },
      });
    }
    ```

  - Notes: Mirrors `src/features/moodle-provision/use-seed-users.ts` error-handling shape.

- [ ] **Task 9 — Create `ProvisionUserForm` component (Option 2B fields + verified campus endpoint)**
  - File: `admin/src/features/user-provisioning/provision-user-form.tsx` (NEW)
  - Action:
    - Native React `useState` for each field: `username`, `firstName`, `lastName`, `password`, `confirmPassword`, `campusId`.
    - Client-side validation: `canSubmit = /^local-[a-z0-9][a-z0-9._-]*$/.test(username) && firstName.trim().length > 0 && lastName.trim().length > 0 && password === confirmPassword && (password === '' || password.length >= 6)`.
    - Helper text under Username field: `"Must start with 'local-' (e.g., local-kmartinez)"`.
    - **Campus dropdown**: call the existing `GET /admin/filters/campuses` endpoint at `admin-filters.controller.ts:30` (implemented by `AdminFiltersService.GetCampuses` at `admin-filters.service.ts:27`). Returns `FilterOptionResponseDto[]`. Create a TanStack Query hook `useCampuses` under `admin/src/features/user-provisioning/use-campuses.ts` or reuse an existing one if present. Verified in Round 2 cross-layer audit.
    - Submit handler: if `password === ''`, show a shadcn `AlertDialog` confirming `"Default password 'Head123#' will be assigned — please share with the user securely. Continue?"` before calling the mutation. If password is non-empty, call the mutation directly.
    - On success: show toast `"User {username} created"` (or `"User {username} created with default password Head123#"` if `defaultPasswordAssigned === true`), reset form.
  - Notes: Mirror `seed-users-tab.tsx` structure. **NO `email` or `displayName` fields** — Round 2 adversarial fix (R2) removed them because the backend DTO has no such fields. Form POSTs `{ username, firstName, lastName, password?, campusId? }` matching Task 3's DTO exactly.

- [ ] **Task 10 — Create provision-user page, route, and nav item**
  - Files:
    - `admin/src/features/user-provisioning/provision-user-page.tsx` (NEW)
    - `admin/src/routes.tsx` (edit)
    - `admin/src/app-shell.tsx:41-47` (edit)
  - Action:
    - **Page**: thin wrapper that renders `<ProvisionUserForm />` inside the standard admin console page layout (header, padding).
    - **Route**: add `{ path: '/provision-users', element: <ProvisionUserPage /> }` to the protected routes array in `routes.tsx` (after AuthGuard, inside AppShell).
    - **Nav**: insert `{ to: '/provision-users', label: 'Provision User', icon: UserPlus }` into the `navItems` array in **`src/components/layout/app-shell.tsx`** (verified path — NOT `src/app-shell.tsx` as an earlier version of this spec incorrectly stated). Position it near "Users" or "Moodle Provision" for semantic grouping.
  - Notes: Import `UserPlus` from `lucide-react`. Path corrected per F12 of the adversarial review.

##### Regression verification

- [ ] **Task 10.75 — Enforce `local-` namespace across all Moodle inflows (Round 3 S3 merge of former Tasks 10.5 + 25.5)**
  - Rationale: The `local-` prefix namespace reservation has two enforcement sides — (1) the admin-console Seed Users tooling must not CREATE Moodle users with `local-*` usernames, and (2) the Moodle enrollment sync must SKIP any Moodle user that already has a `local-*` username (defensive, in case a Moodle sysadmin manually created one). Round 1 had these as two separate tasks (10.5 + 25.5), but Round 3 S3 found that Task 25.5 was in the wrong ticket section (FAC-131b) while its consumer (AC-1.11, Task 11) was in FAC-131a. Merging both enforcement points into one task in FAC-131a eliminates the cross-ticket dependency and groups the conceptual pair cleanly.
  - **Files** (all in api.faculytics unless prefixed):
    - `src/modules/moodle/services/moodle-enrollment-sync.service.ts` (skip guard + campusSource setter)
    - `src/modules/moodle/services/moodle-enrollment-sync.service.spec.ts` (skip guard test — or covered by Task 11's collision test)
    - `src/modules/moodle/dto/requests/seed-users.request.dto.ts` (server-side rejection at the API boundary)
    - `src/modules/moodle/services/moodle-provisioning.service.ts` (belt-and-suspenders rejection inside `SeedUsers`)
    - `admin/src/features/moodle-provision/components/seed-users-tab.tsx` (client-side rejection/validation)
  - **Action part A — Moodle enrollment sync skip guard** (from former Task 25.5):
    Inside the existing `uniqueUsers` processing loop at `moodle-enrollment-sync.service.ts:131-136` that already skips users with missing `id` or `username`, add a pre-upsert guard that rejects any Moodle user whose username starts with `local-`:

    ```typescript
    for (const user of rawUsers) {
      if (user.id == null || !user.username) {
        this.logger.warn(`Skipping user with missing id or username: ...`);
        continue;
      }

      // FAC-131 — refuse Moodle users whose username collides with the reserved
      // "local-" namespace used for locally-provisioned Faculytics accounts.
      // Without this guard, the user_user_name_unique constraint at
      // Migration20260214122722.ts:9 would throw on upsert if a Moodle
      // sysadmin ever created a local-* account.
      if (user.username.toLowerCase().startsWith('local-')) {
        this.logger.warn(
          `Skipping Moodle user with reserved "local-" username prefix: ` +
            `moodleUserId=${user.id}, username=${user.username}`,
        );
        continue;
      }

      uniqueUsers.set(user.id, user);
    }
    ```

    Also update the existing `fork.create(User, {...})` call in the same file (around lines 148-161) to explicitly set `campusSource: InstitutionalRoleSource.AUTO` alongside the existing `departmentSource: InstitutionalRoleSource.AUTO` and `programSource: InstitutionalRoleSource.AUTO` — safety for strict MikroORM modes after the Task 1 migration lands.

  - **Action part B — Seed Users tab rejection** (from former Task 10.5):
    - **Client side** (`admin/src/features/moodle-provision/components/seed-users-tab.tsx`): if the form includes any path that could produce a `local-*` username, add client-side validation that blocks submission with a toast: `"Seed users cannot use reserved 'local-' username prefix"`. Since seed users are currently auto-generated, verify the generation pattern at impl time and either (a) ensure the pattern can never produce `local-*` OR (b) add an explicit check before the mutation fires.
    - **API DTO** (`seed-users.request.dto.ts`): the current DTO accepts `role: 'student' | 'faculty'`, `count`, `campus`, `courseIds`. Add a runtime check in `MoodleProvisioningService.SeedUsers` that rejects any generated username matching `/^local-/i` with `BadRequestException("Seed users cannot use reserved 'local-' username prefix")`.
    - **Service** (`moodle-provisioning.service.ts`): belt-and-suspenders check — after generating the username pattern but before calling `MoodleClient.createUsers`, assert `!username.toLowerCase().startsWith('local-')`. Throw `BadRequestException` otherwise.
  - **Spec tests**:
    - **Sync side**: covered by Task 11's collision regression test (deliberately seed a Moodle response with `local-testadmin`, assert skip-with-warn, assert local user untouched, no unique-constraint violation).
    - **Seed Users side**: unit test for `MoodleProvisioningService.SeedUsers` rejecting a synthetic `local-*` username input; controller test for `POST /moodle/provisioning/users` returning 400 when the generated pattern matches `^local-`.
  - **Position in FAC-131a**: This task ships as part of FAC-131a's PR because AC-1.11 and Task 11's collision test depend on the skip guard. It CANNOT be deferred to FAC-131b without breaking the ticket split's independent-mergeability promise.
  - **Round 3 S3 resolution note**: This merges former Task 10.5 (Seed Users rejection, originally in FAC-131a) and former Task 25.5 (Moodle sync skip guard, originally in FAC-131b but depended on by FAC-131a's Task 11). Option C chosen over Option B (keep separate) because the two enforcement points are halves of the same concern — the `local-` namespace contract — and grouping them is conceptually cleaner. Also retroactively validates AC-1.11's original "Task 10.75" reference.

- [ ] **Task 11 — Moodle enrollment sync regression test for local accounts (deliberate collision)**
  - File: `src/modules/moodle/services/moodle-enrollment-sync.service.spec.ts`
  - Action: Add a test case with the comment `// FAC-131a — verify Moodle sync skip guard prevents local-* username collisions with user_user_name_unique constraint`:
    1. Seed a local user: create via `em.create(User, { userName: 'local-testadmin', firstName: 'Test', lastName: 'Admin', fullName: 'Test Admin', userProfilePicture: '', password: '<bcrypt hash>', moodleUserId: null, isActive: true, lastLoginAt: new Date(), departmentSource: InstitutionalRoleSource.AUTO, programSource: InstitutionalRoleSource.AUTO, campusSource: InstitutionalRoleSource.AUTO })`, flush. **Round 2 R9 fix**: explicit source fields for robustness under `fork.insert` bypass paths that skip entity defaults.
    2. Run one iteration of the sync with a mock Moodle response that contains NO user with username `local-testadmin`. Assert the local user's fields are identical to the seed (compare `updated_at`, `campus`, `roles`). Assert the `SyncLog` for this run does not reference the local user.
    3. **Collision test**: Run a second iteration where the mock Moodle response CONTAINS a user with username `local-testadmin` AND `moodleUserId: 12345`. With Task 10.75's skip guard in place, the sync should LOG a warning and SKIP this user entirely (not attempt to create/upsert). Assert: (a) no new User row is created for moodleUserId=12345; (b) the original local user row is untouched; (c) a warn-level log entry mentions the skipped user; (d) no unique-constraint violation exception is thrown. (T1 fix: Task reference updated from 25.5 to 10.75 after Round 3 Option C merge.)
  - Notes: This is the architectural tripwire. Without Task 10.75's skip guard (the merged `local-` namespace enforcement task, formerly Task 25.5), the second scenario would throw a unique-constraint violation from `user_user_name_unique` (`Migration20260214122722.ts:9`). The test documents the safety guarantee.

---

#### FAC-131b — Campus Head Role (requires FAC-131a merged)

##### Backend core (api.faculytics)

- [ ] **Task 12 — Add `CAMPUS_HEAD` to `UserRole` enum**
  - File: `src/modules/auth/roles.enum.ts`
  - Action: Add `CAMPUS_HEAD = 'CAMPUS_HEAD'` to the enum. Position it near `DEAN` and `CHAIRPERSON` (institutional roles cluster) or at the end per the existing convention.
  - Notes: This enum value is consumed by Tasks 13, 14, 16, 17 — do this first.

- [ ] **Task 13 — Extend `AssignInstitutionalRoleDto` allow-list**
  - File: `src/modules/admin/dto/requests/assign-institutional-role.request.dto.ts:1-20`
  - Action: Update the `@ApiProperty` enum and `@IsEnum` validator to include `UserRole.CAMPUS_HEAD`:
    ```typescript
    @ApiProperty({
      enum: [UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD],
      description:
        'The institutional role to assign (DEAN at depth 3, CHAIRPERSON at depth 4, CAMPUS_HEAD at depth 1)',
    })
    @IsEnum(UserRole)
    role: UserRole;
    ```
  - Notes: The `@IsEnum(UserRole)` already accepts any UserRole value; the `enum` list in `@ApiProperty` is the Swagger-visible allow-list. Keep them in sync.

- [ ] **Task 14 — Extend `admin.service.ts:AssignInstitutionalRole` with CAMPUS_HEAD depth-1 validation**
  - Files:
    - `src/modules/admin/services/admin.service.ts:205-237`
    - `src/modules/admin/services/admin.service.spec.ts`
  - Action: After the existing DEAN depth-3 validation block (around line 237), add:
    ```typescript
    if (dto.role === UserRole.CAMPUS_HEAD) {
      if (moodleCategory.depth !== 1) {
        throw new BadRequestException(
          `CAMPUS_HEAD role must be assigned to a campus-level category (depth 1), got depth ${moodleCategory.depth}`,
        );
      }
    }
    ```
    **Spec tests**: (a) depth-1 category accepted, returns 201; (b) depth-3 category rejected with the BadRequestException containing `"depth 1"`; (c) depth-2 also rejected; (d) duplicate promotion (same user + same category) returns 409.
  - Notes: Unlike DEAN, do NOT auto-resolve to a parent category — depth 1 has no parent in the Moodle tree.
  - **Optional Round 2 R10 hardening** (defensive, close F19 loophole — S6 correction): The existing `AssignInstitutionalRole` method uses independent `if` blocks, NOT an `if/else` chain, so an `else throw` won't catch all the cases. Instead, add a **whitelist check BEFORE the DEAN branch**:

    ```typescript
    // Defensive whitelist — closes the @IsEnum(UserRole) loophole where
    // {role: "FACULTY"} etc. would pass DTO validation (F19/R10).
    if (
      ![UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD].includes(
        dto.role,
      )
    ) {
      throw new BadRequestException('Unsupported institutional role');
    }

    // existing DEAN depth-3 branch ...
    // existing CHAIRPERSON branch (if any) ...
    // existing CAMPUS_HEAD depth-1 branch ...
    ```

    Low priority — can be deferred as a follow-up ticket if it bloats the PR. Add a regression AC: `POST /admin/institutional-roles` with `role: "FACULTY"` returns 400 with message containing `"Unsupported institutional role"`.

- [ ] **Task 15 — Add `GET /admin/institutional-roles/campus-head-eligible-categories` endpoint**
  - Files:
    - `src/modules/admin/dto/responses/campus-head-eligible-category.response.dto.ts` (NEW)
    - `src/modules/admin/services/admin.service.ts` (new method `GetCampusHeadEligibleCategories(userId: string)`)
    - `src/modules/admin/admin.controller.ts` (new endpoint method)
    - `src/modules/admin/admin.controller.spec.ts` (test)
    - `src/modules/admin/services/admin.service.spec.ts` (test)
  - Action:
    - **Response DTO**: `{ id: string; moodleCategoryId: number; name: string; code: string; depth: 1 }` with `@ApiProperty` decorators and static mapper `FromMoodleCategory(cat: MoodleCategory)`.
    - **Service method**:
      1. Query all `MoodleCategory` rows where `depth = 1` and not soft-deleted.
      2. Query `UserInstitutionalRole` where `user.id = userId AND role = CAMPUS_HEAD`, collect the already-assigned `moodleCategoryId` values into a Set.
      3. Filter the depth-1 categories to exclude those in the Set.
      4. Map to response DTOs.
    - **Controller endpoint**:
      ```typescript
      @Get('institutional-roles/campus-head-eligible-categories')
      @UseJwtGuard(UserRole.SUPER_ADMIN)
      @ApiOperation({
        summary: 'List depth-1 Moodle categories a user can be promoted to as Campus Head',
      })
      @ApiResponse({ status: 200, type: [CampusHeadEligibleCategoryResponseDto] })
      async GetCampusHeadEligibleCategories(
        @Query('userId') userId: string,
      ): Promise<CampusHeadEligibleCategoryResponseDto[]> {
        return this.adminService.GetCampusHeadEligibleCategories(userId);
      }
      ```
    - **Spec tests**: (a) returns 3 depth-1 categories when user has none; (b) excludes already-promoted categories; (c) 403 for non-SuperAdmin.
  - Notes: Mirror the existing `dean-eligible-categories` endpoint in structure and naming.

- [ ] **Task 15.5 — Add `CAMPUS_HEAD` to controller-level `@UseJwtGuard` allowlists (NEW — Round 2 R1 fix)**
  - Files:
    - `src/modules/analytics/analytics.controller.ts:29`
    - `src/modules/faculty/faculty.controller.ts:21`
    - `src/modules/reports/reports.controller.ts:28`
    - `src/modules/curriculum/curriculum.controller.ts:16` _(missed by the Round 2 subagent — found in Round 2.5 cross-layer grep)_
  - Action: Each controller currently has `@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.SUPER_ADMIN)` (or similar ordering with just those three roles). Add `UserRole.CAMPUS_HEAD`:
    ```typescript
    // analytics.controller.ts:29
    @UseJwtGuard(
      UserRole.DEAN,
      UserRole.CHAIRPERSON,
      UserRole.SUPER_ADMIN,
      UserRole.CAMPUS_HEAD,
    )
    ```
    Same addition for `faculty.controller.ts:21`, `reports.controller.ts:28`, `curriculum.controller.ts:16`.
  - **Spec test** (controller level): for each of the 4 controllers, add a regression AC that a Campus Head caller receives `200 OK` on a representative endpoint (not `403 Forbidden` from `RolesGuard`). Existing Dean tests continue to pass.
  - **Critical rationale**: `RolesGuard` at `src/security/guards/roles.guard.ts:48` throws `ForbiddenException` if the JWT'd user's roles don't intersect with the decorator's allowlist. Without this task, every Campus Head request to faculty/analytics/reports/curriculum endpoints returns `403` BEFORE reaching the service layer — Task 16's scope resolver work would be unreachable. AC-2.11, AC-2.13, AC-2.14, AC-2.15, AC-2.16, and curriculum endpoints all depend on this task. **This was missed by the Round 1 adversarial review and caught by Round 2 (R1).**
  - Notes: Do NOT add CAMPUS_HEAD to `admin.controller.ts`, `questionnaires.controller.ts`, `moodle-sync.controller.ts`, `moodle-provisioning.controller.ts`, `dimensions.controller.ts`, or `audit.controller.ts` — those are SuperAdmin-only or have different scope semantics per the out-of-scope decisions.

- [ ] **Task 16 — Extend `ScopeResolverService.ResolveDepartmentIds` with ONE CAMPUS_HEAD branch (plus program resolver `null`-branches per Round 2 R3)**
  - Files:
    - `src/modules/common/services/scope-resolver.service.ts`
    - `src/modules/common/services/scope-resolver.service.spec.ts`
  - Action:
    - **Do NOT add a `ResolveDepartmentCodes` method or branch** — no such method exists on this service. The analytics service has its own private method for codes translation (`analytics.service.ts:1072`).
    - Add a private helper `resolveCampusHeadDepartmentIds(userId, semesterId)`. Algorithm reflects the actual schema: `Department` has no direct `campus` FK; traversal is `Department → Semester → Campus`, and each Semester belongs to exactly one Campus. The resolver is semester-scoped, so a Campus Head gets departments from the ONE campus that owns the given semester.

      ```typescript
      private async resolveCampusHeadDepartmentIds(
        userId: string,
        semesterId: string,
      ): Promise<string[]> {
        // 1. Load Campus Head institutional roles for this user
        const roles = await this.em.find(
          UserInstitutionalRole,
          {
            user: userId,
            role: UserRole.CAMPUS_HEAD,
          },
          { populate: ['moodleCategory'] },
        );
        if (roles.length === 0) return [];

        const promotedCategoryIds = new Set(
          roles
            .map((r) => r.moodleCategory?.moodleCategoryId)
            .filter((id): id is number => id != null),
        );

        // 2. Load the semester and its campus (single query via populate)
        const semester = await this.em.findOne(
          Semester,
          { id: semesterId },
          { populate: ['campus'] },
        );
        if (!semester?.campus?.moodleCategoryId) return [];

        // 3. If the semester's campus is NOT in the promoted set, this user
        //    has no scope for this semester (they're a Campus Head of a
        //    different campus)
        if (!promotedCategoryIds.has(semester.campus.moodleCategoryId)) {
          return [];
        }

        // 4. Return all department UUIDs for this semester
        const departments = await this.em.find(Department, { semester: semesterId });
        return departments.map((d) => d.id);
      }
      ```

    - In `ResolveDepartmentIds(semesterId)`, add the branch **before** the existing terminal `throw new ForbiddenException(...)` at lines 36-38. Place the CAMPUS_HEAD check AFTER the SUPER_ADMIN/DEAN/CHAIRPERSON checks so multi-role users fall through in precedence order. Pinned insertion:

      ```typescript
      // existing DEAN branch ...
      if (user.roles.includes(UserRole.DEAN)) {
        /* ... */
      }

      // existing CHAIRPERSON branch ...
      if (user.roles.includes(UserRole.CHAIRPERSON)) {
        /* ... */
      }

      // NEW: Campus Head branch (FAC-131)
      if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
        return this.resolveCampusHeadDepartmentIds(user.id, semesterId);
      }

      // existing terminal throw ...
      throw new ForbiddenException(
        'User does not have a role with scope access.',
      );
      ```

    - **Also branch `ResolveProgramIds(semesterId)`** at `scope-resolver.service.ts:45-65` — Campus Head returns `null` (unrestricted at program level). Required because `curriculum.service.ts:117` calls it directly for curriculum endpoints, which have their own terminal throw and would otherwise 403 for Campus Head. Insertion point: before the existing terminal `throw` (around line 67):

      ```typescript
      // NEW: Campus Head has implicit authority over all programs
      // in their campus(es); the department-level filter in
      // ResolveDepartmentIds is the true scope boundary.
      if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
        return null; // unrestricted at program level, like Dean
      }
      ```

    - **Also branch `ResolveProgramCodes(semesterId)`** at `scope-resolver.service.ts:73-94` with the same `return null` pattern. Required because `analytics.service.ts:IsProgramCodeInScope:1061-1067` calls it unconditionally via `GetDepartmentOverview:80` and `GetAttentionList:196`. Without the branch, Campus Head hits the terminal throw inside `ResolveProgramCodes` BEFORE any department filtering can apply.

      ```typescript
      if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
        return null; // unrestricted at program-code level
      }
      ```

    - **Spec tests for `ResolveDepartmentIds`**:
      - (a) Campus Head of UCMN + caller passes UCMN semesterId → returns all UCMN departments for that semester
      - (b) Campus Head of UCMN + caller passes UCB semesterId → returns `[]` (semester's campus not in promoted set)
      - (c) Campus Head of both UCMN and UCB + caller passes UCMN semesterId → returns UCMN departments only
      - (d) Campus Head of both UCMN and UCB + caller passes UCB semesterId → returns UCB departments only
      - (e) Campus Head with zero departments in the semester → returns `[]`
      - (f) Campus Head whose moodleCategory was soft-deleted → returns `[]`
      - (g) SuperAdmin → returns `null` (unchanged)
      - (h) Dean behavior unchanged
      - (i) Chairperson behavior unchanged
      - (j) Multi-role user who is BOTH Dean and Campus Head → falls into Dean branch first (precedence), Campus Head branch is unreachable for that call. Document this behavior.
    - **Spec tests for `ResolveProgramIds` and `ResolveProgramCodes`** (NEW — Round 2):
      - (k) Campus Head of UCMN; When `ResolveProgramIds(semesterId)` is called; Then returns `null` (unrestricted, matching Dean's line 52-53 behavior)
      - (l) Campus Head of UCMN; When `ResolveProgramCodes(semesterId)` is called; Then returns `null`
      - (m) Multi-role Campus Head + Chairperson; When `ResolveProgramIds(semesterId)` is called; Then Chairperson branch fires first (precedence), Campus Head branch is unreachable

  - Notes: This is the architectural lynchpin. Faculty list, analytics overview, attention list, and faculty report all flow through `ResolveDepartmentIds` — no downstream code changes required. Curriculum endpoints flow through `ResolveProgramIds`, and analytics' `IsProgramCodeInScope` flows through `ResolveProgramCodes` — both now support Campus Head via the `return null` branches. Import `Semester from 'src/entities/semester.entity'` and `Department from 'src/entities/department.entity'` at the top of the file.

- [ ] **Task 17 — Add CAMPUS_HEAD denial in `questionnaire.service.ts:assertSubmissionAuthorization`**
  - Files:
    - `src/modules/questionnaires/services/questionnaire.service.ts:934`
    - `src/modules/questionnaires/services/questionnaire.service.spec.ts`
  - Action: Insert the following block at line 934, immediately after `if (respondent.roles.includes(UserRole.SUPER_ADMIN)) return;`:
    ```typescript
    // FAC-131 — Campus Heads are read-only analytics consumers
    if (respondent.roles.includes(UserRole.CAMPUS_HEAD)) {
      throw new ForbiddenException(
        'Campus Heads are not permitted to submit faculty evaluations.',
      );
    }
    ```
    **Spec test**: Given a respondent User with `roles: [UserRole.CAMPUS_HEAD]`; When `assertSubmissionAuthorization(respondent, faculty, typeCode, semesterId)` is called; Then throws `ForbiddenException` with message exactly `"Campus Heads are not permitted to submit faculty evaluations."`.
  - Notes: Without this, Campus Head would fall through to `RespondentRole.STUDENT` in `resolveRespondentRole` and hit the enrollment check at lines 687-700 with a misleading error. Explicit denial gives a clear, actionable error message.

##### Frontend (app.faculytics)

- [ ] **Task 18 — Add `CAMPUS_HEAD` to `APP_ROLES`**
  - File: `app/constants/roles.ts`
  - Action: Add `CAMPUS_HEAD: 'CAMPUS_HEAD'` to the `APP_ROLES` const object. Update the derived `AppRole` type if it's not auto-inferred from the const.

- [ ] **Task 19 — Add `ROLE_CONFIG[CAMPUS_HEAD]` entry**
  - File: `app/features/auth/lib/role-route.ts` (near existing CHAIRPERSON entry at lines 55-64)
  - Action: Add a new entry to `ROLE_CONFIG`:
    ```typescript
    [APP_ROLES.CAMPUS_HEAD]: {
      label: "Campus Head",
      homePath: "/campus-head/dashboard",
      routePrefix: "/campus-head",
      navItems: [
        {
          title: "Dashboard",
          url: "/campus-head/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "Faculties",
          url: "/campus-head/faculties",
          icon: ChartNoAxesColumn,
        },
      ],
    },
    ```
  - Notes: Only 2 nav items — Dashboard and Faculties. Do NOT include Evaluation. Reuse the same icons as Dean for consistency.

- [ ] **Task 20 — Rename the 2 primary Dean-scoped screens to neutral `Scoped*` names with `scopeLabel` prop**
  - Files (git mv):
    - `app/features/faculty-analytics/components/dean-dashboard-screen.tsx` → `scoped-analytics-dashboard-screen.tsx`
    - `app/features/faculty-analytics/components/dean-faculty-analytics-screen.tsx` → `scoped-faculty-list-screen.tsx`
    - `app/features/faculty-analytics/hooks/use-dean-dashboard-view-model.ts` → `use-scoped-analytics-dashboard-view-model.ts`
    - `app/features/faculty-analytics/hooks/use-dean-faculty-analytics-list-view-model.ts` → `use-scoped-faculty-analytics-list-view-model.ts`
  - Action:
    - Use `git mv <old> <new>` to preserve file history.
    - Rename the exported component/hook identifiers within each file.
    - Update the barrel export in `app/features/faculty-analytics/index.ts` to export the new names.
    - Add a `scopeLabel: "Campus" | "Department"` prop to each screen component. Use the label for page titles and any descriptive text. Propagate `scopeLabel` to child components that Task 20.75 will rename.
    - Grep for remaining `DeanDashboardScreen` and `DeanFacultyAnalyticsScreen` references — clean up any stale imports.
  - Notes: This task only covers the 2 primary screens. The 9 sibling `dean-*` files are covered by Task 20.75. The `FacultyReportScreen` relocation is Task 20.5.

- [ ] **Task 20.5 — Relocate `FacultyReportScreen` and its 5 `_components` siblings into the shared feature**
  - Files (git mv):
    - `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-screen.tsx` → `app/features/faculty-analytics/components/faculty-report-screen.tsx`
    - `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-comments.tsx` → `app/features/faculty-analytics/components/faculty-report-comments.tsx`
    - `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-header.tsx` → `app/features/faculty-analytics/components/faculty-report-header.tsx`
    - `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-section-performance-chart.tsx` → `app/features/faculty-analytics/components/faculty-report-section-performance-chart.tsx`
    - `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-sections.tsx` → `app/features/faculty-analytics/components/faculty-report-sections.tsx`
    - `app/(dashboard)/dean/faculties/[facultyId]/analysis/_components/faculty-report-summary-cards.tsx` → `app/features/faculty-analytics/components/faculty-report-summary-cards.tsx`
  - Action:
    - `git mv` each file to preserve history
    - Rewrite relative imports inside each file: `./faculty-report-header` → `./faculty-report-header` still works from the new co-located parent, so most intra-folder imports are preserved
    - Rewrite any imports from these files in `app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx` to import from `@/features/faculty-analytics`
    - Add all six to `app/features/faculty-analytics/index.ts` barrel
    - Grep for remaining `./_components/faculty-report-*` references and update
  - Notes: Required by F7 of the adversarial review. Without this relocation, the Campus Head faculty analysis route cannot import `FacultyReportScreen` because it lives under a Next.js private `_components` folder scoped to the Dean route subtree. Budget: 6 file moves, ~15 import rewrites.

- [ ] **Task 20.75 — Rename and parameterize the 9 remaining `dean-*` sibling files**
  - Files (git mv):
    - `app/features/faculty-analytics/components/dean-analytics-async-content.tsx` → `scoped-analytics-async-content.tsx`
    - `app/features/faculty-analytics/components/dean-analytics-empty-state.tsx` → `scoped-analytics-empty-state.tsx`
    - `app/features/faculty-analytics/components/dean-analytics-error-state.tsx` → `scoped-analytics-error-state.tsx`
    - `app/features/faculty-analytics/components/dean-analytics-loading-state.tsx` → `scoped-analytics-loading-state.tsx`
    - `app/features/faculty-analytics/components/dean-attention-card.tsx` → `scoped-attention-card.tsx`
    - `app/features/faculty-analytics/components/dean-charts.tsx` → `scoped-charts.tsx`
    - `app/features/faculty-analytics/components/dean-dashboard-header.tsx` → `scoped-dashboard-header.tsx`
    - `app/features/faculty-analytics/components/dean-faculty-analysis-table.tsx` → `scoped-faculty-analysis-table.tsx`
    - `app/features/faculty-analytics/components/dean-metrics-grid.tsx` → `scoped-metrics-grid.tsx`
  - Action:
    - `git mv` each file
    - Rename exported component identifiers (e.g., `DeanAttentionCard` → `ScopedAttentionCard`)
    - Update imports in the renamed Task 20 screens (which still reference the old names)
    - **Parameterize hardcoded strings**: grep each file for `"Dean"`, `"dean"`, `"department"`, `"Department"` and convert to use `scopeLabel` prop OR a generic term. Examples:
      - `"Loading department analytics..."` → `"Loading ${scopeLabel.toLowerCase()} analytics..."`
      - `"Unable to load the department analytics overview."` → `"Unable to load the ${scopeLabel.toLowerCase()} analytics overview."`
      - `"Department"` column header → `"Department"` (unchanged — this is a real column label)
    - Add a `scopeLabel: "Campus" | "Department"` prop to each renamed child that displays descriptive text; pass it through from the parent `ScopedAnalyticsDashboardScreen`/`ScopedFacultyListScreen`
    - Update the barrel export in `app/features/faculty-analytics/index.ts`
    - Grep for stale `DeanAnalyticsAsyncContent`, `DeanAttentionCard`, etc. imports across the repo
  - Notes: Required by F11 of the adversarial review. Without this, Campus Head pages would display strings like "Loading department analytics..." and "department analytics overview" verbatim. Budget: 9 file moves, string-replacement audit, ~20 import rewrites.

- [ ] **Task 21 — Refactor `use-faculty-report-detail-view-model.ts` backHref derivation (destructure + `getRoleConfig` accessor)**
  - File: `app/features/faculty-analytics/hooks/use-faculty-report-detail-view-model.ts` (edits at lines 117 and 159)
  - Action:
    - Add imports at the top:
      ```typescript
      import { useActiveRole } from '@/features/auth/hooks/use-active-role';
      import { getRoleConfig } from '@/features/auth/lib/role-route';
      ```
      **CRITICAL**: use `getRoleConfig` (accessor function), NOT `ROLE_CONFIG` — the const at `role-route.ts:29` is NOT exported. The accessor is exported at `role-route.ts:120` and is the intended API.
    - Inside the hook body (before the returned object), destructure `activeRole` from the hook and derive the route prefix:
      ```typescript
      const { activeRole } = useActiveRole();
      const routePrefix = activeRole
        ? getRoleConfig(activeRole).routePrefix
        : '/dean';
      ```
      **CRITICAL**: the hook returns an object `{ me, roles, activeRole, ... }` — you MUST destructure. Passing the object directly to `getRoleConfig` would fail at runtime.
    - Replace line 117 `backHref: "/dean/faculties"` with `backHref: \`${routePrefix}/faculties\``.
    - Replace line 159 `router.push("/dean/faculties")` with `router.push(\`${routePrefix}/faculties\`)`.
  - Notes: The `"/dean"` fallback covers the brief auth-transition state where `activeRole === null`. Dean users get identical behavior; Campus Head users get `/campus-head/faculties`.

- [ ] **Task 22 — Update Dean routes to pass `scopeLabel="Department"`**
  - Files:
    - `app/(dashboard)/dean/dashboard/page.tsx`
    - `app/(dashboard)/dean/faculties/page.tsx`
  - Action:
    - Update imports from the renamed components (`ScopedAnalyticsDashboardScreen`, `ScopedFacultyListScreen`).
    - Pass `scopeLabel="Department"` as a prop.
    - Example for dashboard:
      ```typescript
      import { ScopedAnalyticsDashboardScreen } from "@/features/faculty-analytics";
      export default function DeanDashboardPage() {
        return <ScopedAnalyticsDashboardScreen scopeLabel="Department" />;
      }
      ```
  - Notes: Regression-critical. Dean users must see identical behavior after this change.

<!-- Task 25.5 DELETED in Round 3 S3 remediation: merged into Task 10.75 in FAC-131a (Option C) to fix the cross-ticket dependency where FAC-131a's AC-1.11 depended on a task physically located in FAC-131b. See Task 10.75 for the full skip-guard spec and Technical Decision #7 for the rationale. -->

- [ ] **Task 23 — Create Campus Head route files**
  - Files (all NEW):
    - `app/(dashboard)/campus-head/layout.tsx`
    - `app/(dashboard)/campus-head/page.tsx`
    - `app/(dashboard)/campus-head/dashboard/page.tsx`
    - `app/(dashboard)/campus-head/faculties/page.tsx`
    - `app/(dashboard)/campus-head/faculties/[facultyId]/analysis/page.tsx`
  - Action: Create each file:

    ```typescript
    // layout.tsx
    import { RoleGuard } from "@/app/(dashboard)/_guards/role-guard";
    import { APP_ROLES } from "@/constants/roles";
    import type { ReactNode } from "react";

    export default function CampusHeadLayout({ children }: { children: ReactNode }) {
      return <RoleGuard allowedRoles={[APP_ROLES.CAMPUS_HEAD]}>{children}</RoleGuard>;
    }
    ```

    ```typescript
    // page.tsx
    import { redirect } from 'next/navigation';
    export default function CampusHeadPage() {
      redirect('/campus-head/dashboard');
    }
    ```

    ```typescript
    // dashboard/page.tsx
    import { ScopedAnalyticsDashboardScreen } from "@/features/faculty-analytics";
    export default function CampusHeadDashboardPage() {
      return <ScopedAnalyticsDashboardScreen scopeLabel="Campus" />;
    }
    ```

    ```typescript
    // faculties/page.tsx
    import { ScopedFacultyListScreen } from "@/features/faculty-analytics";
    export default function CampusHeadFacultiesPage() {
      return <ScopedFacultyListScreen scopeLabel="Campus" />;
    }
    ```

    ```typescript
    // faculties/[facultyId]/analysis/page.tsx
    import { FacultyReportScreen } from "@/features/faculty-analytics";

    export default async function CampusHeadFacultyAnalysisPage({
      params,
    }: {
      params: Promise<{ facultyId: string }>;
    }) {
      const { facultyId } = await params;
      return <FacultyReportScreen facultyId={facultyId} />;
    }
    ```

  - Notes: `FacultyReportScreen` is imported from `@/features/faculty-analytics` — this requires Task 20.5's relocation to be complete. The screen gets its route-aware `backHref` from Task 21's view-model refactor. Also update `app/(dashboard)/dean/faculties/[facultyId]/analysis/page.tsx` to import `FacultyReportScreen` from the feature instead of `./_components/`.

##### Admin console (admin.faculytics)

- [ ] **Task 24 — Extend admin `UserRole` const + `InstitutionalRole` union + add `CampusHeadEligibleCategory` type**
  - File: `admin/src/types/api.ts:98-107, 213`
  - Action:
    - At lines 98-107, add `CAMPUS_HEAD: 'CAMPUS_HEAD'` to the `UserRole` const object.
    - At line 213, extend the `InstitutionalRole` union: `export type InstitutionalRole = typeof UserRole.DEAN | typeof UserRole.CHAIRPERSON | typeof UserRole.CAMPUS_HEAD;`
    - Add a new type:
      ```typescript
      export interface CampusHeadEligibleCategory {
        id: string;
        moodleCategoryId: number;
        name: string;
        code: string;
        depth: 1;
      }
      ```

- [ ] **Task 25 — Add `useCampusHeadEligibleCategories` hook**
  - File: `admin/src/features/admin/use-institutional-roles.ts` (add near line 12 where `useDeanEligibleCategories` lives)
  - Action:
    ```typescript
    export function useCampusHeadEligibleCategories(
      userId: string | undefined,
    ) {
      const activeEnvId = useEnvStore((s) => s.activeEnvId);
      const isAuth = useAuthStore((s) =>
        activeEnvId ? s.isAuthenticated(activeEnvId) : false,
      );
      return useQuery<CampusHeadEligibleCategory[]>({
        queryKey: ['campus-head-eligible-categories', activeEnvId, userId],
        queryFn: () =>
          apiClient<CampusHeadEligibleCategory[]>(
            `/admin/institutional-roles/campus-head-eligible-categories?userId=${userId}`,
          ),
        enabled: !!activeEnvId && isAuth && !!userId,
        staleTime: 30_000,
      });
    }
    ```
  - Notes: Direct copy of `useDeanEligibleCategories` with different endpoint and query key.

- [ ] **Task 26 — Extend `role-action-dialog.tsx` with CAMPUS_HEAD branch**
  - File: `admin/src/features/admin/role-action-dialog.tsx`
  - Action:
    - Update the `INSTITUTIONAL_ROLES` array to include `UserRole.CAMPUS_HEAD`.
    - Add a conditional rendering branch: when the selected `role === UserRole.CAMPUS_HEAD`, use the `useCampusHeadEligibleCategories(user?.id)` hook and render a depth-1 campus picker dropdown. The picker's items should display `{category.name}` (or fall back to `{category.code}` if name is missing) with `value={category.moodleCategoryId}`.
    - The submit handler passes the selected `moodleCategoryId` to the existing `useAssignRole()` mutation with `role: UserRole.CAMPUS_HEAD`.
  - Notes: Mirror the existing Dean picker flow. Do NOT use the CHAIRPERSON numeric-input pattern — Campus Head deserves a proper picker like Dean.

- [ ] **Task 27 — Extend `ROLE_COLORS` map and role filter dropdown**
  - Files:
    - `admin/src/features/admin/users-page.tsx`
    - `admin/src/features/admin/user-detail-page.tsx` (if it has its own ROLE_COLORS)
  - Action:
    - Add a `CAMPUS_HEAD` entry to the `ROLE_COLORS` map with a visually distinct color (e.g., purple or teal — check existing entries and pick an unused tone for clear differentiation from Dean's color).
    - Verify the role filter dropdown on `users-page.tsx` is auto-generated from `UserRole` const. If it's auto-generated, no further change needed. If it's hardcoded, add `CAMPUS_HEAD` to the filter options.

##### Cross-cutting verification

- [ ] **Task 28 — Manual E2E verification**
  - Action: Run the full end-to-end flow on a local dev environment before opening the FAC-131b PR for review:
    1. Start all services: `docker compose up` in api.faculytics (Redis + mock worker), `npm run start:dev` in api.faculytics, `bun dev` in admin.faculytics and app.faculytics.
    2. Log into the admin console as SuperAdmin.
    3. Navigate to `/provision-users`. Create a user with `username: "local-cmartinez"`, `firstName: "C"`, `lastName: "Martinez"`, `campus: UCMN`, empty password (should prompt `"Default password 'Head123#' will be assigned — Continue?"`). Confirm and submit.
    4. Navigate to `/users`. Find `local-cmartinez`. Verify the row shows the user with a campus assignment of UCMN. Click "Manage Roles".
    5. Select role CAMPUS_HEAD. Verify the campus picker appears with UCMN as an option. Select UCMN. Submit.
    6. Verify the user's institutional roles now show `CAMPUS_HEAD @ UCMN`.
    7. Log out of the admin console.
    8. Log into `app.faculytics` as `local-cmartinez` with password `Head123#`.
    9. Verify the post-login redirect lands on `/campus-head/dashboard`.
    10. Verify the page title displays "Campus Analytics".
    11. Verify the sidebar shows exactly 2 nav items: Dashboard and Faculties.
    12. Verify the role switcher in the top bar shows "Campus Head".
    13. Click Faculties. Verify the faculty list contains only UCMN faculty (cross-reference with the database or the admin console).
    14. Click a faculty row. Verify the faculty analysis page renders, showing the faculty's report data. Click "Back to Faculties". Verify the browser navigates to `/campus-head/faculties` (NOT `/dean/faculties`).
    15. Manually navigate to `/dean/dashboard`. Verify `RoleGuard` redirects back to `/campus-head/dashboard`.
    16. Open browser devtools. Attempt `POST /api/v1/questionnaires/submissions` with a forged valid payload. Verify the response is `403 Forbidden` with the message `"Campus Heads are not permitted to submit faculty evaluations."`.
    17. Log back in as a Dean user. Verify `/dean/dashboard` renders with "Department Analytics" as the page title (regression check for the screen rename).
    18. Verify the Dean faculty analysis "Back to Faculties" button still navigates to `/dean/faculties` (regression check for the backHref refactor).
  - Notes: All 18 checks must pass before FAC-131b is merged. If any fail, file a bug and block the PR. This is the go/no-go gate.

### Acceptance Criteria

_37 ACs drafted in Step 1 Party Mode, refined with Step 2 findings. Notes updated inline where Step 2 resolved uncertainty._

#### FAC-131a — Non-enrolled User Provisioning Primitive

**Functional ACs:**

- **AC-1.1 — Happy path: create local user (verified field list per `user.entity.ts:21-89`).** Given SuperAdmin authenticated and campus `UCMN` exists and no user with username `local-kmartinez` exists; When SuperAdmin sends `POST /admin/users` with `{ username: "local-kmartinez", firstName: "K", lastName: "Martinez", password: "TempPass1", campusId: <UCMN uuid> }`; Then response is `201 Created` with `{ id, username: "local-kmartinez", firstName: "K", lastName: "Martinez", fullName: "K Martinez", campus: { id, code: "UCMN" }, defaultPasswordAssigned: false }` AND a User row exists with: `userName: "local-kmartinez"`, `firstName: "K"`, `lastName: "Martinez"`, `fullName: "K Martinez"`, bcrypt-hashed `password` (the column is literally named `password`, NOT `passwordHash`), `campusSource: InstitutionalRoleSource.MANUAL`, `departmentSource: InstitutionalRoleSource.AUTO`, `programSource: InstitutionalRoleSource.AUTO`, `roles: []`, `moodleUserId: null`, `isActive: true`, `lastLoginAt` set to a recent Date, `userProfilePicture: ""`.

- **AC-1.1c — Username prefix enforcement.** Given SuperAdmin sends `POST /admin/users` with `username: "kmartinez"` (no `local-` prefix); Then response is `400 Bad Request` with error containing `"local-"` AND no User row is created. Given `username: "local-KMARTINEZ"` (uppercase); Then `400 Bad Request` (lowercase-only per regex). Given `username: "local-"` (empty suffix); Then `400 Bad Request`. Happy path: `username: "local-kmartinez"`, `"local-jdoe.admin"`, `"local-registrar_alice"` all pass.

- **AC-1.1d — firstName and lastName required (NEW — post-adversarial).** Given SuperAdmin sends `POST /admin/users` with `firstName: ""`; Then response is `400 Bad Request` with a class-validator error indicating firstName must not be empty. Given `lastName: ""`; Then same 400 response for lastName. Given both are omitted entirely; Then `400 Bad Request` with errors for both fields. Happy path: `firstName: "K", lastName: "Martinez"` passes and produces `fullName: "K Martinez"`.

- **AC-1.2 — Username uniqueness.** Given a user with username `local-kmartinez` already exists; When SuperAdmin sends `POST /admin/users` with the same username; Then response is `409 Conflict` with error `"username already exists"` AND no new User row is created. Enforcement: `AdminUserService.CreateLocalUser` pre-checks via `UserRepository.findOne({ userName })`; the DB-level `user_user_name_unique` constraint is the safety net.

- **AC-1.3 — DELETED.** Email uniqueness AC removed — the User entity has no `email` column. Email-based flows are explicitly out of MVP scope.

- **AC-1.4 — Password policy (6-char minimum).** Given SuperAdmin sends `POST /admin/users` with `password` shorter than 6 characters; Then response is `400 Bad Request` with error `"password must be at least 6 characters"`.

- **AC-1.4b — Default password seed.** Given SuperAdmin sends `POST /admin/users` with NO `password` field; Then response is `201 Created` with `defaultPasswordAssigned: true` AND the created user can log in with password `Head123#`.

- **AC-1.5 — Invalid campusId.** Given SuperAdmin sends `POST /admin/users` with a nonexistent `campusId`; Then response is `400 Bad Request` with error `"campus not found"`.

- **AC-1.6 — Optional campusId.** Given SuperAdmin sends `POST /admin/users` without `campusId`; Then response is `201 Created` AND User row has `campus: null` AND `campusSource: InstitutionalRoleSource.AUTO` (the rule is `MANUAL` only if campusId was explicitly provided).

- **AC-1.7 — Unauthorized caller.** Given a user with role `DEAN`; When they send `POST /admin/users`; Then response is `403 Forbidden`.

**Auth ACs:**

- **AC-1.8 — Local user can log in.** Given a local user created via AC-1.1 with password `TempPass1`; When they send `POST /auth/login`; Then response is `200 OK` with tokens AND `LocalLoginStrategy` (priority 10) handled the request AND no Moodle API call was made.

- **AC-1.9 — Wrong password.** Given a local user exists; When they send `POST /auth/login` with wrong password; Then response is `401 Unauthorized`.

**Migration ACs:**

- **AC-1.10a — `campusSource` migration applied.** Given the codebase after FAC-131a migration is applied; When the migration runs; Then `User.campus_source` column exists with default `'auto'` AND all existing rows have `campus_source = 'auto'` AND no migration errors occur.

**Sync-safety ACs:**

- **AC-1.10 — Moodle sync skips local users.** _(Step 2: CONFIRMED — upsert key is `moodleUserId`, local accounts have `moodleUserId = null`, natural skip.)_ Given a local user `kmartinez` exists (no `moodleUserId`) AND Moodle has no user with username `kmartinez`; When the Moodle enrollment sync cron runs; Then the local user's fields are unchanged AND `SyncLog` does not report this user as deactivated or updated.

- **AC-1.11 — Moodle sync collision guard (depends on Task 10.75 skip guard — Round 3 S3 merge validated this reference).** Given a local user `kmartinez` (`password` set, no `moodleUserId`, `userName: "local-kmartinez"`) AND Task 10.75's sync skip guard (the merged `local-` namespace enforcement task) is in place; When the Moodle enrollment sync runs with a mock response containing a Moodle user `{ username: "local-kmartinez", id: 12345 }`; Then the sync SKIPS the Moodle user (warn log emitted: `"Skipping Moodle user with reserved 'local-' username prefix"`) AND no new User row is created for `moodleUserId=12345` AND the original local user row is untouched (no `updated_at` change, no field mutations) AND no `user_user_name_unique` constraint violation is thrown. This AC requires the new code in Task 10.75 and is covered by the collision test in Task 11 — it is NOT "regression test only."

**Audit AC:**

- **AC-1.12 — Creation is audited via manual emission (post-adversarial correction).** Given SuperAdmin creates a user via AC-1.1 with campusId UCMN; When the service persists the user and calls `AuditService.Emit()`; Then an `AuditLog` row exists with: `action: 'admin.user.create'`, `actorId: <superadmin uuid>`, `actorUsername: <superadmin userName>`, `resourceType: 'User'`, `resourceId: <new user uuid>`, `metadata: { campusId: <UCMN uuid>, authMode: 'local', defaultPasswordAssigned: false }`, AND `browserName`, `os`, `ipAddress` populated from `RequestMetadataService` (non-null when the controller runs with `MetaDataInterceptor` in its `@UseInterceptors`). Given the password was omitted (AC-1.4b); Then `metadata.defaultPasswordAssigned: true`. **Implementation note**: the audit row is produced by `AuditService.Emit()` called manually from the service — NOT by the `@Audited()` decorator, because the decorator's `AuditInterceptor` reads metadata from `request.params`/`request.query` (not body) and would produce `metadata: undefined` and `resourceId: undefined`. See Technical Decision #13.

**Admin console ACs:**

- **AC-1.13 — Provisioning form renders (Option 2B fields).** Given SuperAdmin logged into `admin.faculytics`; When they navigate to `/provision-users`; Then a form is visible with fields **Username, First Name, Last Name, Password, Confirm Password, Campus dropdown** AND a Submit button (disabled until required fields are valid). **NO Email or Display Name fields** — Round 2 adversarial fix (R2) aligned the form with the backend DTO which has no such columns.

- **AC-1.14 — Form submission success.** Given SuperAdmin fills the form with valid data; When they click Submit; Then the form calls `POST /admin/users` via TanStack Query mutation, shows a sonner toast `"User kmartinez created"`, and resets to empty.

- **AC-1.15 — Form submission error display.** Given SuperAdmin submits with a taken username; When the API returns 409; Then the form shows `"This username is already taken"` as a toast and does not reset.

#### FAC-131b — Campus Head Role

**Role & promotion ACs:**

- **AC-2.1 — `CAMPUS_HEAD` exists in roles enum.** Given the codebase after this change; Then `UserRole.CAMPUS_HEAD` is importable in api.faculytics AND `APP_ROLES.CAMPUS_HEAD` is importable in app.faculytics AND `UserRole.CAMPUS_HEAD` is in the admin.faculytics `src/types/api.ts:98-107` const AND `InstitutionalRole` union at line 213 includes it.

- **AC-2.2 — SuperAdmin promotes user to Campus Head.** Given SuperAdmin authenticated, target user exists, depth-1 Moodle category `UCMN` exists; When SuperAdmin sends `POST /admin/institutional-roles` with `{ userId, role: "CAMPUS_HEAD", moodleCategoryId: <UCMN id> }`; Then response is `201 Created` AND `UserInstitutionalRole` row exists `(user, role='CAMPUS_HEAD', moodleCategory=UCMN, source='manual')`.

- **AC-2.3 — Depth-1 validation.** Given SuperAdmin sends `POST /admin/institutional-roles` with `role: "CAMPUS_HEAD"` and a depth-3 category; Then response is `400 Bad Request` with error containing `"CAMPUS_HEAD"` and `"depth 1"`. _(Implementation: mirror the existing Dean depth-3 check in `admin.service.ts:220-237`.)_

- **AC-2.4 — Duplicate promotion guard.** Given user already has `UserInstitutionalRole(CAMPUS_HEAD, UCMN)`; When SuperAdmin sends the same promotion; Then response is `409 Conflict`.

- **AC-2.5 — Eligible-categories endpoint.** Given SuperAdmin authenticated AND Moodle has depth-1 categories UCMN, UCB, UCT AND `kmartinez` has no CAMPUS_HEAD roles; When SuperAdmin sends `GET /admin/institutional-roles/campus-head-eligible-categories?userId=<kmartinez uuid>`; Then response is `200 OK` with an array of 3 depth-1 categories.

- **AC-2.6 — Eligible-categories excludes already-promoted.** Given `kmartinez` already has `(CAMPUS_HEAD, UCMN)`; Then the endpoint returns UCB and UCT but not UCMN.

**Scope resolver ACs:**

- **AC-2.7 — `ResolveDepartmentIds` Campus Head branch single campus.** Given `kmartinez` has `UserInstitutionalRole(CAMPUS_HEAD, UCMN)` AND UCMN has 3 departments in the given semester; When `ScopeResolverService.ResolveDepartmentIds(semesterId)` is called for `kmartinez`; Then returns an array containing all 3 department UUIDs (NOT campus UUIDs — department UUIDs within the campus).

- **AC-2.8 — DELETED (superseded by AC-2.8a/b/c — post-adversarial correction).** The original "returns union of 5 department UUIDs" was structurally unreachable given the schema: `Department` has no direct `campus` FK (`department.entity.ts:13-30`), and `ResolveDepartmentIds(semesterId)` is semester-scoped, and each `Semester` belongs to exactly one `Campus`. Multi-campus scope is expressed by the user switching semesters in the UI.

- **AC-2.8a — Multi-campus Campus Head + UCMN semester → UCMN departments only.** Given `kmartinez` has both `(CAMPUS_HEAD, UCMN)` and `(CAMPUS_HEAD, UCB)` AND semester `sem-UCMN-Q1` belongs to UCMN with 3 departments; When `ResolveDepartmentIds('sem-UCMN-Q1')` is called for `kmartinez`; Then returns all 3 UCMN department UUIDs (NOT UCB departments).

- **AC-2.8b — Same user + UCB semester → UCB departments only.** Given the same `kmartinez` AND semester `sem-UCB-Q1` belongs to UCB with 2 departments; When `ResolveDepartmentIds('sem-UCB-Q1')` is called; Then returns all 2 UCB department UUIDs.

- **AC-2.8c — Campus Head + semester from unrelated campus → empty array.** Given `kmartinez` is Campus Head of UCMN only AND semester `sem-UCT-Q1` belongs to UCT; When `ResolveDepartmentIds('sem-UCT-Q1')` is called; Then returns `[]`.

- **AC-2.9 — `ResolveDepartmentIds` unscoped for SuperAdmin.** Given SuperAdmin; When the resolver is called; Then returns `null` (unrestricted), matching existing behavior.

- **AC-2.9b — DELETED (post-adversarial correction).** `ScopeResolverService.ResolveDepartmentCodes` does NOT exist; this AC tested a fabricated method. The actual `ResolveDepartmentCodes` is a private method on `AnalyticsService` at `analytics.service.ts:1072` that internally calls `scopeResolver.ResolveDepartmentIds` and translates IDs → codes — so the analytics codes path inherits transparently from Task 16's `ResolveDepartmentIds` branch.

**Endpoint branching ACs:**

- **AC-2.11 — Faculty list scoped to Campus Head's campuses.** _(Step 2: endpoint is `faculty.service.ts:ListFaculty` at lines 30-164; filter applied at line 358 via `departmentIds` from resolver. CAMPUS_HEAD inherits via `ResolveDepartmentIds` branch — no new code in `faculty.service.ts`.)_ Given Campus Head of UCMN AND UCMN has 20 faculty total AND UCB has 15 faculty; When they call `GET /api/v1/faculty?semesterId=<X>`; Then response contains exactly 20 UCMN faculty AND pagination reflects `total: 20`.

- **AC-2.12 — Faculty list for Dean unchanged (regression).** Given existing Dean; Then faculty list behavior is unchanged from pre-FAC-131.

- **AC-2.13 — Analytics overview scoped by campus.** _(Step 2: endpoint is `analytics.service.ts:GetDepartmentOverview` at lines 74-187; filter at lines 109-110 uses `department_code_snapshot = ANY(?)` with codes from `ResolveDepartmentCodes`. CAMPUS_HEAD inherits via resolver branch. FAC-130 MV grain preserves department_code_snapshot — SUM aggregation works natively.)_ Given Campus Head of UCMN; When they call `GET /api/v1/analytics/overview?semesterId=<X>`; Then response metrics aggregate across all UCMN departments.

- **AC-2.14 — Attention list scoped by campus.** _(Step 2: endpoint at `analytics.service.ts:189-396`; filter at lines 259-262 identical pattern. CAMPUS_HEAD inherits.)_ Given Campus Head of UCMN; Then the attention list contains only faculty in UCMN departments.

- **AC-2.15 — Faculty report authorization (happy).** Given Campus Head of UCMN and target faculty's home department is in UCMN; Then response is `200 OK`.

- **AC-2.16 — Faculty report authorization (denied).** Given Campus Head of UCMN and target faculty's home department is in UCB; Then response is `403 Forbidden`.

- **AC-2.17 — Campus Head cannot submit evaluations.** _(Step 2.5: RESOLVED — exact file:line and code change locked.)_ Given Campus Head authenticated; When they send `POST /questionnaires/submissions` with any valid body; Then response is `403 Forbidden` with error message `"Campus Heads are not permitted to submit faculty evaluations."`. Implementation — add the following block to `src/modules/questionnaires/services/questionnaire.service.ts:934`, immediately after the SUPER_ADMIN bypass and before the `resolveRespondentRole()` dispatch:

  ```typescript
  if (respondent.roles.includes(UserRole.SUPER_ADMIN)) return;

  // FAC-131 — Campus Heads are read-only analytics consumers
  if (respondent.roles.includes(UserRole.CAMPUS_HEAD)) {
    throw new ForbiddenException(
      'Campus Heads are not permitted to submit faculty evaluations.',
    );
  }

  const role = this.resolveRespondentRole(respondent);
  ```

  Add a corresponding spec case to `questionnaire.service.spec.ts` asserting the explicit 403 with the expected message when a Campus Head attempts submission.

**Frontend ACs:**

- **AC-2.18 — Screen rename preserves Dean behavior (regression).** Given the rename `DeanDashboardScreen` → `ScopedAnalyticsDashboardScreen` with `scopeLabel` prop; When Dean visits `/dean/dashboard`; Then the screen renders with `scopeLabel="Department"`, displays identical data and layout to pre-rename, and page title is `"Department Analytics"`.

- **AC-2.18b — FacultyReportScreen backHref refactor preserves Dean behavior.** _(NEW from Step 2; wording corrected in Round 3 narrative polish.)_ Given the refactor of `use-faculty-report-detail-view-model.ts` to derive `backHref` from `getRoleConfig(activeRole).routePrefix` (where `activeRole` is destructured from `useActiveRole()`); When a Dean clicks the "Back to Faculties" button on a faculty analysis page; Then they navigate to `/dean/faculties` (behavior unchanged).

- **AC-2.18c — FacultyReportScreen backHref works for Campus Head.** _(NEW from Step 2.)_ Given a Campus Head viewing `/campus-head/faculties/[facultyId]/analysis`; When they click "Back to Faculties"; Then they navigate to `/campus-head/faculties` (NOT to `/dean/faculties`).

- **AC-2.19 — Campus Head lands on `/campus-head/dashboard`.** Given user `kmartinez` is Campus Head and just logged in; Then they are redirected to `/campus-head/dashboard` per `ROLE_CONFIG[CAMPUS_HEAD].homePath`.

- **AC-2.20 — Campus Head dashboard renders campus scope.** Given Campus Head on `/campus-head/dashboard`; Then `ScopedAnalyticsDashboardScreen` renders with `scopeLabel="Campus"`, page title is `"Campus Analytics"`, data scoped to UCMN.

- **AC-2.21 — Campus Head sidebar shows Dashboard + Faculties only.** Given Campus Head logged in; Then the sidebar via `getNavItemsForRole(CAMPUS_HEAD)` renders exactly 2 items: `Dashboard → /campus-head/dashboard` AND `Faculties → /campus-head/faculties` (no Evaluation).

- **AC-2.22 — Role guard blocks Campus Head from Dean routes.** Given Campus Head authenticated (`activeRole = CAMPUS_HEAD`); When they navigate to `/dean/dashboard`; Then `RoleGuard` redirects them to `/campus-head/dashboard`.

**Edge case ACs:**

- **AC-2.25 — Campus Head with zero submissions empty state (post-adversarial correction: zero-submissions ≠ zero-semesters).** The original AC cited `dean-dashboard-screen.tsx:57-62` as "the empty-state guard" — that guard actually fires only when `semesters.length === 0` (zero SEMESTERS, a completely different condition). For the zero-SUBMISSIONS case, the view model at `use-dean-dashboard-view-model.ts:91-99` provides a fallback summary object with all-zero metrics, so the dashboard renders the full chart shell with zero values (not a dedicated empty state). **Refined AC**: Given Campus Head of UCMN AND UCMN has semesters AND zero submissions exist this semester; When they visit `/campus-head/dashboard`; Then the dashboard renders with zero-valued metric cards (total faculty = 0, total submissions = 0, sentiment rates = 0%) AND the attention list renders as an empty list AND NO uncaught JavaScript errors appear in the browser console. **Implementation note for dev**: If any chart component (e.g., `DeanOverallSentimentBarChart`) crashes on empty input arrays, add a defensive `if (data.length === 0) return <EmptyChartPlaceholder />` guard as part of Task 20.75's string parameterization pass. Verify behavior during Task 28's manual E2E step 10.

- **AC-2.26 — Campus Head with deleted campus (defensive, minimal).** Given user has `(CAMPUS_HEAD, UCMN)` AND UCMN Moodle category is subsequently soft-deleted; When user logs in; Then `ResolveDepartmentIds` returns `[]` AND dashboard renders empty state AND sidebar still renders nav items AND no 500 errors occur.

## Additional Context

### Dependencies

- **FAC-131b depends on FAC-131a** — Campus Head users must exist before they can be promoted. SuperAdmin creates the local account via 131a, then promotes via the extended institutional-roles endpoint in 131b.
- **No external service dependencies introduced.**
- **Related prior work**: FAC-127 (source-tracking pattern reused for `campusSource`), FAC-128 (home department snapshotting), FAC-129 (dean faculty listing), FAC-130 (analytics MV — grain confirmed compatible at `Migration20260413232204_fac-130-mv-home-department.ts:20-83`).

### Testing Strategy

- **Unit tests**: `ScopeResolverService` with table-driven tests for each role branch (Dean, Chairperson, Campus Head single-campus, Campus Head multi-campus, SuperAdmin unrestricted).
- **Service tests**: `AdminUserService.CreateLocalUser` covering bcrypt hashing, uniqueness, default password seed, campus validation, audit emission.
- **Controller tests**: `admin.controller.spec.ts` extended with `POST /admin/users` happy-path and error cases; new `campus-head-eligible-categories` endpoint coverage.
- **Migration test**: Verify `campusSource` column added with default `'auto'` and existing rows backfilled.
- **Integration/regression**:
  - Moodle enrollment sync regression test — local account (moodleUserId=null) not touched across one sync cycle
  - Existing Dean endpoint tests re-run to verify no regression after `ScopeResolverService` branching
  - Frontend: Dean dashboard + faculties list still render correctly after screen rename; Dean faculty report back button still navigates to `/dean/faculties` after `backHref` refactor
- **Manual E2E**: SuperAdmin creates a Campus Head via admin console `/provision-users`, assigns them to UCMN via `/role-action-dialog`, logs in as the new user, navigates to `/campus-head/dashboard`, verifies UCMN-scoped data renders and Dean routes are blocked.

### Step 2 Findings Summary

| Question                                        | Resolution                                                                                                                                                                                                                                                            | Impact on plan                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Q1 — FAC-130 MV grain                           | **UNBLOCKED** — `department_code_snapshot` preserved in MV at `Migration20260413232204:20-83`                                                                                                                                                                         | No MV migration; `ResolveDepartmentCodes` branch sufficient    |
| Q2 — Moodle sync upsert key                     | **UNBLOCKED** — key is `moodleUserId`; skip guard at `moodle-enrollment-sync.service.ts:131-136`                                                                                                                                                                      | No sync code change; regression test only                      |
| Q3 — FacultyReportScreen hardcoded URLs         | **RESOLVED (Step 2.5)** — `use-faculty-report-detail-view-model.ts:117,159` hardcodes `/dean/faculties`; refactor locked to Option 1 (`ROLE_CONFIG[activeRole].routePrefix` via `useActiveRole()`)                                                                    | Added refactor to scope; new ACs 2.18b, 2.18c                  |
| Q4 — Chairperson routes                         | **PARTIAL** — stubs exist but do NOT import Dean screens; rename does not affect them                                                                                                                                                                                 | Out of scope confirmed                                         |
| Q5 — Dean dashboard empty state                 | **UNBLOCKED** — explicit guard at `dean-dashboard-screen.tsx:57-62` + fallback at view-model `:91-99`                                                                                                                                                                 | AC-2.25 passes by design                                       |
| Q6 — Evaluation submission auth                 | **RESOLVED (Step 2.5)** — read `questionnaire.service.ts:928-956` directly; fix is explicit CAMPUS_HEAD denial at line 934 (~4 LOC). Campus Head was implicitly denied today via enrollment check with misleading error; explicit denial gives a clear error message. | AC-2.17 refined with exact code                                |
| Q7 — Audit log subsystem                        | **UNBLOCKED** — full subsystem at `src/modules/audit/` with `AuditLog` entity, `@Audited()` decorator, `AuditInterceptor`                                                                                                                                             | Use existing infrastructure                                    |
| Q8 — POST /admin/institutional-roles allow-list | **UNBLOCKED** — DTO enum at `assign-institutional-role.request.dto.ts:1-20`; depth check at `admin.service.ts:205-237`                                                                                                                                                | ~15 LOC extension                                              |
| Q9 — `User.campusSource`                        | **NEW WORK** — column does NOT exist                                                                                                                                                                                                                                  | New migration required                                         |
| Q10 — Admin service structure                   | **PARTIAL** — no `AdminUserService` exists; `AdminService` is the main service                                                                                                                                                                                        | Create new `AdminUserService` in `src/modules/admin/services/` |
| Q11 — Exact service paths                       | **UNBLOCKED** — all four endpoint services mapped with line numbers                                                                                                                                                                                                   | Filled into Files to Reference table                           |
| Q12 — Parallel route structure                  | **UNBLOCKED** — minimal templates captured                                                                                                                                                                                                                            | Filled into In Scope section                                   |
| Q13 — Role switcher                             | **UNBLOCKED** — reads from `ROLE_CONFIG` dynamically; zero switcher code changes needed                                                                                                                                                                               | ROLE_CONFIG entry is the whole change                          |

### Remaining Impl-Time Verification Items

These are small questions deferred to implementation time, not blockers for the spec:

1. **`AuditAction.ADMIN_USER_CREATE` existence** — check if the enum value already exists in `src/modules/audit/audit-action.enum.ts`; add if missing.
2. **`admin-filters.service.ts` campus filter option** — if the admin console provisioning form needs a "campuses" dropdown, verify a `GET /admin/filters/campuses` endpoint exists or add one; the seed-users tab already uses cascading dropdowns so the pattern is established.
3. **Frontend snapshot tests after rename** — if snapshot tests exist for `DeanDashboardScreen` / `DeanFacultyAnalyticsScreen` (search for `.test.tsx` or `__snapshots__/` in `features/faculty-analytics/`), update snapshots during the rename. If none exist, note that fact to avoid reviewer confusion.

### Notes

**Party Mode session participants** (Step 1 brainstorming): John (PM), Winston (Architect), Midge (Moodle Integrator), Dr. Quinn (Creative Problem Solver), Sally (UX), Amelia (Dev), Bob (Scrum Master).

**Step 2 investigation method**: Three parallel Explore agents — one for `api.faculytics` (7 questions), one for `app.faculytics` (3 questions + 2 bonus), one for `admin.faculytics` (4 questions). All reports cross-referenced with actual file reads where ambiguity remained.

**Key Step 2 insight**: The original plan called for a new `ResolveCampusIds` method on `ScopeResolverService`. Step 2 revealed this is unnecessary — the existing `ResolveDepartmentIds` and `ResolveDepartmentCodes` methods are the scope gates used by faculty list and analytics endpoints, and the FAC-130 MV grain preserves department_code_snapshot. Adding a `CAMPUS_HEAD` branch inside those existing methods (that resolves campus → all-departments-in-campus) is simpler and keeps the downstream caller code unchanged. This is a ~30% simplification vs the original plan.

**Key Step 2 blocker**: `use-faculty-report-detail-view-model.ts:117,159` hardcoded `/dean/faculties`. This was not visible in Step 1's surface-level scan. The refactor is small but essential — without it, Campus Head users clicking "Back" on a faculty analysis page would navigate to a route blocked by their own role guard. New ACs 2.18b and 2.18c cover the refactor and regression. **Refactor approach locked to Option 1 in Step 2.5 (destructure `useActiveRole()`, use `getRoleConfig()` accessor — corrected in Step 3.5).**

---

### Step 3.5 Post-Adversarial Review Remediation (2026-04-14)

After Step 4 finalization, an adversarial review was run against the spec with information asymmetry (a subagent read only the spec + code, with no context from the workflow). It surfaced **20 findings**: 7 Critical, 5 High, 5 Medium, 3 Low. All findings were real and validated against actual source files. This section summarizes the remediation that followed.

**Meta-pattern identified**: The original Step 2 investigation contained "CONFIRMED via grep" markers for claims that were actually pattern-inferred from the Step 1 orient scan, not verified against real file contents. Examples of fabricated-then-confirmed claims: `User.passwordHash` column (actual: `password`), `User.email` and `User.displayName` fields (don't exist), `ScopeResolverService.ResolveDepartmentCodes` method (doesn't exist; it's on `AnalyticsService`), `Department.campus` FK (doesn't exist; traversal is via `Semester`), `useActiveRole()` returns a role string (returns an object), `ROLE_CONFIG` is exported from `role-route.ts` (it isn't — only `getRoleConfig` is), `FacultyReportScreen` lives in `features/faculty-analytics` (actually lives under Dean's `_components` private folder).

**Remediation discipline applied**: Every factual claim in this post-remediation version was verified via Read/Grep against the actual source file before being written. No "CONFIRMED" shortcuts. Future edits to this spec MUST follow the same discipline.

| #   | Severity | Finding                                                                                                            | Resolution                                                                                                                                                                                                                                                                       |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Critical | `passwordHash` column doesn't exist (it's `password`)                                                              | Global fix: DTO, service, ACs, Solution paragraph, code_patterns all updated                                                                                                                                                                                                     |
| F2  | Critical | `User` entity has no `email` or `displayName` fields                                                               | **Decision locked: Option 2B** — DTO reshaped to use `firstName`, `lastName`; `fullName` computed server-side. AC-1.3 (email uniqueness) deleted. In Scope bullets updated.                                                                                                      |
| F3  | Critical | `ScopeResolverService.ResolveDepartmentCodes` doesn't exist                                                        | Removed every reference. Task 16 branches only `ResolveDepartmentIds`. Technical Decision #4 corrected. AC-2.9b deleted. Analytics codes path inherits via `AnalyticsService`'s own private method.                                                                              |
| F4  | Critical | `Department` has no `campus` FK; traversal must go via `Semester`                                                  | Task 16's algorithm rewritten with Semester-traversal. Semester-scoped semantics documented (one campus per semesterId). AC-2.8 deleted, replaced by AC-2.8a/b/c with corrected multi-campus semantics.                                                                          |
| F5  | Critical | `useActiveRole()` returns an object, not a role string                                                             | Task 21 code corrected: `const { activeRole } = useActiveRole()` (destructure). Technical Decision #11 updated.                                                                                                                                                                  |
| F6  | Critical | `ROLE_CONFIG` is not exported from `role-route.ts`                                                                 | Task 21 uses `getRoleConfig(activeRole).routePrefix` accessor. Technical Decision #11 updated. Code pattern updated.                                                                                                                                                             |
| F7  | Critical | `FacultyReportScreen` lives under Dean's `_components` private folder                                              | **New Task 20.5**: relocate `FacultyReportScreen` + 5 sibling `_components` to `features/faculty-analytics/components/`. Budget: 6 file moves, ~15 import rewrites. Task 23's import path verified.                                                                              |
| F8  | High     | `AuditInterceptor` reads `params`/`query`, not `body`                                                              | **Decision locked**: manual `AuditService.Emit()` from `AdminUserService`. Inject `AuditService`, `CurrentUserService`, `RequestMetadataService`. Task 4 rewritten with full code block. Task 6 drops `@Audited` decorator. AC-1.12 rewritten. Technical Decision #13 rewritten. |
| F9  | High     | Task 6 omitted `MetaDataInterceptor`                                                                               | Task 6 updated: `@UseInterceptors(MetaDataInterceptor, CurrentUserInterceptor)` to populate CLS, no `AuditInterceptor`, no `@Audited`.                                                                                                                                           |
| F10 | High     | `user_user_name_unique` constraint breaks the "regression test only" claim                                         | Triple-enforcement model documented in Technical Decision #16. Task 25.5 NEW adds Moodle sync `local-*` skip guard. Task 10.5 NEW adds Seed Users form rejection. AC-1.11 rewritten as deliberate-collision regression test.                                                     |
| F11 | High     | 9 additional `dean-*` component files leak "Dean"/"department" strings                                             | **New Task 20.75**: rename and parameterize 9 sibling files with `scopeLabel` prop propagation. ~20 import rewrites + string-replacement audit.                                                                                                                                  |
| F17 | High     | Task 4's `em.create` omits `firstName`, `lastName`, `userProfilePicture`, `lastLoginAt`, `isActive` (all NOT NULL) | Task 4 code block rewritten with all required fields per `user.entity.ts:21-89`. AC-1.1 postcondition expanded.                                                                                                                                                                  |
| F12 | Medium   | Wrong admin console path (`src/app-shell.tsx` vs `src/components/layout/app-shell.tsx`)                            | Path corrected in files_to_modify, Task 10, and Context references.                                                                                                                                                                                                              |
| F13 | Medium   | Questionnaire service fall-through justification was wrong                                                         | Technical Decision #15 rewritten with accurate fall-through analysis covering both `SUBMISSION_TYPE_MATRIX` failure and enrollment-check failure modes.                                                                                                                          |
| F14 | Medium   | AC-2.25 cited wrong guard (`semesters.length === 0` vs zero submissions)                                           | AC-2.25 rewritten to describe actual zero-submissions behavior (zero-valued metric cards, not dedicated empty state). Implementation note added for defensive chart guards.                                                                                                      |
| F15 | Medium   | AC-1.11 "regression test only — no new code" was false                                                             | AC-1.11 rewritten as a real regression test with explicit collision test verifying Task 25.5's skip guard.                                                                                                                                                                       |
| F18 | Medium   | Task 16 "add the branch" was ambiguous on insertion point                                                          | Task 16 pinned the insertion point explicitly (after DEAN/CHAIRPERSON checks, before the terminal throw). Multi-role Dean+Campus-Head precedence documented.                                                                                                                     |
| F16 | Low      | SUPER_ADMIN `superadmin` username grandfathering has a latent Moodle-collision risk                                | Documented in Technical Decision #16 and Solution paragraph as known low-probability edge case.                                                                                                                                                                                  |
| F19 | Low      | `@IsEnum(UserRole)` allow-list loophole allows `role: "FACULTY"` to pass validation                                | Documented as a pre-existing bug outside FAC-131 scope. Mitigation: add an explicit else-throw in `admin.service.ts:AssignInstitutionalRole` as defensive hardening (optional extension to Task 14).                                                                             |
| F20 | Low      | Moodle sync doesn't set `campusSource` on created users                                                            | Task 25.5 (and files_to_modify) updated to include the setter alongside the new skip guard.                                                                                                                                                                                      |

**Tasks added by remediation**:

- **Task 10.5** — Seed Users tab rejects `local-*` Moodle username
- **Task 20.5** — Relocate `FacultyReportScreen` + 5 siblings to `features/faculty-analytics/components/`
- **Task 20.75** — Rename and parameterize 9 additional `dean-*` siblings
- **Task 25.5** — Moodle enrollment sync skip guard for `local-*` usernames

**Tasks substantially rewritten by remediation**:

- Task 3 (DTO: firstName/lastName, no email/displayName)
- Task 4 (service: full field list + manual audit emission + verified bcrypt column name)
- Task 6 (controller: no `@Audited`, correct interceptor order)
- Task 16 (resolver: Semester-traversal algorithm, one branch not two)
- Task 21 (backHref: destructure + `getRoleConfig()` accessor)
- Task 23 (import path note for Task 20.5 dependency)

**ACs affected**:

- Rewritten: AC-1.1, AC-1.6, AC-1.11, AC-1.12, AC-2.17, AC-2.25
- Deleted: AC-1.3 (email uniqueness), AC-2.8 (superseded), AC-2.9b (fabricated method)
- Added: AC-1.1d (firstName/lastName required), AC-2.8a, AC-2.8b, AC-2.8c (corrected multi-campus semantics)

**Estimated remediation effort**: 1.5 hours of careful editing with per-claim verification. Worth it — the original spec would have stuck a dev at Task 4 for half a day with confusing TypeScript errors about nonexistent columns.

**Next step recommendation**: Run a second adversarial review against the post-remediation spec before calling it ready for dev. Two adversarial passes catch both the original gaps and any gaps introduced by the fixes.

---

### Step 3.7 Round 2 Adversarial Remediation (2026-04-14)

A second adversarial review followed the first remediation. It surfaced **11 new findings** (3 Critical, 1 High, 3 Medium, 4 Low), all real and validated against code. The pattern: **every gap was a cross-layer verification failure** — the first remediation verified one side of an interface (service layer, backend DTO, resolver method) and assumed the adjacent layer (controller guards, frontend form, internal call chain) followed suit. It didn't.

**Round 2 Critical findings and resolutions**:

| ID  | Severity | Finding                                                                                                                                                                                                                                      | Resolution                                                                                                                                                                                                                                                                                                                                        |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Critical | CAMPUS_HEAD missing from `@UseJwtGuard` on `analytics.controller.ts:29`, `faculty.controller.ts:21`, `reports.controller.ts:28` — all 403 before reaching the resolver                                                                       | **New Task 15.5** adds CAMPUS_HEAD to those guards. Cross-layer audit found a 4th controller (`curriculum.controller.ts:16`) that the adversarial subagent missed — added to the task.                                                                                                                                                            |
| R2  | Critical | F2 fix halted at backend/frontend seam — Task 7, Task 9, AC-1.13, Task 28 step 3 still use `email`/`displayName`                                                                                                                             | Rewrote all four to use `firstName`/`lastName`. Updated with verified campus endpoint (`GET /admin/filters/campuses` confirmed to exist at `admin-filters.controller.ts:30`).                                                                                                                                                                     |
| R3  | Critical | Task 16 branched only `ResolveDepartmentIds`; `ResolveProgramCodes` is called unconditionally by analytics' `IsProgramCodeInScope` AND `ResolveProgramIds` is called by `curriculum.service.ts:117` — Campus Head hits their terminal throws | Task 16 expanded with `return null` branches for `ResolveProgramIds` and `ResolveProgramCodes` (unrestricted at program level, matching Dean's behavior at lines 52-53). Context section line 262 corrected — it now says "three methods need CAMPUS_HEAD handling" and explains the `return null` semantics. Two new spec tests added (k, l, m). |
| R4  | High     | Stragglers: spec line 253 still said `passwordHash`; AC-1.11 contradicted Task 25.5/10.75 by claiming "regression test only — no new code"                                                                                                   | Line 253 corrected; AC-1.11 fully rewritten to depend on the sync skip guard and describe the deliberate-collision test.                                                                                                                                                                                                                          |
| R5  | Medium   | Task 25.5 used literal `'auto'` instead of `InstitutionalRoleSource.AUTO` enum                                                                                                                                                               | Updated to use the enum, matching the existing sibling assignments.                                                                                                                                                                                                                                                                               |
| R6  | Low      | Misleading `admin.module.ts` import guidance                                                                                                                                                                                                 | `AuditModule` is `@Global()`, `CommonModule` already provides CLS services. Clause deleted from frontmatter. Task 5's Notes updated with the verified import chain.                                                                                                                                                                               |
| R8  | Medium   | Task 9's campus dropdown data source was hand-waved                                                                                                                                                                                          | Verified in Round 2.5 cross-layer audit: `GET /admin/filters/campuses` exists at `admin-filters.controller.ts:30`, implemented by `AdminFiltersService.GetCampuses` at `admin-filters.service.ts:27`. Task 9 now cites the exact endpoint.                                                                                                        |
| R9  | Low      | Task 11's test payload omitted source fields                                                                                                                                                                                                 | Added explicit `departmentSource`, `programSource`, `campusSource` with the enum.                                                                                                                                                                                                                                                                 |
| R10 | Low      | F19 defensive hardening described but not actionable                                                                                                                                                                                         | Task 14 now has an optional hardening bullet closing the `@IsEnum(UserRole)` loophole with an explicit `else throw`. Can be deferred if it bloats the PR.                                                                                                                                                                                         |
| R11 | Low      | Task 25.5 numbered out of sequence                                                                                                                                                                                                           | Kept numerically — moving blocks of text risks introducing bugs. The ticket reader can cope with the 22 → 25.5 → 23 ordering; the task's cross-references are accurate.                                                                                                                                                                           |

**Round 2.5 cross-layer audit findings** (performed by Claude with Read/Grep BEFORE applying fixes, per Dr. Quinn's discipline rule):

- **Audit 1 — Controller guards grep**: `rg "@UseJwtGuard.*UserRole" --type ts src/modules/*/\*.controller.ts` returned 34 matches across 12 controllers. Four controllers use `DEAN, CHAIRPERSON, SUPER_ADMIN` allowlists and must be updated: `analytics.controller.ts:29`, `faculty.controller.ts:21`, `reports.controller.ts:28`, `curriculum.controller.ts:16`. (Round 2 adversarial subagent caught 3 of 4 — the 4th was curriculum.)

- **Audit 2 — ResolveProgramCodes/ResolveProgramIds callers grep**: `rg "ResolveProgram(Codes|Ids)" src/` returned matches at `curriculum.service.ts:117` (calls `ResolveProgramIds`) and `analytics.service.ts:1067` (calls `ResolveProgramCodes` via `IsProgramCodeInScope`). Both require CAMPUS_HEAD handling in the resolver. Confirmed Task 16's expanded scope is necessary and sufficient.

- **Audit 3 — `email`/`displayName` stragglers grep**: `rg "email\|displayName" _bmad-output/implementation-artifacts/tech-spec-fac-131-*.md` returned hits at spec lines 597, 598, 606, 607 (Task 7 types), 654, 655 (Task 9 form state), 1132 (Task 28 E2E), 1201 (AC-1.13). All rewritten. Remaining hits are intentional — they describe what is NOT present (e.g., "NO email or displayName columns" in the Solution paragraph, the F2 tracker entry in the remediation table).

- **Audit 4 — `passwordHash` stragglers grep**: `rg "passwordHash" _bmad-output/implementation-artifacts/tech-spec-fac-131-*.md` returned hits at spec lines 253, 1192. Both fixed. Remaining hits (lines 88, 133, 509, 558) are intentional — they document the anti-pattern explicitly ("NOT `passwordHash`").

- **Audit 5 — `dean-*` component file count**: `ls app.faculytics/features/faculty-analytics/components/ | grep ^dean-` returned exactly 11 files. Task 20 covers 2 (`dean-dashboard-screen.tsx`, `dean-faculty-analytics-screen.tsx`); Task 20.75 covers the other 9. Count verified — no files missed.

- **Audit 6 — Campus filter endpoint existence**: `rg "@Get.*campus" src/modules/admin/admin-filters.controller.ts` returned `admin-filters.controller.ts:30: @Get('campuses')`. Confirmed endpoint exists. Task 9's campus dropdown now cites this endpoint directly.

**Meta-pattern observation (Dr. Quinn's discipline rule, now baked in)**:

The Round 1 and Round 2 critical findings all share a shape: **the spec verified one side of an interface and assumed the adjacent layer followed suit**.

- Round 1 F1 (`passwordHash`): service-layer assumption about entity column name
- Round 1 F7 (FacultyReportScreen location): feature-layer assumption about route-layer file structure
- Round 1 F3 (ResolveDepartmentCodes): resolver-service assumption about which service method owns a name
- Round 2 R1 (controller guards): service-layer assumption about transport-layer permissiveness
- Round 2 R2 (frontend form): backend-DTO assumption about frontend field shape propagation
- Round 2 R3 (program resolver): single-method assumption about multi-path call chain

**Discipline rule for future edits to this spec**: No claim of the form "X EXISTS at Y:line Z" or "Y inherits from X automatically" without a verbatim Grep/Read citation. No "CONFIRMED" markers without an inline grep command. Cross-layer changes must grep BOTH sides of every interface before being marked complete. Six standard greps (listed in Audit 1-6 above) should be repeated whenever the spec is substantively edited.

**Total remediation time**: ~45 minutes for Round 2 fixes + 15 minutes for the cross-layer audit. Well worth it — R1 alone would have stuck a dev for a full afternoon of 403 debugging.

---

### Step 3.8 Round 3 Adversarial Remediation (2026-04-14)

A third adversarial review followed the Round 2 remediation. **The convergence is real**: 20 → 11 → 6 findings, 7 → 3 → 0 Criticals. Round 3 found **zero spec-vs-code failures** — all 6 findings were internal spec-vs-spec inconsistencies (cross-reference bugs, stale stragglers, structural contradictions inside the spec text itself).

**Round 3 findings and resolutions**:

| ID        | Severity | Finding                                                                                                                                     | Resolution                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1        | High     | `moodle-enrollment-sync.service.ts` listed in BOTH "Files to Reference Only" (zero changes) AND Files to Modify (via Task 25.5)             | Removed from reference-only table. Technical Decision #7 rewritten to explicitly say "this IS a code change, via Task 10.75."                                                                                                                                                                                                                                                                   |
| S2        | High     | AC-1.11 referenced "Task 10.75" but the task was actually Task 25.5 (R11 deferral left the cross-reference broken)                          | Option C (S3 merge below) retroactively made "Task 10.75" correct — AC-1.11 now references the real merged task.                                                                                                                                                                                                                                                                                |
| S3        | High     | Task 25.5 physically in FAC-131b section but depended on by FAC-131a's Task 11 — breaks the ticket split's independent-mergeability promise | **Option C applied**: merged former Tasks 10.5 (Seed Users rejection) + 25.5 (Moodle sync skip guard) into new **Task 10.75 — Enforce `local-` namespace in all Moodle inflows** in FAC-131a. Deleted Task 25.5's standalone entry. Former Task 10.5's separate entry consolidated. This groups both halves of the `local-` namespace enforcement into one task where they conceptually belong. |
| S4        | Low      | Task 3 Notes still said "username/email uniqueness"                                                                                         | Dropped `/email` — email was never a User column.                                                                                                                                                                                                                                                                                                                                               |
| S5        | Low      | Task 4 service code used literal `'auto'`/`'manual'` strings; Task 25.5 used the enum; inconsistent                                         | Task 4's `em.create` payload updated to use `InstitutionalRoleSource.AUTO` / `InstitutionalRoleSource.MANUAL` enum values. AC-1.1 and AC-1.6 assertion strings updated to match. Task 3's import list expanded with the enum import.                                                                                                                                                            |
| S6        | Low      | Task 14's R10 hardening `else throw` pattern was structurally invalid for the existing independent-if control flow                          | Rewritten as a whitelist check `if (![DEAN, CHAIRPERSON, CAMPUS_HEAD].includes(dto.role)) throw ...` placed BEFORE the existing branches — valid for the actual code shape.                                                                                                                                                                                                                     |
| Narrative | Low      | AC-2.18b wording used `ROLE_CONFIG[activeRole]` direct-access phrasing contradicting Task 21's `getRoleConfig()` accessor mandate           | AC-2.18b rewritten to reference `getRoleConfig(activeRole).routePrefix` for consistency.                                                                                                                                                                                                                                                                                                        |

**Tasks structure after Round 3**:

- **Merged**: Tasks 10.5 + 25.5 → **Task 10.75** (in FAC-131a). Both former tasks' content is now in Task 10.75.
- **Deleted**: Task 25.5's standalone entry (replaced by an HTML comment pointing to Task 10.75).

**Round 3 verdict from the subagent**: Zero spec-vs-code failures. All Round 2 fixes verified clean against source (R1 controller guards, R3 program resolver, R6 module imports, R8 campus endpoint). The remaining work was pure internal-consistency cleanup.

**Convergence metrics**:

| Round                         | Findings | Critical | High | Medium | Low |
| ----------------------------- | -------- | -------- | ---- | ------ | --- |
| 1 (after Step 3)              | 20       | 7        | 5    | 5      | 3   |
| 2 (after Round 1 remediation) | 11       | 3        | 1    | 3      | 4   |
| 3 (after Round 2 remediation) | 6        | **0**    | 3    | 0      | 3   |

**Meta-pattern observation finalized**: Round 1 caught spec-vs-code disagreement. Round 2 caught more spec-vs-code disagreement at adjacent layers (cross-layer). Round 3 caught spec-vs-spec disagreement (internal consistency). The discipline evolution:

- **Post-Round-1**: Cross-Layer Verification Audit (grep code to verify spec claims)
- **Post-Round-3** (future): Spec-Internal Consistency Audit (grep the spec for internal cross-reference correctness — duplicate file entries, nonexistent task references, field-name drift between tasks and ACs)

Dr. Quinn's rule for a potential Round 4: grep the spec itself, not just the code. Round 4's subagent prompt should include: _"also run a consistency audit on the spec text — internal cross-references, duplicate entries, field-name drift, task number validity."_

**Round 3 remediation time**: ~20 minutes. The Option C merge was the largest change but mostly cut-and-paste with re-numbering. The other 5 fixes were one-line or one-paragraph edits.

---

### Step 3.9 Round 4 Adversarial Remediation + Known Issues (2026-04-14 — FINAL)

A fourth adversarial review followed the Round 3 remediation. It surfaced **6 findings** (2 High, 1 Medium, 3 Low) — same count as Round 3, but a different mix. Zero spec-vs-code failures again; all 6 were internal spec-vs-spec consistency bugs, most introduced by Round 3's own fixes (the Option C merge left stale references in adjacent sections that the grep-based cross-layer audit didn't catch).

**Round 4 fixes applied**:

| ID  | Severity | Finding                                                                                                                                                                                                                       | Resolution                                                                                                                                                                                                                                                                             |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2  | High     | Files to Modify table + frontmatter `files_to_modify` missing 7 files from Tasks 10.75 and 15.5 (4 controllers + 3 Moodle files)                                                                                              | Added all 7 rows to Files to Modify table and frontmatter. The T2 bug was a consequence of the S1 half-fix — I removed one file from the reference-only table without adding it (or its siblings) to the modify table.                                                                 |
| T3  | High     | Files to Modify row 303 still said "Add CAMPUS_HEAD branches to `ResolveDepartmentIds` and `ResolveDepartmentCodes`" — but `ResolveDepartmentCodes` doesn't exist on ScopeResolverService (fabricated method from Round 1 F3) | Row 303 rewritten to reference only `ResolveDepartmentIds` + `return null` branches for `ResolveProgramIds`/`ResolveProgramCodes`. Row 323 (analytics.service.ts reference) clarified that `ResolveDepartmentCodes` is a private method on AnalyticsService, not ScopeResolverService. |
| T1  | Medium   | Task 11 step 3 body still referenced "Task 25.5"                                                                                                                                                                              | Updated to "Task 10.75" to match Round 3's Option C merge.                                                                                                                                                                                                                             |

**Round 4 deferred — "Known Issues" list** (not blocking, documented for future polish):

| ID  | Severity | Finding                                                                                                                                                     | Deferral Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T4  | Medium   | "Step 2 Findings Summary" table at lines 1378-1392 is a stale pre-remediation snapshot — rows for Q2/Q3/Q6/Q7/Q1 contradict the Round 1-3 corrections       | **Deferred**. The table is clearly labeled "Step 2" and lives in the historical Notes section; a reader navigating the task list directly won't see it. A future editorial pass can either annotate each stale row with "⚠️ superseded by F<N>" or prefix the section with "Historical snapshot — pre-adversarial remediation." Not blocking implementation.                                                                                                                                                                                                                                                     |
| T5  | Low      | AC numbering gaps at AC-2.10, AC-2.23, AC-2.24 have no "DELETED" marker (cuts from Step 2 party); "37 ACs drafted" count is stale (actual count is ~48)     | **Deferred**. The ACs in question were cut early (Step 2 party mode) and the body of the spec clearly says "X ACs cut/deferred" in the Notes. A sequential reader might wonder why 2.10 is missing but won't be blocked. Future polish can add explicit DELETED rows for the three gaps and update the count.                                                                                                                                                                                                                                                                                                    |
| T6  | Low      | Task 10.75's client-side `seed-users-tab.tsx` rejection describes work that has no surface (the form has no username input; usernames are server-generated) | **Deferred**. The server-side enforcement half of Task 10.75 (DTO `@Matches` + `MoodleProvisioningService.SeedUsers` check) is the real enforcement point and is unaffected. Task 10.75's client-side bullet is redundant but not incorrect — an implementing dev reading Task 10.75 Part B will either (a) verify the form has no surface and drop the client-side work, or (b) add a defensive check anyway. A future polish pass can simplify Task 10.75 Part B to drop the client-side file from scope and state "seed-users-tab.tsx has no username input; zero client-side change required." Not blocking. |

**Round 4 convergence final**:

| Round                 | Findings | Critical | High | Medium | Low |
| --------------------- | -------- | -------- | ---- | ------ | --- |
| 1                     | 20       | 7        | 5    | 5      | 3   |
| 2                     | 11       | 3        | 1    | 3      | 4   |
| 3                     | 6        | 0        | 3    | 0      | 3   |
| 4                     | 6        | 0        | 2    | 1      | 3   |
| **5+ (hypothetical)** | —        | —        | —    | —      | —   |

**Decision**: Stop after Round 4 with T1/T2/T3 applied. T4/T5/T6 accepted as known polish items. The convergence plateau at 6 findings, all internal-consistency bugs, suggests a Round 5 would catch Round-4-introduced edits (the T2 file-list additions, the T3 row rewrite) and find 4-6 new minor issues — diminishing returns on editorial polish. The actual implementation plan (Tasks 1-28 including 10.75/15.5/20.5/20.75) is materially correct and self-consistent; navigation aids (tables, summaries, cross-references) will have minor drift that a dev can mentally skip.

**Final spec status after Round 4**: **Ready for Development** with 3 documented minor polish items (T4/T5/T6). A dev implementing from this spec should follow the individual task bodies (not the Step 2 summary table) as ground truth, and should expect minor cross-reference drift in historical Notes sections without letting it block execution.

**Total remediation cycle**: Step 1 party mode (initial brainstorm) → Step 2 investigation → Step 2.5 party mode refinements → Step 3 task generation → Round 1 adversarial review (20 findings) → Round 1 remediation → Round 2 adversarial review (11 findings) → Round 2 remediation + cross-layer audit → Round 3 adversarial review (6 findings) → Round 3 remediation + Option C merge → Round 4 adversarial review (6 findings) → Round 4 remediation (T1/T2/T3) → **DONE**.

**Total time**: approximately 3 hours of collaborative spec development + 4 rounds of adversarial review. For a ~840 LOC feature split into two tickets touching three subprojects, this was justified by the spec's high-dependency nature — both tickets sit on top of existing authorization, audit, and scoping infrastructure that had to be verified against real code rather than inferred from patterns.

**Lessons for future specs of similar complexity**:

1. **Step 2 investigation must read files, not pattern-match**. Every "X EXISTS at Y:line Z" claim needs a verbatim Read/Grep citation before it enters the spec.
2. **Cross-layer verification is as important as single-layer verification**. The top-3 Critical findings in Round 2 (R1 controller guards, R2 frontend/backend DTO mismatch, R3 program resolver chain) were all cross-layer bugs that single-layer verification couldn't catch.
3. **Two adversarial passes is the minimum for a spec this size**. Round 1 caught architectural errors; Round 2 caught the gaps in Round 1's fixes. Round 3 and Round 4 caught editorial drift. If you stop at one adversarial pass, you ship fixable-but-painful bugs to the implementing dev.
4. **Internal-consistency audits complement cross-layer audits**. Round 3 introduced this discipline explicitly, and Round 4 proved it catches bugs the cross-layer audit misses.
5. **The convergence plateau is real**. After 4 rounds, the spec reached a point where each remediation cycle introduced roughly as many issues as it fixed. That's the stopping signal — not perfection, but a plateau where continued editing is net-zero or net-negative.

**Step 2.5 (post-investigation party refinements)**:

A second party-mode session ran immediately after Step 2's file audit. Four additional refinements landed:

1. **Files-to-modify cleanup** (Amelia's audit): Moved `faculty.service.ts`, `analytics.service.ts` (×3), `moodle-enrollment-sync.service.ts`, and the vague `questionnaire.service.ts` entry out of the modify list and into a new "Files to Reference Only (inherit via upstream changes)" subsection. Rationale: reviewers reading the PR should see the true diff target, not a reading list. The cleanup reduces the apparent modification footprint from ~38 files to ~25 files, which is more honest and more reviewable.

2. **backHref refactor approach locked to Option 1** (user decision): `ROLE_CONFIG[activeRole].routePrefix` via the existing `useActiveRole()` hook. Sally had recommended Option 2 (pathname-regex) but yander preferred the explicit single-source-of-truth approach. Locked in Technical Decision #11.

3. **Username convention — reserved `local-` prefix** (Midge's concern, yander's proactive resolution): All locally-provisioned usernames must match `^local-[a-z0-9][a-z0-9._-]*$`. Enforced via class-validator `@Matches()` in `CreateLocalUserDto`. This converts Midge's tripwire concern into an architectural impossibility: Moodle usernames follow `<campus_code>-<id>` or numeric patterns and will never collide with `local-*`. Midge's collision regression test downgraded from mandatory to recommended-documentation. SUPER_ADMIN (seeded via EntityManager) grandfathered. New Technical Decision #16, new AC-1.1c.

4. **Evaluation submission authorization — RESOLVED** (Q6 escalated from "impl-time verification" to "read now"): Read `questionnaire.service.ts:928-956` directly. Current behavior implicitly denies CAMPUS_HEAD via the enrollment check at lines 687-700, but with a misleading error message. Fix: add explicit CAMPUS_HEAD denial at line 934, immediately after the SUPER_ADMIN bypass. ~4 LOC production. AC-2.17 refined with exact code block. Removed Q6 from "impl-time verification" items.

**Net effect of Step 2.5**: One impl-time uncertainty eliminated, one architectural wart prevented (username collisions), one UX ambiguity resolved (Option 1 locked), one reviewability win (files-to-modify cleanup). Zero new blockers surfaced. The spec is now materially ready for Step 3 task generation.
