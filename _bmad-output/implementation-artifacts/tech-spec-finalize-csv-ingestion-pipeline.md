---
title: 'Finalize CSV Ingestion Pipeline'
slug: 'finalize-csv-ingestion-pipeline'
created: '2026-03-20'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - NestJS 11 (Controller, Multer FileInterceptor, @nestjs/platform-express)
  - csv-parse (replacing csv-parser v3.2.0)
  - MikroORM 6.6.6 (EntityManager fork per record)
  - class-validator / class-transformer (DTO validation)
  - p-limit 7.3.0 (concurrency control)
  - dataloader 2.2.3 (batched entity lookups)
  - Jest (unit + integration tests)
files_to_modify:
  - src/modules/questionnaires/ingestion/adapters/csv.adapter.ts
  - src/modules/questionnaires/ingestion/adapters/csv.adapter.spec.ts
  - src/modules/questionnaires/ingestion/types/csv-adapter-config.type.ts
  - src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts
  - src/modules/questionnaires/questionnaire.controller.ts
  - src/modules/questionnaires/questionnaires.module.ts
  - package.json
files_to_create:
  - src/modules/questionnaires/dto/requests/ingest-csv-request.dto.ts
code_patterns:
  - SourceAdapter async iterable pattern (extract yields IngestionRecord<T>)
  - BaseStreamAdapter provides normalizeKey() and cleanupStream()
  - UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN) for role-protected endpoints
  - @ApiTags/@ApiOperation/@ApiResponse for Swagger docs
  - Controller is questionnaire.controller.ts (singular), module is questionnaires.module.ts (plural)
  - No existing file upload usage — this will be the first FileInterceptor in the project
  - CSVAdapter registered via token: SOURCE_ADAPTER_CSV using useExisting
test_patterns:
  - CSVAdapter tests use Readable.from(csvData) to create in-memory streams
  - Direct adapter instantiation (new CSVAdapter()) — no TestingModule needed for adapter unit tests
  - Engine tests use NestJS TestingModule with jest.fn() mocks for dependencies
  - Fixture CSV strings embedded in test files
---

# Tech-Spec: Finalize CSV Ingestion Pipeline

**Created:** 2026-03-20

## Overview

### Problem Statement

The CSV ingestion pipeline has all downstream pieces (engine, mapper, questionnaire validation) but is not usable end-to-end. Three critical gaps exist:

1. **No row transformation layer.** The CSV adapter yields flat `Record<string, unknown>` rows, but `IngestionMapperService.map()` expects structured `RawSubmissionData` with a nested `answers: RawAnswerData[]` array. Nothing bridges the two.
2. **No type coercion.** CSV parsers yield all values as strings. Numeric fields (`moodleUserId`, `moodleFacultyId`, `courseId`, answer values) arrive as strings, causing downstream validation failures.
3. **No HTTP endpoint.** The `IngestionEngine` is wired in the module but not exposed via any controller endpoint. There is no way to trigger ingestion over HTTP.
4. **Outdated CSV parser.** The current `csv-parser` package should be replaced with `csv-parse`, which is better maintained and supports async iterables natively.

### Solution

Replace `csv-parser` with `csv-parse`, implement a CSV column convention using a metadata allowlist (fixed known columns are metadata, all remaining columns are answer questionIds), add fail-fast header validation, type coercion, and a file upload controller endpoint that exposes the existing dry-run functionality.

### Scope

**In Scope:**

- Swap `csv-parser` → `csv-parse` in the CSV adapter
- CSV column convention: metadata allowlist (`externalId`, `moodleUserId`, `moodleFacultyId`, `courseId`, `submittedAt`, `comment`), all other columns treated as answer questionIds (UUIDs from schema)

**Expected CSV format:**

```csv
externalId,moodleUserId,moodleFacultyId,courseId,a3f1b2c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c,b7e2d9f1-c3a4-5b6d-7e8f-9a0b1c2d3e4f,comment
sub_001,1001,2001,3001,4,5,"clear explanations"
sub_002,1002,2001,3001,5,3,
sub_003,1003,2001,3002,4,4,"needs more examples"
```

