---
title: 'Questionnaire Version Templating'
slug: 'questionnaire-version-templating'
created: '2026-04-03'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS 11',
    'MikroORM 6',
    'PostgreSQL',
    'Zod',
    'class-validator',
    'Swagger/OpenAPI',
    'Next.js 16',
    'React 19',
    'Zustand',
    'TanStack Query',
  ]
files_to_modify:
  - 'api: src/modules/questionnaires/services/questionnaire.service.ts'
  - 'api: src/modules/questionnaires/questionnaire.controller.ts'
  - 'api: src/modules/questionnaires/dto/requests/create-version-from-template-request.dto.ts (NEW)'
  - 'api: src/modules/questionnaires/services/questionnaire.service.spec.ts'
  - 'api: src/modules/questionnaires/questionnaire.controller.spec.ts'
  - 'app: features/questionnaires/api/questionnaire.requests.ts'
  - 'app: features/questionnaires/hooks/use-create-version-from-template.ts (NEW)'
  - 'app: features/questionnaires/components/questionnaire-list-toolbar.tsx'
  - 'app: app/(dashboard)/superadmin/questionnaires/_components/questionnaire-list-screen.tsx'
  - 'app: app/(dashboard)/superadmin/questionnaires/page.tsx'
  - 'app: network/endpoints.ts'
code_patterns:
  - 'PascalCase public service methods (e.g., CreateVersion, CreateVersionFromTemplate)'
  - 'DTOs use class-validator + @ApiProperty decorators'
  - 'Controller endpoints have full Swagger decorators (@ApiOperation, @ApiResponse)'
  - 'Service uses versionRepo.findOne() for lookups, versionRepo.create() for creation (outside transactions)'
  - 'Transactions use UnitOfWork.runInTransaction(async (em) => { ... }) — inside: em.findOne(), em.create(), no em.persist() needed (managed by default in v6). Outside transactions: use injected repos.'
  - 'Cache invalidation via cacheService.invalidateNamespace() after mutations'
  - '@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN) for admin-only endpoints'
  - 'Response DTOs have static Map() factory method'
test_patterns:
  - 'Spec files co-located with source (.spec.ts suffix)'
  - 'createMockRepo() helper pattern for repository mocks'
  - 'getRepositoryToken() for DI in test module'
  - 'Controller specs override guards/interceptors via builder pattern'
  - 'auditTestProviders() + overrideAuditInterceptors() helpers for audit decorator support'
---

# Tech-Spec: Questionnaire Version Templating

**Created:** 2026-04-03

## Overview

### Problem Statement

Admins must build questionnaire schemas from scratch every time they create a new version, even when the structure is nearly identical to a previous version. This is tedious and error-prone for complex questionnaires with many sections, nested subsections, questions, weights, and dimension codes.

### Solution

Add a backend endpoint that creates a new DRAFT version by deep-copying the `schemaSnapshot` from an existing version within the same questionnaire. On the frontend, enhance the "Create Draft" flow with an optional template selection modal so admins can pick a past version as a starting point. The builder loads the new draft via the existing flow — no builder changes needed.

### Scope

**In Scope:**

- New API endpoint: `POST /questionnaires/:id/versions/from-template` accepting `{ sourceVersionId }`
- Deep-copy of `schemaSnapshot` JSON into a new DRAFT version
- Enforce existing single-draft rule (409 if a DRAFT already exists)
- Source version can be any non-DRAFT status (ACTIVE, DEPRECATED, ARCHIVED)
- Source version must belong to the same questionnaire
- Frontend: template selection modal on "Create Draft" click
- Frontend: dropdown lists non-DRAFT versions from existing version list hook
- Frontend: new mutation hook `useCreateVersionFromTemplate()`
- Frontend: navigate to builder with new draft's `versionId` after creation

**Out of Scope:**

- Cross-questionnaire-type templating (copying from a different questionnaire)
- Template library / browsing UI
- Changes to the questionnaire builder component itself
- Changes to the existing version creation or publishing flow
- Template metadata (name, description, tags) — no "saved templates" concept

## Context for Development

### Codebase Patterns

**Backend (api.faculytics):**

