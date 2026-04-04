---
title: 'CSV Test Submission Generator'
slug: 'csv-test-submission-generator'
created: '2026-04-04'
status: 'in-progress'
stepsCompleted: [1, 2]
tech_stack: ['NestJS', 'MikroORM', 'PostgreSQL', 'OpenAI SDK', 'BullMQ', 'Zod', 'Jest']
files_to_modify:
  - 'src/modules/admin/admin.module.ts'
  - 'src/modules/admin/admin-filters.controller.ts'
  - 'src/modules/admin/services/admin-filters.service.ts'
  - 'src/modules/admin/admin-generate.controller.ts (NEW)'
  - 'src/modules/admin/services/admin-generate.service.ts (NEW)'
  - 'src/modules/admin/services/comment-generator.service.ts (NEW)'
  - 'src/modules/admin/dto/ (NEW DTOs)'
code_patterns:
  - 'EntityManager direct injection (admin services)'
  - 'FilterOptionResponseDto for filter endpoints'
  - '@UseJwtGuard(UserRole.SUPER_ADMIN) on all admin endpoints'
  - 'MikroOrmModule.forFeature() for entity registration'
  - 'OpenAI client: new OpenAI({ apiKey: env.OPENAI_API_KEY })'
  - 'EnrollmentRole enum: STUDENT, EDITING_TEACHER'
test_patterns:
  - 'Mock EntityManager with jest.fn() methods'
  - 'NestJS TestingModule with useValue mocks'
  - 'Test files: *.spec.ts or __tests__/*.spec.ts'
---

# Tech-Spec: CSV Test Submission Generator

**Created:** 2026-04-04

## Overview

### Problem Statement

Manually constructing CSV files with realistic submission data for questionnaire ingestion is too slow for rapid analytics testing. The team needs volume (up to ~50 submissions per course) with realistic, multilingual qualitative feedback to properly exercise analytics dashboards (sentiment analysis, topic modeling, etc.).

### Solution

Backend APIs that generate realistic test submissions for a given questionnaire version — pulling real identities from the DB (faculty, students, courses), generating varied numeric answers, and calling the OpenAI API to produce code-switched student feedback in Cebuano/Tagalog/English (English-heavy distribution). Two-phase flow: preview all available student submissions, then commit through the existing ingestion pipeline.

### Scope

**In Scope:**

- 4 new filter endpoints for the admin console builder flow
- 2 new action endpoints (preview + commit) for submission generation
- Pull valid faculty, courses, students from enrollment data
- Answer generation with interesting distributions (not uniform random)
- OpenAI integration for multilingual comment generation (Cebuano, Tagalog, English, mixed — weighted English)
- Auto-count: generate for ALL available students (enrolled minus already submitted)
- Preview-then-commit flow: generate full preview → user reviews → commit all
- Feed generated data through existing ingestion pipeline

**Out of Scope:**

- Admin console UI implementation (separate project — just designing APIs)
- Partial generation (subset of available students)
- Non-questionnaire data generation
- Semester selection (auto-derived from course hierarchy)

## Context for Development

### Codebase Patterns

**Admin Module Pattern:**
- Controllers use `@UseJwtGuard(UserRole.SUPER_ADMIN)` for all endpoints
- Services inject `EntityManager` directly (not custom repositories)
- Filter endpoints return `FilterOptionResponseDto[]` with typed Query DTOs
- Module registers entities via `MikroOrmModule.forFeature([...])`
- Existing entities in admin module: Campus, Course, Department, Enrollment, Program, Semester, User

**OpenAI Integration Pattern (from analysis module):**
```typescript
constructor() {
  this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
}
```
- Models in use: `gpt-5` (ChatKit), `gpt-4o-mini` (topic labels)
- For comment generation: `gpt-4o-mini` is appropriate (cheap, fast, sufficient quality)

**Ingestion Pipeline Flow:**
```
RawSubmissionData → IngestionMapper (lookups: user, faculty, course, semester) → submitQuestionnaire()
```
- Mapper validates: user exists, faculty exists, course exists, semester derived from course.program.department.semester
- submitQuestionnaire validates: version active, enrollments exist (STUDENT + EDITING_TEACHER), unique constraint, answers in range [1, maxScore], qualitative comment if required

**Critical Constraint — Unique Submission:**
```
UNIQUE(respondent, faculty, questionnaireVersion, semester, course)
```
- Generator must exclude students who already have submissions for the given version+faculty+course+semester combo
- Available students = enrolled STUDENT users - already submitted users

**Enrollment Query Patterns:**
```typescript
// Faculty's courses
em.find(Enrollment, { user: facultyId, role: 'editingteacher', isActive: true }, { populate: ['course'] })

// Course's students
em.find(Enrollment, { course: courseId, role: 'student', isActive: true }, { populate: ['user'] })
```

