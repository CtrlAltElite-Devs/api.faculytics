---
title: 'Report Generation Infrastructure — Faculty Evaluation PDF'
slug: 'report-generation-faculty-pdf'
created: '2026-04-01'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    'NestJS',
    'MikroORM',
    'PostgreSQL',
    'BullMQ',
    'Redis',
    'Puppeteer',
    'Handlebars',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'Zod',
  ]
files_to_modify:
  - 'src/configurations/common/queue-names.ts'
  - 'src/configurations/env/bullmq.env.ts'
  - 'src/configurations/env/index.ts'
  - 'src/modules/index.module.ts'
  - 'src/modules/analytics/analytics.module.ts'
  - 'src/entities/index.entity.ts'
  - '.env.sample'
files_to_create:
  - 'src/modules/reports/reports.module.ts'
  - 'src/modules/reports/reports.controller.ts'
  - 'src/modules/reports/reports.service.ts'
  - 'src/modules/reports/processors/report-generation.processor.ts'
  - 'src/modules/reports/services/pdf.service.ts'
  - 'src/modules/reports/services/r2-storage.service.ts'
  - 'src/modules/reports/interfaces/storage-provider.interface.ts'
  - 'src/modules/reports/templates/faculty-evaluation.hbs'
  - 'src/modules/reports/templates/report.css'
  - 'src/modules/reports/dto/generate-report.dto.ts'
  - 'src/modules/reports/dto/generate-batch-report.dto.ts'
  - 'src/modules/reports/dto/report-status.response.dto.ts'
  - 'src/modules/reports/dto/batch-status.response.dto.ts'
  - 'src/entities/report-job.entity.ts'
  - 'src/repositories/report-job.repository.ts'
  - 'src/modules/reports/jobs/report-cleanup.job.ts'
  - 'src/configurations/env/r2.env.ts'
  - 'src/configurations/env/report.env.ts'
code_patterns:
  [
    'AuditProcessor (WorkerHost + @Processor)',
    'ScopeResolverService for auth scoping',
    'CustomBaseEntity for entities',
    'Zod env schemas',
    'PascalCase public methods',
    'em.fork() for processor DB ops',
    'CurrentUserService via CLS for user context',
    '@InjectQueue for job enqueuing',
  ]
test_patterns:
  [
    'TestingModule with jest.fn() mocks',
    '.spec.ts alongside source',
    'mock EntityManager and Queue',
  ]
---

# Tech-Spec: Report Generation Infrastructure — Faculty Evaluation PDF

**Created:** 2026-04-01

## Overview

### Problem Statement

Faculty admins, deans, and chairpersons need to export per-faculty evaluation reports as downloadable PDFs matching the institution's official format. Generating these synchronously isn't viable due to Puppeteer rendering time and potential batch sizes across departments/campuses (5 campuses, potentially hundreds of faculty).

### Solution

Async PDF report generation via BullMQ, with Puppeteer + Handlebars rendering existing analytics data into the official evaluation form layout. Reports stored in Cloudflare R2 with time-limited presigned download URLs. Batch support via scope filters delegated to `ScopeResolverService`. One `ReportJob` per faculty, linked by `batchId` for batch requests.

### Scope

**In Scope:**

- Single faculty evaluation PDF generation (`POST /reports/generate`)
- Batch PDF generation with scope filters — departmentId, programId (`POST /reports/generate/batch`)
- BullMQ async processing — one `ReportJob` per faculty, linked by `batchId` for batches
- Cloudflare R2 storage with presigned download URLs (1hr expiry)
- Puppeteer (persistent browser instance) + Handlebars template matching the official evaluation form
- `ReportJob` entity with user ownership tracking (`requestedById`)
- Job status polling endpoints (single + batch)
- Cleanup cron for expired reports and R2 objects
- Role-agnostic design — delegates entirely to `ScopeResolverService`
- Batch size cap as safety valve
- Thin `StorageProvider` abstraction for testability

**Out of Scope:**

- Excel export (future phase)
- Department summary rollup report (future phase)
- New user roles (campus head, VP — separate auth feature)
- Report scheduling (cron-based)
- Frontend report viewer (download only)
- Real-time/streaming report generation
- Per-course filtered reports (v1 always generates aggregate across all courses for a faculty/semester)

## Context for Development

### Codebase Patterns

**Processor Pattern (follow AuditProcessor):**

- Extend `WorkerHost` from `@nestjs/bullmq`
- Decorate with `@Processor(QueueName.REPORT_GENERATION, { concurrency: 2 })`
- Implement `async process(job: Job<ReportJobMessage>)`
- Use `this.em.fork()` for isolated DB context in each job
- Handle failures via `@OnWorkerEvent('failed')` decorator
- Import: `Processor, WorkerHost, OnWorkerEvent` from `@nestjs/bullmq`, `Job` from `bullmq`

**Service Pattern (follow AuditService):**

- Inject queue via `@InjectQueue(QueueName.REPORT_GENERATION) private readonly reportQueue: Queue`
- Enqueue with `this.reportQueue.add('report', payload, { attempts, removeOnComplete, removeOnFail })`
- Wrap enqueue in try-catch, log warnings on failure

**Module Pattern (follow AuditModule):**

- Register queue: `BullModule.registerQueue({ name: QueueName.REPORT_GENERATION })`
- Register entities: `MikroOrmModule.forFeature([ReportJob])`
- Import `CommonModule` for `ScopeResolverService`
- Import `AnalyticsModule` for `AnalyticsService` (data source)
- Export `ReportsService` (not Processor — internal concern)

**Authorization Pattern:**

- Controller: `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN, UserRole.CHAIRPERSON)`
- Apply `@UseInterceptors(CurrentUserInterceptor)` for CLS user context
- **CLS flow**: `CurrentUserInterceptor` loads the full User entity into CLS _before_ the service method runs. `ScopeResolverService` reads the user from CLS internally — it does NOT accept a userId parameter. The `userId` passed from the controller to the service is for entity ownership tracking (`requestedBy`), NOT for scope resolution.
- Access user: `req.user!.userId` from `AuthenticatedRequest` in controller (for passing to service), `CurrentUserService.getOrFail()` in service internals (for scope resolution via CLS)
- Scope: `ScopeResolverService.ResolveDepartmentIds(semesterId)` returns `null` (unrestricted) or `string[]`

**Data Source (existing AnalyticsService methods):**

- `GetFacultyReport(facultyId, { semesterId, questionnaireTypeCode })` → `FacultyReportResponseDto`
- `GetFacultyReportComments(facultyId, { semesterId, questionnaireTypeCode, page, limit })` → `FacultyReportCommentsResponseDto`
- Comments are paginated (max 100 per page) — processor must loop pages or add internal unpaginated method
- Scope validation (`validateFacultyScope`) runs inside these methods — processor calls must run within a user context or bypass scope validation via a dedicated internal method

**Entity Pattern:**

