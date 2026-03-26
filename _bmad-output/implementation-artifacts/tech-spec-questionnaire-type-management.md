---
title: 'Questionnaire Type Management'
slug: 'questionnaire-type-management'
created: '2026-03-26'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - NestJS
  - MikroORM
  - PostgreSQL
  - class-validator
  - class-transformer
  - uuid (v4 via CustomBaseEntity)
files_to_modify:
  - src/modules/questionnaires/lib/questionnaire.types.ts
  - src/entities/questionnaire.entity.ts
  - src/entities/dimension.entity.ts
  - src/entities/index.entity.ts
  - src/modules/questionnaires/services/questionnaire.service.ts
  - src/modules/questionnaires/questionnaire.controller.ts
  - src/modules/questionnaires/dto/requests/create-questionnaire-request.dto.ts
  - src/modules/questionnaires/dto/requests/get-versions-by-type-request.dto.ts
  - src/modules/questionnaires/dto/responses/questionnaire-type-response.dto.ts
  - src/modules/questionnaires/dto/responses/questionnaire-response.dto.ts
  - src/modules/questionnaires/dto/responses/questionnaire-version-detail-response.dto.ts
  - src/modules/questionnaires/dto/responses/questionnaire-version-response.dto.ts
  - src/seeders/infrastructure/questionnaire.seeder.ts
  - src/seeders/infrastructure/dimension.seeder.ts
  - src/seeders/infrastructure/infrastructure.seeder.ts
  - src/modules/questionnaires/questionnaires.module.ts
  - src/modules/questionnaires/services/__tests__/questionnaire-types.spec.ts
  - src/modules/questionnaires/lib/schemas/faculty-in-classroom.schema.ts
  - src/modules/questionnaires/lib/schemas/faculty-out-of-classroom.schema.ts
  - src/modules/questionnaires/lib/schemas/faculty-feedback.schema.ts
  - src/modules/questionnaires/lib/dimension.constants.ts
  - src/modules/dimensions/dto/requests/create-dimension.request.dto.ts
  - src/modules/dimensions/dto/requests/list-dimensions-query.dto.ts
  - src/modules/dimensions/dto/responses/dimension.response.dto.ts
  - src/modules/dimensions/services/dimensions.service.ts
  - src/modules/dimensions/dimensions.module.ts
  - src/modules/dimensions/services/dimensions.service.spec.ts
  - src/modules/questionnaires/questionnaire.controller.spec.ts
  - src/modules/questionnaires/services/questionnaire-schema.validator.spec.ts
  - src/modules/questionnaires/services/scoring.service.spec.ts
files_to_create:
  - src/entities/questionnaire-type.entity.ts
  - src/repositories/questionnaire-type.repository.ts
  - src/modules/questionnaires/services/questionnaire-type.service.ts
  - src/modules/questionnaires/questionnaire-type.controller.ts
  - src/modules/questionnaires/dto/requests/create-questionnaire-type-request.dto.ts
  - src/modules/questionnaires/dto/requests/update-questionnaire-type-request.dto.ts
  - src/modules/questionnaires/dto/requests/list-questionnaire-types-query.dto.ts
  - src/modules/questionnaires/dto/responses/questionnaire-type-detail-response.dto.ts
  - src/modules/questionnaires/services/__tests__/questionnaire-type.service.spec.ts
  - src/seeders/infrastructure/questionnaire-type.seeder.ts
  - src/migrations/MigrationXXX_questionnaire_type_entity.ts
code_patterns:
  - 'Entity + Custom Repository pattern (EntityRepository<T> in src/repositories/)'
  - 'CustomBaseEntity with UUID PK (v4), createdAt, updatedAt, deletedAt, SoftDelete()'
  - '@UseJwtGuard(UserRole.SUPER_ADMIN) for admin-only endpoint protection'
  - 'CacheService with namespace-based invalidation (wrap/invalidateNamespace/invalidateNamespaces)'
  - 'DTO request/response pattern with class-validator (@IsString, @IsNotEmpty, @IsUUID, @IsOptional)'
  - 'Response DTOs use static Map(entity) factory methods'
  - 'Module registers entities via MikroOrmModule.forFeature([])'
  - 'Entity index barrel exports in src/entities/index.entity.ts (named exports + entities array)'
  - 'Seeder extends Seeder class, receives EntityManager, uses idempotent find-or-create pattern'
test_patterns:
  - 'NestJS TestingModule with Jest mocks'
  - 'Mock repos via getRepositoryToken(Entity) with create/findOne/findAll/find stubs'
  - 'CacheService mock: wrap calls fn() directly, invalidate methods are jest.fn()'
  - 'Existing test suite at services/__tests__/questionnaire-types.spec.ts (needs full rewrite)'
---

# Tech-Spec: Questionnaire Type Management

**Created:** 2026-03-26

## Overview

### Problem Statement

The `QuestionnaireType` is currently a hardcoded TypeScript enum with 3 fixed values (`FACULTY_IN_CLASSROOM`, `FACULTY_OUT_OF_CLASSROOM`, `FACULTY_FEEDBACK`). This is enforced at the database level via PostgreSQL CHECK constraints on the `questionnaire.type` and `dimension.questionnaire_type` columns. Institutions cannot define custom evaluation types (e.g., "Peer Teaching Review", "Staff Satisfaction") without modifying source code and running new migrations.

### Solution

Replace the `QuestionnaireType` enum with a database-backed `QuestionnaireType` entity. The existing 3 types become seed rows marked as system types (`isSystem: true`). A new CRUD controller allows SuperAdmins to create, read, update, and soft-delete custom questionnaire types. The `Questionnaire` and `Dimension` entities switch from enum columns to `ManyToOne` FK relationships to the new entity.

### Scope

**In Scope:**

- New `QuestionnaireType` entity with `name`, `code`, `description`, `isSystem` fields
- Safe CRUD endpoints for questionnaire type management (SuperAdmin only)
- Migration from enum to entity on `Questionnaire` and `Dimension` entities
- Updated `QuestionnaireSchemaSnapshot` interface (`meta.questionnaireType` becomes `string`)
- Updated infrastructure seeder to create entity rows
- Updated DTOs, service methods, and schema validator
- Database migration (clean wipe strategy — team drops local DBs)

**Out of Scope:**

- API versioning (v2 endpoints) — not needed in beta phase
- Relaxing the one-to-one relationship (one type = one questionnaire)
- Changes to the analysis module (no type references exist there)
- Changes to QuestionnaireVersion entity (references questionnaire, not type)
- Changes to submissions (reference version, not type)
- Frontend changes (separate concern)

## Context for Development

### Codebase Patterns

- All entities extend `CustomBaseEntity` with UUID PK, timestamps, and soft delete
- Entities specify custom repositories: `@Entity({ repository: () => XRepository })`
- Endpoints are protected with `@UseJwtGuard(UserRole.SUPER_ADMIN)`
- Caching uses `CacheService` with namespace-based invalidation (1-hour TTL for type listings)
- Environment configuration uses Zod schemas
- DTOs use `class-validator` decorators for request validation

