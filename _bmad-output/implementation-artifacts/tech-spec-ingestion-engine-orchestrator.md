---
title: 'Ingestion Engine Orchestrator'
slug: 'ingestion-engine-orchestrator'
created: '2026-02-17'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack: ['NestJS', 'MikroORM', 'p-limit', 'dataloader', 'TypeScript']
files_to_modify:
  [
    'src/modules/common/data-loaders/index.module.ts',
    'src/modules/common/data-loaders/ingestion-mapping.loader.ts',
    'src/modules/questionnaires/ingestion/dto/ingestion-result.dto.ts',
    'src/modules/questionnaires/ingestion/dto/raw-submission-data.dto.ts',
    'src/modules/questionnaires/ingestion/services/ingestion-mapper.service.ts',
    'src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts',
    'src/modules/questionnaires/questionnaires.module.ts',
  ]
code_patterns:
  [
    'Bounded Concurrency',
    'Per-record Transactions',
    'Speculative Dry-runs',
    'DataLoader Caching',
    'Resource Cleanup',
  ]
test_patterns:
  [
    'Unit tests with mocked dependencies',
    'Concurrency verification',
    'Transactional rollback verification',
    'Memory/Resource leak check',
  ]
---

# Tech-Spec: Ingestion Engine Orchestrator

**Created:** 2026-02-17
**Status:** Completed

## Review Notes

- Adversarial review completed
- Findings: 10 total, 5 addressed, 5 optimized/skipped
- Resolution approach: Walk through + Auto-fix

## Overview

### Problem Statement

The system needs a central orchestrator to process asynchronous streams of questionnaire submissions from diverse adapters, ensuring high performance through concurrency while maintaining transactional integrity and providing a true-to-life "dry-run" simulation.

### Solution

Implement an `IngestionEngine` that consumes `AsyncIterable` streams. It will process records using bounded concurrency (6) via `p-limit` with per-record transactions and forked Entity Managers. Dry-runs will be executed as full-logic transactions that always rollback. A dedicated `IngestionMapperService` using `DataLoader` will handle raw-to-internal data transformations.

### Scope

**In Scope:**

- `IngestionEngine` service for stream orchestration.
- `IngestionMapperService` for standard institutional lookups and mapping.
- Bounded concurrency control (6) using `p-limit`.
- Per-record transaction isolation using `em.fork()`.
- Speculative dry-run logic (transaction + explicit rollback).
- Structured error reporting and `maxErrors` thresholding.
- **New**: Resource management (`try...finally` for adapter closing).
- **New**: Structured result DTO and logging with `ingestionId`.

**Out of Scope:**

- Advanced DSL or UI for mapping (Phase 2 future).
- Background task queues like BullMQ (Phase 3).
- Concrete adapter implementations for CSV/Excel (separate task).

## Context for Development

### Codebase Patterns

- **Bounded Concurrency**: Use `p-limit` to process the stream with a fixed number of concurrent workers (6).
- **Transactional Integrity**: Use `UnitOfWork` or `em.transactional()` per record. Each worker must use a forked `EntityManager` (`em.fork()`).
- **Resource Cleanup**: Always use `try...finally` blocks to ensure `adapter.close()` is called. Each `em.fork()` must be cleared via `em.clear()` after each record to prevent identity map bloat.
- **Timeouts & Cancellation**: Apply a 30s timeout per record. While `Promise.race` is the primary mechanism, the forked EM should be discarded immediately on timeout to prevent "zombie" connections from persisting too long.
- **Memory Safety**: Implement a hard limit of 5,000 records per ingestion batch to prevent memory exhaustion from the results array.
- **Structured Logging**: Every log and the final `IngestionResultDto` must include a unique `ingestionId`.

### Files to Reference