- Extend `CustomBaseEntity` (UUID pk, timestamps, soft delete)
- Declare repository: `@Entity({ repository: () => ReportJobRepository })`
- Repository in `src/repositories/`

**Env Config Pattern:**

- Zod schema per concern in `src/configurations/env/`
- Merge via spread in `src/configurations/env/index.ts`
- Access via `import { env } from 'src/configurations/index.config'`

**Cron Job Pattern (follow RefreshTokenCleanupJob):**

- Extend `BaseJob`, call `super(schedulerRegistry, ClassName.name)`
- Use `@Cron('expression', { name: ClassName.name })` on handler
- Implement `isRunning` guard against concurrent execution
- Record results via `StartupJobRegistry.record()`
- Note: `ReportCleanupJob` lives INSIDE `ReportsModule` (not in `AllCronJobs`) because it needs `STORAGE_PROVIDER` and `ReportJobRepository` from that module's DI context. The `@Cron()` decorator works from any module.

### Files to Reference

| File                                                                          | Purpose                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/modules/audit/audit.processor.ts`                                        | Processor pattern to follow (WorkerHost, concurrency, em.fork)         |
| `src/modules/audit/audit.service.ts`                                          | Service pattern for @InjectQueue and job enqueuing                     |
| `src/modules/audit/audit.module.ts`                                           | Module registration pattern (queue, entity, exports)                   |
| `src/modules/analytics/analytics.service.ts`                                  | Data source — `GetFacultyReport()`, `GetFacultyReportComments()`       |
| `src/modules/analytics/dto/responses/faculty-report.response.dto.ts`          | Report data structure (sections, questions, averages, interpretations) |
| `src/modules/analytics/dto/responses/faculty-report-comments.response.dto.ts` | Comments data structure (paginated items + meta)                       |
| `src/modules/analytics/lib/interpretation.util.ts`                            | Score-to-label interpretation mapping                                  |
| `src/modules/common/services/scope-resolver.service.ts`                       | Scope resolution by role (returns dept IDs or null)                    |
| `src/modules/common/cls/current-user.service.ts`                              | CLS-based user context access                                          |
| `src/modules/common/common.module.ts`                                         | Exports ScopeResolverService, CurrentUserService                       |
| `src/security/decorators/index.ts`                                            | `UseJwtGuard()` decorator with role params                             |
| `src/modules/common/interceptors/current-user.interceptor.ts`                 | Loads full User entity into CLS                                        |
| `src/entities/base.entity.ts`                                                 | CustomBaseEntity (UUID, timestamps, soft delete)                       |
| `src/configurations/common/queue-names.ts`                                    | QueueName const object — add REPORT_GENERATION                         |
| `src/configurations/env/bullmq.env.ts`                                        | Zod schema for BullMQ env vars — add report concurrency                |
| `src/configurations/env/index.ts`                                             | Env schema merge point — add r2.env.ts                                 |
| `src/crons/jobs/auth-jobs/refresh-token-cleanup.job.ts`                       | Cleanup cron pattern (BaseJob, @Cron, isRunning guard)                 |
| `src/crons/base.job.ts`                                                       | Abstract base class for cron jobs                                      |
| `src/crons/index.jobs.ts`                                                     | AllCronJobs registration array                                         |
| `src/modules/index.module.ts`                                                 | ApplicationModules array — add ReportsModule                           |
| `src/entities/user.entity.ts`                                                 | User entity — roles, campus/department/program associations            |
| `src/entities/department.entity.ts`                                           | Department entity — ManyToOne Semester                                 |
| `src/entities/campus.entity.ts`                                               | Campus entity — OneToMany Semester                                     |

### Technical Decisions

- **Puppeteer over lighter PDF libs**: The official evaluation form requires precise table rendering with cell borders, weighted section headers, and formatted layout. Puppeteer + Handlebars is the pragmatic choice for this form factor.
- **AuditProcessor pattern over BaseAnalysisProcessor**: PDF rendering happens in-process — no external worker needed. Matches the audit processor's self-contained model.
- **One ReportJob per faculty with batchId**: Allows individual report downloads as they complete during batch processing. If one faculty report fails, others still succeed. Status endpoint aggregates by batchId.
- **Scope filters over role-based endpoints**: The batch endpoint accepts optional `departmentId` and `programId` filters. `campusId` was intentionally excluded because `Semester` has a `ManyToOne` to `Campus` — each semester belongs to exactly one campus, so providing `semesterId` already implicitly scopes to a campus. `ScopeResolverService` enforces the ceiling. Future roles (campus head, VP) only require changes to `ScopeResolverService`, not the reports module.
- **Thin StorageProvider abstraction**: Interface with `Upload(key, buffer, contentType)` and `GetPresignedUrl(key, expiresInSeconds)`. R2 implementation behind it. Testability without leaking SDK types into domain layer.
- **Persistent Puppeteer browser instance**: Launched in `OnModuleInit`, closed in `OnModuleDestroy`. Avoids per-job browser launch overhead.
- **Processor scope bypass**: The processor runs in a background worker context without HTTP request/CLS user context. The service layer must resolve faculty list and validate scope _before_ enqueuing. The processor receives pre-validated `facultyId` + query params and calls analytics methods directly (bypassing scope checks, since authorization was already performed at enqueue time).
- **R2 key convention**: `reports/{reportType}/{semesterId}/{batchId}/{facultyId}.pdf` — enables easy batch cleanup and listing.
- **No courseId filter in v1**: The `FacultyReportQueryDto` supports optional `courseId`, but the report system deliberately omits it. Faculty evaluation PDFs always show the aggregate across all courses for a given semester — matching the physical form format (one form per faculty per semester). Per-course filtered reports are a future enhancement.
- **Deduplication at enqueue time**: Before creating a `ReportJob`, check for an existing job with the same `{ facultyId, semesterId, questionnaireTypeCode, reportType }` in `'waiting'` or `'active'` status. Return the existing `jobId` instead of creating a duplicate. A unique partial index enforces this at the DB level for race conditions.

## Implementation Plan

### Tasks

#### Layer 0: Configuration & Environment

- [ ] Task 1: Add R2 environment schema
  - File: `src/configurations/env/r2.env.ts` (create)
  - Action: Create Zod schema with **all credentials optional** (follows the pattern of `SENTIMENT_WORKER_URL` etc.):
    - `CF_ACCOUNT_ID` → `z.string().optional()`
    - `R2_ACCESS_KEY_ID` → `z.string().optional()`
    - `R2_SECRET_ACCESS_KEY` → `z.string().optional()`
    - `R2_BUCKET_NAME` → `z.string().default('faculytics-reports')`
  - Notes: Making credentials optional ensures local dev, CI, and non-report environments can start without R2 configured. The `R2StorageService` handles the runtime guard (see Task 11).
  - Reference: `src/configurations/env/redis.env.ts` for pattern

- [ ] Task 2a: Add report processor concurrency to BullMQ schema
  - File: `src/configurations/env/bullmq.env.ts` (modify)
  - Action: Add `REPORT_GENERATION_CONCURRENCY` (coerce number, default `2`) — this IS a BullMQ concern (processor concurrency)

- [ ] Task 2b: Create report-specific env schema
  - File: `src/configurations/env/report.env.ts` (create)
  - Action: Create Zod schema with domain-specific report config (NOT BullMQ concerns):
    - `REPORT_PRESIGNED_URL_EXPIRY_SECONDS` (coerce number, default `3600`)
    - `REPORT_BATCH_MAX_SIZE` (coerce number, default `100`)
    - `REPORT_RETENTION_DAYS` (coerce number, default `7`)
  - Notes: Follows the "Zod schema per concern" pattern — these are application-domain config, not BullMQ config.

- [ ] Task 3: Register new env schemas
  - File: `src/configurations/env/index.ts` (modify)
  - Action: Import and spread both `r2EnvSchema` and `reportEnvSchema` into the merged schema object

- [ ] Task 4: Add REPORT_GENERATION queue name
  - File: `src/configurations/common/queue-names.ts` (modify)
  - Action: Add `REPORT_GENERATION: 'report-generation'` to the `QueueName` object

#### Layer 1: Entity, Repository & Migration

- [ ] Task 5: Create ReportJob entity
  - File: `src/entities/report-job.entity.ts` (create)
  - Action: Create entity extending `CustomBaseEntity` with:
    - `reportType: string` — e.g. `'faculty_evaluation'`
    - `status: string` — `'waiting' | 'active' | 'completed' | 'failed' | 'skipped'`
    - `requestedBy: User` — `@ManyToOne(() => User)`, the requesting user
    - `facultyId: string` — target faculty UUID
    - `facultyName: string` — snapshot of faculty name at generation time
    - `semesterId: string` — semester UUID
    - `questionnaireTypeCode: string` — questionnaire type filter
    - `batchId?: string` — nullable, links batch jobs together; indexed
    - `storageKey?: string` — nullable, R2 object key (set on completion)
    - `error?: string` — nullable, error message (set on failure)
    - `completedAt?: Date` — nullable, completion timestamp
  - Notes: Do NOT store `downloadUrl` — generate presigned URLs on-the-fly from `storageKey` at query time. Index on `batchId` and `requestedBy` for efficient queries.
  - **Critical**: Also add `ReportJob` to the exports and `entities` array in `src/entities/index.entity.ts`. MikroORM discovers entities from this central registry — without it, migrations won't see the entity and all ORM operations will fail. `MikroOrmModule.forFeature([ReportJob])` in the module only scopes injection, it does NOT substitute for global registration.
  - Reference: `src/entities/base.entity.ts` for base class pattern, `src/entities/index.entity.ts` for registration

- [ ] Task 6: Create ReportJobRepository
  - File: `src/repositories/report-job.repository.ts` (create)
  - Action: Create custom repository with:
    - `FindByJobId(jobId: string)` — find single job by ID
    - `FindByBatchId(batchId: string)` — find all jobs in a batch
    - `FindExpiredCompleted(cutoffDate: Date)` — find completed jobs older than cutoff (for cleanup)
    - `FindByRequestedBy(userId: string)` — find all jobs by requesting user
  - Reference: existing repository files in `src/repositories/`

- [ ] Task 7: Create migration for report_job table
  - Action: Run `npx mikro-orm migration:create` to generate migration, then populate with:
    - `report_job` table with all columns from entity
    - Index on `batch_id` (partial: `WHERE batch_id IS NOT NULL`)
    - Index on `requested_by_id`
    - Index on `status`
    - Index on `(status, completed_at)` for cleanup queries
    - **Unique partial index for dedup**: `CREATE UNIQUE INDEX uq_report_job_pending ON report_job (faculty_id, semester_id, questionnaire_type_code, report_type) WHERE status IN ('waiting', 'active')` — prevents duplicate pending/active jobs for the same faculty+semester+type combination at the DB level

#### Layer 2: DTOs

- [ ] Task 8: Create request DTOs
  - File: `src/modules/reports/dto/generate-report.dto.ts` (create)
  - Action: Create `GenerateReportDto` with:
    - `facultyId: string` — `@IsUUID()`
    - `semesterId: string` — `@IsUUID()`
    - `questionnaireTypeCode: string` — `@IsString() @IsNotEmpty()`
  - File: `src/modules/reports/dto/generate-batch-report.dto.ts` (create)
  - Action: Create `GenerateBatchReportDto` with:
    - `semesterId: string` — `@IsUUID()`
    - `questionnaireTypeCode: string` — `@IsString() @IsNotEmpty()`
    - `departmentId?: string` — `@IsUUID() @IsOptional()`
    - `programId?: string` — `@IsUUID() @IsOptional()`
  - Notes: `campusId` intentionally excluded — `Semester` belongs to exactly one `Campus`, so `semesterId` already implicitly scopes to a campus.

- [ ] Task 9: Create response DTOs
  - File: `src/modules/reports/dto/report-status.response.dto.ts` (create)
  - Action: Create `ReportStatusResponseDto` with:
    - `jobId: string`
    - `status: 'waiting' | 'active' | 'completed' | 'failed' | 'skipped'`
    - `facultyName: string`
    - `downloadUrl?: string` — present only when `status === 'completed'`
    - `expiresAt?: string` — ISO timestamp of URL expiry
    - `error?: string` — present only when `status === 'failed'`
    - `message?: string` — present when `status === 'skipped'` (e.g., "No evaluation data found")
    - `createdAt: string`
    - `completedAt?: string`
  - File: `src/modules/reports/dto/batch-status.response.dto.ts` (create)
  - Action: Create `BatchStatusResponseDto` with:
    - `batchId: string`
    - `total: number`
    - `completed: number`
    - `failed: number`
    - `skipped: number`
    - `active: number`
    - `waiting: number`
    - `jobs: ReportStatusResponseDto[]` — paginated subset of jobs for current page
    - `meta: { totalItems, itemCount, itemsPerPage, totalPages, currentPage }` — pagination metadata (same structure as `FacultyReportCommentsResponseDto.meta`)

#### Layer 3: Interfaces

- [ ] Task 10: Create StorageProvider interface
  - File: `src/modules/reports/interfaces/storage-provider.interface.ts` (create)
  - Action: Define interface:
    ```typescript
    export interface StorageProvider {
      Upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
      GetPresignedUrl(key: string, expiresInSeconds: number): Promise<string>;
      Delete(key: string): Promise<void>;
      DeleteByPrefix(prefix: string): Promise<void>;
    }
    ```
  - Notes: `DeleteByPrefix` is needed for batch cleanup (delete all objects under `reports/{type}/{semesterId}/{batchId}/`). Use injection token `STORAGE_PROVIDER` for DI.

#### Layer 4: Services (independent — no inter-service deps)

- [ ] Task 11: Create R2StorageService
  - File: `src/modules/reports/services/r2-storage.service.ts` (create)
  - Action: Implement `StorageProvider` interface using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`:
    - **Constructor**: Check if `env.CF_ACCOUNT_ID`, `env.R2_ACCESS_KEY_ID`, and `env.R2_SECRET_ACCESS_KEY` are all present. If any are missing, set `this.isConfigured = false` and log a warning: `'R2 storage not configured — report generation will be unavailable'`. If all present, initialize `S3Client` with R2 endpoint, region `'auto'`, and credentials.
    - **Runtime guard**: All methods (`Upload`, `GetPresignedUrl`, `Delete`, `DeleteByPrefix`) must check `this.isConfigured` first and throw `ServiceUnavailableException('R2 storage is not configured')` if false. This allows the application to start without R2 credentials while failing gracefully at report generation time.
    - `Upload()`: Use `PutObjectCommand` with `Body: buffer`, `ContentType`, `Key`
    - `GetPresignedUrl()`: Use `GetObjectCommand` + `getSignedUrl()` from presigner
    - `Delete()`: Use `DeleteObjectCommand`
    - `DeleteByPrefix()`: Use `ListObjectsV2Command` in a **paginated loop** (`do...while` on `IsTruncated`, passing `ContinuationToken` from each response) to handle prefixes with >1000 objects. Collect all keys, then batch delete via `DeleteObjectsCommand` (max 1000 keys per call — batch if needed).
  - Notes: Inject `STORAGE_PROVIDER` token. Register as provider in module with `{ provide: STORAGE_PROVIDER, useClass: R2StorageService }`

