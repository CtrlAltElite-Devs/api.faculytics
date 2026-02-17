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

## Phase 2: Questionnaire & Ingestion Engine

Enabling structured feedback through a flexible domain engine and universal ingestion adapters.

- [x] **Recursive Schema Validation:** Ensuring mathematical integrity (leaf-weight rules) in complex questionnaires.
- [x] **Dimension Registry:** A categorized framework for grouping assessment criteria across different questionnaire types.
- [x] **Institutional Snapshotting:** Decoupling historical submissions from future hierarchy changes.
- [x] **Submission & Scoring:** API for processing student/faculty feedback with normalized scoring.
- [x] **Ingestion Engine (Orchestrator):** Concurrent stream processor with transactional isolation and dry-run support.
- [x] **Universal Ingestion Adapters:** Base architecture and concrete CSV/Excel adapters implemented.
- [ ] **File-to-Questionnaire Mapping:** Mechanism (DSL or UI) to map CSV/Excel/JSON columns to internal Questionnaire Dimensions.
- [ ] **Submission Lifecycle:** Support for states (Draft, Submitted, Locked, Archived).
- [ ] **Questionnaire Versioning:** Full lifecycle management of assessment versions.

## Phase 3: AI & Inference Pipeline

Enriching qualitative feedback through asynchronous computational middleware.

- [ ] **Message Queue Integration:** Asynchronous pipeline using BullMQ or RabbitMQ for inference and large-scale file ingestion.
- [ ] **Async Inference Workers:** Dedicated consumers for computational tasks.
- [ ] **Sentiment Analysis:** Processing qualitative responses for emotional tone.
- [ ] **Topic Modeling & Clustering:** Grouping feedback into institutional themes.
- [ ] **Embedding Generation:** Vector storage for semantic search and similarity analysis.
- [ ] **Inference Versioning:** Tracking model artifacts, prompt templates, and execution metadata.

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
