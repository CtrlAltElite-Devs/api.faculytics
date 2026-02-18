---
title: 'Questionnaire Versioning'
slug: 'questionnaire-versioning'
created: 'Tuesday, February 17, 2026'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS',
    'MikroORM',
    'TypeScript',
    'class-validator',
    '@nestjs/swagger',
    'csv-parser',
    'exceljs',
    'uuid',
    'p-limit',
  ]
files_to_modify:
  [
    'src/modules/questionnaires/questionnaire.types.ts',
    'src/modules/questionnaires/services/questionnaire.service.ts',
    'src/modules/questionnaires/questionnaire.controller.ts',
  ]
code_patterns:
  [
    'Modular Structure',
    'Service/Controller/Repository',
    'Entity-based Data Model',
    'Schema Validation',
    'Scoring Logic',
    'Ingestion Adapters',
    'Async/Stream Processing',
    'Data Snapshotting',
  ]
test_patterns:
  [
    'Unit Testing (Jest)',
    'Dependency Mocking',
    'Exception Testing',
    'Data Setup',
    'Stream Processing Testing',
    'Backpressure Testing',
  ]
---

# Tech-Spec: Questionnaire Versioning

**Created:** Tuesday, February 17, 2026

## Overview

### Problem Statement

The current system lacks a mechanism to manage different iterations of questionnaires over time, leading to potential issues with data consistency, historical analysis, and controlled deployment of assessment changes.

### Solution

Implement a versioning system for questionnaires, allowing for distinct lifecycle states (Draft, Active, Deprecated), controlled transitions, and strict linking of submissions to the questionnaire version they were made against. This will enable clear historical data comparison and managed deployment of questionnaire updates.

### Scope

**In Scope:**

- Defining questionnaire version states: Draft, Active, Deprecated.
- Managing transitions between these states, including a manual transition from Active to Deprecated at the user's discretion.
- Enforcing only one drafted copy for a specific questionnaire type at any given time.
- Ensuring submissions are permanently linked to the specific questionnaire version.
- Allowing editing only for Draft versions.
- Restricting submissions to Active versions only.
- Maintaining accessibility of historical submissions for comparison, with the deciding query factor being the dimension (registry-backed).
- Implementing strict incremental semantic versioning (v1, v2, v3...), with no version skipping enforced.

**Out of Scope:**

- Detailed implementation of "File-to-Questionnaire Mapping" (deferred for a later session; strict headers for Excel/CSV files will be enforced for now).
- Any complex merging or migration of historical submission data between different questionnaire versions (beyond simple accessibility).
- Complex branching or merging of questionnaire versions.

## Context for Development

### Codebase Patterns

- **Modular Structure**: The `questionnaires` module (`src/modules/questionnaires`) encapsulates all related logic (controllers, services, DTOs, entities).
- **Service/Controller/Repository**: Adheres to standard NestJS architecture, using `@InjectRepository` for MikroORM for data access.
- **Entity-based Data Model**: Core entities `Questionnaire`, `QuestionnaireVersion`, `QuestionnaireSubmission`, `QuestionnaireAnswer`, `Dimension`, and `Enrollment` are managed by MikroORM.
- **Schema Validation**: A dedicated `QuestionnaireSchemaValidator` service enforces complex rules on the `QuestionnaireSchemaSnapshot`, including dimension code validation.
- **Scoring Logic**: A separate `ScoringService` handles score calculations based on the questionnaire schema.
- **Ingestion Adapters**: Clear separation of concerns for file ingestion (CSV, Excel) using a `SourceAdapter` interface and `SourceAdapterFactory`, processing data as `AsyncIterable`.
- **Data Snapshotting**: `QuestionnaireSchemaSnapshot` is stored directly with `QuestionnaireVersion`, ensuring immutability and historical accuracy of questionnaire structure.

### Files to Reference