- [ ] Task 12: Create PdfService
  - File: `src/modules/reports/services/pdf.service.ts` (create)
  - Action: Implement PDF generation with Puppeteer + Handlebars:
    - `OnModuleInit`: Launch persistent Puppeteer browser with `--no-sandbox`, `--disable-setuid-sandbox`
    - `OnModuleDestroy`: Close browser instance
    - `GenerateFacultyEvaluationPdf(data: FacultyReportResponseDto, comments: ReportCommentDto[]): Promise<Buffer>`:
      1. Read and compile Handlebars template from `templates/faculty-evaluation.hbs`
      2. Read CSS from `templates/report.css`
      3. Render HTML with data context (sections, questions, averages, interpretations, comments)
      4. Create new browser page, set HTML content
      5. Generate PDF with options: `format: 'A4'`, `printBackground: true`, margins `20mm top/bottom`, `15mm left/right`
      6. Close page, return PDF buffer
    - Cache compiled Handlebars template (compile once on first call)
    - **Browser crash recovery**: Wrap `browser.newPage()` in a try-catch. On failure (Chromium OOM, zombie process, stale ref), attempt to relaunch the browser (`this.browser = await puppeteer.launch(...)`) and retry page creation once. Log the recovery event. If relaunch also fails, throw — the job fails and BullMQ retries it per configured attempts.
    - **Page-level cleanup**: All page operations (`setContent`, `pdf`) must be wrapped in `try/finally` to ensure `page.close()` is always called, even on partial failure. This prevents page leaks when `page.pdf()` throws or hangs.
  - Notes: Template context shape matches `FacultyReportResponseDto` + flat comments array. Template will render the exact layout from the reference images.