- Public service methods use PascalCase (e.g., `CreateVersion`, `PublishVersion`)
- DTOs split into `dto/requests/` and `dto/responses/`, use `class-validator` + `@ApiProperty`
- Response DTOs have a static `Map(entity)` factory method
- Controller endpoints decorated with `@ApiOperation`, `@ApiResponse`, `@ApiTags`
- Admin endpoints use `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN)`
- Cache invalidation via `cacheService.invalidateNamespace(CacheNamespace.QUESTIONNAIRE_VERSIONS)` after mutations
- `QuestionnaireVersion.schemaSnapshot` is a `json` column holding `QuestionnaireSchemaSnapshot`
- `CreateVersion()` at service:236 is the anchor method — enforces archived check, single-draft rule, auto-increments version number, persists, invalidates cache

**Frontend (app.faculytics):**

- Feature-sliced structure: `features/questionnaires/{api,hooks,store,components,types}/`
- API requests in `features/questionnaires/api/questionnaire.requests.ts`
- Mutation hooks wrap TanStack Query `useMutation` with cache invalidation
- Builder loads existing versions via `loadDraftFromServer()` in Zustand store
- `deserializeQuestionnaireVersionToDraft()` converts wire schema to editor state
- "Create Draft" button in `QuestionnaireListToolbar` navigates to `/superadmin/questionnaires/new?type=TYPE`
- Endpoints registered in `network/endpoints.ts`

### Files to Reference

| File                                                                         | Purpose                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `api: src/modules/questionnaires/services/questionnaire.service.ts`          | `CreateVersion()` — anchor method to model validation logic after                    |
| `api: src/modules/common/unit-of-work/index.ts`                              | `UnitOfWork` (default export) — transaction wrapper, inject into service constructor |
| `api: src/modules/questionnaires/questionnaire.controller.ts:153`            | `createVersion()` endpoint — pattern for new endpoint                                |
| `api: src/modules/questionnaires/dto/requests/create-version-request.dto.ts` | Existing DTO — reference for new DTO structure                                       |
| `api: src/entities/questionnaire-version.entity.ts`                          | Version entity — `schemaSnapshot: json`, `versionNumber`, `status`                   |
| `api: src/modules/questionnaires/lib/questionnaire.types.ts`                 | `QuestionnaireSchemaSnapshot`, `QuestionnaireStatus` types                           |
| `api: src/modules/questionnaires/services/questionnaire.service.spec.ts`     | Service tests — `createMockRepo()` pattern, mock setup                               |
| `api: src/modules/questionnaires/questionnaire.controller.spec.ts`           | Controller tests — guard/interceptor override pattern                                |
| `app: features/questionnaires/api/questionnaire.requests.ts`                 | API request functions — add new request here                                         |
| `app: features/questionnaires/hooks/`                                        | Mutation hooks — model new hook after existing patterns                              |
| `app: features/questionnaires/components/questionnaire-list-toolbar.tsx`     | "Create Draft" button — enhance with template modal                                  |
| `app: features/questionnaires/store/questionnaire-builder-store.ts`          | Zustand store — `loadDraftFromServer()` (no changes needed)                          |
| `app: network/endpoints.ts`                                                  | Endpoint registry — add new endpoint constant                                        |

### Technical Decisions

- **Backend copies, not frontend:** The API endpoint performs the deep-copy atomically. This ensures single-draft rule enforcement before copying and prevents stale/manipulated schemas.
- **Same-questionnaire only:** Source version must belong to the target questionnaire (`version.questionnaire.id === questionnaireId`). Cross-type templating deferred to avoid `meta.questionnaireType` mismatch complexity.
- **Reuse `CreateVersion()` internals:** The new `CreateVersionFromTemplate()` method mirrors the same draft-check + version-numbering + persist logic from `CreateVersion()`. The only difference is the schema source: fetched from an existing version instead of received in the request body.
- **Transaction wrapping:** `CreateVersionFromTemplate()` wraps all DB steps in `this.unitOfWork.runInTransaction(async (em) => { ... })` using the project's `UnitOfWork` pattern. All reads and writes inside the callback must use the forked `em` parameter (e.g., `em.findOne(Questionnaire, ...)`, `em.create(...)`, `em.persist(...)`) — NOT the injected repository instances, which are bound to the request-scoped EntityManager and would bypass the transaction. Cache invalidation goes AFTER `runInTransaction()` resolves to avoid invalidating before commit. The existing `CreateVersion()` has the same race-condition gap (no transaction, no partial unique index enforcing single-draft at DB level) but fixing it is out of scope for this PR.
- **Deep copy via `structuredClone()`:** `schemaSnapshot` is a plain JSON object. `structuredClone()` provides a safe deep copy with no prototype chain issues. Available natively in Node 17+. The `meta.version` field inside the snapshot is a schema format version (always `1`), not the questionnaire version number — it is copied as-is.
- **No new entities or repositories:** Purely a new service method + endpoint + DTO.
- **Frontend modal, not page:** A lightweight modal on "Create Draft" click — one extra decision point, then into the existing builder via the same `loadDraftFromServer()` path.

