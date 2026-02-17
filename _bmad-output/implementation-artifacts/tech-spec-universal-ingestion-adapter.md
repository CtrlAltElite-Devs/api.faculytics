---
title: 'Universal Ingestion Adapter for Questionnaire Submissions'
slug: 'universal-ingestion-adapter'
created: '2026-02-17'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['NestJS v11', 'TypeScript v5', 'MikroORM v6', 'Zod']
files_to_modify: ['src/modules/questionnaires/questionnaires.module.ts']
code_patterns: ['Adapter Pattern', 'Factory Pattern', 'AsyncIterable for Streaming', 'DTO-First', 'Fail-Early Validation']
test_patterns: ['Unit Tests with Jest', 'Mocked Dependencies']

## Review Notes
- Adversarial review completed
- Findings: 10 total, 10 fixed, 0 skipped
- Resolution approach: Walk through
---

# Tech-Spec: Universal Ingestion Adapter for Questionnaire Submissions

**Created:** 2026-02-17

## Overview

### Problem Statement

The system needs a unified, scalable way to ingest `QuestionnaireSubmission` data from diverse sources, primarily standard file formats (CSV, Excel) and API inputs. This requires a standard interface to extract raw data before it is mapped to internal institutional dimensions.

### Solution

Implement a `SourceAdapter` interface using a factory pattern. The adapter will parse raw inputs into a standardized `RawSubmissionData` stream (`AsyncIterable`) to ensure scalability for large files. Mapping logic will be decoupled from the adapter to allow for flexible DSL-based transformations later.

### Scope

**In Scope:**

- `SourceAdapter` interface definition (supporting `AsyncIterable` for batching/streaming).
- `SourceAdapterFactory` for dynamic instantiation.
- `RawSubmissionData` and `SourceConfiguration` type definitions.
- Architecture for handling file-based (CSV/Excel) and API-based ingestion.

**Out of Scope:**

- Concrete parsing logic for CSV/Excel (this spec focuses on the _interface_ design).
- The mapping DSL/UI implementation.
- Message queue (BullMQ) integration.

## Context for Development

### Codebase Patterns

- **Async Steams:** Use `AsyncIterable` (e.g., `async *generate()`) to handle potentially large data sets without loading everything into memory.
- **Factory Pattern:** Use a central factory to resolve the correct adapter based on source type.
- **DTO-First:** Ensure all raw data models are strictly typed as DTOs.
- **Loose Coupling:** The adapter should only be responsible for _extraction_. Transformation (mapping) should happen in a separate layer.
- **Fail-Early Validation:** Structural validation occurs at the adapter level to ensure the stream only contains readable records.

### Files to Reference

| File                                                           | Purpose                              |
| -------------------------------------------------------------- | ------------------------------------ |
| `src/entities/questionnaire-submission.entity.ts`              | Target entity for mapping.           |
| `src/entities/questionnaire-answer.entity.ts`                  | Target entity for mapping answers.   |
| `src/modules/questionnaires/questionnaires.module.ts`          | Module registration entry point.     |
| `src/modules/questionnaires/services/questionnaire.service.ts` | Logic for submission and validation. |
| `src/modules/moodle/moodle.service.ts`                         | Example of service/client pattern.   |

### Technical Decisions

- **AsyncIterable over Observables:** For simplicity in handling backpressure and native JS support in modern Node.js versions.
- **Factory-based instantiation (ModuleRef):** Use NestJS `ModuleRef` in the `SourceAdapterFactory` to resolve adapters. Concrete adapters must be registered with the naming convention `SOURCE_ADAPTER_${TYPE}`.
- **Type-Safe Generic Adapters (F14):** Use `SourceAdapter<TPayload>` to ensure type safety for different inputs (e.g., `Stream` for CSV, `MoodleContext` for Moodle).
- **Stateless Adapters (F1, F4):** The `extract(payload: TPayload, config: SourceConfiguration)` method receives the data source. The interface includes an optional `close()` method for resource cleanup.
- **IngestionRecord Wrapper (F5, F16):** Yield `{ data?: T, error?: string, sourceIdentifier: string | number }`. `RawSubmissionData` answers will be an array of objects: `{ questionId: string, value: number }`.
- **Fail-Early Validation & Formatter (F10, F20):** Adapters perform structural validation (Zod) and mandate UTF-8 encoding. A utility formats Zod errors into human-readable strings.
- **Concurrency & OOM Prevention (F11, F13):** The ingestion engine must support a `maxErrors` threshold (default 1000) to prevent OOM. Every 100 records, the engine should yield to the event loop using `setImmediate`.
- **Dry-Run Support (F15):** `SourceConfiguration` includes a `dryRun: boolean` flag. When true, the mapping/ingestion process should skip persistence and only return the validation summary.

