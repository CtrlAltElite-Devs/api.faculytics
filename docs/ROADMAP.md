# Roadmap: api.faculytics

This document outlines the development progress, architectural milestones, and future goals for the `api.faculytics` platform. It serves as a high-level guide for system evolution and a context provider for developers and agents.

## Project Vision

To provide a robust, analytics-driven bridge between Moodle learning environments and institutional assessment frameworks, enabling data-informed decisions through synchronized data, asynchronous AI enrichment, and structured feedback loops from diverse sources (Moodle, Web, and File-based ingestion).

---

## Phase 1: Foundation & Core Synchronization (Current Focus)

Establishing the bedrock of the system: identity, hierarchy, and reliable data flow from Moodle.

- [x] **Identity Management:** Moodle-integrated JWT authentication and automatic user profile hydration.
- [x] **Institutional Hierarchy:** Rebuilding Campus/Semester/Department/Program structures from Moodle categories.
- [x] **Idempotent Infrastructure:** Automated migrations and self-healing infrastructure seeders (e.g., Dimension registry).
- [x] **Hybrid Authentication Strategy:** implementing local credential support alongside Moodle SSO for administrative users (Admins/SuperAdmins/Higher-ups).
- [x] **Robust Startup:** Fail-fast initialization sequence ensuring migration execution, seed idempotency, and schema integrity enforcement.
- [x] **Data Sync Engine:** Background jobs for Moodle category and course mirroring (Refinement in progress).
- [x] **Enrollment Mirroring:** Efficient synchronization of user-course relationships with role mapping.
- [x] **Institutional Authority Mapping:** Automated detection and mapping of Deans/Managers based on Moodle category-level capabilities.
- [x] **Moodle Connectivity Resilience (FAC-33):** 10-second request timeouts and `MoodleConnectivityError` handling for graceful degradation when Moodle is unreachable.
- [x] **Login Strategy Pattern (FAC-34):** Refactored authentication into a priority-based strategy pattern supporting local credentials and Moodle SSO with extensible provider support.
- [x] **Refresh Token Cleanup (FAC-35):** Automated cron job purging expired refresh tokens every 12 hours with 7-day retention policy.

## Phase 2: Questionnaire & Ingestion Engine

Enabling structured feedback through a flexible domain engine and universal ingestion adapters.

- [x] **Recursive Schema Validation:** Ensuring mathematical integrity (leaf-weight rules) in complex questionnaires.
- [x] **Dimension Registry:** A categorized framework for grouping assessment criteria across different questionnaire types.
- [x] **Institutional Snapshotting:** Decoupling historical submissions from future hierarchy changes.
- [x] **Submission & Scoring:** API for processing student/faculty feedback with normalized scoring.
- [x] **Ingestion Engine (Orchestrator):** Concurrent stream processor with transactional isolation and dry-run support.
- [x] **Universal Ingestion Adapters:** Base architecture and concrete CSV/Excel adapters implemented.
- [ ] **File-to-Questionnaire Mapping:** Mechanism (DSL or UI) to map CSV/Excel/JSON columns to internal Questionnaire Dimensions.
- [x] **Submission Lifecycle (Phase 1):** Draft and Submitted states implemented with full CRUD operations, security hardening, and adversarial review completed (2026-02-18). Locked and Archived states deferred to Phase 2.
- [x] **Questionnaire Versioning:** Full lifecycle management of assessment versions.

## Phase 3: AI & Inference Pipeline

Enriching qualitative feedback through asynchronous computational middleware. See [AI Inference Pipeline](./architecture/ai-inference-pipeline.md) and [Analysis Pipeline Workflow](./workflows/analysis-pipeline.md).

- [x] **BullMQ Job Queue (FAC-44):** `@nestjs/bullmq` on Redis with queue-per-type pattern, retry policies, and stall detection.
- [x] **Pipeline Orchestrator (FAC-46):** Multi-stage pipeline with confirm-before-execute pattern, coverage stats, and sequential stage progression.
- [x] **Sentiment Analysis (FAC-46):** Batch sentiment classification with per-submission positive/neutral/negative scores.
- [x] **Sentiment Gate (FAC-46):** Filters low-signal positive comments before topic modeling (negative/neutral always pass; positive needs ≥ 10 words).
- [x] **Topic Modeling (FAC-46):** BERTopic-based topic discovery with keyword extraction, soft assignments, and quality metrics.
- [x] **Embedding Generation (FAC-46):** pgvector storage (768-dim LaBSE), upsert behavior, best-effort backfill during pipeline confirmation.
- [x] **Recommendations Engine (FAC-46):** LLM-based action recommendations from aggregated sentiment and topic data, with priority levels and supporting evidence.
- [x] **Recommendation Engine v2 (FAC-55):** Direct OpenAI generation with structured output, dimension score aggregation, per-topic sentiment breakdowns, confidence scoring, and `GET /analysis/pipelines/:id/recommendations` endpoint. Replaces external worker dispatch.
- [x] **Worker Contracts:** Typed Zod schemas for sentiment, topic model, and recommendations workers. See `docs/worker-contracts/`.
- [x] **Inference Versioning:** Worker version tracking on all run entities for provenance.
- [ ] **RunPod Integration:** Replace mock worker URLs with deployed RunPod/LLM endpoint URLs (sentiment, topic modeling).
- [ ] **Pipeline Monitoring:** Bull Board or custom dashboard for inspecting failed jobs and pipeline health.

## Phase 4: Analytics & Reporting Infrastructure

Transforming enriched data into high-performance institutional insights.

- [ ] **OLAP Strategy Decision:** Formalizing the use of Postgres-native views vs. DuckDB for analytical scale.
- [ ] **Snapshot-to-Analytics Pipeline:** Exporting transactional snapshots to analytical storage.
- [ ] **Precomputed Aggregates:** Building departmental and program-level data cubes.
- [ ] **Trend Analysis Engine:** Mathematical modeling of performance across semesters.
- [ ] **Reporting Engine:** Generation of institutional PDFs and Excel exports.

## Phase 5: Governance & Ecosystem

Enforcing institutional boundaries and extending the system reach.

- [ ] **Role-Based Access Control (RBAC):** Granular permissions for admins, deans, and department heads.
- [ ] **Permission Scoping:** Enforcing data boundaries (e.g., Department Head only sees their department).
- [ ] **Notification Engine:** Automated reminders for pending evaluations (Email/Moodle).
- [ ] **External SIS Integration:** Hooks for integrating Student Information Systems beyond Moodle.

---

## Immediate Next Steps (To-Do)