### Files to Reference

**Modify:**

| File                                                                          | Purpose                                                                                                                     | Key Changes                                                                                                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/questionnaires/lib/questionnaire.types.ts`                       | Enum definition + `QuestionnaireSchemaSnapshot` interface                                                                   | Delete `QuestionnaireType` enum; change `meta.questionnaireType` type from enum to `string`                                                             |
| `src/entities/questionnaire.entity.ts`                                        | `Questionnaire` entity                                                                                                      | Replace `@Enum(() => QuestionnaireType) type!` with `@ManyToOne(() => QuestionnaireType) type!`; add `@Unique({ properties: ['type'] })` for one-to-one |
| `src/entities/dimension.entity.ts`                                            | `Dimension` entity with composite unique `(code, questionnaireType)`                                                        | Replace `@Enum` with `@ManyToOne`; update `@Unique` composite key to use FK                                                                             |
| `src/entities/index.entity.ts`                                                | Entity barrel exports + `entities` array                                                                                    | Add `QuestionnaireType` to named exports and array                                                                                                      |
| `src/modules/questionnaires/services/questionnaire.service.ts`                | Main service — `getQuestionnaireTypes()` at line 78, `getVersionsByType()` at line 103, `createQuestionnaire()` at line 158 | Refactor all three: query entity table, accept `typeId` param, remove `Object.values(QuestionnaireType)` iteration                                      |
| `src/modules/questionnaires/questionnaire.controller.ts`                      | Controller — routes at lines 76-91 for type listing/versions                                                                | Update `GET /types` and `GET /types/:type/versions` to use entity IDs                                                                                   |
| `src/modules/questionnaires/dto/requests/create-questionnaire-request.dto.ts` | Create request — currently `@IsEnum` with hardcoded strings                                                                 | Replace `type: QuestionnaireType` with `typeId: string` using `@IsUUID()`                                                                               |
| `src/modules/questionnaires/dto/requests/get-versions-by-type-request.dto.ts` | Path param — currently `@IsEnum(QuestionnaireType)`                                                                         | Replace with `@IsUUID()` type ID param                                                                                                                  |
| `src/modules/questionnaires/dto/responses/questionnaire-type-response.dto.ts` | Type listing response                                                                                                       | Restructure to return entity fields (id, name, code, description, isSystem, questionnaire info)                                                         |
| `src/modules/questionnaires/dto/responses/questionnaire-response.dto.ts`      | Questionnaire response — `Map()` returns `type: entity.type` (enum)                                                         | Update to return type entity info (id, name, code) instead of enum string                                                                               |
| `src/seeders/infrastructure/questionnaire.seeder.ts`                          | Seeds 3 questionnaires using enum                                                                                           | Create `QuestionnaireType` entities first, then questionnaires referencing them                                                                         |
| `src/modules/questionnaires/questionnaires.module.ts`                         | Module registration                                                                                                         | Add `QuestionnaireType` to `forFeature`, register new controller + service                                                                              |
| `src/modules/questionnaires/lib/schemas/faculty-in-classroom.schema.ts`       | Schema definition — `meta.questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM`                                        | Change to string literal `'FACULTY_IN_CLASSROOM'`                                                                                                       |
| `src/modules/questionnaires/lib/schemas/faculty-out-of-classroom.schema.ts`   | Schema definition — uses enum                                                                                               | Change to string literal `'FACULTY_OUT_OF_CLASSROOM'`                                                                                                   |
| `src/modules/questionnaires/lib/schemas/faculty-feedback.schema.ts`           | Schema definition — uses enum                                                                                               | Change to string literal `'FACULTY_FEEDBACK'`                                                                                                           |
| `src/modules/questionnaires/services/__tests__/questionnaire-types.spec.ts`   | Test suite for type/version methods                                                                                         | Full rewrite — mock entity repo instead of enum, test entity-based lookups                                                                              |

**Create:**

| File                                                                                 | Purpose                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/entities/questionnaire-type.entity.ts`                                          | New `QuestionnaireType` entity extending `CustomBaseEntity`               |
| `src/repositories/questionnaire-type.repository.ts`                                  | Custom repository extending `EntityRepository<QuestionnaireType>`         |
| `src/modules/questionnaires/services/questionnaire-type.service.ts`                  | CRUD service with safety guards (isSystem, reference checks)              |
| `src/modules/questionnaires/questionnaire-type.controller.ts`                        | REST controller with 5 endpoints, `@UseJwtGuard(UserRole.SUPER_ADMIN)`    |
| `src/modules/questionnaires/dto/requests/create-questionnaire-type-request.dto.ts`   | Request DTO: name, code, description (optional)                           |
| `src/modules/questionnaires/dto/requests/update-questionnaire-type-request.dto.ts`   | Request DTO: name (optional), description (optional) — no code            |
| `src/modules/questionnaires/dto/responses/questionnaire-type-detail-response.dto.ts` | Response DTO with full entity fields + static `Map()`                     |
| `src/modules/questionnaires/services/__tests__/questionnaire-type.service.spec.ts`   | Unit tests for CRUD + safety guards                                       |
| New migration file                                                                   | Create `questionnaire_type` table, drop CHECK constraints, add FK columns |

**Reference Only (no changes):**