- [ ] Task 13: Refactor AnalyticsService for shared logic + add unscoped methods, and export it
  - File: `src/modules/analytics/analytics.service.ts` (modify)
  - Action: **Refactor to avoid duplicating the ~234-line `GetFacultyReport()` method:**
    1. Extract the core logic (version resolution, SQL aggregation, schema flattening, weighted calculation, interpretation mapping) into a private method:
       `private async BuildFacultyReportData(facultyId: string, versionIds: string[], canonicalSchema: QuestionnaireSchemaSnapshot, query: FacultyReportQueryDto): Promise<FacultyReportResponseDto>`
    2. Refactor `GetFacultyReport()` to: call `validateFacultyScope()` → `resolveVersionIds()` → `BuildFacultyReportData()`
    3. Add `GetFacultyReportUnscoped(facultyId: string, query: FacultyReportQueryDto): Promise<FacultyReportResponseDto>` — calls `resolveVersionIds()` → `BuildFacultyReportData()` directly (skips scope validation). Thin wrapper, no duplication.
    4. Extract comment query logic into a shared private method. Add `GetAllFacultyReportComments(facultyId: string, query: BaseFacultyReportQueryDto): Promise<ReportCommentDto[]>` — returns ALL comments (no pagination). Same SQL but without LIMIT/OFFSET.
  - File: `src/modules/analytics/analytics.module.ts` (modify)
  - Action: **Add `exports: [AnalyticsService]` to the module decorator.** The module currently has NO exports array — this is a blocking requirement for `ReportsModule` to inject `AnalyticsService`. Do NOT assume it already exists; it does not.
  - Notes: Unscoped methods are ONLY for use by the report processor, where authorization was already performed at enqueue time. Document with JSDoc: `/** @internal Called by report processor only — scope validation was performed at enqueue time. Do NOT expose via HTTP. */`. The unscoped methods are protected by convention (JSDoc `@internal`), not by runtime enforcement. Since `AnalyticsService` is now exported, any module can technically call them. **Code review must verify these are never called from HTTP-facing code.**

#### Layer 5: Processor

- [ ] Task 14: Create ReportGenerationProcessor
  - File: `src/modules/reports/processors/report-generation.processor.ts` (create)
  - Action: Implement BullMQ processor following AuditProcessor pattern:
    - `@Processor(QueueName.REPORT_GENERATION, { concurrency: env.REPORT_GENERATION_CONCURRENCY })`
    - Extends `WorkerHost`
    - Inject: `EntityManager`, `AnalyticsService`, `PdfService`, `@Inject(STORAGE_PROVIDER) StorageProvider`
    - `process(job: Job<ReportJobMessage>)`:
      1. Extract `{ reportJobId, facultyId, semesterId, questionnaireTypeCode }` from `job.data`
      2. Fork EntityManager: `const fork = this.em.fork()`
      3. Load `ReportJob` entity by `reportJobId`, set `status = 'active'`, flush
      4. Call `AnalyticsService.GetFacultyReportUnscoped(facultyId, { semesterId, questionnaireTypeCode })`
      5. **Zero-submissions check**: If `reportData.submissionCount === 0`, skip PDF generation. Set `status = 'skipped'`, `storageKey = null`, `completedAt = new Date()`, flush, and return early. No PDF is generated or uploaded. The `'skipped'` status is semantically distinct from `'completed'` — it signals that the job ran but had no data to render.
      6. Call `AnalyticsService.GetAllFacultyReportComments(facultyId, { semesterId, questionnaireTypeCode })`
      7. Call `PdfService.GenerateFacultyEvaluationPdf(reportData, comments)`
      8. Build storage key: `reports/faculty_evaluation/${semesterId}/${reportJob.batchId ?? reportJob.id}/${facultyId}.pdf`
      9. Call `StorageProvider.Upload(key, pdfBuffer, 'application/pdf')`
      10. Update `ReportJob`: `status = 'completed'`, `storageKey = key`, `completedAt = new Date()`, flush
    - `@OnWorkerEvent('failed')`: Load `ReportJob`, set `status = 'failed'`, `error = failedReason`, flush
  - Notes:
    - `ReportJobMessage` type: `{ reportJobId: string; facultyId: string; semesterId: string; questionnaireTypeCode: string }`
    - **courseId must never be passed**: Construct the query DTO with only `semesterId` and `questionnaireTypeCode`. The unscoped method inherits the optional `courseId` field from `FacultyReportQueryDto`, but it must always be `undefined` for report generation. v1 always generates the aggregate across all courses.

