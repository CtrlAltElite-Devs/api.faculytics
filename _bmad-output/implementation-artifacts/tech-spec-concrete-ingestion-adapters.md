---
title: 'Concrete Ingestion Adapters (CSV & Excel)'
slug: 'concrete-ingestion-adapters'
created: '2026-02-17T01:08:37.446Z'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack: ['NestJS', 'csv-parser', 'exceljs', 'AsyncIterables']
files_to_modify:
  - 'src/modules/questionnaires/questionnaires.module.ts'
  - 'src/modules/questionnaires/ingestion/factories/source-adapter.factory.ts'
  - 'package.json'
files_to_create:
  - 'src/modules/questionnaires/ingestion/interfaces/file-storage-provider.interface.ts'
  - 'src/modules/questionnaires/ingestion/adapters/base-stream.adapter.ts'
  - 'src/modules/questionnaires/ingestion/adapters/csv.adapter.ts'
  - 'src/modules/questionnaires/ingestion/adapters/excel.adapter.ts'
  - 'src/modules/questionnaires/ingestion/adapters/csv.adapter.spec.ts'
  - 'src/modules/questionnaires/ingestion/adapters/excel.adapter.spec.ts'
code_patterns:
  [
    'AsyncIterables',
    'Streaming Ingestion',
    'Factory Pattern',
    'Provider Interface',
    'Base Class Pattern',
  ]
test_patterns: ['Jest with Readable Stream Mocks', 'Poison File Simulation']
---

# Tech-Spec: Concrete Ingestion Adapters (CSV & Excel)

**Created:** 2026-02-17T01:08:37.446Z

## Overview

### Problem Statement

The universal ingestion engine lacks the actual implementations to process CSV and Excel files, which are essential for bulk data uploads.

### Solution

Implement `CSVAdapter` and `ExcelAdapter` as "Smart" `AsyncIterable` stream processors. They will consume `NodeJS.ReadableStream`, normalize headers for DTO compatibility, and yield `IngestionRecord` objects while strictly managing memory and stream resources.

### Scope

**In Scope:**

- `CSVAdapter` using `csv-parser` (supporting custom delimiters).
- `ExcelAdapter` using `exceljs` (supporting sheet name/index selection).
- `FileStorageProvider` interface definition.
- `BaseStreamAdapter` for centralized resource cleanup and stream lifecycle management.
- Header normalization (trimming and lowercasing) for DTO compatibility.
- Registration in `SourceAdapterFactory`.
- Unit tests covering happy paths, malformed rows, and large file simulations.

**Out of Scope:**

- Concrete S3/Object storage implementation.
- `UploadedFile` entity persistence.
- UI mapping.

## Context for Development

### Codebase Patterns

- **AsyncIterables**: Adapters must implement `extract()` returning an `AsyncIterable`.
- **Factory Pattern**: Adapters must be registered in NestJS container with a specific token (`SOURCE_ADAPTER_PREFIX + SourceType`).
- **Storage Abstraction**: Ingestion engine uses `FileStorageProvider` to obtain streams.
- **DTO Alignment**: Adapters output `TData` matching `RawSubmissionData`.
- **Resource Safety**: Use `try...finally` with `stream.destroy()` to prevent memory leaks and dangling file descriptors.

### Files to Reference

| File                                                                          | Purpose                       |
| ----------------------------------------------------------------------------- | ----------------------------- |
| `src/modules/questionnaires/ingestion/interfaces/source-adapter.interface.ts` | Base interface for adapters   |
| `src/modules/questionnaires/ingestion/types/source-type.enum.ts`              | Source types registry         |
| `src/modules/questionnaires/ingestion/factories/source-adapter.factory.ts`    | Factory for creating adapters |
| `src/modules/questionnaires/ingestion/dto/raw-submission-data.dto.ts`         | Target data structure         |

### Technical Decisions