## Implementation Plan

### Tasks

#### Backend (api.faculytics)

- [x] Task 1: Create the request DTO
  - File: `src/modules/questionnaires/dto/requests/create-version-from-template-request.dto.ts` (NEW)
  - Action: Create a DTO with a single field `sourceVersionId: string` validated as `@IsUUID()` and `@IsNotEmpty()`, decorated with `@ApiProperty({ description: 'UUID of the version to copy the schema from' })`

- [x] Task 2: Add `CreateVersionFromTemplate()` service method
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Prerequisites: Add `UnitOfWork` as a constructor dependency via injection. **Important:** `UnitOfWork` is a **default export** — import as `import UnitOfWork from '../../common/unit-of-work'` (NOT a named import — the service is in `services/` subdir, so two levels up). Also import `Questionnaire`, `QuestionnaireVersion` entity classes for use with the forked `em`.
  - Action: Add a new public method `CreateVersionFromTemplate(questionnaireId: string, sourceVersionId: string)` structured as:

    ```typescript
    async CreateVersionFromTemplate(questionnaireId: string, sourceVersionId: string) {
      const versionId = await this.unitOfWork.runInTransaction(async (em) => {
        // ALL reads/writes inside use `em`, NOT injected repos (this.versionRepo, etc.)

        // 1. Fetch questionnaire (404 if not found, 400 if ARCHIVED)
        const questionnaire = await em.findOne(Questionnaire, questionnaireId, { populate: ['type'] });

        // 2. Fetch source version (404 if not found)
        const sourceVersion = await em.findOne(QuestionnaireVersion, sourceVersionId, { populate: ['questionnaire'] });

        // 3. Validate source belongs to same questionnaire (400 if mismatch)
        // 4. Validate source is not DRAFT (400)
        // 5. Enforce single-draft rule (409)
        const existingDraft = await em.findOne(QuestionnaireVersion, { questionnaire, status: QuestionnaireStatus.DRAFT });

        // 6. Determine next version number
        const latestVersion = await em.findOne(QuestionnaireVersion, { questionnaire }, { orderBy: { versionNumber: 'DESC' } });

        // 7. Deep-copy schema
        const schema = structuredClone(sourceVersion.schemaSnapshot);

        // 8. Create new version (MikroORM v6 em.create() defaults to managed: true, no em.persist() needed)
        const version = em.create(QuestionnaireVersion, { questionnaire, versionNumber, schemaSnapshot: schema, status: QuestionnaireStatus.DRAFT, isActive: false });

        // 9. Return the ID — NOT the entity (identity map isolation)
        return version.id;
      });

      // Cache invalidation AFTER transaction commits
      await this.cacheService.invalidateNamespace(CacheNamespace.QUESTIONNAIRE_VERSIONS);

      // Re-fetch with full populate for the response mapper (populating 'questionnaire.type'
      // also loads questionnaire.title as a side effect, which Map() needs)
      const version = await this.versionRepo.findOne(versionId, { populate: ['questionnaire.type'] });
      if (!version) {
        throw new NotFoundException(`Version ${versionId} not found after creation.`);
      }
      return version;
    }
    ```

  - Notes: The method mirrors `CreateVersion()` validation logic but wraps it in `unitOfWork.runInTransaction()` for atomicity. All DB operations inside the callback use the forked `em` parameter — never injected repository instances. The transaction returns only the version `id`; the fully-populated entity is fetched _after_ commit to avoid identity-map isolation issues (the forked `em`'s loaded relations don't carry over). Cache invalidation is placed after `runInTransaction()` resolves so readers never see stale pre-commit data. The existing `CreateVersion()` has the same race-condition gap but fixing it is out of scope for this PR.

