# Roadmap: api.faculytics

This roadmap tracks the implementation status of the `api.faculytics` backend against the product direction. It reflects the checked-in `develop` branch as of 2026-03-31.

## Project Vision

Provide a robust, analytics-driven bridge between Moodle learning environments and institutional assessment workflows, enabling data-informed decisions through synchronized academic data, asynchronous AI enrichment, and structured feedback collection from direct submissions and file-based ingestion.

## Status Snapshot

| Phase                                         | Status          | Notes                                                                                                                              |
| --------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1. Foundation & Core Synchronization    | Complete        | Core auth, Moodle sync, hydration, scheduling, and resilience are in place.                                                        |
| Phase 2. Questionnaire & Ingestion Engine     | Mostly complete | Questionnaire management, draft/submit flows, and CSV ingestion are live; self-serve file mapping is still pending.                |
| Phase 3. AI & Inference Pipeline              | Mostly complete | End-to-end pipeline is shipped; production worker rollout and operator monitoring remain open.                                     |
| Phase 4. Analytics & Reporting Infrastructure | In progress     | Materialized-view analytics and faculty reports are live; exports and long-term analytics scaling are still open.                  |
| Phase 5. Governance & Ecosystem               | In progress     | Scoped access, admin tooling, and audit logging are implemented; finer-grained permissions and ecosystem integrations remain open. |

Cross-cutting platform capabilities already present in the codebase but not treated as separate roadmap phases include Redis-backed caching and throttling, structured health checks, request-scoped CLS metadata, and the authenticated `ChatKit` endpoint.

---

## Phase 1: Foundation & Core Synchronization

- [x] **Identity Management:** Moodle-integrated JWT auth with local access and refresh tokens.
- [x] **Hybrid Authentication Strategy (FAC-34):** Priority-based login strategies support both local credentials and Moodle SSO.
- [x] **Robust Startup:** Fail-fast bootstrap runs migrations, infrastructure seeders, and configuration validation before serving traffic.
- [x] **Institutional Hierarchy Sync:** Campuses, semesters, departments, programs, courses, and enrollments are mirrored from Moodle.
- [x] **Per-User Hydration on Login:** Moodle logins refresh the user's courses, enrollments, sections, and institutional roles.
- [x] **Section Sync from Moodle Groups:** Course groups are materialized locally as `Section` and attached to enrollments.
- [x] **Institutional Authority Mapping:** Dean and chairperson scope is derived from Moodle category structure, with support for manual dean assignment.
- [x] **Dynamic Sync Scheduling & SyncLog Observability:** Sync cadence is runtime-configurable and every run is recorded with per-phase metrics.
- [x] **Semester Label Enrichment:** Moodle semester codes are parsed into display labels and academic year metadata.
- [x] **Moodle Connectivity Resilience (FAC-33):** 10-second request timeouts and connectivity-specific failures prevent hanging auth and sync paths.
- [x] **Refresh Token Cleanup (FAC-35):** Expired refresh tokens are purged on a 12-hour schedule with retention handling.

## Phase 2: Questionnaire & Ingestion Engine

- [x] **Recursive Schema Validation:** Questionnaire schemas enforce leaf-only questions and exact weight totals.
- [x] **Dimension Registry & Admin API:** Canonical dimensions are seeded and can be managed through the dimensions module.
- [x] **Questionnaire Lifecycle Management:** Questionnaires support creation, update, archive, publish, deprecate, and version detail flows.
- [x] **Institutional Snapshotting:** Submissions persist faculty, department, program, campus, and semester snapshots for historical stability.
- [x] **Draft Save/Resume Flow:** Respondents can save, retrieve, list, and delete drafts before final submission.
- [x] **Submission & Scoring:** Finalized submissions validate answers, compute normalized scores, and enforce duplicate-submission rules.
- [x] **Bulk CSV Ingestion:** Version-specific CSV templates and audited `/questionnaires/ingest` uploads support bulk submission imports.
- [x] **Ingestion Engine (Orchestrator):** Stream-based processing supports dry runs, concurrency control, timeouts, and bounded error handling.
- [x] **Adapter-Based Ingestion Foundation:** CSV is live in the API, and Excel adapter support exists in the ingestion layer for future exposure.
- [ ] **Self-Serve File-to-Questionnaire Mapping:** Imports still rely on fixed metadata headers plus question UUID columns; there is no user-defined mapping DSL or UI yet.