- **Library (CSV)**: `csv-parser` for performance and streaming support.
- **Library (Excel)**: `exceljs` with `Excel.stream.xlsx.WorkbookReader`.
- **Payload**: Both adapters will accept `NodeJS.ReadableStream` as `TPayload`.
- **Header Normalization**: Adapters will lowercase and trim keys to ensure `Moodle ID` maps to `moodleuser`. In case of collisions (e.g., "Moodle ID" and "moodleid"), the adapter will append a suffix (e.g., `moodleid_1`).
- **Storage Contract**: `FileStorageProvider` interface defines `getStream(storageKey: string): Promise<NodeJS.ReadableStream>`.
- **Memory Safety**: `ExcelAdapter` must use the event-driven `WorkbookReader`. Note: `exceljs` may still load `sharedStrings.xml` into memory; for extremely large shared-string files, memory usage may spike.
- **Stream Resilience (F1)**: The AsyncGenerator wrapping the `WorkbookReader` must handle the `close` and `error` events of the underlying stream to prevent deadlocks.
- **CSV Robustness (F2)**: Support `escape` and `quote` characters in `SourceConfiguration` to handle delimiters inside quoted fields.
- **Row Indexing (F6)**: All `sourceIdentifier` values for row numbers must be 1-based, representing the data row (after headers).

## Implementation Plan

### Tasks

- [x] Task 1: Add dependencies to `package.json`
- [x] Task 2: Define Storage and Base Adapter Interfaces
- [x] Task 3: Implement `CSVAdapter`
- [x] Task 4: Implement `ExcelAdapter`
- [x] Task 5: Register Adapters in Module
- [x] Task 6: Unit Tests for Adapters

### Acceptance Criteria

- [x] AC 1: Given a valid CSV stream, when `CSVAdapter.extract()` is called, then it yields `IngestionRecord` objects with normalized keys.
- [x] AC 2: Given a malformed row in CSV, when `CSVAdapter.extract()` processes it, then it yields an `IngestionRecord` with an `error` message and continues to the next row.
- [x] AC 3: Given an Excel stream with multiple sheets, when `ExcelAdapter.extract()` is called with a specific sheet name, then it only processes rows from that sheet.
- [x] AC 4: Given an ingestion is aborted mid-stream, when the `AsyncIterable` is closed, then the underlying `ReadableStream` is destroyed and no listeners remain (F1).
- [x] AC 5: Given a CSV with headers like " Moodle User ", when processed, then the emitted data key is "moodleuser".
- [x] AC 6: Given an empty file, when processed, then the adapter yields zero records and completes gracefully (F9).

## Review Notes

- Adversarial review completed
- Findings: 13 total, 6 fixed, 7 skipped/acknowledged
- Resolution approach: Walk through
- Key improvements: Added column count validation in CSV, improved empty header naming, added backpressure tests, and refined key normalization.

## Additional Context

### Dependencies

- `csv-parser`: Fast, header-aware CSV parser.
- `exceljs`: Robust Excel reader with streaming support.

### Testing Strategy

- **Mock Streams**: Use `Readable.from()` to simulate file streams in unit tests.
- **Resource Tracking**: In tests, attach a listener to the stream's `close` event to verify destruction.
- **Large File Simulation**: Test with a large number of rows to verify the `AsyncIterable` pattern doesn't block the event loop.

### Notes

- The `IngestionEngine` already handles `maxErrors` and `maxRecords`. The adapters should focus on _yielding_ these errors/records correctly.
- Ensure `csv-parser` is configured with `mapHeaders: ({ header }) => this.normalizeKey(header)`.
- **Package Deep-Dive (Paige's Research):**
  - `csv-parser`: Uses a high-performance C++ backend (via `stream.Transform`). Ensure we don't block the `data` event; use `mapHeaders` for normalization to keep it in the streaming pipeline.
  - `exceljs (WorkbookReader)`: This is an event-emitter, not a native Readable stream. The implementation must use a `Deferred` promise or an `Observable` to bridge the event-to-AsyncIterable gap without losing rows during backpressure.
  - **Backpressure**: Both adapters must respect the stream's `drain` signal if the `IngestionEngine` downstream is slow.