- [x] Task 3: Add controller endpoint
  - File: `src/modules/questionnaires/questionnaire.controller.ts`
  - Action: Add a new endpoint directly after the existing `createVersion()` method:
    ```typescript
    @Post(':id/versions/from-template')
    @UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Create a new version from an existing version template' })
    @ApiResponse({ status: 201, description: 'Version created from template', type: QuestionnaireVersionDetailResponse })
    @ApiResponse({ status: 400, description: 'Source version is a draft, archived questionnaire, or belongs to different questionnaire' })
    @ApiResponse({ status: 404, description: 'Questionnaire or source version not found' })
    @ApiResponse({ status: 409, description: 'Draft version already exists' })
    async createVersionFromTemplate(
      @Param('id') id: string,
      @Body() data: CreateVersionFromTemplateRequest,
    ): Promise<QuestionnaireVersionDetailResponse> {
      const version = await this.questionnaireService.CreateVersionFromTemplate(id, data.sourceVersionId);
      return QuestionnaireVersionDetailResponse.Map(version);
    }
    ```
  - Notes: Add import for `CreateVersionFromTemplateRequest` at the top of the file. The endpoint is protected with `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN)` since only admins manage questionnaire versions. Note: the existing `createVersion` endpoint is currently unguarded — that is a pre-existing issue and out of scope for this PR.

- [x] Task 4: Add service unit tests
  - File: `src/modules/questionnaires/services/questionnaire.service.spec.ts`
  - Prerequisites: Add a `UnitOfWork` mock provider to the `beforeEach` block so the entire test suite doesn't break (Task 2 adds `UnitOfWork` as a constructor dependency):

    ```typescript
    // In beforeEach, create a mock transactional EntityManager:
    const mockTransactionalEm = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((Entity, data) => ({ ...data, id: 'new-version-id' })),
    };

    // Add to providers array:
    {
      provide: UnitOfWork,  // default import: import UnitOfWork from '../common/unit-of-work'
      useValue: {
        runInTransaction: jest.fn().mockImplementation((cb) => cb(mockTransactionalEm)),
      },
    }
    ```

    Note: `UnitOfWork` is a **default export** — import as `import UnitOfWork from '../../common/unit-of-work'`.

  - Action: Add a `describe('CreateVersionFromTemplate')` block with tests for:
    1. **Happy path:** configure `mockTransactionalEm.findOne` with `mockResolvedValueOnce` chaining for the 4 sequential queries (questionnaire, source version, draft check → null, latest version). Verify `mockTransactionalEm.create` is called with the deep-copied schema and correct version number. Verify `versionRepo.findOne` is called after the transaction with the returned ID and `populate: ['questionnaire.type']`.
    2. **404 — questionnaire not found:** `mockTransactionalEm.findOne` returns null on first call → throws `NotFoundException`
    3. **400 — archived questionnaire:** questionnaire has `status: ARCHIVED` → throws `BadRequestException`
    4. **404 — source version not found:** `mockTransactionalEm.findOne` returns null on second call → throws `NotFoundException`
    5. **400 — source belongs to different questionnaire:** source version's `questionnaire.id` differs → throws `BadRequestException`
    6. **400 — source is a DRAFT:** source version has `status: DRAFT` → throws `BadRequestException`
    7. **409 — draft already exists:** `mockTransactionalEm.findOne` returns a draft on third call → throws `ConflictException`
    8. **Happy path — cache invalidation assertion:** within the happy-path test (test 1), also verify `cacheService.invalidateNamespace` is called with `CacheNamespace.QUESTIONNAIRE_VERSIONS` after the transaction succeeds
  - Notes: All reads inside the transaction use `mockTransactionalEm.findOne`, NOT the injected `versionRepo` or `questionnaireRepo`. The injected `versionRepo.findOne` is only used for the post-commit re-fetch. Use `mockResolvedValueOnce` chaining on `mockTransactionalEm.findOne` to control each sequential query's return value.

- [x] Task 5: Add controller unit tests
  - File: `src/modules/questionnaires/questionnaire.controller.spec.ts`
  - Action: Add `CreateVersionFromTemplate: jest.fn()` to the mock service value object in **all four existing `describe` blocks'** `beforeEach` setups (each block independently creates its own mock — they all need the new method to avoid missing-dependency errors). Add a new test in a `describe('createVersionFromTemplate')` block that verifies the endpoint calls `CreateVersionFromTemplate` with correct args and maps the response via `QuestionnaireVersionDetailResponse.Map`.

#### Frontend (app.faculytics)

- [x] Task 6: Add endpoint constant
  - File: `network/endpoints.ts`
  - Action: Add a new enum member to the existing endpoints enum, following the established pattern of static strings with `:id` placeholders. E.g.: `questionnaireVersionFromTemplate = "/api/v1/questionnaires/:id/versions/from-template"`. The request function (Task 7) will call `.replace(":id", questionnaireId)` at the call site.

