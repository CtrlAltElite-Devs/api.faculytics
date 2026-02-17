---
title: 'Finalize Questionnaire Submission API'
slug: 'finalize-questionnaire-submission-api'
created: '2026-02-17'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: ['NestJS', 'MikroORM', 'TypeScript', 'Zod']
files_to_modify:
  - src/modules/questionnaires/questionnaire.types.ts
  - src/modules/questionnaires/services/questionnaire.service.ts
  - src/modules/questionnaires/services/scoring.service.ts
  - src/entities/questionnaire-submission.entity.ts
code_patterns:
  - 'Idempotent context validation'
  - 'Institutional snapshotting'
  - 'Schema-driven data validation'
  - 'Recursive schema traversal for scoring'
test_patterns:
  - 'Unit tests for ScoringService'
  - 'Integration tests for QuestionnaireService submission flow'
---

# Overview

## Problem Statement

The current Questionnaire Submission API implementation is a functional prototype but lacks the production-grade rigor required for institutional assessment. It missing critical context validation (verifying if users are actually part of the course), does not prevent duplicate submissions at the service layer, lacks full schema-driven answer validation, and uses hardcoded scoring normalization. Additionally, institutional snapshots are incomplete (missing faculty employee numbers).

## Solution

Enhance the `QuestionnaireService` and `ScoringService` to implement a robust, validated submission pipeline. This includes:

1. **Contextual Validation:** Ensuring respondents and faculty are correctly enrolled in the specified course with appropriate roles ("student" and "editingteacher") and that their enrollment is `isActive`.
2. **Submission Integrity:** Preventing duplicate submissions and validating that all questions in the version schema are answered within valid numeric ranges.
3. **Flexible Analytics:** Updating the scoring engine to handle dynamic scales by utilizing a `maxScore` field defined in the `QuestionnaireVersion` schema's `meta` object.
4. **State Preservation:** Ensuring all institutional snapshots, including faculty metadata, are fully captured at the moment of submission.

## Scope

### In Scope

- **Enrollment Verification:** Validation logic using the `Enrollment` entity to confirm student/faculty relationship to a course, including `isActive: true` check.
- **Duplicate Prevention:** Explicit check for existing submissions before persistence.
- **Enhanced Answer Validation:** Schema-aware validation of the `answers` payload.
- **Scoring Normalization:** Refactoring `ScoringService` to use `schema.meta.maxScore` instead of a hardcoded value.
- **Snapshot Enrichment:** Populating `facultyEmployeeNumberSnapshot`.

### Out of Scope

- Frontend implementation or UI components.
- Implementation of new questionnaire types.
- Post-submission analytics processing or report generation.

# Context for Development

## Codebase Patterns

- **Types:** `src/modules/questionnaires/questionnaire.types.ts` defines the schema structure. `maxScore` needs to be added to `QuestionnaireSchemaSnapshot.meta`.
- **Enrollment:** No dedicated repository; use `em.getRepository(Enrollment)` or `@InjectRepository(Enrollment)`.
- **Validation:** `QuestionnaireSchemaValidator` ensures structural integrity, but per-submission answer validation is handled in `QuestionnaireService`.

## Files to Reference

| File                                                           | Purpose                                            |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `src/entities/enrollment.entity.ts`                            | Source of truth for course participation and roles |
| `src/modules/questionnaires/services/questionnaire.service.ts` | Main orchestration point for submissions           |
| `src/modules/questionnaires/services/scoring.service.ts`       | Scoring logic to be refactored for dynamic scales  |

## Technical Decisions

- **Enrollment Roles:** A student must have the `student` role in an enrollment for the course. A faculty member must have the `editingteacher` role. Both must have `isActive: true`.
- **Dean Exception:** If the respondent has the `DEAN` role (from `User.roles`), skip the course enrollment validation for the respondent.
- **Context Integrity:** Explicitly verify that the provided `courseId` (if present) belongs to the provided `semesterId`.
- **Scoring:** The `QuestionnaireVersion.schemaSnapshot.meta.maxScore` field (e.g., 4 or 5) will be used to calculate the `normalizedScore` (0-100). Default to `5` if missing/invalid, and throw `BadRequestException` if `maxScore <= 0`.
- **Snapshotting:** Use existing `QuestionnaireSubmission` entity fields. The `facultyEmployeeNumberSnapshot` will be populated using the `faculty.userName` field.
- **Error Handling:** Use standard NestJS `BadRequestException`, `ForbiddenException` (for role mismatch), or `ConflictException` (for duplicates).

# Implementation Plan

- [x] Task 1: Update Questionnaire Types
  - File: `src/modules/questionnaires/questionnaire.types.ts`
  - Action: Add `maxScore: number` to `QuestionnaireSchemaSnapshot.meta`.

- [x] Task 2: Refactor Scoring Logic
  - File: `src/modules/questionnaires/services/scoring.service.ts`
  - Action: Modify `calculateScores` to accept `schema.meta.maxScore`.
  - Action: Add guard: `const max = (schema.meta.maxScore > 0) ? schema.meta.maxScore : 5`.
  - Action: Calculate `normalizedScore = (totalScore / max) * 100`.

- [x] Task 3: Implement Context and Enrollment Validation
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: Inject `Enrollment` repository.
  - Action: In `submitQuestionnaire`, if `courseId` is provided:
    1. Verify `course.semester.id === data.semesterId`.
    2. If `!respondent.roles.includes(UserRole.DEAN)`, verify respondent has `isActive: true` enrollment with role `student` in `courseId`.
    3. Verify faculty has `isActive: true` enrollment with role `editingteacher` in `courseId`.
  - Action: Add duplicate check via `submissionRepo.findOne`. Wrap `em.flush()` in a `try/catch` to map unique constraint violations to `ConflictException`.

- [x] Task 4: Enhance Answer Payload and Comment Validation
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: Validate all questions in the schema are present in `data.answers`.
  - Action: Validate numeric values are between `1` and `maxScore`.
  - Action: If `qualitativeComment` provided, validate length against `schema.qualitativeFeedback.maxLength` (if enabled).

- [x] Task 5: Enrich Institutional Snapshots
  - File: `src/modules/questionnaires/services/questionnaire.service.ts`
  - Action: Populate snapshots for Campus, Department, Program, and Course.
  - Action: Populate `facultyEmployeeNumberSnapshot` using `faculty.userName`.

# Acceptance Criteria

- [x] AC 1: Enrollment Guard
  - Given a student is NOT enrolled in Course A, when they attempt to submit a questionnaire for Course A, then the API returns 400/403 with a clear enrollment error.
- [x] AC 2: Dean Exception
  - Given a respondent has the 'DEAN' role, when they submit for Course A even without an enrollment, then the submission is accepted.
- [x] AC 3: Context Integrity Guard
  - Given Course A belongs to Semester 1, when a submission attempts to link Course A to Semester 2, then the API returns 400 Bad Request.
- [x] AC 4: Duplicate Prevention
  - Given a student has already submitted for Version X in Course A, when they attempt to submit again for the same version and course, then the API returns 409 Conflict.
- [x] AC 5: Dynamic Scoring
  - Given a questionnaire version with `maxScore: 4`, when a student scores 4 on all questions, then the `normalizedScore` is 100.

# Additional Context

## Dependencies

- `QuestionnaireVersion` schema must have `meta.maxScore` populated (might require updates to seeding or creation tools).

## Testing Strategy

- **Unit Tests:** Update `scoring.service.spec.ts` to test various `maxScore` values.
- **Integration Tests:** Create new test cases in `questionnaire.service.spec.ts` for enrollment failures and duplicate submissions.