## Implementation Plan

### Tasks

- [x] Task 1: Define Ingestion Interfaces, Types, and Utilities
  - Files:
    - `src/modules/questionnaires/ingestion/interfaces/ingestion-record.interface.ts`
    - `src/modules/questionnaires/ingestion/interfaces/source-adapter.interface.ts`
    - `src/modules/questionnaires/ingestion/types/source-config.type.ts`
    - `src/modules/questionnaires/ingestion/utils/error-formatter.util.ts`
  - Action: Define `SourceAdapter<TPayload>` with `extract()` and `close()`. Add `dryRun` and `maxErrors` to `SourceConfiguration`.
- [x] Task 2: Define RawSubmissionData DTO (F16)
  - File: `src/modules/questionnaires/ingestion/dto/raw-submission-data.dto.ts`
  - Action: Define flat structure with an array of answer objects.
- [x] Task 3: Implement SourceAdapterFactory & SourceType Enum (F12, F19)
  - File: `src/modules/questionnaires/ingestion/factories/source-adapter.factory.ts`
  - File: `src/modules/questionnaires/ingestion/types/source-type.enum.ts`
  - Action: Define `SourceType` (API, CSV, EXCEL, MOODLE). Use `SOURCE_ADAPTER_${TYPE}` token convention.
- [x] Task 4: Register Ingestion Components in QuestionnaireModule
  - File: `src/modules/questionnaires/questionnaires.module.ts`
  - Action: Provide `SourceAdapterFactory` and register adapter tokens.

### Acceptance Criteria

- [x] AC 1: Given a source configuration, when `SourceAdapterFactory.Create()` is called, then it returns the correct adapter implementation.
- [x] AC 2: Given an adapter instance, when `extract()` is called, then it returns an `AsyncIterable` that yields `IngestionRecord` objects.
- [x] AC 3: Given a batch exceeding `maxErrors`, when processed, then the ingestion terminates gracefully with a partial error report.
- [x] AC 4: Given `dryRun: true`, when ingestion is executed, then no records are persisted but a full validation summary is returned.

### Acceptance Criteria

- [x] AC 1: Given a source configuration, when `SourceAdapterFactory.Create()` is called, then it returns the correct adapter implementation.
- [x] AC 2: Given an adapter instance, when `extract()` is called, then it returns an `AsyncIterable` that yields `IngestionRecord` objects.
- [x] AC 3: Given a malformed input record, when an adapter processes it, then it yields an `IngestionRecord` with an `error` message and a `sourceIdentifier` (e.g., row number).
- [x] AC 4: Given a valid input record, when an adapter processes it, then it yields an `IngestionRecord` with populated `data` and no `error`.

## Additional Context

### Dependencies

- **Zod:** Required for the "Fail-Early" validation within adapters.
- **NestJS Core:** For Dependency Injection and Module management.

### Testing Strategy

- **Unit Tests:** Focus on the `SourceAdapterFactory` and a mock `SourceAdapter` to verify the `AsyncIterable` handling.
- **Integration Tests:** Verify that the `QuestionnairesModule` correctly provides the factory.

### Notes

- The `AsyncIterable` approach is designed for memory efficiency; ensure the implementation doesn't accidentally collect the entire stream into an array.
- The `sourceIdentifier` is critical for user-facing error reports.