- [x] Task 7: Add API request function
  - File: `features/questionnaires/api/questionnaire.requests.ts`
  - Action: Add a `createVersionFromTemplate(questionnaireId: string, sourceVersionId: string)` function that POSTs to the new endpoint with `{ sourceVersionId }` body. Returns `QuestionnaireVersionDetail`.

- [x] Task 8: Add mutation hook
  - File: `features/questionnaires/hooks/use-create-version-from-template.ts` (NEW)
  - Action: Create a TanStack Query `useMutation` hook wrapping `createVersionFromTemplate()`. On success, invalidate the questionnaire versions query cache (follow existing mutation hook patterns for cache invalidation).

- [x] Task 9: Thread props and add template selection modal
  - Files:
    - `features/questionnaires/components/questionnaire-list-toolbar.tsx` — add modal, new props, refactor navigation
    - `app/(dashboard)/superadmin/questionnaires/_components/questionnaire-list-screen.tsx` — thread new props from hook data down to toolbar (this is the immediate parent that renders `QuestionnaireListToolbar`)
    - `app/(dashboard)/superadmin/questionnaires/page.tsx` — pass `questionnaireId` and version data from the page hook output to `QuestionnaireListScreen` props
  - Action:
    1. **Thread new props through the component chain (page → screen → toolbar):**
       - The `questionnaireId` value comes from `activeTypeSummary?.questionnaireId` in the `useQuestionnaireListPage` hook return. The page component (`page.tsx`) must extract this and pass it as a prop to `QuestionnaireListScreen`.
       - `QuestionnaireListScreen` receives the new props and passes them down to `QuestionnaireListToolbar`.
       - The toolbar receives two new props:
         - `questionnaireId: string | null` — needed for the mutation call. **The toolbar must guard against null** (disable the template option when `questionnaireId` is null — this means no questionnaire exists for the type yet).
         - `templateVersions: VersionItem[]` — non-DRAFT versions derived from the **unfiltered** version rows (NOT `filteredRows`), so that search/status filters don't affect which templates are available. Filter: `v.status !== 'DRAFT'`.
    2. **Modify "Create Draft" button behavior:**
       - If `templateVersions.length > 0`, clicking "Create Draft" opens a dialog/modal
       - The modal offers two choices:
         - "Start from scratch" → navigates to `/superadmin/questionnaires/new?type=TYPE` (existing flow)
         - "Use a previous version as template" → shows a dropdown of template versions (version number, status, publishedAt date)
       - On template selection + confirm → calls `createVersionFromTemplate` mutation with `questionnaireId` and selected `sourceVersionId` → on success, navigates to `/superadmin/questionnaires/new?type=TYPE&versionId={newVersion.id}` (the `versionId` query param is required for the builder to call `loadDraftFromServer()` and load the newly created draft; without it the builder opens blank)
       - If `templateVersions.length === 0`, the button behaves exactly as it does today (direct navigation, no modal)
    3. **Refactor "Create Draft" button navigation:** The current toolbar renders the "Create Draft" button as a `<Link>` component (declarative navigation). Since the modal flow requires an async mutation before navigating, replace the `<Link>` with a `<Button onClick={...}>` and use `useRouter().push()` for imperative navigation after the mutation succeeds (or for the "Start from scratch" path). Import `useRouter` from `next/navigation` in the toolbar.
    4. **Loading state:** Disable the confirm button and show a spinner while the mutation is pending. Use `isPending` from the mutation hook to prevent double-clicks.
    5. **Error handling:** On mutation error, show a toast. On 409, show "A draft already exists — edit it or deprecate it first." On other errors, show generic "Failed to create version from template."
  - Notes: The `useQuestionnaireVersions` hook already returns `status`, `publishedAt`, and `createdAt` per version — no hook modifications needed. The "Create Draft" button is already hidden when `hasDraftVersion` is true, so the 409 error path is purely a server-side safety net — the frontend prevents this scenario by conditionally rendering the button. The modal is only shown when the button is visible (no draft exists) AND template versions are available.

### Acceptance Criteria

**Backend:**

- [ ] AC 1: Given a questionnaire with an ACTIVE version (v1), when an admin POSTs to `/questionnaires/:id/versions/from-template` with `{ sourceVersionId: v1.id }`, then a new DRAFT version (v2) is created with `schemaSnapshot` identical to v1's schema, `status: DRAFT`, `isActive: false`, and `versionNumber: 2`.