| File                                                                          | Purpose                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/questionnaires/questionnaire.controller.ts`                      | Handles API endpoints for questionnaire and version creation, publishing, and submission.                                                                                                             |
| `src/modules/questionnaires/questionnaire.types.ts`                           | Defines enums (`QuestionnaireType`, `QuestionType`, `QuestionnaireStatus` - to be updated) and interfaces (`QuestionNode`, `SectionNode`, `QuestionnaireSchemaSnapshot`) for questionnaire structure. |
| `src/modules/questionnaires/services/questionnaire.service.ts`                | Contains core business logic for questionnaire and version management, including submission processing.                                                                                               |
| `src/modules/questionnaires/services/questionnaire-schema.validator.ts`       | Validates the integrity and correctness of questionnaire schemas.                                                                                                                                     |
| `src/modules/questionnaires/questionnaires.module.ts`                         | NestJS module definition, registers components and MikroORM entities.                                                                                                                                 |
| `src/entities/questionnaire.entity.ts`                                        | MikroORM entity for the base questionnaire.                                                                                                                                                           |
| `src/entities/questionnaire-version.entity.ts`                                | MikroORM entity for questionnaire versions, stores `schemaSnapshot`.                                                                                                                                  |
| `src/entities/questionnaire-submission.entity.ts`                             | MikroORM entity for submitted questionnaires, linked to `QuestionnaireVersion`.                                                                                                                       |
| `src/entities/dimension.entity.ts`                                            | MikroORM entity for dimensions, used by `QuestionnaireSchemaValidator` for dimension code validation.                                                                                                 |
| `src/modules/questionnaires/dto/requests/create-questionnaire-request.dto.ts` | DTO for creating a new questionnaire.                                                                                                                                                                 |
| `src/modules/questionnaires/dto/requests/create-version-request.dto.ts`       | DTO for creating a new questionnaire version.                                                                                                                                                         |
| `src/modules/questionnaires/dto/requests/submit-questionnaire-request.dto.ts` | DTO for submitting a questionnaire.                                                                                                                                                                   |

### Technical Decisions

- **Questionnaire Status Alignment**: The existing `QuestionnaireStatus` enum (`DRAFT`, `PUBLISHED`, `ARCHIVED`) in `questionnaire.types.ts` will be aligned with the new lifecycle states: `DRAFT`, `ACTIVE`, `DEPRECATED`. This will involve updating the enum and mapping `PUBLISHED` to `ACTIVE`, and potentially `ARCHIVED` to `DEPRECATED` or introducing `DEPRECATED` as a new state.
- **Deprecation Safeguards (UI/Global Control):**
  - The UI will provide warnings to administrators regarding the consequences of deprecating an Active version (e.g., number of existing submissions, in-progress forms).
  - A global activation/deactivation mechanism will be implemented for active forms, complementing the individual version states.
  - Correctness of a version is assumed to be enforced institutionally prior to activation.
- **Historical Data Querying (Dimension-backed):**
  - Historical submissions will be queryable using a dimension-backed approach, relying on a registry of standardized dimensions. The `QuestionnaireSchemaValidator` already validates against `DimensionRepository`, confirming the existence of a registry for dimensions. This ensures data consistency and comparability across different questionnaire versions, even if underlying question structures evolve.
- **User Experience for Deprecated Versions:**
  - Users attempting to access a deprecated questionnaire version will receive a clear message indicating its status and will be directed to the updated active version (if one exists).

## Implementation Plan

### Tasks

- [x] Task 1: Update `QuestionnaireStatus` Enum
  - File: `src/modules/questionnaires/questionnaire.types.ts`
  - Action: Modify `QuestionnaireStatus` enum. Rename `PUBLISHED` to `ACTIVE` and add a new state `DEPRECATED`.
  - Notes: Ensure all references to `PUBLISHED` in the codebase are updated to `ACTIVE`.

- [x] Task 2: Implement `deprecateVersion` in `QuestionnaireService`
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: Add a new `async` method `deprecateVersion(versionId: string)` that:
    - Fetches the `QuestionnaireVersion` by `versionId` using `this.versionRepo.findOne()`. Populate its associated `questionnaire`.
    - Throws `NotFoundException` if the version is not found.
    - Throws `BadRequestException` if the version is already `DEPRECATED` (check against the updated enum).
    - Sets `version.isActive = false`.
    - Updates `version.status` to `QuestionnaireStatus.DEPRECATED`.
    - Persists (`this.em.persist(version)`) and flushes (`await this.em.flush()`) the changes.
  - Notes: This method implements the core logic for manual deprecation.

- [x] Task 3: Add `deprecateVersion` Endpoint to `QuestionnaireController`
  - File: `src/modules/questionnaires/questionnaire.controller.ts`
  - Action: Add a new `PATCH` endpoint:
    ```typescript
    @Patch('versions/:versionId/deprecate')
    @ApiOperation({ summary: 'Deprecate a questionnaire version' })
    async deprecateVersion(@Param('versionId') versionId: string) {
      return this.questionnaireService.deprecateVersion(versionId);
    }
    ```
  - Notes: This exposes the deprecation functionality via the API.

- [x] Task 4: Enforce "Single Draft Copy" Rule in `createVersion`
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: Modify the `createVersion` method. Before creating a new version, add a check:
    - Find if an existing `QuestionnaireVersion` for the same `questionnaireId` has `status: QuestionnaireStatus.DRAFT`.
    - If such a version is found, throw a `ConflictException` with a message like 'A draft version already exists for this questionnaire.'
  - Notes: This ensures only one active draft per questionnaire.

- [x] Task 5: Review and Adjust `createVersion` for "No Version Skipping"
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: The current logic for `nextVersionNumber` (`latestVersion ? latestVersion.versionNumber + 1 : 1`) inherently enforces no skipping. Ensure no external parameter could override this, which is currently not the case. No explicit code change needed for this specific `createVersion` logic based on current interpretation.
  - Notes: The `QuestionnaireSchemaSnapshot` has a `version` field in its `meta`, which currently isn't used to set `versionNumber` in `createVersion`. This field's purpose should be clarified (e.g., if it's meant for internal tracking within the schema definition, or if it could potentially be used for version comparison/validation if externally provided). For now, the database's auto-incrementing of `versionNumber` from the latest existing version is what enforces no skipping.

- [x] Task 6: Update `publishVersion` to use `ACTIVE` Status
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: In the `publishVersion` method:
    - Ensure `version.isActive = true;` is correctly set.
    - Update `version.questionnaire.status = QuestionnaireStatus.ACTIVE;` (assuming `ACTIVE` replaces `PUBLISHED` in the enum).
    - If `currentActive` is found, ensure `currentActive.isActive = false;` and `currentActive.status = QuestionnaireStatus.DEPRECATED;` (this implements the transition logic).
  - Notes: This aligns the system's state with the new enum and handles the transition from active to deprecated for the previous active version.

- [x] Task 7: Implement Endpoint for Latest Active Version Retrieval
  - File: `src/modules/questionnaires/questionnaire.controller.ts` (new endpoint) and `src/modules/questionnaires/services/questionnaire.service.ts` (new method).
  - Action:
    - In `QuestionnaireService`: Add a new method `getLatestActiveVersion(questionnaireId: string): Promise<QuestionnaireVersion | null>` that retrieves the `QuestionnaireVersion` for a given questionnaire with `isActive: true`.
    - In `QuestionnaireController`: Add a new `GET` endpoint (e.g., `/questionnaires/:id/latest-active-version`) to expose this functionality.
  - Notes: This supports the UI's redirection for deprecated versions.

### Acceptance Criteria

- **AC1: Deprecation Warning & Global Control:**
  - Given an administrator attempts to manually deprecate an active questionnaire version,
  - When the action is initiated,
  - Then a warning message is displayed showing the number of active submissions and in-progress forms associated with that version,
  - And the admin must explicitly confirm the action.
  - Given an active form,
  - When a global deactivation is performed,
  - Then the form becomes inactive regardless of its version state, and no new submissions are accepted.
- **AC2: Single Draft Enforcement:**
  - Given a questionnaire type,
  - When a new `QuestionnaireVersion` with `QuestionnaireStatus.DRAFT` is created for that type,
  - Then no other `QuestionnaireVersion` with `QuestionnaireStatus.DRAFT` can exist simultaneously for the same `Questionnaire`.
  - When a `QuestionnaireVersion` with `QuestionnaireStatus.DRAFT` already exists and an attempt is made to create another,
  - Then the system prevents the creation and informs the user.
- **AC3: Strict Semantic Versioning Enforcement:**
  - Given a `Questionnaire` with `QuestionnaireVersion` v1,
  - When an admin attempts to create `QuestionnaireVersion` v3 without v2,
  - Then the system prevents version skipping and enforces sequential versioning (v1 -> v2 -> v3...).
- **AC4: Historical Submission Accessibility:**
  - Given multiple `QuestionnaireVersion`s exist (e.g., v1, v2, v3) with submissions linked to each,
  - When historical data is queried,
  - Then data from all versions is accessible and consistently queryable through registered dimensions (verified against `DimensionRepository`).
- **AC5: Deprecated Version User Experience:**
  - Given a user attempts to access a `QuestionnaireVersion` that has been deprecated,
  - When the request is made,
  - Then a clear message is displayed indicating the version is no longer active,
  - And the user is automatically redirected to the latest `ACTIVE` version of that questionnaire (if available).
- **AC6: QuestionnaireStatus Alignment:**
  - Given the existing `QuestionnaireStatus.PUBLISHED` in `questionnaire.types.ts`,
  - When the system needs to represent an `ACTIVE` version,
  - Then `QuestionnaireStatus.PUBLISHED` will be mapped to `ACTIVE`.
  - When a version is manually deprecated,
  - Then its status will be set to `QuestionnaireStatus.DEPRECATED` (a new or re-purposed state).

## Additional Context

### Dependencies

- **Existing**: NestJS core modules, MikroORM, `class-validator`, `uuid`.
- **New (Implicit)**: UI changes to implement admin warnings for deprecation (AC1) and redirection for deprecated versions (AC5).
- **Data Consistency**: Reliance on the existing `DimensionRepository` for validating dimension codes, which underpins the historical data querying (AC4).

### Testing Strategy

- **Unit Tests**: Comprehensive unit tests (`*.spec.ts`) for `QuestionnaireService` to cover:
  - Successful `deprecateVersion` and `publishVersion` scenarios.
  - Error handling for `deprecateVersion` (e.g., not found, already deprecated).
  - `createVersion` enforcing single draft and (implicitly) no version skipping.
  - Correct state transitions and `isActive` flags after `publish` and `deprecate`.
  - New `getLatestActiveVersion` method.
- **Integration Tests**: Additions to `questionnaire.controller.spec.ts` to test:
  - `POST /questionnaires/:id/versions` (single draft enforcement).
  - `PATCH /questionnaires/versions/:versionId/publish` (state transitions).
  - `PATCH /questionnaires/versions/:versionId/deprecate` (manual deprecation).
  - `GET /questionnaires/:id/latest-active-version`.
- **End-to-End Tests**: Scenarios to verify:
  - Admin workflow for creating, publishing, and deprecating versions, including UI warnings (if applicable to E2E scope).
  - User experience when attempting to access deprecated versions (redirection to latest active).
  - Submission behavior against active/deprecated versions.
  - Historical query functionality based on dimensions.

### Notes

- The `QuestionnaireSchemaSnapshot` currently includes `meta.version: number`. This value is not currently used to set the `versionNumber` for `QuestionnaireVersion` entities. It's automatically incremented by the service. A decision should be made if `schema.meta.version` should be used for validation or if it's purely informational within the schema itself. For this spec, we rely on the service to determine the `versionNumber` sequentially.
- The UI implementation of warnings (AC1) and redirection (AC5) is critical for a good user experience and system safety.
- Global activation/deactivation (AC1) also needs UI integration and a clear definition of its scope (e.g., does it prevent access to _all_ versions of a questionnaire, regardless of individual version status?).

## Review Notes

- Adversarial review completed
- Findings: 10 total, 5 fixed, 3 not applicable (noise/validator mocked), 2 skipped (undecided/noise)
- Resolution approach: auto-fix

### Fixes Applied:

- F1: Created database migration for `QuestionnaireVersion.status` field
- F2: Renamed `publishVersion` to `PublishVersion` for naming consistency
- F3: Added `@ApiResponse` decorators to all new endpoints
- F4: Updated `DeprecateVersion` to set parent `questionnaire.status` to DEPRECATED when no active versions remain

### Notes:

- F9 (Integration/E2E tests): Deferred to separate task per project workflow
- Migration file: `Migration20260217152408_add-questionnaire-version-status.ts`