## Phase 3: AI & Inference Pipeline

- [x] **BullMQ Job Queue (FAC-44):** Queue-per-type analysis jobs run on Redis with retry and backoff policies.
- [x] **Pipeline Orchestrator (FAC-46):** Confirm-before-execute orchestration tracks coverage, warnings, stage progression, and terminal states.
- [x] **Sentiment Analysis (FAC-46):** Batch sentiment classification persists per-submission polarity scores.
- [x] **Sentiment Gate (FAC-46):** Low-signal positive comments are filtered before topic modeling.
- [x] **Topic Modeling (FAC-46):** Topic discovery persists assignments, keywords, and run provenance.
- [x] **Topic Labeling:** Topic clusters are labeled before recommendation generation.
- [x] **Embedding Generation (FAC-46):** pgvector-backed embeddings are stored and upserted per submission.
- [x] **Recommendations Engine v2 (FAC-55):** Recommendations are generated directly via OpenAI with structured output, confidence, and supporting evidence.
- [x] **Worker Contracts & Inference Versioning:** Zod-validated contracts and version fields exist across pipeline runs.
- [x] **Local Worker Simulation:** `mock-worker/` supports local development without deployed inference workers.
- [ ] **RunPod / Production Worker Rollout:** Sentiment and topic-model stages still need production endpoint deployment and cutover.
- [ ] **Pipeline Monitoring:** There is no Bull Board or equivalent operator dashboard yet for failed jobs and queue health.

## Phase 4: Analytics & Reporting Infrastructure

- [x] **Postgres-Native Analytics Strategy:** Materialized views are the current analytics backbone instead of live multi-join dashboard queries.
- [x] **Snapshot-to-Analytics Refresh Pipeline:** Completed analysis pipelines enqueue asynchronous analytics refresh jobs.
- [x] **Precomputed Aggregates:** `mv_faculty_semester_stats` and `mv_faculty_trends` provide dashboard-ready rollups.
- [x] **Trend Analysis Engine:** Trend APIs compute regression slopes and confidence (`R^2`) over semester history.
- [x] **Dashboard APIs:** Department overview, attention list, and faculty trends endpoints are live and scope-aware.
- [x] **Faculty Evaluation Reports:** Per-question reports and paginated qualitative comment endpoints are implemented.
- [x] **Analytics Freshness Tracking:** `analytics_last_refreshed_at` is recorded so consumers can show data staleness.
- [ ] **Exportable Reporting:** PDF and Excel report generation are not implemented yet.
- [ ] **Long-Term OLAP Path:** A broader warehouse or alternative analytical engine decision is still open if current Postgres views become a bottleneck.

## Phase 5: Governance & Ecosystem

- [x] **Role-Protected APIs:** `UseJwtGuard()` and `RolesGuard` enforce route-level access across application modules.
- [x] **Scoped Dean/Chairperson Access:** `ScopeResolverService` restricts analytics, curriculum, and faculty queries to authorized departments and programs.
- [x] **Institutional Role Administration:** Super admins can assign and remove manual dean/chairperson roles through admin endpoints.
- [x] **Admin Directory APIs:** Super-admin endpoints support user listing, filtering, and institutional role management workflows.
- [x] **Append-Only Audit Trail:** Auth, sync, questionnaire, and analysis actions are captured through the global audit pipeline.
- [ ] **Fine-Grained Permission Model:** Access control is still role-centric rather than permission-centric.
- [ ] **Audit Review Surface:** The write path exists, but there are no audit query/reporting endpoints for operators yet.
- [ ] **Notification Engine:** Automated reminders and outbound notifications are still pending.
- [ ] **External SIS Integration:** Moodle remains the only production integration surface for institutional data.

---

## Immediate Next Steps

1. Productionize the remaining external inference stages by replacing mock or placeholder worker URLs with deployed sentiment and topic-model endpoints.
2. Add operator visibility for BullMQ queues, sync runs, analytics refresh failures, and audit review workflows.
3. Extend the analytics surface from API-only responses into exportable institutional reports (PDF/Excel) and scheduled delivery paths.
4. Mature governance from coarse role checks into a clearer permission model with explicit review tooling.
5. Reassess the analytics storage strategy once dashboard scope expands beyond the current faculty- and department-focused materialized views.