#### Layer 6: Service (orchestration)

- [ ] Task 15: Create ReportsService
  - File: `src/modules/reports/reports.service.ts` (create)
  - Action: Implement report orchestration service:
    - Inject: `@InjectQueue(QueueName.REPORT_GENERATION) Queue`, `ReportJobRepository`, `EntityManager`, `ScopeResolverService`, `@Inject(STORAGE_PROVIDER) StorageProvider`
    - `GenerateSingle(dto: GenerateReportDto, userId: string): Promise<{ jobId: string }>`:
      1. **Semester validation**: Query `SELECT id FROM semester WHERE id = $1 AND deleted_at IS NULL`. If not found, throw `NotFoundException('Semester not found')`.
      2. **Dedup check**: Query for existing `ReportJob` with same `{ facultyId, semesterId, questionnaireTypeCode, reportType }` in `'waiting'` or `'active'` status. If found, return existing `{ jobId }` immediately — no duplicate.
      3. Validate faculty is in user's scope via `ScopeResolverService.ResolveDepartmentIds(dto.semesterId)` + department check query
      4. Resolve faculty name via user query
      5. Create `ReportJob` entity (`status: 'waiting'`, no `batchId`)
      6. Persist entity (wrap in try-catch for `UniqueConstraintViolationException` from the partial unique index — race condition guard; on conflict, re-query and return existing jobId)
      7. **Enqueue with orphan protection**: Enqueue BullMQ job with `{ reportJobId, facultyId, semesterId, questionnaireTypeCode }`. Wrap in try-catch — if enqueue fails (Redis down), delete the just-created `ReportJob` entity via `em.nativeDelete()` before re-throwing. This prevents orphaned `'waiting'` jobs that would block dedup forever.
      8. Return `{ jobId: reportJob.id }`
    - `GenerateBatch(dto: GenerateBatchReportDto, userId: string): Promise<{ batchId: string; jobCount: number; skippedCount: number }>`:
      1. **Semester validation**: Query `SELECT id FROM semester WHERE id = $1 AND deleted_at IS NULL`. If not found, throw `NotFoundException('Semester not found')`.
      2. Resolve allowed department IDs via `ScopeResolverService.ResolveDepartmentIds(dto.semesterId)`
      3. **Translate department IDs to codes**: If `deptIds` is not null (non-super-admin), query `SELECT DISTINCT code FROM department WHERE id = ANY($1) AND deleted_at IS NULL` to get department codes. If `deptIds` is null (super admin), set `departmentCodes = null` (no department filter). This translation is necessary because `questionnaire_submission.department_code_snapshot` stores codes (e.g. `'CCS'`), not UUIDs.
      4. **Apply scope filters**:
         - If `departmentId` provided: resolve to department code, intersect with allowed department codes
         - If `programId` provided: resolve to program code via `SELECT code FROM program WHERE id = $1 AND deleted_at IS NULL`. This code will be used as an additional filter on `program_code_snapshot` in the faculty query.
      5. **Resolve faculty via `questionnaire_submission`** — use semester-scoped submission data to find faculty with actual evaluation data. Uses `department_code_snapshot` (not the `department` FK) for historical accuracy — the snapshot preserves the department mapping at submission time:
         ```sql
         SELECT DISTINCT qs.faculty_id, u.first_name, u.last_name
         FROM questionnaire_submission qs
         JOIN "user" u ON u.id = qs.faculty_id
         WHERE qs.semester_id = $1
           AND ($2 IS NULL OR qs.department_code_snapshot = ANY($2))
           AND ($3 IS NULL OR qs.program_code_snapshot = $3)
           AND qs.deleted_at IS NULL
           AND u.deleted_at IS NULL
         ```

         - `$2`: department codes (null for super admin = unrestricted)
         - `$3`: program code (null if no `programId` filter provided)
           This bypasses the problematic `User.department` FK (nullable, not semester-scoped) and only returns faculty who have evaluation data.
      6. Enforce `env.REPORT_BATCH_MAX_SIZE` cap — throw `BadRequestException` if exceeded
      7. **Dedup check per faculty**: For each resolved faculty, check for existing pending/active `ReportJob`. Skip already-queued faculty.
      8. Generate `batchId` (UUID)
      9. Create N `ReportJob` entities (only for non-skipped faculty) with that `batchId`
      10. Persist all entities
      11. **Enqueue with tracked orphan protection**: Enqueue jobs sequentially, maintaining an `enqueuedJobIds: Set<string>` tracking which jobs were successfully enqueued. On failure mid-batch, delete only `ReportJob` entities where `id NOT IN enqueuedJobIds` via `em.nativeDelete()`. Already-enqueued jobs continue processing normally. Log the partial failure.
      12. Return `{ batchId, jobCount: enqueuedJobIds.size, skippedCount }`
    - `GetJobStatus(jobId: string, userId: string): Promise<ReportStatusResponseDto>`:
      1. Find `ReportJob` by ID, verify `requestedBy.id === userId` (or user is SUPER_ADMIN)
      2. If `status === 'completed'` and `storageKey` exists, generate fresh presigned URL via `StorageProvider.GetPresignedUrl()`
      3. Map to `ReportStatusResponseDto`
    - `GetBatchStatus(batchId: string, userId: string, page?: number, limit?: number): Promise<BatchStatusResponseDto>`:
      1. Find all `ReportJob` entities by `batchId`. Verify ownership by checking the first job's `requestedBy.id === userId` (or user is SUPER_ADMIN). All jobs in a batch are created by the same user in a single request, so checking the first is sufficient. If no jobs found or ownership fails, return 404.
      2. Aggregate counts (total, completed, failed, skipped, active, waiting) — this is always computed over the full batch
      3. **Paginate the jobs list**: Apply `page` (default 1) and `limit` (default 20, max 50) to the per-job detail array
      4. Generate presigned URLs for completed jobs **in the current page only** via `Promise.all()` for concurrency
      5. Map to `BatchStatusResponseDto` with pagination meta

#### Layer 7: Controller