| File                                                                          | Purpose                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/modules/questionnaires/ingestion/interfaces/source-adapter.interface.ts` | Definition of the adapter interface.              |
| `src/modules/questionnaires/ingestion/types/source-config.type.ts`            | Configuration including `dryRun` and `maxErrors`. |
| `src/modules/questionnaires/services/questionnaire.service.ts`                | The target service for creating submissions.      |
| `src/modules/common/unit-of-work/index.ts`                                    | Transaction management utility.                   |
| `src/modules/common/data-loaders/user.loader.ts`                              | Reference for `DataLoader` pattern.               |

### Technical Decisions

- **Bounded Concurrency (6)**: Optimizes throughput while leaving headroom in the database pool for other requests.
- **Transaction per Record**: Isolates failures and reduces lock contention duration.
- **Full-Logic Dry-Run**: Guarantees dry-run accuracy by exercising real DB constraints and triggers.
- **Dedicated Mapper with DataLoader**: Uses the `DataLoader` pattern to deduplicate and cache institutional lookups across concurrent ingestion workers.
- **Correction-Path Error Reporting**: Focuses reporting on human-readable error messages and `sourceIdentifier` to help users fix source data issues quickly.
- **Fail-Fast vs. Continue**: Live runs stop at `maxErrors`. Dry-runs continue by default to provide a full diagnostic report unless the error is fatal (e.g., DB down).

## Implementation Plan

### Tasks

- [x] **Task 1: Implement `IngestionMappingLoader`**
  - File: `src/modules/common/data-loaders/ingestion-mapping.loader.ts`
  - Action: Create a request-scoped `DataLoader` for `User`, `Course`, and `Semester`.
  - **Refinement**: Include logic to clear the loader's cache if reused across different ingestion batches.

- [x] **Task 2: Define `IngestionResultDto`**
  - File: `src/modules/questionnaires/ingestion/dto/ingestion-result.dto.ts`
  - Action: Define classes for `IngestionSummary` and `IngestionRecordResult`.
  - **Refinement**: Include `ingestionId` in the summary for log correlation.

- [x] **Task 3: Implement `IngestionMapperService` with Validation**
  - File: `src/modules/questionnaires/ingestion/services/ingestion-mapper.service.ts`
  - Action: Transform `RawSubmissionData`.
  - **Refinement**: Add a defensive validation layer (using Zod or class-validator) _after_ mapping to catch institutional inconsistencies before they hit the DB. Handle Moodle ID collisions by throwing a "Duplicate External ID mapping" error.

- [x] **Task 4: Implement `IngestionEngine` with Resource Management**
  - File: `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts`
  - Action: Implement `ProcessStream` with `p-limit`.
  - **Critical**: Ensure `em.clear()` is called and the forked EM is ready for GC after each worker finishes. Handle empty streams by returning a successful summary with 0 records processed.
  - **Critical**: Implement backpressure by checking the `limit.pendingCount` before pulling the next record from the `AsyncIterable`.

- [x] **Task 5: Implement Error & Dry-Run Policy**
  - File: `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts`
  - Action: Update `dryRun` to report all non-fatal errors. Live runs must halt at `maxErrors`.

- [x] **Task 6: Register Services in `QuestionnaireModule`**
  - File: `src/modules/questionnaires/questionnaires.module.ts`

### Acceptance Criteria

- [x] **AC 1: Resource Safety**. Given an ingestion that hits `maxErrors`, when terminated, then `adapter.close()` must be called exactly once.
- [x] **AC 2: Transactional Isolation**. Given a batch with one invalid record, when processed, then only that record fails, others commit.
- [x] **AC 3: Empty Stream Handling**. Given an empty `AsyncIterable`, when processed, then the engine returns a 200 with 0 successes and 0 failures.
- [x] **AC 4: Concurrency and Timeout**. Given a hanging record (simulated), when 30s passes, then the worker must time out and release the connection/resource.
- [x] **AC 5: Memory Leak Protection**. Given a batch of 100 records, when processed, then the identity map of each forked EM must be cleared.
- [x] **AC 6: Correlation**. Given a failed ingestion, when reviewing the response, then the `ingestionId` must match the logs.

## Additional Context

### Testing Strategy

- **Leak Testing**: Verify `adapter.close()` is called on early exit.
- **Timeout Testing**: Mock a hanging service call and verify the 30s timeout triggers a failure result.
- **Transactional Testing**: Verify `em.rollback()` is called for `dryRun`.

### Notes

- Future: Consider streaming results for batches > 1000 records to prevent memory bottlenecks.
- Transient errors could be addressed with a simple retry decorator in a future iteration.