- Fail-fast header validation before row processing (missing required metadata columns → error, zero answer columns → error)
- Schema-aware header validation: cross-reference answer column headers against the target questionnaire version's question IDs before processing rows
- Type coercion (string → number) using `csv-parse` `cast` option + post-coercion validation (`isFinite()`, `Number.isSafeInteger()`, non-empty required fields, fallback `externalId` to row index)
- Flat row → `RawSubmissionData` transformation with nested `answers[]` array
- Controller endpoint (`POST /api/v1/questionnaires/ingest`) with Multer file upload + config params (`dryRun`, `delimiter`, `maxErrors`, `maxRecords`), default `maxRecords: 500`
- Controller input validation: file type check (Multer `fileFilter`), `versionId` pre-validation (exists + active, `ParseUUIDPipe`)
- Engine timeout fix: extend `withTimeout` to cover mapper + submission (not just `executeSubmission`)
- Dry-run analysis suppression: prevent `submitQuestionnaire()` from dispatching embedding jobs during dry-run
- Updated CSV adapter unit tests + controller integration test
- Expose existing dry-run mode via the controller for validation-only runs

**Implementation details** (not separate features — parser/Multer config flags applied during implementation):

- `csv-parse` options: `bom: true`, `skip_empty_lines: true`, `max_record_size: 65536`, `trim: true`
- Multer: `limits.fileSize` configured for reasonable max

**Out of Scope:**