- [ ] Task 16: Create ReportsController
  - File: `src/modules/reports/reports.controller.ts` (create)
  - Action: Implement HTTP endpoints:
    - `@Controller('reports')`
    - `@ApiTags('Reports')`
    - `@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN, UserRole.CHAIRPERSON)`
    - `@UseInterceptors(CurrentUserInterceptor)`
    - `POST /reports/generate` → `GenerateReport(@Body() dto, @Req() req)` → calls `ReportsService.GenerateSingle()`, returns 202
    - `POST /reports/generate/batch` → `GenerateBatchReport(@Body() dto, @Req() req)` → calls `ReportsService.GenerateBatch()`, returns 202. Apply `@Throttle({ default: { limit: 3, ttl: 60000 } })` — max 3 batch requests per minute per user to prevent queue flooding.
    - `GET /reports/status/:jobId` → `GetReportStatus(@Param('jobId') jobId, @Req() req)` → calls `ReportsService.GetJobStatus()`
    - `GET /reports/batch/:batchId` → `GetBatchStatus(@Param('batchId') batchId, @Query() query, @Req() req)` → calls `ReportsService.GetBatchStatus()` with pagination params (`page`, `limit`)
  - Notes: Use `@HttpCode(HttpStatus.ACCEPTED)` on POST endpoints. Apply `@ApiOperation()` summaries.

#### Layer 8: Module & Registration

- [ ] Task 17: Create ReportsModule
  - File: `src/modules/reports/reports.module.ts` (create)
  - Action: Wire all components:
    ```
    imports: [
      BullModule.registerQueue({ name: QueueName.REPORT_GENERATION }),
      MikroOrmModule.forFeature([ReportJob]),
      CommonModule,
      AnalyticsModule,
      DataLoaderModule,  // Required for CurrentUserInterceptor → UserLoader DI
    ]
    providers: [
      ReportsService,
      ReportGenerationProcessor,
      PdfService,
      { provide: STORAGE_PROVIDER, useClass: R2StorageService },
      ReportCleanupJob,  // lives here — has access to STORAGE_PROVIDER and ReportJobRepository
    ]
    controllers: [ReportsController]
    exports: [ReportsService]
    ```
  - Notes: `ReportCleanupJob` is registered inside this module (NOT in `AllCronJobs`) because it needs `STORAGE_PROVIDER` and `ReportJobRepository` from this module's DI context. The `@Cron()` decorator works from any NestJS module — it does not need to live in `AppModule`.

- [ ] Task 18: Register module in application
  - File: `src/modules/index.module.ts` (modify)
  - Action: Import `ReportsModule` and add to `ApplicationModules` array

#### Layer 9: Handlebars Template & CSS

- [ ] Task 19: Create faculty evaluation PDF template
  - File: `src/modules/reports/templates/faculty-evaluation.hbs` (create)
  - Action: Create Handlebars template matching the official evaluation report layout:
    - Header: "FACULTY EVALUATION REPORT" (left), semester code + academic year (right), "CONFIDENTIAL" banner
    - Teacher name row
    - For each section: `{{#each sections}}` — table with header row showing section title + weight, question rows (text | average | interpretation), footer row with section average + interpretation
    - Overall rating row at bottom
    - Comments section: `{{#each comments}}` — bullet list of comment text
    - All CSS inlined via `<style>` tag (read from report.css)
  - **Security**: All user-supplied data (faculty name, comment text, question text) MUST use double-stache `{{var}}` for automatic HTML escaping. **Never use triple-stache `{{{var}}}`** in this template — Puppeteer runs with `--no-sandbox` in Docker, so unescaped HTML injection could be exploited.
  - File: `src/modules/reports/templates/report.css` (create)
  - Action: Styles matching the reference images:
    - Black bordered tables, bold headers
    - Font: sans-serif, 10-11pt for table content
    - `page-break-inside: avoid` on section tables
    - Print-friendly: no background colors except header bar
    - A4 page layout

#### Layer 10: Cleanup Cron Job

