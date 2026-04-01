# Report Generation Workflow

This document describes the async PDF report generation flow for faculty evaluation reports.

## Overview

Faculty evaluation reports are generated asynchronously via BullMQ. Puppeteer renders Handlebars templates into PDFs, which are uploaded to Cloudflare R2 with time-limited presigned download URLs.

## Architecture

```
POST /reports/generate
  |
  v
ReportsService.GenerateSingle()
  |-- Semester validation
  |-- Dedup check (partial unique index)
  |-- Scope validation (ScopeResolverService)
  |-- Create ReportJob entity (status: 'waiting')
  |-- Enqueue BullMQ job (orphan protection on failure)
  v
ReportGenerationProcessor.process()
  |-- Set status: 'active'
  |-- AnalyticsService.GetFacultyReportUnscoped()
  |-- Zero-submissions check → status: 'skipped' (early return)
  |-- AnalyticsService.GetAllFacultyReportComments()
  |-- PdfService.GenerateFacultyEvaluationPdf()
  |-- StorageProvider.Upload() → R2
  |-- Set status: 'completed', storageKey
  v
GET /reports/status/:jobId
  |-- Fresh presigned URL generated on each poll
```

## Batch Flow

```
POST /reports/generate/batch
  |
  v
ReportsService.GenerateBatch()
  |-- Semester validation
  |-- Resolve department IDs → translate to codes
  |-- Apply optional departmentId / programId filters
  |-- Resolve faculty via questionnaire_submission (semester-scoped)
  |-- Enforce REPORT_BATCH_MAX_SIZE cap
  |-- Bulk dedup check (single query)
  |-- Create N ReportJob entities linked by batchId
  |-- Queue.addBulk() (atomic enqueue)
  v
GET /reports/batch/:batchId
  |-- SQL GROUP BY aggregation for status counts
  |-- DB-level LIMIT/OFFSET for paginated job details
  |-- Presigned URLs for completed jobs in current page only
```

## Key Components

| Component                   | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `ReportsService`            | Orchestration — scope validation, dedup, entity lifecycle     |
| `ReportGenerationProcessor` | BullMQ processor — data fetch, PDF render, R2 upload          |
| `PdfService`                | Puppeteer + Handlebars PDF generation with persistent browser |
| `R2StorageService`          | S3-compatible R2 storage with presigned URL generation        |
| `ReportCleanupJob`          | Daily cron — purges expired reports and orphaned jobs         |
| `ReportJob` entity          | Tracks job lifecycle, ownership, and storage key              |

## Authorization

- **Role gate:** `SUPER_ADMIN`, `DEAN`, `CHAIRPERSON` (via `@UseJwtGuard()`)
- **Scope enforcement:** `ScopeResolverService.ResolveDepartmentIds()` validates faculty access at enqueue time
- **Processor bypass:** The processor calls `GetFacultyReportUnscoped()` — scope was already validated when the job was created
- **Ownership check:** Status endpoints verify `requestedBy` matches the requesting user (super admins bypass)

## Deduplication

A partial unique index on `report_job` prevents duplicate pending/active jobs:

```sql
CREATE UNIQUE INDEX uq_report_job_pending
  ON report_job (faculty_id, semester_id, questionnaire_type_code, report_type)
  WHERE status IN ('waiting', 'active') AND deleted_at IS NULL;
```

The service checks for existing pending jobs before creating new ones. On `UniqueConstraintViolationException` (race condition), the existing job ID is returned.

## Storage

- **Key convention:** `reports/faculty_evaluation/{semesterId}/{batchId|jobId}/{facultyId}.pdf`
- **Presigned URLs:** Generated on-the-fly from `storageKey` with configurable expiry (`REPORT_PRESIGNED_URL_EXPIRY_SECONDS`, default 1 hour)
- **Graceful degradation:** If R2 credentials are not configured, the service starts but report endpoints return `503 Service Unavailable`

## Cleanup

`ReportCleanupJob` runs daily at 3 AM:

1. Finds completed `ReportJob` entities older than `REPORT_RETENTION_DAYS` (default 7)
2. Batch-deletes R2 objects by prefix via `DeleteByPrefix()`
3. Hard-deletes expired entities via `nativeDelete()`
4. Finds orphaned `'waiting'` jobs older than 1 hour (enqueue failed) and hard-deletes them

## Job Status Lifecycle

```
waiting → active → completed (storageKey set, presigned URL available)
                 → failed (error message stored)
                 → skipped (zero submissions — no PDF generated)
```

The `@OnWorkerEvent('failed')` handler only marks the entity as `'failed'` on the final retry attempt. Intermediate failures leave the status as `'active'` so BullMQ can retry.

## Environment Variables

| Variable                              | Default              | Purpose                            |
| ------------------------------------- | -------------------- | ---------------------------------- |
| `CF_ACCOUNT_ID`                       | _(optional)_         | Cloudflare account ID for R2       |
| `R2_ACCESS_KEY_ID`                    | _(optional)_         | R2 access key                      |
| `R2_SECRET_ACCESS_KEY`                | _(optional)_         | R2 secret key                      |
| `R2_BUCKET_NAME`                      | `faculytics-reports` | R2 bucket name                     |
| `REPORT_GENERATION_CONCURRENCY`       | `2`                  | BullMQ processor concurrency       |
| `REPORT_PRESIGNED_URL_EXPIRY_SECONDS` | `3600`               | Presigned URL lifetime             |
| `REPORT_BATCH_MAX_SIZE`               | `100`                | Max faculty per batch request      |
| `REPORT_RETENTION_DAYS`               | `7`                  | Days before cleanup purges reports |