| File                                                                    | Purpose                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/entities/base.entity.ts`                                           | `CustomBaseEntity` pattern: UUID PK, timestamps, `SoftDelete()`                             |
| `src/repositories/questionnaire.repository.ts`                          | Reference for empty repository pattern                                                      |
| `src/modules/questionnaires/services/questionnaire-schema.validator.ts` | Schema validator — validates dimensions but NOT `meta.questionnaireType`; no changes needed |
| `src/entities/questionnaire-version.entity.ts`                          | Version entity — references questionnaire, not type; unaffected                             |
| `src/migrations/Migration20260216080508.ts`                             | Reference for existing CHECK constraint syntax                                              |

### Technical Decisions

1. **Direct migration, no API versioning** — Beta phase with no live deployment. No consumers to protect. Existing v1 endpoints modified in-place.
2. **One-to-one invariant** — One `QuestionnaireType` maps to one `Questionnaire`. Enforced via unique constraint on `questionnaire.type_id`.
3. **Two-step creation flow** — Create type first (`POST /questionnaire-types`), then create questionnaire referencing it. Frontend orchestrates.
4. **Clean wipe migration** — Team drops local databases and re-seeds. No hand-written backfill SQL.
5. **`code` is immutable** — Set at creation, never changed. Used as stable identifier in schema snapshots.
6. **`isSystem` protects seed data** — System types cannot be deleted. Only `name` and `description` are editable on system types.
7. **Schema snapshots store type `code` as string** — Snapshots are immutable historical records. No FK needed in JSON — the `code` is self-contained and human-readable.
8. **SuperAdmin-only CRUD** — Custom type management is an institutional decision.

## Implementation Plan

### Tasks

#### Phase 1: Foundation (Entity + Repository + Types)

- [ ] Task 1: Create `QuestionnaireType` entity
  - File: `src/entities/questionnaire-type.entity.ts` (CREATE)
  - Action: Create entity extending `CustomBaseEntity` with fields:
    - `name: string` — `@Property()`, display name
    - `code: string` — `@Property()`, `@Unique()`, `@Index()`, slug-style identifier
    - `description?: string` — `@Property({ nullable: true })`
    - `isSystem: boolean` — `@Property({ default: false })`
  - Action: Decorate with `@Entity({ repository: () => QuestionnaireTypeRepository })`

- [ ] Task 2: Create `QuestionnaireTypeRepository`
  - File: `src/repositories/questionnaire-type.repository.ts` (CREATE)
  - Action: Create class extending `EntityRepository<QuestionnaireType>` following the pattern in `questionnaire.repository.ts`

- [ ] Task 3: Register entity in barrel exports
  - File: `src/entities/index.entity.ts`
  - Action: Add `import { QuestionnaireType } from './questionnaire-type.entity'`
  - Action: Add `QuestionnaireType` to named exports block
  - Action: Add `QuestionnaireType` to `entities` array (place before `Questionnaire` since it's now a dependency)

- [ ] Task 4: Delete `QuestionnaireType` enum and update `QuestionnaireSchemaSnapshot`
  - File: `src/modules/questionnaires/lib/questionnaire.types.ts`
  - Action: Delete the `QuestionnaireType` enum (lines 1-5)
  - Action: Change `QuestionnaireSchemaSnapshot.meta.questionnaireType` type from `QuestionnaireType` to `string`

- [ ] Task 5: Update schema definition files to use string literals
  - File: `src/modules/questionnaires/lib/schemas/faculty-in-classroom.schema.ts`
    - Action: Remove `QuestionnaireType` import; change `questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM` to `questionnaireType: 'FACULTY_IN_CLASSROOM'`
  - File: `src/modules/questionnaires/lib/schemas/faculty-out-of-classroom.schema.ts`
    - Action: Same pattern — `questionnaireType: 'FACULTY_OUT_OF_CLASSROOM'`
  - File: `src/modules/questionnaires/lib/schemas/faculty-feedback.schema.ts`
    - Action: Same pattern — `questionnaireType: 'FACULTY_FEEDBACK'`

- [ ] Task 5b: Update `dimension.constants.ts` to use string literals (F4)
  - File: `src/modules/questionnaires/lib/dimension.constants.ts`
  - Action: Remove `import { QuestionnaireType } from './questionnaire.types'`
  - Action: Replace all 18 `QuestionnaireType.FACULTY_IN_CLASSROOM` → `'FACULTY_IN_CLASSROOM'`, `QuestionnaireType.FACULTY_OUT_OF_CLASSROOM` → `'FACULTY_OUT_OF_CLASSROOM'`, `QuestionnaireType.FACULTY_FEEDBACK` → `'FACULTY_FEEDBACK'`
  - Action: Update the `questionnaireType` field type in the array entries to `string`
  - Notes: This file is consumed by `DimensionSeeder` — must be updated before seeder changes

#### Phase 2: Update Existing Entities

- [ ] Task 6: Update `Questionnaire` entity
  - File: `src/entities/questionnaire.entity.ts`
  - Action: Remove `QuestionnaireType` import from `questionnaire.types`
  - Action: Import `QuestionnaireType` entity from `./questionnaire-type.entity`
  - Action: Replace `@Enum(() => QuestionnaireType) type!: QuestionnaireType` with `@ManyToOne(() => QuestionnaireType) type!: QuestionnaireType`
  - Action: Add `@Unique({ properties: ['type'] })` class decorator to enforce one-to-one
  - Action: Update imports: replace `Enum` with `ManyToOne, Unique` from `@mikro-orm/core`

- [ ] Task 7: Update `Dimension` entity
  - File: `src/entities/dimension.entity.ts`
  - Action: Remove `QuestionnaireType` import from `questionnaire.types`
  - Action: Import `QuestionnaireType` entity from `./questionnaire-type.entity`
  - Action: Replace `@Enum(() => QuestionnaireType) questionnaireType!: QuestionnaireType` with `@ManyToOne(() => QuestionnaireType) questionnaireType!: QuestionnaireType`
  - Action: Update `@Unique({ properties: ['code', 'questionnaireType'] })` — stays the same, MikroORM handles FK in composite unique
  - Action: Update imports: replace `Enum` with `ManyToOne` from `@mikro-orm/core`

#### Phase 3: DTOs

- [ ] Task 8: Create `CreateQuestionnaireTypeRequest` DTO
  - File: `src/modules/questionnaires/dto/requests/create-questionnaire-type-request.dto.ts` (CREATE)
  - Action: Create DTO with:
    - `name: string` — `@IsString()`, `@IsNotEmpty()`, `@ApiProperty()`
    - `code: string` — `@IsString()`, `@IsNotEmpty()`, `@Matches(/^[A-Z][A-Z0-9_]*$/)` (SCREAMING_SNAKE_CASE — matches dimension code convention in `create-dimension.request.dto.ts`), `@ApiProperty()`
    - `description?: string` — `@IsString()`, `@IsOptional()`, `@ApiProperty({ required: false })`

- [ ] Task 9: Create `UpdateQuestionnaireTypeRequest` DTO
  - File: `src/modules/questionnaires/dto/requests/update-questionnaire-type-request.dto.ts` (CREATE)
  - Action: Create DTO with:
    - `name?: string` — `@IsString()`, `@IsOptional()`, `@ApiProperty({ required: false })`
    - `description?: string` — `@IsString()`, `@IsOptional()`, `@ApiProperty({ required: false })`
  - Notes: No `code` field — code is immutable after creation

- [ ] Task 9b: Create `ListQuestionnaireTypesQueryDto` (R2-F5 — boolean query bug)
  - File: `src/modules/questionnaires/dto/requests/list-questionnaire-types-query.dto.ts` (CREATE)
  - Action: Create query DTO with:
    - `isSystem?: boolean` — `@IsOptional()`, `@BooleanQueryTransform()` (or project-specific boolean transform decorator)
  - **CRITICAL**: The project just merged FAC-75 and FAC-77 specifically to fix `?active=false` being parsed as truthy string `"false"`. This endpoint MUST use the same boolean transform pattern. Without it, `?isSystem=false` will be truthy and return system types instead of custom types.
  - Notes: Check `list-dimensions-query.dto.ts` or the FAC-75/FAC-77 PRs for the boolean transform pattern used in this project.

- [ ] Task 10: Create `QuestionnaireTypeDetailResponse` DTO
  - File: `src/modules/questionnaires/dto/responses/questionnaire-type-detail-response.dto.ts` (CREATE)
  - Action: Create response DTO with fields: `id`, `name`, `code`, `description`, `isSystem`, `createdAt`
  - Action: Add static `Map(entity: QuestionnaireType)` factory method

- [ ] Task 11: Update `CreateQuestionnaireRequest` DTO
  - File: `src/modules/questionnaires/dto/requests/create-questionnaire-request.dto.ts`
  - Action: Remove `QuestionnaireType` import and `@IsEnum` decorator
  - Action: Replace `type!: QuestionnaireType` with `typeId!: string` using `@IsUUID()`, `@IsNotEmpty()`, `@ApiProperty()`

- [ ] Task 12: Update `GetVersionsByTypeParam` DTO
  - File: `src/modules/questionnaires/dto/requests/get-versions-by-type-request.dto.ts`
  - Action: Remove `QuestionnaireType` import and `@IsEnum` decorator
  - Action: Replace `type!: QuestionnaireType` with `typeId!: string` using `@IsUUID()` decorator
  - Notes: Route param changes from `:type` (enum string) to `:typeId` (UUID)

- [ ] Task 13: Update `QuestionnaireTypeResponse` DTO
  - File: `src/modules/questionnaires/dto/responses/questionnaire-type-response.dto.ts`
  - Action: Remove `QuestionnaireType` import
  - Action: Restructure to return: `id: string` (type entity ID), `name: string`, `code: string`, `description: string | null`, `isSystem: boolean`, `questionnaireId: string | null`, `questionnaireTitle: string | null`, `questionnaireStatus: QuestionnaireStatus | null`
  - Notes: This DTO is used by `getQuestionnaireTypes()` — must include both type info and associated questionnaire info

- [ ] Task 14: Update `QuestionnaireResponseDto`
  - File: `src/modules/questionnaires/dto/responses/questionnaire-response.dto.ts`
  - Action: Remove `QuestionnaireType` import
  - Action: Replace `type: QuestionnaireType` field with `type: { id: string; name: string; code: string }`
  - Action: Update `Map()` method to populate type from loaded entity relation

- [ ] Task 14b: Update `QuestionnaireVersionDetailResponse` DTO (F2)
  - File: `src/modules/questionnaires/dto/responses/questionnaire-version-detail-response.dto.ts`
  - Action: Remove `QuestionnaireType` import
  - Action: Replace `questionnaireType: QuestionnaireType` (line 20) with `questionnaireType: { id: string; name: string; code: string }`
  - Action: Update `Map()` method (line 50): `version.questionnaire.type` is now a ManyToOne relation — map to `{ id: version.questionnaire.type.id, name: version.questionnaire.type.name, code: version.questionnaire.type.code }`
  - **CRITICAL**: All controller endpoints that call `Map()` must ensure `version.questionnaire` is populated with `{ populate: ['questionnaire.type'] }` — this includes: `createVersion`, `getVersionById`, `updateDraftVersion`, `publishVersion`, `deprecateVersion`
  - Notes: This DTO is returned from 5 controller endpoints. Without the populate fix, `type` will be an unloaded reference.

- [ ] Task 14c: Update `QuestionnaireVersionsResponse` DTO (F3)
  - File: `src/modules/questionnaires/dto/responses/questionnaire-version-response.dto.ts`
  - Action: Remove `QuestionnaireType` import
  - Action: Replace `type!: QuestionnaireType` (line 35) on `QuestionnaireVersionsResponse` with `type!: { id: string; name: string; code: string }`
  - Action: Update `getVersionsByType()` in service to map the type entity to `{ id, name, code }` when building this response

- [ ] Task 14d: Update dimensions module DTOs (F1)
  - File: `src/modules/dimensions/dto/requests/create-dimension.request.dto.ts`
    - Action: Remove `QuestionnaireType` import
    - Action: Replace `@IsEnum(QuestionnaireType) questionnaireType: QuestionnaireType` with `@IsUUID() @IsNotEmpty() questionnaireTypeId: string`
    - Notes: The dimensions service will need to look up the type entity by ID instead of using the enum directly
  - File: `src/modules/dimensions/dto/requests/list-dimensions-query.dto.ts`
    - Action: Remove `QuestionnaireType` import
    - Action: Replace `@IsEnum(QuestionnaireType) questionnaireType?: QuestionnaireType` with `@IsUUID() @IsOptional() questionnaireTypeId?: string`
  - File: `src/modules/dimensions/dto/responses/dimension.response.dto.ts`
    - Action: Remove `QuestionnaireType` import
    - Action: Replace `questionnaireType: QuestionnaireType` with `questionnaireType: { id: string; name: string; code: string }`
    - Action: Update `Map()` method (if present) to map from loaded FK relation
- [ ] Task 14e: Update `DimensionsService` — full refactor (R2-F1, R2-F6)
  - File: `src/modules/dimensions/services/dimensions.service.ts`
  - Action: Add `@InjectRepository(QuestionnaireType)` to constructor (import entity from entities)
  - Action: Update `create()` method (line ~31):
    - Accept `questionnaireTypeId: string` from DTO instead of enum value
    - Look up `QuestionnaireType` entity by ID, throw `NotFoundException` if not found
    - Pass entity reference to `em.create(Dimension, { ..., questionnaireType: typeEntity })` instead of enum string
  - Action: Update `findAll()` method (line ~54):
    - Change filter from `questionnaireType: dto.questionnaireType` (enum) to `questionnaireType: dto.questionnaireTypeId` (UUID FK filter)
    - Change `orderBy: { questionnaireType: 'ASC' }` (line ~69) to `orderBy: { questionnaireType: { code: 'ASC' } }` — sorting by UUID is meaningless (R2-F14)
    - Add `populate: ['questionnaireType']` to the query so `DimensionResponseDto.Map()` can access `.questionnaireType.id/.name/.code`
  - Action: Update `findOne()`, `deactivate()`, `activate()` methods:
    - Add `populate: ['questionnaireType']` to every query that feeds into `DimensionResponseDto`
  - Notes: Without the populate calls, every dimension response will have `questionnaireType: undefined` for `.name` and `.code`.

- [ ] Task 14f: Update `DimensionsModule` registration (R2-F2)
  - File: `src/modules/dimensions/dimensions.module.ts`
  - Action: Import `QuestionnaireType` from entities
  - Action: Add `QuestionnaireType` to `MikroOrmModule.forFeature([Dimension, User, QuestionnaireType])`
  - Notes: Required for `@InjectRepository(QuestionnaireType)` in `DimensionsService`

#### Phase 4: Services

- [ ] Task 15: Create `QuestionnaireTypeService` with safe CRUD
  - File: `src/modules/questionnaires/services/questionnaire-type.service.ts` (CREATE)
  - Action: Create injectable service with constructor injecting:
    - `@InjectRepository(QuestionnaireType)` — `EntityRepository<QuestionnaireType>`
    - `@InjectRepository(Questionnaire)` — `EntityRepository<Questionnaire>` (for reference checks)
    - `CacheService`
  - Action: Implement methods:
    - `create(data: { name, code, description? })`:
      - Validate `code` uniqueness (catch `UniqueConstraintViolationException` → `ConflictException`)
      - Set `isSystem: false`
      - Invalidate cache namespace `QUESTIONNAIRE_TYPES`
      - Return created entity
    - `findAll(filters?: { isSystem?: boolean })`:
      - Query all types with optional `isSystem` filter
      - Return array of entities
    - `findOne(id: string)`:
      - Find by ID, throw `NotFoundException` if not found
      - Return entity
    - `update(id: string, data: { name?, description? })`:
      - Find entity, throw `NotFoundException` if not found
      - Apply partial update (only provided fields)
      - Invalidate cache namespace `QUESTIONNAIRE_TYPES`
      - Return updated entity
    - `remove(id: string)`:
      - Find entity, throw `NotFoundException` if not found
      - Guard: if `isSystem === true`, throw `ForbiddenException('System questionnaire types cannot be deleted')`
      - Guard: check if any questionnaire references this type (`questionnaireRepo.findOne({ type: id })`), throw `ConflictException('Cannot delete a type that has an associated questionnaire')` if found
      - Call `entity.SoftDelete()` + flush
      - Invalidate cache namespace `QUESTIONNAIRE_TYPES`

- [ ] Task 16: Refactor `QuestionnaireService` type-related methods
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: Add `@InjectRepository(QuestionnaireType)` to constructor (import entity from entities)
  - Action: Remove `QuestionnaireType` enum import from `questionnaire.types`
  - Action: Refactor `getQuestionnaireTypes()` (line 78):
    - Replace `Object.values(QuestionnaireType).map(...)` with a query that fetches all `QuestionnaireType` entities
    - Left-join to `Questionnaire` to get associated questionnaire info
    - Map to updated `QuestionnaireTypeResponse` shape
  - Action: Refactor `getVersionsByType(typeId: string)` (line 103):
    - Replace enum validation (`Object.values(...).includes(type)`) with entity lookup by ID
    - Throw `NotFoundException` if type entity not found
    - Find questionnaire by `type` FK instead of enum value
    - Keep version fetch logic unchanged
  - Action: Refactor `createQuestionnaire(data: { title, typeId })` (line 158):
    - Accept `typeId` instead of enum value
    - Look up `QuestionnaireType` entity by ID, throw `NotFoundException` if not found
    - Check one-to-one: `findOne({ type: typeEntity })`, throw `ConflictException` if a questionnaire already exists for this type
    - Create questionnaire with FK reference
  - **CRITICAL — `populate` requirements** (from pre-mortem finding #1):
    - Every `questionnaireRepo.findAll()` and `questionnaireRepo.findOne()` that feeds into `QuestionnaireResponseDto` or `QuestionnaireTypeResponse` MUST include `{ populate: ['type'] }` to load the FK relation
    - Affected queries: `getQuestionnaireTypes()`, `getVersionsByType()`, `createQuestionnaire()` (populate after create or manually assign)
    - Without this, accessing `questionnaire.type.name` or `.code` returns `undefined` on unloaded references
  - **CRITICAL — version-related populate paths** (R2-F3):
    - 6 methods currently use `populate: ['questionnaire']` — ALL must change to `populate: ['questionnaire.type']` so `QuestionnaireVersionDetailResponse.Map()` can access `version.questionnaire.type.name/.code`:
      - `CreateVersion()` (line 176) — `findOne(questionnaireId)` does not populate; after create, version needs populated questionnaire.type for response
      - `PublishVersion()` (line 221) — `findOne(versionId, { populate: ['questionnaire'] })` → change to `['questionnaire.type']`
      - `DeprecateVersion()` (line 262) — same pattern, `populate: ['questionnaire']` → `['questionnaire.type']`
      - `GetVersionById()` (line 301) — same pattern
      - `UpdateDraftVersion()` (line 318) — same pattern
      - `GetLatestActiveVersion()` (line 356) — `findOne({ ... }, { populate: ['questionnaire'] })` → `['questionnaire.type']`

#### Phase 5: Controllers

- [ ] Task 17: Create `QuestionnaireTypeController`
  - File: `src/modules/questionnaires/questionnaire-type.controller.ts` (CREATE)
  - Action: Create controller with `@Controller('questionnaire-types')`, `@ApiTags('Questionnaire Types')`
  - **IMPORTANT — method-level guards, NOT class-level** (from pre-mortem finding #2):
    - `GET` endpoints use `@UseJwtGuard()` (any authenticated user) — other roles need to see available types
    - `POST`, `PATCH`, `DELETE` endpoints use `@UseJwtGuard(UserRole.SUPER_ADMIN)` — mutations are admin-only
    - This is the **admin-facing CRUD** controller for type management
  - Action: Implement endpoints:
    - `POST /` — `@UseJwtGuard(UserRole.SUPER_ADMIN)` — `create(@Body() dto: CreateQuestionnaireTypeRequest)` → returns `QuestionnaireTypeDetailResponse`
    - `GET /` — `@UseJwtGuard()` — `findAll(@Query() query: ListQuestionnaireTypesQueryDto)` → returns `QuestionnaireTypeDetailResponse[]`
    - `GET /:id` — `@UseJwtGuard()` — `findOne(@Param('id', ParseUUIDPipe) id: string)` → returns `QuestionnaireTypeDetailResponse`
    - `PATCH /:id` — `@UseJwtGuard(UserRole.SUPER_ADMIN)` — `update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuestionnaireTypeRequest)` → returns `QuestionnaireTypeDetailResponse`
    - `DELETE /:id` — `@UseJwtGuard(UserRole.SUPER_ADMIN)` — `remove(@Param('id', ParseUUIDPipe) id: string)` → returns `{ message: string }`
  - Notes: `ParseUUIDPipe` (from `@nestjs/common`) returns 400 for malformed UUIDs instead of hitting the DB (F10)

- [ ] Task 18: Update `QuestionnaireController` type-related routes
  - File: `src/modules/questionnaires/questionnaire.controller.ts`
  - Action: Update `GET /types` (line 76): no parameter changes, but return type changes to updated `QuestionnaireTypeResponse`
  - Action: Update `GET /types/:type/versions` (line 82): change route to `types/:typeId/versions`, update param DTO to `GetVersionsByTypeParam` with `typeId`
  - Action: Update `POST /` (line 93): `CreateQuestionnaireRequest` now has `typeId` instead of `type` — ensure `data` is passed correctly to service
  - Action: Update `createQuestionnaire` to pass `{ title: data.title, typeId: data.typeId }` to service

#### Phase 6: Module Registration

- [ ] Task 19: Update `QuestionnairesModule`
  - File: `src/modules/questionnaires/questionnaires.module.ts`
  - Action: Add `QuestionnaireType` import from entities
  - Action: Add `QuestionnaireType` to `MikroOrmModule.forFeature([...])`
  - Action: Add `QuestionnaireTypeController` to `controllers` array
  - Action: Add `QuestionnaireTypeService` to `providers` array
  - Action: Add `QuestionnaireTypeService` to `exports` array (if needed by other modules)

#### Phase 7: Migration + Seeder

- [ ] Task 20: Create database migration
  - File: Auto-generated via `npx mikro-orm migration:create`
  - Action: Run migration generator after entity changes are complete
  - Action: Verify generated SQL:
    - Creates `questionnaire_type` table with columns: `id`, `name`, `code` (unique), `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
    - Drops CHECK constraint on `questionnaire.type`
    - Replaces `questionnaire.type` (text enum) with `questionnaire.type_id` (FK to `questionnaire_type`)
    - Adds unique constraint on `questionnaire.type_id`
    - Drops CHECK constraint on `dimension.questionnaire_type`
    - Replaces `dimension.questionnaire_type` (text enum) with `dimension.questionnaire_type_id` (FK to `questionnaire_type`)
    - Updates composite unique on `dimension` to `(code, questionnaire_type_id)`
  - Notes: Since this is a clean-wipe migration, the generated diff should work directly. Review and adjust column naming if MikroORM's naming strategy produces unexpected names.
  - **Expected column name changes** (from pre-mortem finding #5):
    - `questionnaire.type` (text) → `questionnaire.type_id` (varchar FK) — MikroORM's `UnderscoreNamingStrategy` appends `_id` for `@ManyToOne` properties
    - `dimension.questionnaire_type` (text) → `dimension.questionnaire_type_id` (varchar FK) — same convention
    - These are the expected names. If you want to preserve old names, use `@Property({ fieldName: 'type' })` alongside `@ManyToOne`, but `_id` suffix is the cleaner convention.

- [ ] Task 21: Create `QuestionnaireTypeSeeder` and restructure seeder ordering (F5)
  - File: `src/seeders/infrastructure/questionnaire-type.seeder.ts` (CREATE)
  - Action: Create new seeder that creates the 3 system `QuestionnaireType` entities:
    ```
    { name: 'Faculty In-Classroom', code: 'FACULTY_IN_CLASSROOM', description: 'In-classroom faculty evaluation', isSystem: true }
    { name: 'Faculty Out-of-Classroom', code: 'FACULTY_OUT_OF_CLASSROOM', description: 'Out-of-classroom faculty evaluation', isSystem: true }
    { name: 'Faculty Feedback', code: 'FACULTY_FEEDBACK', description: 'General faculty feedback evaluation', isSystem: true }
    ```
  - Action: Use idempotent find-or-create pattern (find by `code`, create if missing)
  - File: `src/seeders/infrastructure/infrastructure.seeder.ts`
  - Action: Import `QuestionnaireTypeSeeder`
  - Action: **Reorder** the seeder array to:
    1. `QuestionnaireTypeSeeder` (NEW — must run first, creates type rows)
    2. `DimensionSeeder` (references types via FK — must run after types exist)
    3. `UserSeeder`
    4. `SystemConfigSeeder`
    5. `QuestionnaireSeeder` (references types via FK — must run after types exist)
  - Notes: Current order has `DimensionSeeder` first, which will fail because dimension FK references `questionnaire_type` rows that don't exist yet.

- [ ] Task 21b: Update `QuestionnaireSeeder` (remove type creation responsibility)
  - File: `src/seeders/infrastructure/questionnaire.seeder.ts`
  - Action: Remove `QuestionnaireType` enum import
  - Action: Import `QuestionnaireType` entity from entities
  - Action: Update `run()` method:
    - For each seed, look up `QuestionnaireType` entity by code (they already exist from `QuestionnaireTypeSeeder`)
    - Find-or-create `Questionnaire` referencing the type entity
    - Create version 1 if questionnaire is new (same logic as current seeder)
  - Notes: Type creation is now handled by `QuestionnaireTypeSeeder`. This seeder only creates questionnaires and versions.

- [ ] Task 21c: Update `DimensionSeeder` (F5, R2-F7)
  - File: `src/seeders/infrastructure/dimension.seeder.ts`
  - Action: The seeder currently consumes `DEFAULT_DIMENSIONS` from `dimension.constants.ts` which now has string codes instead of enum values
  - Action: For each entry in `DEFAULT_DIMENSIONS`, look up `QuestionnaireType` entity by `data.questionnaireType` (the code string)
  - **CRITICAL — destructuring trap** (R2-F7): The current seeder does `em.create(Dimension, { ...data, active: true })`. After Task 5b, `data.questionnaireType` is a string like `'FACULTY_IN_CLASSROOM'`. Spreading `...data` into `em.create` will pass this string into a `@ManyToOne` field, which expects an entity reference. The fix is:
    ```typescript
    const { questionnaireType: typeCode, ...rest } = data;
    const typeEntity = await em.findOne(QuestionnaireType, { code: typeCode });
    em.create(Dimension, {
      ...rest,
      questionnaireType: typeEntity,
      active: true,
    });
    ```
  - Action: Destructure out `questionnaireType` from `data`, replace with the looked-up entity reference

#### Phase 8: Tests

- [ ] Task 22: Create `QuestionnaireTypeService` unit tests
  - File: `src/modules/questionnaires/services/__tests__/questionnaire-type.service.spec.ts` (CREATE)
  - Action: Test cases:
    - `create`: successfully creates a type with `isSystem: false`
    - `create`: throws `ConflictException` on duplicate `code`
    - `findAll`: returns all types
    - `findAll`: filters by `isSystem`
    - `findOne`: returns type by ID
    - `findOne`: throws `NotFoundException` for non-existent ID
    - `update`: updates `name` and `description`
    - `update`: throws `NotFoundException` for non-existent ID
    - `remove`: soft-deletes a custom type
    - `remove`: throws `ForbiddenException` for system types (`isSystem: true`)
    - `remove`: throws `ConflictException` when type has associated questionnaires
  - Notes: Follow existing test pattern with `TestingModule`, mock repos via `getRepositoryToken()`, mock `CacheService`

- [ ] Task 23: Rewrite `questionnaire-types.spec.ts` for entity-based logic
  - File: `src/modules/questionnaires/services/__tests__/questionnaire-types.spec.ts`
  - Action: Update test setup to mock `QuestionnaireType` entity repository
  - Action: Rewrite `getQuestionnaireTypes` tests:
    - Mock type entity repo `findAll()` returning type entities
    - Assert response maps type entity fields + associated questionnaire info
    - Test with types that have no associated questionnaire (null fields)
  - Action: Rewrite `getVersionsByType` tests:
    - Accept `typeId` (UUID) instead of enum value
    - Mock type entity lookup
    - Test `NotFoundException` for invalid type ID
    - Keep version ordering tests (DESC by versionNumber)
  - Action: Add `createQuestionnaire` tests:
    - Test successful creation with valid `typeId`
    - Test `NotFoundException` for non-existent type ID
    - Test `ConflictException` when type already has a questionnaire

- [ ] Task 24: Update remaining test files that import `QuestionnaireType` enum (F6, R2-F11)
  - **Important — two distinct replacement strategies** (R2-F11):
    - **Schema snapshot fixtures** (inside `schemaSnapshot.meta.questionnaireType`) → use **string literals** (e.g., `'FACULTY_IN_CLASSROOM'`) — these are JSON values
    - **Entity fixtures** (inside mock questionnaire/dimension objects for `entity.type` or `entity.questionnaireType`) → use **mock entity objects** (e.g., `{ id: 'type-1', name: 'Faculty In-Classroom', code: 'FACULTY_IN_CLASSROOM' }`) — these are ManyToOne references
  - File: `src/modules/questionnaires/questionnaire.controller.spec.ts`
    - Action: Schema fixtures (e.g., `mockSchema.meta.questionnaireType`) → string literals
    - Action: Entity fixtures (e.g., `questionnaire.type`) → mock entity objects with `{ id, name, code }`
  - File: `src/modules/questionnaires/services/questionnaire-schema.validator.spec.ts`
    - Action: All 3 usages are in schema fixtures → string literals
  - File: `src/modules/questionnaires/services/scoring.service.spec.ts`
    - Action: All 2 usages are in schema fixtures → string literals
  - File: `src/modules/dimensions/services/dimensions.service.spec.ts`
    - Action: All 9 usages are entity fixtures → mock entity objects with `{ id, name, code }`

- [ ] Task 25: Add `QUESTIONNAIRE_VERSIONS` cache invalidation to `QuestionnaireTypeService` (F11)
  - File: `src/modules/questionnaires/services/questionnaire-type.service.ts`
  - Action: In the `update()` method, also invalidate `CacheNamespace.QUESTIONNAIRE_VERSIONS` alongside `QUESTIONNAIRE_TYPES`
  - Notes: If a type is renamed, cached version responses (which include the type name) serve stale data until TTL expires. Invalidating both namespaces on type update prevents this.

#### Phase 9: Verification (must be last)

- [ ] Task 26: Verify build, tests, and stale imports
  - Action: Run `npm run build` — must compile with zero errors
  - Action: Run `npm run test` — all tests must pass
  - Action: Grep for any remaining imports of `QuestionnaireType` from `questionnaire.types` — must find zero
  - Action: Verify migration includes `ADD UNIQUE CONSTRAINT` on `questionnaire.type_id` (R2-F10) — if MikroORM's diff generator does not produce this, add it manually to the migration SQL
  - Notes: This is the absolute final step. Do not proceed to PR until all four sub-actions pass.

### Acceptance Criteria

#### QuestionnaireType Entity & CRUD

- [ ] AC-1: Given a SuperAdmin, when they `POST /questionnaire-types` with `{ name: "Peer Review", code: "PEER_REVIEW", description: "Peer teaching evaluation" }`, then a new type is created with `isSystem: false` and returned with its UUID, name, code, description, and timestamps.

- [ ] AC-2: Given a SuperAdmin, when they `POST /questionnaire-types` with a `code` that already exists, then the API returns `409 Conflict` with a message indicating the code is taken.

- [ ] AC-3: Given a SuperAdmin, when they `GET /questionnaire-types`, then all non-soft-deleted types are returned (both system and custom).

- [ ] AC-4a: Given an authenticated user, when they `GET /questionnaire-types?isSystem=true`, then only system types are returned.

- [ ] AC-4b: Given an authenticated user, when they `GET /questionnaire-types?isSystem=false`, then only custom (non-system) types are returned — the string `"false"` is correctly parsed as boolean `false`, not treated as truthy.

- [ ] AC-5: Given a SuperAdmin, when they `PATCH /questionnaire-types/:id` with `{ name: "Updated Name" }`, then the type's name is updated but `code` and `isSystem` remain unchanged.

- [ ] AC-5b: Given a SuperAdmin who just renamed a type, when any user calls `GET /questionnaires/types/:typeId/versions`, then the response contains the **updated** type name (cache is invalidated correctly).

- [ ] AC-6: Given a SuperAdmin, when they `DELETE /questionnaire-types/:id` for a custom type with no associated questionnaires, then the type is soft-deleted (returns 200).

- [ ] AC-7: Given a SuperAdmin, when they `DELETE /questionnaire-types/:id` for a type with `isSystem: true`, then the API returns `403 Forbidden`.

- [ ] AC-8: Given a SuperAdmin, when they `DELETE /questionnaire-types/:id` for a custom type that has an associated questionnaire, then the API returns `409 Conflict`.

- [ ] AC-9: Given a non-SuperAdmin authenticated user, when they attempt `POST/PATCH/DELETE` on `/questionnaire-types`, then the API returns `403 Forbidden`. However, `GET /questionnaire-types` and `GET /questionnaire-types/:id` are accessible to any authenticated user.

#### Questionnaire-Type Integration

- [ ] AC-10: Given a SuperAdmin, when they `POST /questionnaires` with `{ title: "My Eval", typeId: "<valid-type-uuid>" }`, then a questionnaire is created referencing the type entity.

- [ ] AC-11: Given a SuperAdmin, when they `POST /questionnaires` with a `typeId` that already has an associated questionnaire, then the API returns `409 Conflict`.

- [ ] AC-12: Given a SuperAdmin, when they `POST /questionnaires` with a non-existent `typeId`, then the API returns `404 Not Found`.

- [ ] AC-13: Given any user (these endpoints are currently unguarded — preserving existing behavior), when they `GET /questionnaires/types`, then all questionnaire types are returned with their associated questionnaire info (id, title, status — or nulls if no questionnaire exists for a type).

- [ ] AC-14: Given any user, when they `GET /questionnaires/types/:typeId/versions` with a valid type UUID, then the versions for that type's questionnaire are returned in descending order.

- [ ] AC-15: Given any authenticated user, when they `GET /questionnaires/types/:typeId/versions` with a non-existent type UUID, then the API returns `404 Not Found`.

#### Migration & Seeder

- [ ] AC-16: Given a fresh database, when `migration:up` is run, then the `questionnaire_type` table is created with columns `id`, `name`, `code` (unique), `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`.

- [ ] AC-17: Given a fresh database, when the infrastructure seeder runs, then 3 system types are created with `is_system = true` and codes `FACULTY_IN_CLASSROOM`, `FACULTY_OUT_OF_CLASSROOM`, `FACULTY_FEEDBACK`, each with an associated active questionnaire and version 1.

- [ ] AC-18: Given a seeded database, when the seeder runs again, then no duplicate types or questionnaires are created (idempotent).

#### Version Response Shape (F8)

- [ ] AC-20: Given any authenticated user, when they call any endpoint that returns `QuestionnaireVersionDetailResponse` (e.g., `GET /questionnaires/versions/:versionId`), then the `questionnaireType` field contains `{ id, name, code }` (object with type entity info), not a raw enum string.

- [ ] AC-21: Given any authenticated user, when they call `GET /questionnaires/types/:typeId/versions`, then the `type` field in `QuestionnaireVersionsResponse` contains `{ id, name, code }` (object with type entity info), not a raw enum string.

#### Input Validation (F10, F14)

- [ ] AC-22: Given any user, when they call `GET /questionnaire-types/not-a-uuid`, then the API returns `400 Bad Request` (not a 500 or cryptic DB error).

- [ ] AC-23: Given a SuperAdmin, when they `POST /questionnaire-types` with a `code` that is not SCREAMING_SNAKE_CASE (e.g., `peer_review` or `Peer-Review`), then the API returns `400 Bad Request` with a validation message.

#### Seeder Ordering (F5)

- [ ] AC-24: Given a fresh database, when the infrastructure seeder runs, then `QuestionnaireTypeSeeder` executes before `DimensionSeeder` and `QuestionnaireSeeder`, ensuring FK references exist before dependent rows are inserted.

#### Schema Snapshot Compatibility

- [ ] AC-19: Given an existing schema snapshot with `meta.questionnaireType: "FACULTY_IN_CLASSROOM"`, when the system reads and validates this snapshot, then it is accepted without error (string value matches type entity `code`).

## Additional Context

### Dependencies

- No new npm packages required
- Existing infrastructure used: MikroORM, class-validator, class-transformer, CacheService, JWT guards, Passport
- `QuestionnaireType` entity must be created before updating `Questionnaire` and `Dimension` entities (FK dependency)
- Migration must run after all entity changes are complete

### Testing Strategy

**Unit Tests:**

- `QuestionnaireTypeService` — 11 test cases covering all CRUD operations + safety guards (Task 22)
- `QuestionnaireService` — rewrite type-related tests for entity-based logic (Task 23)
- Update 4 additional test files with stale enum imports: `questionnaire.controller.spec.ts`, `questionnaire-schema.validator.spec.ts`, `scoring.service.spec.ts`, `dimensions.service.spec.ts` (Task 24)
- Both new test files follow existing pattern: `TestingModule` with mock repos via `getRepositoryToken()`

**Manual Testing:**

1. Drop local database, run `migration:up`, run seeder — verify 3 system types + dimensions + questionnaires created in correct order
2. Create a custom type via API — verify it appears in type listing
3. Create a questionnaire for the custom type — verify one-to-one enforced
4. Attempt to delete a system type — verify 403
5. Attempt to delete a custom type with a questionnaire — verify 409
6. Delete a custom type with no questionnaire — verify soft delete
7. Verify version detail endpoints return `questionnaireType` as `{ id, name, code }` object
8. Verify `GET /questionnaire-types/not-a-uuid` returns 400

**Build Verification:**

- Run `npm run build` — zero compile errors (Task 26)
- Run `npm run test` — all tests pass
- Grep for `from.*questionnaire.types.*QuestionnaireType` — zero remaining enum imports

### Notes

- **Team communication required**: PR description must note database wipe requirement. Team members should drop their local databases and re-run migrations + seeder.
- **Seeder ordering is critical** (F5): `QuestionnaireTypeSeeder` MUST run before `DimensionSeeder` and `QuestionnaireSeeder`. The current `InfrastructureSeeder` runs `DimensionSeeder` first — this will fail after migration because dimensions now have a FK to `questionnaire_type`. A new `QuestionnaireTypeSeeder` is created and registered first in the seeder array.
- **Seeder validation**: A fresh seeder run validates the entire new entity chain works end-to-end. This is the primary integration test for the migration.
- **Impact assessment**: Analysis module has no direct `QuestionnaireType` enum imports. However, `QuestionnaireVersionDetailResponse` (which feeds downstream contexts) now returns type as an object. Verify no analysis pipeline code parses `questionnaireType` as a raw string (F13).
- **One-to-one invariant assumption** (F12): The one-to-one constraint (`@Unique` on `questionnaire.type_id`) does NOT currently exist at the database level — it is only enforced in application code. The clean-wipe strategy means no existing data can violate this. If a developer skips the wipe, duplicate type references could prevent migration. The PR description must emphasize the wipe requirement.
- **Existing snapshot compatibility**: Enum string values (`FACULTY_IN_CLASSROOM`, etc.) become the `code` values on seeded type entities. Existing JSON snapshots in `schema_snapshot` columns remain valid.
- **Cache invalidation**: `QuestionnaireTypeService` must invalidate both `QUESTIONNAIRE_TYPES` and `QUESTIONNAIRE_VERSIONS` namespaces on type mutations (F11). If only `QUESTIONNAIRE_TYPES` is invalidated, version responses serve stale type names.
- **Future consideration**: If the one-to-one invariant is relaxed later, the unique constraint on `questionnaire.type_id` is the only thing to drop. The rest of the architecture supports one-to-many without changes.
- **Endpoint overlap clarification** (pre-mortem #6): `GET /questionnaires/types` is **consumer-facing** (types + questionnaire context for evaluation flows). `GET /questionnaire-types` is **admin-facing** (type entity details for management). Document in Swagger `@ApiOperation` descriptions.
- **Import verification** (pre-mortem #3): After all code changes, run `npm run build` to catch stale imports. Task 26 is the final safety net.
- **Schema validator verified no-change** (F9): `questionnaire-schema.validator.ts` queries dimensions by `code` and `active` status — it does NOT filter by `questionnaireType`. The column type change from enum to FK does not affect these queries. Confirmed as verified-no-change, not assumed-no-change.
- **Known limitation — cross-type dimension validation** (R2-F12): The schema validator does not filter dimensions by questionnaire type. A dimension code like `PREPARATION` that exists under `FACULTY_FEEDBACK` would pass validation even in a schema for a different type. This is a **pre-existing design gap**, not introduced by this migration. Filed as a known limitation rather than claimed as correct behavior. Consider adding type-scoped dimension validation in a follow-up ticket.
- **Guard status of existing questionnaire endpoints** (R2-F4): `GET /questionnaires/types`, `GET /questionnaires/types/:type/versions`, and `POST /questionnaires` are currently unguarded in the codebase (no `@UseJwtGuard()`). This spec preserves that behavior. Adding auth guards to these endpoints is a separate concern and should not be conflated with this migration. ACs are worded accordingly.