- [ ] Task 20: Create ReportCleanupJob
  - File: `src/modules/reports/jobs/report-cleanup.job.ts` (create)
  - Action: Implement cleanup cron following `RefreshTokenCleanupJob` pattern:
    - Extend `BaseJob`
    - `@Cron('0 3 * * *', { name: 'ReportCleanupJob' })` — run daily at 3 AM
    - `isRunning` guard
    - Inject: `ReportJobRepository`, `@Inject(STORAGE_PROVIDER) StorageProvider`, `SchedulerRegistry`
    - Logic:
      1. **Expired completed jobs**: Find completed `ReportJob` entities older than `env.REPORT_RETENTION_DAYS`
      2. For each with a `storageKey`, delete R2 object via `StorageProvider.Delete(storageKey)`
      3. Hard-delete via `em.nativeDelete(ReportJob, { id: { $in: expiredIds } })` — preferred over `em.removeAndFlush()` because it bypasses the ORM identity map and issues a direct `DELETE FROM` statement, avoiding unnecessary entity hydration for bulk cleanup operations. This is intentional — report jobs are ephemeral operational records with a fixed TTL, not auditable domain entities.
      4. **Orphaned waiting jobs**: Find `ReportJob` entities in `'waiting'` status with `createdAt` older than 1 hour. These are jobs where the BullMQ enqueue failed after entity persist (e.g., Redis was down). Delete them via `nativeDelete` — no R2 cleanup needed since they never generated a PDF.
      5. Log summary: `Cleaned up N expired + M orphaned report jobs`
    - `runStartupTask()`: Return `{ status: 'skipped', details: 'Cleanup runs on schedule only' }`
  - Notes: This job lives inside `ReportsModule` (registered in Task 17's providers), NOT in `AllCronJobs`. This solves the DI problem — it has full access to `STORAGE_PROVIDER` and `ReportJobRepository` from the module context.

#### Layer 11: Install Dependencies & Housekeeping

- [ ] Task 21: Install npm packages
  - Action: `npm install puppeteer handlebars @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
  - Notes: Verify `puppeteer` pulls Chromium automatically. For Docker, may need to switch to `puppeteer-core` + system Chromium.

- [ ] Task 22: Update `.env.sample` with new environment variables
  - File: `.env.sample` (modify)
  - Action: Add all new env vars with descriptions:
    ```
    # Report Generation (R2 Storage) — optional, reports unavailable without these
    CF_ACCOUNT_ID=
    R2_ACCESS_KEY_ID=
    R2_SECRET_ACCESS_KEY=
    R2_BUCKET_NAME=faculytics-reports
    REPORT_GENERATION_CONCURRENCY=2
    REPORT_PRESIGNED_URL_EXPIRY_SECONDS=3600
    REPORT_BATCH_MAX_SIZE=100
    REPORT_RETENTION_DAYS=7
    ```
  - Notes: Comment header should clarify that R2 credentials are optional — the app starts without them, but report generation endpoints will return 503.

### Acceptance Criteria

#### Single Report Generation

- [ ] AC 1: Given an authenticated Dean, when they POST `/reports/generate` with a valid `facultyId` in their department scope, `semesterId`, and `questionnaireTypeCode`, then a 202 response is returned with `{ jobId }` and a `ReportJob` entity is created with `status: 'waiting'`.

- [ ] AC 2: Given a queued report job, when the BullMQ processor picks it up, then it sets `status: 'active'`, fetches report data from `AnalyticsService`, generates a PDF via Puppeteer, uploads to R2, and sets `status: 'completed'` with `storageKey` populated.

- [ ] AC 3: Given a completed report job, when the user GETs `/reports/status/:jobId`, then the response includes `status: 'completed'`, a fresh presigned `downloadUrl`, and `expiresAt` timestamp.

- [ ] AC 4: Given a Dean requesting a report for a faculty member outside their department scope, when they POST `/reports/generate`, then a 403 Forbidden response is returned.

- [ ] AC 5: Given a Chairperson, when they POST `/reports/generate` for a faculty in their program's department, then the report is generated successfully (scope resolves through program → department).

#### Batch Report Generation

- [ ] AC 6: Given an authenticated Dean, when they POST `/reports/generate/batch` with `semesterId` and `questionnaireTypeCode`, then N `ReportJob` entities are created (one per faculty in their department scope), linked by `batchId`, and a 202 response returns `{ batchId, jobCount }`.

- [ ] AC 7: Given a Super Admin, when they POST `/reports/generate/batch` with a `departmentId` filter, then only faculty with evaluation data in that specific department are included (scope filter narrows the unrestricted super admin scope).

- [ ] AC 8: Given a batch request exceeding `REPORT_BATCH_MAX_SIZE`, when the service resolves the faculty list, then a 400 Bad Request is returned with a descriptive error.

- [ ] AC 9: Given an in-progress batch, when the user GETs `/reports/batch/:batchId`, then the response includes aggregated progress (`total`, `completed`, `failed`, `skipped`, `active`, `waiting`) and per-job status with download URLs for completed jobs.

- [ ] AC 10: Given a batch where one faculty report fails, when the user checks batch status, then the failed job shows `status: 'failed'` with an `error` message, while other jobs complete independently.

- [ ] AC 11: Given a batch request with `programId` filter, when the service resolves faculty, then only faculty with evaluation data matching that specific `program_code_snapshot` are included — not all faculty in the parent department.

#### PDF Output

- [ ] AC 12: Given valid report data, when the PdfService generates a PDF, then the output matches the official evaluation form layout: header with semester/confidential banner, teacher name, 5 weighted sections with per-question averages and interpretations, section averages, overall rating, and comments section.

- [ ] AC 13: Given a faculty member with no qualitative comments, when the PDF is generated, then the comments section renders as empty or with "No comments submitted" (does not error).

#### Storage & Presigned URLs

- [ ] AC 14: Given a generated PDF buffer, when the R2StorageService uploads it, then the object is stored at key `reports/faculty_evaluation/{semesterId}/{batchId|jobId}/{facultyId}.pdf` and is retrievable via presigned URL.

- [ ] AC 15: Given a presigned URL, when it is accessed after `REPORT_PRESIGNED_URL_EXPIRY_SECONDS`, then R2 returns a 403/expired error.

- [ ] AC 16: Given a completed job, when the status endpoint is polled multiple times, then a fresh presigned URL is generated each time (not a stale cached URL).

#### Cleanup

- [ ] AC 17: Given completed report jobs older than `REPORT_RETENTION_DAYS`, when the cleanup cron runs, then the corresponding R2 objects are deleted and the `ReportJob` entities are hard-deleted.

- [ ] AC 18: Given the cleanup cron is already running, when the cron trigger fires again, then the second execution is skipped (no concurrent runs).

#### Zero Submissions & Edge Cases

- [ ] AC 19: Given a faculty member with zero submissions for the requested semester/type, when the processor runs, then the job is set to `status: 'skipped'` with `storageKey: null` — no PDF is generated or uploaded. The `'skipped'` status is semantically distinct from `'completed'`.

- [ ] AC 20: Given an invalid `semesterId` (valid UUID but no matching record), when `GenerateSingle` or `GenerateBatch` is called, then a 404 Not Found is returned.

#### Failure Modes

- [ ] AC 21: Given R2 credentials are not configured (`isConfigured = false`), when a user POSTs `/reports/generate`, then a 503 Service Unavailable is returned with message `'R2 storage is not configured'`.

- [ ] AC 22: Given Redis is down during enqueue, when `GenerateSingle` fails to add the BullMQ job, then the just-created `ReportJob` entity is deleted via `nativeDelete` (no orphaned waiting job) and an appropriate error is returned.

- [ ] AC 23: Given a `ReportJob` in `'waiting'` status for more than 1 hour, when the cleanup cron runs, then the orphaned job is hard-deleted (it had no corresponding BullMQ job).

#### Deduplication

- [ ] AC 24: Given a pending report job for faculty X in semester Y, when a new request is submitted for the same faculty/semester/questionnaireTypeCode, then the existing `jobId` is returned with no duplicate job created.

- [ ] AC 25: Given two concurrent requests for the same faculty/semester/type (race condition), when both try to insert, then the unique partial index prevents the duplicate and the service handles the `UniqueConstraintViolationException` gracefully by returning the existing job.

- [ ] AC 26: Given a batch request where 5 of 20 faculty already have pending jobs, when the batch is processed, then 15 new jobs are created and the response includes `{ jobCount: 15, skippedCount: 5 }`.

#### Batch Pagination

- [ ] AC 27: Given a batch with 100 jobs, when `GET /reports/batch/:batchId?page=1&limit=20` is called, then the response includes all aggregate counts (total=100, completed, etc.) but only 20 job details in the `jobs` array, with a `meta` pagination object.

#### Authorization & Scope

- [ ] AC 28: Given a user with no SUPER_ADMIN, DEAN, or CHAIRPERSON role, when they access any `/reports` endpoint, then a 403 Forbidden is returned.

- [ ] AC 29: Given a user polling status for a job they did not request (and they are not SUPER_ADMIN), when they GET `/reports/status/:jobId`, then a 404 is returned (do not reveal job existence).

## Additional Context

### Dependencies

**New npm packages:**

- `puppeteer` — Headless Chrome for PDF rendering
- `handlebars` — Template engine for HTML report generation
- `@aws-sdk/client-s3` — S3-compatible client for Cloudflare R2
- `@aws-sdk/s3-request-presigner` — Presigned URL generation for R2

**Existing (already in project):**

- `bullmq` / `@nestjs/bullmq` — Job queue infrastructure
- `@mikro-orm/core` / `@mikro-orm/postgresql` — ORM and entity management
- `zod` — Environment variable validation
- `@nestjs/schedule` — Cron job scheduling (for cleanup job)

**New environment variables:**

- `CF_ACCOUNT_ID` — Cloudflare account ID (**optional** — app starts without it)
- `R2_ACCESS_KEY_ID` — R2 access key (**optional**)
- `R2_SECRET_ACCESS_KEY` — R2 secret key (**optional**)
- `R2_BUCKET_NAME` — R2 bucket name (default: `faculytics-reports`)
- `REPORT_GENERATION_CONCURRENCY` — Processor concurrency (default: `2`)
- `REPORT_PRESIGNED_URL_EXPIRY_SECONDS` — Presigned URL lifetime (default: `3600`)
- `REPORT_BATCH_MAX_SIZE` — Maximum faculty count per batch request (default: `100`)
- `REPORT_RETENTION_DAYS` — Days before cleanup cron purges completed reports (default: `7`)

**Docker considerations:**

- Puppeteer requires Chromium system dependencies
- Use `ghcr.io/puppeteer/puppeteer` as base image or install Chromium deps
- Launch args: `--no-sandbox`, `--disable-setuid-sandbox` (required in containerized environments)
- **Note**: Dockerfile creation/modification is a separate infrastructure task, not included in this spec. When deploying, ensure the API image includes Chromium dependencies before enabling report generation.

### Testing Strategy

**Unit Tests:**

- `reports.service.spec.ts`:
  - Mock `Queue`, `ReportJobRepository`, `ScopeResolverService`, `EntityManager`
  - Test `GenerateSingle()` creates entity, enqueues job, validates scope
  - Test `GenerateSingle()` throws 403 when faculty is out of scope
  - Test `GenerateSingle()` returns existing jobId when duplicate pending job exists (dedup)
  - Test `GenerateSingle()` deletes entity on BullMQ enqueue failure (orphan protection)
  - Test `GenerateBatch()` translates department IDs to codes before querying submissions
  - Test `GenerateBatch()` resolves faculty via questionnaire_submission, respects scope filters, enforces batch size cap
  - Test `GenerateBatch()` skips already-queued faculty and returns correct `skippedCount`
  - Test `GenerateBatch()` throws 400 when exceeding max batch size
  - Test `GetJobStatus()` generates fresh presigned URL for completed jobs
  - Test `GetJobStatus()` returns 404 for jobs not owned by requesting user
  - Test `GetBatchStatus()` aggregates counts correctly

- `report-generation.processor.spec.ts`:
  - Mock `EntityManager`, `AnalyticsService`, `PdfService`, `StorageProvider`
  - Test `process()` happy path: fetches data → generates PDF → uploads → updates entity
  - Test `process()` skips PDF generation when submissionCount === 0 (sets status completed, storageKey null)
  - Test `process()` updates entity to `'failed'` on error
  - Test `@OnWorkerEvent('failed')` handler updates entity status

- `pdf.service.spec.ts`:
  - Mock Puppeteer browser/page (use `jest.fn()` for `newPage`, `setContent`, `pdf`, `close`)
  - Test `GenerateFacultyEvaluationPdf()` returns a Buffer
  - Test template rendering with sections, questions, comments
  - Test with empty comments array (no error)

- `r2-storage.service.spec.ts`:
  - Mock `S3Client.send()`
  - Test `Upload()` sends `PutObjectCommand` with correct params
  - Test `GetPresignedUrl()` calls presigner with correct expiry
  - Test `Delete()` sends `DeleteObjectCommand`
  - Test `DeleteByPrefix()` lists then batch-deletes (with pagination loop)
  - Test `isConfigured = false` guard throws `ServiceUnavailableException`

- `report-cleanup.job.spec.ts`:
  - Mock `ReportJobRepository`, `StorageProvider`
  - Test cleanup finds expired completed jobs, deletes R2 objects, hard-deletes via nativeDelete
  - Test cleanup finds orphaned waiting jobs (>1hr), hard-deletes them
  - Test `isRunning` guard prevents concurrent execution

**Integration Tests (E2E):**

- Test full flow: POST generate → poll status → verify completed with downloadUrl
- Test batch flow: POST batch → poll batch status → verify progress aggregation
- Test authorization: 403 for out-of-scope faculty, 403 for unauthorized roles
- Test ownership: 404 when polling another user's job

**Manual Testing Steps:**

1. Start local dev: `docker compose up` (Redis)
2. Ensure R2 bucket exists with valid credentials in `.env`
3. POST single report generation, poll status until completed, verify PDF downloads
4. POST batch generation with department filter, verify all faculty in scope are queued
5. Verify cleanup cron runs and purges old reports

### Notes

**Report Layout Reference:**

- The official evaluation report format has 5 weighted sections (Preparation 15%, Teaching & Learning Process 35%, Assessment 25%, Learning Environment 10%, Teacher's Professionalism 15%), per-question averages with interpretations, section averages, overall weighted rating, and a comments/remarks section at the bottom.
- Interpretation scale: 4.5-5.0 = "EXCELLENT PERFORMANCE", 3.5-4.49 = "VERY SATISFACTORY PERFORMANCE", 2.5-3.49 = "SATISFACTORY PERFORMANCE", 1.5-2.49 = "FAIR PERFORMANCE", 1.0-1.49 = "NEEDS IMPROVEMENT"
- Existing interpretation logic at `src/modules/analytics/lib/interpretation.util.ts`

**High-Risk Items:**

- **Puppeteer in Docker**: Chromium dependency adds significant image size. May need `@sparticuz/chromium` (~50MB) instead of full Puppeteer (~300MB). Test PDF rendering in the Docker build early.
- **Memory pressure**: Puppeteer browser instance holds ~100MB+ RAM. With `concurrency: 2`, two simultaneous pages could peak at ~300MB. Monitor memory on VPS during batch runs.
- **Puppeteer crash recovery**: If Chromium OOM-kills mid-batch, the browser ref goes stale. `PdfService` has a relaunch-and-retry mechanism, but a persistent Chromium instability issue would require process-level restart.
- **R2 connectivity**: If R2 upload fails after PDF generation, the PDF is lost and must be regenerated. Consider retrying the upload step before marking as failed.
- **AnalyticsService coupling**: The refactored `BuildFacultyReportData()` private method and `GetFacultyReportUnscoped()` wrapper bypass authorization. Document clearly with JSDoc and ensure they're never exposed via HTTP.
- **Orphaned jobs**: If Redis is down during enqueue, the compensating delete protects against orphans. The cleanup cron also catches any that slip through (waiting >1hr). But a sustained Redis outage during heavy batch usage could still cause transient issues.

**Future Considerations (out of scope):**

- Excel export can reuse the same data flow — add `ExcelService` alongside `PdfService`, dispatch based on `reportType`
- Department summary rollup would need a new data aggregation path (not just per-faculty)
- Campus head / VP roles: when added, only `ScopeResolverService` changes — the reports module is already role-agnostic
- Report scheduling (cron-based): could reuse `GenerateBatch()` triggered by a scheduled job instead of HTTP request
- Batch ZIP download: bundle all completed PDFs in a batch into a single ZIP file for convenience
- Campus-level batch filter: A super admin operating across 5 campuses currently must know which `semesterId` belongs to which campus. A `campusId` filter (or campus-aware semester picker on the frontend) would improve UX for cross-campus users. Deferred because it's a frontend/UX concern.