- [ ] AC 2: Given a questionnaire with a DEPRECATED version (v1) and an ACTIVE version (v2), when an admin uses v1 as a template, then a new DRAFT version (v3) is created with v1's schema — deprecated versions are valid template sources.

- [ ] AC 3: Given a questionnaire that already has a DRAFT version, when an admin tries to create a version from template, then a 409 Conflict is returned with message "A draft version already exists for this questionnaire."

- [ ] AC 4: Given a source version that belongs to a different questionnaire, when an admin tries to use it as a template, then a 400 Bad Request is returned.

- [ ] AC 5: Given a source version with status DRAFT, when an admin tries to use it as a template, then a 400 Bad Request is returned with message "Cannot use a draft version as a template."

- [ ] AC 6: Given an ARCHIVED questionnaire, when an admin tries to create a version from template, then a 400 Bad Request is returned.

- [ ] AC 7: Given a non-existent questionnaire ID or source version ID, when an admin calls the endpoint, then a 404 Not Found is returned.

- [ ] AC 8: Given a successful template creation, when the new draft's schema is subsequently modified in the builder, then the source version's schema remains unchanged (deep copy verified).

**Frontend:**

- [ ] AC 9: Given an admin on the questionnaire management page with a type that has previous versions, when they click "Create Draft", then a modal appears offering "Start from scratch" or "Use a previous version as template."

- [ ] AC 10: Given the template modal is open, when the admin selects a previous version and confirms, then a new draft is created via the API and the builder opens with the pre-populated schema.

- [ ] AC 11: Given a questionnaire type with no previous versions, when the admin clicks "Create Draft", then the existing direct navigation flow is used (no modal).

## Additional Context

### Dependencies

- No new npm packages required (backend or frontend)
- No database migrations needed
- No new environment variables
- Backend endpoint must be deployed before the frontend modal can be used

### Testing Strategy

**Unit Tests (Backend):**

- `questionnaire.service.spec.ts`: 8 test cases covering happy path, all error conditions, and deep-copy verification (Task 4)
- `questionnaire.controller.spec.ts`: 1-2 test cases verifying endpoint wiring and response mapping (Task 5)

**Manual Testing:**

1. Create a questionnaire with an ACTIVE version containing sections, questions, and weights
2. Call `POST /questionnaires/:id/versions/from-template` with the active version's ID
3. Verify the new DRAFT version has an identical schema via `GET /questionnaires/versions/:newId`
4. Edit the new draft's schema and verify the source version's schema is unchanged
5. Try creating another version from template while a draft exists — verify 409
6. Try using a draft version as source — verify 400
7. Try using a version from a different questionnaire — verify 400
8. Frontend: click "Create Draft" with previous versions available → verify modal appears
9. Frontend: select a template version → verify builder opens with pre-populated schema

### Notes

- The `schemaSnapshot` JSON includes `meta.questionnaireType` which stays consistent since we're scoping to same-questionnaire-only
- `QuestionnaireVersion` is immutable once submissions exist, but we're copying FROM it (not modifying it), so no immutability concerns
- The frontend builder doesn't need to know the draft came from a template — it loads via the same `loadDraftFromServer()` path
- If a future need arises for cross-type templating, the service method can be extended with an optional `targetQuestionnaireType` parameter that remaps `meta.questionnaireType` in the copied schema
- The shared logic between `CreateVersion()` and `CreateVersionFromTemplate()` (draft check, version numbering, persist) could be extracted to a private helper if a third call site emerges
- The 409 "draft already exists" error is purely a server-side safety net — the frontend hides the "Create Draft" button (and thus the template modal) when `hasDraftVersion` is true, so this path should never be triggered by normal UI usage

## Review Notes

### Backend (Tasks 1-5)

- Adversarial review completed
- Findings: 14 total, 1 fixed, 13 skipped (noise/invalid/out-of-scope)
- Resolution approach: auto-fix
- Fixed: F12 — removed redundant `@IsNotEmpty()` decorator from DTO (already covered by `@IsUUID()`)
- Notable out-of-scope: F1 (race condition on single-draft rule) — pre-existing gap shared with `CreateVersion()`, acknowledged in tech-spec

### Frontend (Tasks 6-9)

- All tasks implemented: endpoint constant, API request, mutation hook, template modal
- TypeScript typecheck: clean
- ESLint: clean
- Template modal uses toggle buttons (scratch vs template) since RadioGroup component not in shadcn registry
- `templateVersions` derived from unfiltered `rows` in screen component to avoid filter interference