**Questionnaire Types:**
- Existing endpoint: `GET /questionnaire-types` with optional `isSystem` filter
- Can reuse via `QuestionnaireTypeService.FindAll()` or query directly
- Three system types: FACULTY_IN_CLASSROOM, FACULTY_OUT_OF_CLASSROOM, FACULTY_FEEDBACK

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/modules/admin/admin.module.ts` | Admin module registration — add new entities/services/controllers here |
| `src/modules/admin/admin-filters.controller.ts` | Existing filter endpoints — pattern to follow for new filters |
| `src/modules/admin/services/admin-filters.service.ts` | Existing filter service — pattern to follow |
| `src/modules/questionnaires/questionnaire.controller.ts:331-480` | Existing csv-template + ingest endpoints |
| `src/modules/questionnaires/ingestion/adapters/csv.adapter.ts` | CSV adapter — understand format for commit |
| `src/modules/questionnaires/ingestion/services/ingestion-engine.service.ts` | Ingestion engine — processStream interface |
| `src/modules/questionnaires/ingestion/services/ingestion-mapper.service.ts` | Mapper — lookups and mapped output shape |
| `src/modules/questionnaires/services/questionnaire.service.ts:577+` | submitQuestionnaire — full validation chain |
| `src/entities/questionnaire-version.entity.ts` | Version entity with schemaSnapshot |
| `src/entities/questionnaire-submission.entity.ts` | Submission entity — unique constraint, required fields |
| `src/entities/enrollment.entity.ts` | Enrollment entity — user+course+role+isActive |
| `src/modules/questionnaires/lib/questionnaire.types.ts` | EnrollmentRole enum, RespondentRole enum |
| `src/modules/questionnaires/services/questionnaire-type.service.ts` | QuestionnaireType queries |
| `src/modules/analysis/services/topic-label.service.ts` | OpenAI usage pattern to follow |
| `src/configurations/env/openai.env.ts` | OpenAI API key env config |

### Technical Decisions

- **OpenAI over Anthropic**: Reuse existing `OPENAI_API_KEY` env var; `gpt-4o-mini` for comment generation (cheap, fast)
- **Language distribution**: ~60% English, ~15% Tagalog, ~15% Cebuano, ~10% mixed/code-switched
- **Auto-count**: Generate for all available students (enrolled - already submitted), no manual count parameter in MVP
- **Preview all, commit all**: No partial generation — frontend holds full preview, sends back for commit
- **No server-side state**: Preview returns JSON rows, frontend POSTs them back for commit
- **Reuse ingestion pipeline**: Commit endpoint converts rows to format compatible with existing IngestionEngine/Mapper
- **Semester auto-derived**: From course.program.department.semester — no user selection needed
- **Two-track builder flow**: Identity (faculty → course) + Instrument (type → version) are independent selections

### API Surface

**Filter Endpoints (AdminFiltersController):**

| Method | Path | Query Params | Returns |
|--------|------|-------------|---------|
| GET | `/admin/filters/faculty` | — | `{ id, username, fullName }[]` |
| GET | `/admin/filters/courses` | `facultyUsername` (required) | `{ id, shortname, fullname }[]` |
| GET | `/admin/filters/questionnaire-types` | — | `{ id, name, code }[]` |
| GET | `/admin/filters/questionnaire-versions` | `typeId` (required) | `{ id, versionNumber, isActive }[]` |

**Generator Endpoints (new AdminGenerateController):**

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/admin/generate-submissions/preview` | `{ versionId, facultyUsername, courseShortname }` | Preview response (metadata + questions + rows) |
| POST | `/admin/generate-submissions/commit` | `{ versionId, rows }` | `IngestionResultDto` |

**Preview Response Shape:**
```typescript
{
  metadata: {
    faculty: { username, fullName },
    course: { shortname, fullname },
    semester: { code, label, academicYear },
    version: { id, versionNumber },
    totalEnrolled: number,
    alreadySubmitted: number,
    availableStudents: number,
    generatingCount: number,
  },
  questions: [{ id, text, sectionName }],
  rows: [{
    externalId: string,
    username: string,
    facultyUsername: string,
    courseShortname: string,
    answers: Record<string, number>,
    comment?: string,
  }],
}
```

## Implementation Plan

### Tasks

_To be generated in Step 3_

### Acceptance Criteria

_To be generated in Step 3_

## Additional Context

### Dependencies

- `openai` npm package (already installed)
- Existing entities: User, Course, Enrollment, Semester, QuestionnaireVersion, QuestionnaireSubmission, QuestionnaireType
- Existing services: IngestionEngine, IngestionMapper, QuestionnaireService, QuestionnaireTypeService

### Testing Strategy

- Mock `EntityManager` for service unit tests (follow admin.service.spec.ts pattern)
- Mock OpenAI client for comment generator tests
- Test answer distribution produces values in valid range [1, maxScore]
- Test available student calculation (enrolled - already submitted)
- Test preview response shape matches expected DTO
- Test commit endpoint feeds data through ingestion pipeline correctly

### Notes

- This is an internal developer tool — iterate fast, polish later
- Admin console builder flow: two-track selection (faculty+course | type+version) → preview all → commit all
- ~50 students across 4 courses in current dev/staging data
- Comment generation is the only external API call — consider timeout/error handling
