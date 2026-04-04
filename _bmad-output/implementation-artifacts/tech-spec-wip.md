---
title: 'CSV Test Submission Generator'
slug: 'csv-test-submission-generator'
created: '2026-04-04'
status: 'in-progress'
stepsCompleted: [1]
tech_stack: []
files_to_modify: []
code_patterns: []
test_patterns: []
---

# Tech-Spec: CSV Test Submission Generator

**Created:** 2026-04-04

## Overview

### Problem Statement

Manually constructing CSV files with realistic submission data for questionnaire ingestion is too slow for rapid analytics testing. The team needs volume (60-100 submissions at a time) with realistic, multilingual qualitative feedback to properly exercise analytics dashboards (sentiment analysis, topic modeling, etc.).

### Solution

Backend APIs that generate realistic test submissions for a given questionnaire version — pulling real identities from the DB (faculty, students, courses), generating varied numeric answers, and calling the Anthropic SDK to produce code-switched student feedback in Cebuano/Tagalog/English (English-heavy distribution). The admin console will provide a builder flow (faculty → course → semester → preview → submit).

### Scope

**In Scope:**

- API endpoint(s) to generate test submissions for a questionnaire version
- Pull valid usernames, faculty, courses from existing synced data
- Answer generation with interesting distributions (not uniform random)
- Anthropic SDK integration for multilingual comment generation (Cebuano, Tagalog, English, mixed — weighted English)
- Configurable count (default 60, max 100)
- Preview step before committing submissions
- Feed generated data through existing ingestion pipeline

**Out of Scope:**

- Admin console UI implementation (separate project — just designing APIs for it)
- Stress testing / high-volume modes beyond 100
- Non-questionnaire data generation

## Context for Development

### Codebase Patterns

- NestJS module architecture with split Infrastructure/Application modules
- Existing ingestion pipeline: CSVAdapter → IngestionEngine → IngestionMapperService
- CSV template endpoint already generates headers + 1 example row per version
- Anthropic SDK (`OPENAI_API_KEY` env var exists for ChatKit; will need `ANTHROPIC_API_KEY` or reuse existing key)
- Admin console is a separate frontend project; APIs must be designed for its builder flow

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/modules/questionnaires/questionnaire.controller.ts` | Existing ingest + csv-template endpoints |
| `src/modules/questionnaires/ingestion/adapters/csv.adapter.ts` | CSV parsing and validation |
| `src/modules/questionnaires/ingestion/ingestion-engine.ts` | Stream processing with concurrency control |
| `src/entities/questionnaire-version.entity.ts` | Version entity with schemaSnapshot |
| `src/modules/questionnaires/ingestion/ingestion-mapper.service.ts` | Maps raw data to domain entities |

### Technical Decisions

- Comment generation via Anthropic SDK (Claude) for multilingual code-switched feedback
- Language distribution: English-heavy with Cebuano, Tagalog, and mixed sprinkled in
- Max 100 records per call, default 60
- Preview-then-commit flow: generate → return preview → user confirms → ingest
- Reuse existing ingestion pipeline for actual submission creation

## Implementation Plan

### Tasks

_To be defined in Step 2/3_

### Acceptance Criteria

_To be defined in Step 2/3_

## Additional Context

### Dependencies

_To be defined in Step 2/3_

### Testing Strategy

_To be defined in Step 2/3_

### Notes

- This is an internal developer tool — iterate fast, polish later
- Admin console builder flow: faculty → course → semester → generate → preview → confirm