- Excel adapter changes (stays as-is, future work)
- Mapping DSL (configurable column name mappings for external CSV formats)
- BullMQ async dispatch for ingestion jobs
- API/Moodle adapter implementations
- `BaseStreamAdapter` refactoring
- S3/cloud file storage integration
- Ingestion idempotency key / concurrent upload locking (parallel uploads handled by DB unique constraint)
- In-batch deduplication (DB unique constraint provides clear "already exists" errors — sufficient for ≤500 rows)
- Delimiter mismatch detection (column count mismatch error "expected 9, got 1" already communicates the issue)
- Comment HTML sanitization (cross-cutting concern — existing frontend submit endpoint doesn't sanitize either; fix globally in separate ticket if needed)

## Context for Development

### Codebase Patterns

- **SourceAdapter interface** (`ingestion/interfaces/source-adapter.interface.ts`): Generic async iterable `extract()` method with optional `close()`. CSV adapter must yield `IngestionRecord<RawSubmissionData>` (currently yields `<unknown>`).
- **BaseStreamAdapter** (`ingestion/adapters/base-stream.adapter.ts`): Provides `normalizeKey()` for header normalization (trim, lowercase, strip special chars, collision dedup) and `cleanupStream()` for resource teardown. CSV adapter extends this.
- **IngestionEngine** (`ingestion/services/ingestion-engine.service.ts`): Orchestrates streaming with p-limit(6) concurrency, backpressure (pause at 10 pending), per-record transactions via forked EntityManager, 30s timeout, dry-run with rollback. Passes `record.data` directly to `mapper.map()`.
- **IngestionMapperService** (`ingestion/services/ingestion-mapper.service.ts`): Expects `RawSubmissionData` with `answers: RawAnswerData[]`. Loads respondent/faculty/course via DataLoader batching. Returns `MappedSubmission`.
- **QuestionnaireService.submitQuestionnaire()**: Validates answers against schema snapshot — checks all questions answered, Likert range (1–maxScore), rejects extra questionIds, checks enrollment, prevents duplicates via unique constraint.
- **Dry-run**: Engine wraps submission in transaction then throws `DryRunRollbackError` to rollback. In dry-run mode, `maxErrors` is ignored (processes all records for full validation report).

### Files to Reference

| File                                                                                 | Purpose                                                                      | Action     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------- |
| `src/modules/questionnaires/ingestion/adapters/csv.adapter.ts`                       | Current CSV adapter — swap parser, add row transformation                    | **Modify** |
| `src/modules/questionnaires/ingestion/adapters/csv.adapter.spec.ts`                  | Adapter unit tests — update for new parser + transformation                  | **Modify** |
| `src/modules/questionnaires/ingestion/adapters/base-stream.adapter.ts`               | Base class with `normalizeKey()` and `cleanupStream()` — keep as-is          | Reference  |
| `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts`          | Orchestration engine — extend timeout to cover mapper                        | **Modify** |
| `src/modules/questionnaires/ingestion/services/ingestion-mapper.service.ts`          | Maps `RawSubmissionData` → `MappedSubmission`                                | Reference  |
| `src/modules/questionnaires/ingestion/dto/raw-submission-data.dto.ts`                | Target DTO shape: `RawSubmissionData` with nested `answers: RawAnswerData[]` | Reference  |
| `src/modules/questionnaires/ingestion/dto/ingestion-result.dto.ts`                   | Response shape: `IngestionResultDto` with per-record results                 | Reference  |
| `src/modules/questionnaires/ingestion/types/csv-adapter-config.type.ts`              | CSV-specific config — add `questionIds` field for schema-aware validation    | **Modify** |
| `src/modules/questionnaires/ingestion/types/source-config.type.ts`                   | Base config: `dryRun`, `maxErrors?`, `maxRecords?`                           | Reference  |
| `src/modules/questionnaires/ingestion/interfaces/source-adapter.interface.ts`        | `SourceAdapter<TPayload, TData>` contract with `extract()` + `close?()`      | Reference  |
| `src/modules/questionnaires/ingestion/interfaces/file-storage-provider.interface.ts` | `FileStorageProvider` interface — not needed (Multer buffer used directly)   | Reference  |
| `src/modules/questionnaires/questionnaire.controller.ts`                             | Existing controller — add ingest endpoint here                               | **Modify** |
| `src/modules/questionnaires/questionnaires.module.ts`                                | Module registration — no changes needed (CSVAdapter already registered)      | Reference  |
| `src/modules/questionnaires/services/questionnaire.service.ts`                       | `submitQuestionnaire()` — downstream validation reference                    | Reference  |
| `src/security/decorators/index.ts`                                                   | `UseJwtGuard(...roles)` — use for endpoint auth                              | Reference  |
| `package.json`                                                                       | Swap `csv-parser` → `csv-parse` dependency                                   | **Modify** |

### Technical Decisions

1. **Column convention: metadata allowlist (Option C).** Required metadata columns: `externalId`, `moodleUserId`, `moodleFacultyId`, `courseId`. Optional: `submittedAt`, `comment`. All remaining columns after header normalization are treated as answer questionIds with cell values as numeric answer values.
2. **`csv-parse` over `csv-parser`.** `csv-parse` is better maintained, supports native async iteration, offers `cast` for type coercion, and `columns` as a function for header transformation.
3. **Transformation lives in the CSV adapter.** The adapter owns the knowledge of "these columns are metadata, the rest are answers." It yields `IngestionRecord<RawSubmissionData>` directly, so the engine and mapper need no changes.
4. **Fail-fast header validation.** Before yielding any data rows, the adapter validates that all required metadata columns are present and at least one answer column exists. Throws immediately with a clear error.
5. **Schema-aware answer column validation.** The controller loads the version schema, extracts question IDs, and passes them to the adapter via `CSVAdapterConfig.questionIds?: string[]`. Optional field — if provided, adapter validates answer columns (verbatim, not normalized) against the list before processing rows (mismatches produce a clear error listing expected vs found). If not provided (e.g., in unit tests), schema validation is skipped. The controller always provides it. **Important:** `normalizeKey()` is only applied to metadata column headers for case-insensitive matching. Answer column headers are preserved verbatim since they are UUIDs that must match the schema exactly.
6. **Post-coercion validation.** After `csv-parse` `cast` coerces strings to numbers, validate with `isFinite()` + `Number.isSafeInteger()`. Non-empty check on required metadata fields. Fallback `externalId` to row index if blank.
7. **Controller pre-validation.** Validate file type via Multer `fileFilter`, verify `versionId` exists and is active (via `ParseUUIDPipe` + service lookup). Catches common errors before any row processing begins.
8. **Engine timeout scope.** Extend the existing `withTimeout` wrapper in `IngestionEngine` to cover both `mapper.map()` and `executeSubmission()`, not just `executeSubmission()` alone.
9. **Dry-run analysis suppression.** `submitQuestionnaire()` fires an embedding enqueue (line 606-623) after `em.flush()` — this happens _inside_ the dry-run transaction before `DryRunRollbackError` is thrown. **Approach:** Add a second options parameter: `submitQuestionnaire(data, { skipAnalysis?: boolean })`. The engine passes `{ skipAnalysis: true }` when `config.dryRun` is true. One `if (!options?.skipAnalysis)` guard around the enqueue block. Backward-compatible — existing callers pass no second argument. Additionally, omit `internalId` from `IngestionRecordResult` when `dryRun: true` — the rolled-back UUID is meaningless.
10. **Dry-run exposed via controller.** The existing engine dry-run is surfaced as a `dryRun` parameter on the upload endpoint.
11. **Dean scope delegation.** The controller does NOT add scope validation for deans. Handled downstream by `submitQuestionnaire()` which verifies enrollment per-row.
12. **Deferred by design.** In-batch deduplication (DB constraint sufficient), delimiter mismatch detection (column count error sufficient), and comment HTML sanitization (cross-cutting concern) were evaluated and explicitly deferred — see Out of Scope.

## Implementation Plan

### Tasks

- [x] **Task 1: Swap CSV parser dependency**
  - File: `package.json`
  - Action: Remove `csv-parser` (v3.2.0), add `csv-parse`. Run `npm install`.
  - Notes: `csv-parse` is the parser module from the `csv` project. Import as `import { parse } from 'csv-parse'`.

- [x] **Task 2a: Extend `CSVAdapterConfig` with `questionIds`**
  - File: `src/modules/questionnaires/ingestion/types/csv-adapter-config.type.ts`
  - Action: Add `questionIds?: string[]` to the interface.
  - Notes: Optional to maintain backward compat with unit tests. Controller always provides it.

- [x] **Task 2b: Add `qualitativeComment` to `RawSubmissionData` and update mapper**
  - Files: `src/modules/questionnaires/ingestion/dto/raw-submission-data.dto.ts`, `src/modules/questionnaires/ingestion/services/ingestion-mapper.service.ts`
  - Action:
    1. Add `@IsOptional() @IsString() qualitativeComment?: string` to `RawSubmissionData`
    2. In `IngestionMapperService.map()`, add `qualitativeComment: data.qualitativeComment` to the return object's `data` block (after `externalId` at line 77)
  - Notes: The CSV adapter sets this from the `comment` column. The mapper must pass it through so `submitQuestionnaire()` can store it. `MappedSubmission` already declares the `qualitativeComment?: string` field (line 12) — the mapper just needs to populate it.

- [x] **Task 3: Rewrite `CSVAdapter` with `csv-parse` and row transformation**
  - File: `src/modules/questionnaires/ingestion/adapters/csv.adapter.ts`
  - Action:
    1. Replace `csv-parser` import with `import { parse } from 'csv-parse'`
    2. Configure parser: `{ delimiter, quote, escape, bom: true, skip_empty_lines: true, max_record_size: 65536, trim: true, cast: (value, context) => ... }` and use `columns` as a **function** (not `true`):
       ```typescript
       columns: (headers: string[]) =>
         headers.map((h) => {
           const normalized = h
             .trim()
             .toLowerCase()
             .replace(/[^a-z0-9_-]/g, '');
           return METADATA_COLUMNS.has(normalized) ? normalized : h.trim();
         });
       ```
    3. **Split header normalization algorithm:** The `columns` function receives raw headers and decides per-column:
       - Normalize the header (trim, lowercase, strip special chars)
       - If the normalized form is in `METADATA_COLUMNS` → use the normalized key (for case-insensitive metadata matching)
       - If NOT in `METADATA_COLUMNS` → preserve the original header (trimmed only) as the key — these are answer columns with UUID question IDs that must match the schema exactly
       - This produces objects where metadata keys are normalized (`externalid`, `moodleuserid`) and answer keys are verbatim UUIDs (`a3f1b2c4-...`)
    4. Use `cast` to coerce numeric values (metadata fields + answer values) to numbers
    5. Define `METADATA_COLUMNS` set: `externalid`, `moodleuserid`, `moodlefacultyid`, `courseid`, `submittedat`, `comment`
    6. After headers are resolved, perform fail-fast header validation:
       - Check all required metadata columns present (after normalization: `externalid`, `moodleuserid`, `moodlefacultyid`, `courseid`)
       - Identify answer columns (all columns whose normalized form is not in `METADATA_COLUMNS`)
       - Check at least one answer column exists
       - If `config.questionIds` provided, cross-reference answer columns (verbatim, not normalized) against the list; yield error if mismatch with clear expected-vs-found listing
    7. For each data row, transform flat `Record<string, unknown>` into `RawSubmissionData`:
       - Extract metadata fields by normalized key name
       - Collect answer columns (verbatim keys) into `answers: RawAnswerData[]` array (`{questionId: verbatimColumnName, value: numericValue}`)
       - Post-coercion validation: `isFinite()` + `Number.isSafeInteger()` on `moodleUserId`, `moodleFacultyId`, `courseId`; `isFinite()` on answer values
       - Fallback `externalId` to row index if blank
       - Set `qualitativeComment` from `comment` column if present
    8. Yield `IngestionRecord<RawSubmissionData>` (not `<unknown>`). Set `sourceIdentifier` to the CSV's `externalId` value (not the row index), so the user sees their identifier in the response: `{ data: rawSubmissionData, sourceIdentifier: rawSubmissionData.externalId || rowIndex }`
    9. Preserve `cleanupStream()` and `parser.destroy()` in `finally` block
  - Notes: `csv-parse` natively supports `AsyncIterable` via `for await (const record of parser)`. No manual pipe needed. The `SourceAdapter` interface types `config` as `SourceConfiguration` — access `questionIds` via cast: `(config as CSVAdapterConfig).questionIds`. This is the existing pattern used for `delimiter`, `quote`, `escape`.

- [x] **Task 4: Add `skipAnalysis` option to `submitQuestionnaire()`**
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action:
    1. Add a second parameter: `submitQuestionnaire(data: { ... }, options?: { skipAnalysis?: boolean })`
    2. Wrap the embedding enqueue block (lines 606-623) with `if (!options?.skipAnalysis)`
  - Notes: **Do NOT add `skipAnalysis` to the data object or `MappedSubmission`.** It is a call-site concern, not a data property. Existing callers pass no second argument — defaults to `undefined` (falsy). The engine passes `{ skipAnalysis: true }` when `dryRun` is true.

- [x] **Task 5: Extend engine timeout and wire skipAnalysis**
  - File: `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts`
  - Action:
    1. Move `withTimeout` to wrap both `mapper.map()` and `executeSubmission()` calls (lines 102-117), not just `executeSubmission()`
    2. In `executeSubmission()`, pass the `dryRun` flag through to the service: `this.questionnaireService.submitQuestionnaire(mapped, { skipAnalysis: dryRun })`. This dynamically couples analysis suppression to dry-run mode — non-dry-run calls pass `{ skipAnalysis: false }` which is falsy and allows the enqueue to proceed normally.
    3. When `dryRun`, omit `internalId` from `recordResult` (set to `undefined` instead of the rolled-back UUID)
  - Notes: Timeout stays at 30s. The mapper call is now covered. Note: `withTimeout` races a rejection but does not abort the underlying work — this is the existing pattern and acceptable for this ticket. The background work eventually completes or errors harmlessly.

- [x] **Task 6: Create ingestion request DTO**
  - File: `src/modules/questionnaires/dto/requests/ingest-csv-request.dto.ts` (NEW)
  - Action: Create DTO with class-validator decorators. **Critical: multipart form data sends all fields as strings.** Use `@Transform` from `class-transformer` to coerce before validation:
    ```typescript
    class IngestCsvRequestDto {
      @IsUUID() versionId: string;
      @IsOptional()
      @Transform(({ value }) => value === 'true' || value === true)
      @IsBoolean()
      dryRun?: boolean;
      @IsOptional() @IsString() delimiter?: string;
      @IsOptional()
      @Transform(({ value }) => parseInt(value, 10))
      @IsInt()
      @Min(1)
      maxErrors?: number;
      @IsOptional()
      @Transform(({ value }) => (value != null ? parseInt(value, 10) : 500))
      @IsInt()
      @Min(1)
      @Max(5000)
      maxRecords?: number = 500;
    }
    ```
  - Notes: `versionId` is the only required field. `@Transform` runs before `@IsBoolean`/`@IsInt`, ensuring string `"true"` / `"500"` from multipart form data is coerced to the correct type before validation. `maxRecords` defaults to `500` (not the engine's internal default of `5000`) to prevent HTTP timeouts on large files. Also check if `Express.Multer.File` type resolves — if not, install `@types/multer` as a dev dependency.

- [x] **Task 7: Add ingestion endpoint to controller**
  - File: `src/modules/questionnaires/questionnaire.controller.ts`
  - Action:
    1. Add `POST ingest` endpoint:
       ```typescript
       @Post('ingest')
       @UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEAN)
       @UseInterceptors(FileInterceptor('file', {
         fileFilter: csvFileFilter,
         limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
       }))
       @ApiOperation({ summary: 'Ingest questionnaire submissions from CSV' })
       @ApiConsumes('multipart/form-data')
       async ingestCsv(
         @UploadedFile() file: Express.Multer.File,
         @Body() dto: IngestCsvRequestDto,
       ): Promise<IngestionResultDto>
       ```
    2. Implement `csvFileFilter` — reject non-CSV files (check extension `.csv` and/or MIME)
    3. Pre-validate: file exists (throw 400 if not), load version by `versionId` (throw 404 if not found or not active)
    4. Extract question IDs from version's `schemaSnapshot` using `getAllQuestions()` pattern
    5. Create `Readable` from `file.buffer`, build `CSVAdapterConfig` with `questionIds`
    6. Call `ingestionEngine.processStream(csvAdapter, readable, config, versionId)`
    7. Return `IngestionResultDto`
  - Notes: Inject `IngestionEngine`, `CSVAdapter`, `QuestionnaireService` (for version lookup). Import `FileInterceptor` from `@nestjs/platform-express`, `UploadedFile` from `@nestjs/common`. If `Express.Multer.File` type does not resolve, install `@types/multer` as a dev dependency.

- [x] **Task 8: Rewrite CSV adapter unit tests**
  - File: `src/modules/questionnaires/ingestion/adapters/csv.adapter.spec.ts`
  - Action: Update all 6 existing tests for `csv-parse` API, then add new tests:
    1. Existing (update): normalized keys, key collisions, custom delimiters, stream errors, cleanup, backpressure
    2. New: metadata column extraction + answer column separation
    3. New: flat row → `RawSubmissionData` transformation (verify `answers[]` array shape)
    4. New: type coercion (string `"1001"` → number `1001`)
    5. New: post-coercion validation (`NaN` value → error record, `MAX_SAFE_INTEGER` overflow → error record)
    6. New: fail-fast header validation (missing `moodleUserId` → throws)
    7. New: zero answer columns → throws
    8. New: schema-aware validation with `questionIds` config (mismatched columns → error)
    9. New: empty `externalId` fallback to row index
    10. New: BOM handling (prepend `\uFEFF` to fixture CSV)
  - Notes: Keep direct instantiation pattern (`new CSVAdapter()`). Use `Readable.from(csvData)`.

- [x] **Task 9: Add controller unit tests**
  - File: `src/modules/questionnaires/questionnaire.controller.spec.ts` (NEW)
  - Action: Test the ingest endpoint using NestJS TestingModule with mocked services:
    1. Auth: SUPER_ADMIN can upload (200), ADMIN can upload (200), DEAN can upload (200), STUDENT gets 403
    2. Happy path: valid CSV buffer + active version → `IngestionResultDto` with successes
    3. No file attached → 400
    4. Invalid file type → 400
    5. Invalid `versionId` (not UUID) → 400
    6. Non-existent `versionId` → 404
    7. Dry-run: returns results with `dryRun: true`, no `internalId`, no persisted data
    8. `maxRecords` truncation: CSV with rows exceeding `maxRecords` → response `total` reflects truncated count
  - Notes: Use NestJS TestingModule with `jest.fn()` mocks for `QuestionnaireService`, `IngestionEngine`, and `CSVAdapter`. Test HTTP behavior via the compiled module, not supertest against a running app.

### Acceptance Criteria

- [ ] **AC 1:** Given a valid CSV file with correct metadata columns and answer columns matching an active questionnaire version's question IDs, when uploaded via `POST /api/v1/questionnaires/ingest` by a SUPER_ADMIN, then all rows are processed and `IngestionResultDto` returns with `successes` equal to total rows.

- [ ] **AC 2:** Given a CSV file missing a required metadata column (e.g., `moodleUserId`), when uploaded, then the request fails immediately with a clear error listing the missing column(s) — no rows are processed.

- [ ] **AC 3:** Given a CSV file with answer columns that don't match the target version's question IDs, when uploaded, then the request fails immediately with an error listing expected vs found question IDs.

- [ ] **AC 4:** Given a valid CSV uploaded with `dryRun: true`, when processed, then all rows are validated end-to-end (mapper + submit), the response shows per-row success/failure, no submissions are persisted in the database, no analysis jobs are dispatched, and `internalId` is omitted from results.

- [ ] **AC 5:** Given a CSV with mixed valid and invalid rows (e.g., some with non-existent Moodle user IDs), when uploaded, then valid rows succeed, invalid rows fail with specific error messages, and the response accurately reflects the counts.

- [ ] **AC 6:** Given a user with `STUDENT` role, when they attempt to upload a CSV, then they receive a 403 Forbidden response.

- [ ] **AC 7:** Given a user with `DEAN` role, when they upload a valid CSV, then the ingestion succeeds (auth allows SUPER_ADMIN, ADMIN, DEAN).

- [ ] **AC 8:** Given a CSV where a numeric field contains a non-numeric value (e.g., `moodleUserId` = `"abc"`), when processed, then that row yields an error record with a clear message about invalid numeric value.

- [ ] **AC 9:** Given a request without a file attached, when sent to the ingest endpoint, then a 400 response is returned with a "No file uploaded" message.

- [ ] **AC 10:** Given a `versionId` that does not exist or is not active, when the ingest endpoint is called, then a 404 response is returned before any CSV processing begins.

- [ ] **AC 11:** Given the `csv-parser` package, when checked in `package.json`, then it is no longer present and `csv-parse` is installed in its place.

- [ ] **AC 12:** Given a CSV with more rows than `maxRecords` (e.g., 501 rows with `maxRecords: 500`), when uploaded, then only the first 500 rows are processed, the response `total` field reflects the truncated count, and the engine logs a warning about the truncation.

- [ ] **AC 13:** Given a CSV with a `comment` column containing "great teacher", when uploaded and processed successfully, then the persisted `QuestionnaireSubmission` has `qualitativeComment` set to "great teacher" (round-trip: CSV `comment` → `RawSubmissionData.qualitativeComment` → `MappedSubmission.qualitativeComment` → submission).

## Additional Context

### Dependencies

- `csv-parse` npm package (replacing `csv-parser`)
- `@nestjs/platform-express` (Multer — already installed, v11.0.1)

### Testing Strategy

**Unit Tests (CSV Adapter):**

- Rewrite 6 existing tests for `csv-parse` API compatibility
- Add ~10 new tests covering: row transformation, type coercion, post-coercion validation, header validation (fail-fast), schema-aware validation, BOM handling, empty externalId fallback
- Pattern: direct instantiation (`new CSVAdapter()`), `Readable.from(csvFixture)`, no TestingModule needed

**Unit Tests (Engine):**

- Add test verifying `withTimeout` covers mapper + submission
- Add test verifying `skipAnalysis` is passed through during dry-run
- Add test verifying `internalId` omitted from results during dry-run

**Controller Unit Tests** (`questionnaire.controller.spec.ts`):

- Auth matrix: SUPER_ADMIN (200), ADMIN (200), DEAN (200), STUDENT (403)
- Happy path with fixture CSV buffer
- Error cases: no file (400), bad file type (400), invalid versionId (400/404)
- Dry-run mode: no persistence, no analysis dispatch
- `maxRecords` truncation behavior
- Pattern: NestJS TestingModule with `jest.fn()` mocked services

**Manual Testing:**

- Upload a real CSV with 10-50 rows against a local dev instance with an active questionnaire version
- Verify dry-run returns full validation report
- Verify real run persists submissions and triggers embedding jobs (requires Redis + mock worker via `docker compose up`)

### Feynman Technique Findings

Explaining the feature simply revealed critical gaps:

| #   | Gap                                                                                                                                                  | Severity | Action                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Analysis dispatch inside forked EM — may fail silently in ingestion context                                                                          | Medium   | Verify `AnalysisService.EnqueueJob()` works within `RequestContext.create()` forked EM; document if known limitation |
| 2   | **Dry-run dispatches real analysis jobs** for rolled-back submissions (`submitQuestionnaire()` fires embedding enqueue before `DryRunRollbackError`) | **High** | Engine must suppress analysis dispatch during dry-run — pass flag to skip enqueue or restructure call                |
| 3   | `versionId` UUID format not validated at controller                                                                                                  | Low      | Add UUID validation in request DTO                                                                                   |

### Red Team vs Blue Team Findings

Adversarial testing of the ingestion pipeline:

| Attack Vector                              | Result                    | Action                                            |
| ------------------------------------------ | ------------------------- | ------------------------------------------------- |
| CSV bomb (oversized fields / many columns) | Defended                  | `max_record_size` + schema validation block it    |
| SQL injection via cell values              | Defended                  | MikroORM parameterized queries                    |
| XSS via `comment` field                    | Gap                       | Strip HTML tags during transformation             |
| Parallel duplicate uploads                 | Defended by DB constraint | Document behavior; idempotency key is future work |
| Malicious file type (renamed .exe)         | Defended                  | No file persistence; parser fails on binary       |
| Numeric overflow (>MAX_SAFE_INTEGER)       | Gap                       | Add `Number.isSafeInteger()` check                |
| Slow DataLoader batch timeout              | Gap                       | Extend `withTimeout` to cover mapper + submission |

### Failure Mode Analysis

Component-level failure modes examined across parser, transformer, mapper, engine, and controller:

**Parser (`csv-parse`):**

- Malformed CSV (unclosed quotes) → caught per-row, but remaining rows lost after parser death
- Encoding mismatch (Latin-1 as UTF-8) → out of scope for this ticket, noted as future risk
- Extremely long fields → mitigated by `max_record_size: 64KB`
- Delimiter mismatch → detect single-column rows, surface actionable error

**Row Transformer (new):**

- `NaN` after coercion → `isFinite()` validation on all numeric fields
- Non-numeric answer values (e.g., `"strongly agree"`) → validate all answers are finite numbers
- Empty `externalId` → fallback to row index
- Answer value `0` → passes adapter validation (`isFinite(0)` is true), rejected downstream by `submitQuestionnaire()` Likert range check (1–maxScore). The adapter does NOT perform Likert validation — it has no access to `maxScore`.

**Mapper:**

- User/course not synced from Moodle → enhance error with "ensure sync is up to date" hint
- All other failure modes properly handled by existing per-record error catching

**Engine:**

- Concurrent write conflicts on same submission key → DB unique constraint is safety net, in-batch dedup prevents gracefully
- EntityManager lifecycle, adapter cleanup, Promise.all handling → all properly handled

**Controller (new):**

- No file / wrong file type → validate extension + MIME before parsing
- File too large → Multer `limits.fileSize`
- Invalid/inactive `versionId` → pre-validate before starting engine
- Missing required params → DTO validation

### Pre-mortem Findings

The following failure scenarios were identified and mitigations added to scope:

| #   | Failure Scenario                                      | Root Cause                                                                                       | Prevention                                                                                                            |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | All rows fail with "Answer for question X is missing" | CSV answer column headers don't match schema question IDs (e.g., human-readable labels vs UUIDs) | Cross-reference answer columns against version schema before processing; fail-fast with clear expected-vs-found error |
| 2   | Dry-run passes but real run hits duplicate conflicts  | In-batch duplicates not detected during dry-run (each record rolled back independently)          | **Deferred** — DB unique constraint provides clear "already exists" error per-row; sufficient for ≤500 rows           |
| 3   | Rows silently skipped (trailing empty lines)          | Empty rows pass column count check but have no data                                              | Enable `skip_empty_lines`, validate required metadata non-empty after coercion                                        |
| 4   | HTTP timeout on large files, partial data persisted   | Synchronous processing of large CSVs exceeds proxy timeout                                       | Set sensible default `maxRecords` (500) on controller; document practical limits                                      |
| 5   | String values cause silent data corruption            | Inconsistent type coercion across JS operators                                                   | Use `csv-parse` `cast` option + explicit post-transform `typeof number` validation                                    |
| 6   | BOM character breaks first column recognition         | Excel-exported CSVs include UTF-8 BOM prefix                                                     | Enable `csv-parse` `bom: true` option                                                                                 |

### Notes

- The `versionId` parameter must be provided with the upload request to identify which questionnaire version the submissions target.
- The existing `QuestionnaireService.submitQuestionnaire()` handles all downstream validation (schema matching, Likert range, duplicates, enrollment checks). The adapter's job is to produce correctly shaped `RawSubmissionData`.
- `UserRole.DEAN` confirmed in `src/modules/auth/roles.enum.ts` (line 4). Moodle `manager` role maps to DEAN (line 13). No blocker.
- `submitQuestionnaire()` takes an inline type parameter (not `MappedSubmission`). `skipAnalysis` is added as a second options parameter: `submitQuestionnaire(data, { skipAnalysis })`. Backward-compatible — existing callers pass no second argument.
- Answer column headers in the CSV must be the actual UUID question IDs from the questionnaire version's schema snapshot, not human-readable labels. Answer columns are preserved verbatim (no `normalizeKey()`), while metadata columns are normalized for case-insensitive matching.
- **Known limitation:** The `submittedAt` column is parsed from the CSV but currently ignored. `submitQuestionnaire()` hardcodes `submittedAt: new Date()`. Historical timestamps in the CSV are silently dropped. Threading `submittedAt` through the mapper and service is a separate enhancement.
- **Known limitation:** `withTimeout` races a rejection but does not abort the underlying DataLoader/DB work. The background work completes or errors harmlessly. Proper `AbortController` propagation is a larger refactor deferred to a future ticket.
- **Platform assumption:** The project uses `@nestjs/platform-express` (Express adapter). `FileInterceptor` requires Express, not Fastify.
