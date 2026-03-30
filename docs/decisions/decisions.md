# Architectural Decisions

This document tracks key architectural decisions and patterns used in the `api.faculytics` project.

## 1. External ID Stability

Moodle's `moodleCategoryId` and `moodleCourseId` are used as business keys for idempotent upserts to ensure primary key stability in the local database. This prevents local UUIDs from changing during synchronization.

## 2. Unit of Work Pattern

Leveraging MikroORM's `EntityManager` to ensure transactional integrity during complex synchronization processes. This ensures that either a full sync operation succeeds or none of it is committed.

## 3. Base Job Pattern

Non-sync background jobs extend `BaseJob` to provide consistent logging, startup execution logic, and error handling. Currently only `RefreshTokenCleanupJob` uses this pattern — the Moodle sync jobs were migrated to BullMQ (see Decision #26).

## 4. Questionnaire Leaf-Weight Rule

To ensure scoring mathematical integrity:

- Only "leaf" sections (those without sub-sections) can have weights and questions.
- The sum of all leaf section weights within a questionnaire version must equal exactly 100.
- This is enforced recursively by the `QuestionnaireSchemaValidator`.

## 5. Institutional Snapshotting

Submissions store a literal snapshot of institutional data (Campus Name, Department Code, etc.) at the moment of submission. This decouples historical feedback from future changes in the institutional hierarchy (e.g., renaming a department).

## 6. Multi-Column Unique Constraints

For data integrity in questionnaires, unique constraints are applied across multiple columns (e.g., `respondentId`, `facultyId`, `versionId`, `semesterId`, `courseId`) using MikroORM's `@Unique` class decorator to prevent duplicate submissions.

## 7. Idempotent Infrastructure Seeding

The application ensures that required infrastructure state (like the Dimension registry) always exists on startup. This is handled via a strictly idempotent seeding strategy integrated into the bootstrap flow:

- **Insert-Only:** Seeders check for existence before inserting and never modify or delete existing records.
- **Fail-Fast:** If seeding fails, the application crashes immediately. This ensures the system never runs in an inconsistent or incomplete state.
- **Environment Parity:** The same seeders run in all environments, guaranteeing that canonical codes (like 'PLANNING') are always available for services and analytics.

## 8. Namespace-Based Cache Invalidation

Rather than using Redis pattern-based key scanning (`KEYS` / `SCAN`), the caching layer uses an in-memory `keyRegistry` (`Map<CacheNamespace, Set<string>>`) to track cached keys per namespace. This enables precise, O(n) invalidation without Redis `KEYS` commands (which are O(N) over the entire keyspace and discouraged in production).

- **Trade-off:** On app restart, the registry is empty so stale keys cannot be actively invalidated. This is acceptable because all cached entries have a finite TTL (30 min – 1 hour), so stale data self-expires.
- **Bounded memory:** The registry only tracks keys for a small, fixed set of cached endpoints, so memory usage is negligible.

See [Caching Architecture](../architecture/caching.md) for full details.

## 9. BullMQ over RabbitMQ for Job Processing

The AI inference pipeline uses BullMQ (Redis-backed) instead of RabbitMQ for async job processing:

- **No new infrastructure:** Reuses the existing Redis instance — no separate message broker to operate.
- **All workers are HTTP endpoints:** RunPod serverless and LLM APIs are HTTP-based. No AMQP consumers exist or are planned, so RabbitMQ's cross-language support is unnecessary.
- **Queue-per-type isolation:** Each analysis type (sentiment, topic model, embeddings) gets its own queue with independent concurrency and retry policies.
- **Trade-off:** Single Redis serves both caching and queues in development. In production, these should be split into separate instances (cache: `allkeys-lru`, queue: `noeviction`) to prevent job data eviction.

See [AI Inference Pipeline](../architecture/ai-inference-pipeline.md) for full architecture.

## 10. Redis Required (No In-Memory Fallback)

`REDIS_URL` changed from optional to required. The in-memory cache fallback was removed because BullMQ requires a real Redis connection. This simplifies the codebase (eliminates a dead code branch) at the cost of requiring Redis for all environments — mitigated by `docker-compose.yml` providing a local Redis instance.

## 11. Terminus Health Checks

Migrated from a barebones `'healthy'` string response to `@nestjs/terminus` with structured JSON and HTTP status codes (200/503). This is a breaking change for any monitoring that parses the response body, but load balancers and K8s probes typically check status codes, making it transparent to most infrastructure.

## 12. Confirm-Before-Execute Pipeline Pattern

Analysis pipelines use a two-step creation flow: `CreatePipeline()` computes coverage stats and warnings, then `ConfirmPipeline()` starts execution. This prevents accidental analysis runs on insufficient data and gives the UI a chance to display warnings (low response rate, stale enrollment data) before committing compute resources.

- **Trade-off:** Adds an extra API call, but avoids wasting GPU time on pipelines that a human would reject after seeing coverage stats.

## 13. Sentiment Gate for Topic Modeling

Between sentiment analysis and topic modeling, a filtering gate excludes low-signal positive comments (< 10 words). Negative and neutral comments always pass because they contain the most actionable feedback.

- **Rationale:** Short positive comments ("Great!", "Good job") add noise to topic modeling clusters without contributing meaningful themes. Removing them improves topic quality.
- **Trade-off:** Some short but substantive positive feedback may be excluded. The 10-word threshold is configurable via `SENTIMENT_GATE.POSITIVE_MIN_WORD_COUNT`.

## 14. Batch Message Contract over Individual Jobs

Pipeline-driven stages (sentiment, topic model, recommendations) use a batch envelope — all items for a stage are sent in a single BullMQ job and HTTP request. This replaces the per-submission individual job pattern used for ad-hoc analysis.

- **Rationale:** Workers like BERTopic need the full corpus in one request for clustering. RunPod serverless cold starts make per-item requests expensive.
- **Trade-off:** A single failed batch fails all items. Acceptable because pipeline retry policies handle this at the stage level.

See [AI Inference Pipeline](../architecture/ai-inference-pipeline.md) for message schemas.

## 15. pgvector for Embedding Storage

Embeddings are stored using `pgvector` on the existing PostgreSQL database rather than a dedicated vector DB (Qdrant, Pinecone).

- **Rationale:** Embeddings are used for topic modeling input, not real-time similarity search. Keeping them in Postgres avoids new infrastructure and simplifies backup/restore.
- **Trade-off:** If high-throughput similarity search is needed later (e.g., semantic search), a dedicated vector DB may be required. The `SubmissionEmbedding` entity can be adapted to sync to an external store.

## 16. Cleaned Comment Preprocessing

Raw `qualitativeComment` text is cleaned into a separate `cleanedComment` column at submission time. All downstream analysis stages (sentiment, embeddings, topic modeling) use `cleanedComment` instead of the raw text.

- **Rationale:** Multilingual student feedback (Cebuano, Tagalog, English, code-switched) contains noise — Excel import artifacts (`#NAME?`), URLs, laughter tokens (`hahaha`, `lol`), keyboard mash, repeated characters, and broken emoji. Cleaning at write time ensures consistent input across all analysis stages and avoids re-cleaning on every pipeline run.
- **Trade-off:** Submissions with `qualitativeComment` but `cleanedComment = null` (text reduced to nothing after cleaning) are excluded from analysis entirely. The raw text is preserved for audit/display purposes.

## 17. RunPod Processor Abstraction

Topic modeling (and future GPU-bound workers) use a `RunPodBatchProcessor` base class that extends `BaseBatchProcessor` with RunPod-specific envelope handling (`{ input: ... }` / `{ output: ... }`) and bearer token auth.

- **Rationale:** RunPod serverless has a fixed request/response envelope format. Encoding this in a shared base class avoids duplicating wrapping logic across multiple GPU worker processors.
- **Trade-off:** Adds an inheritance layer. Acceptable because the alternative (conditionals in `BaseBatchProcessor`) would couple the base class to a specific vendor.

## 18. LLM-Based Topic Labeling as Inline Pipeline Step

BERTopic produces machine-generated raw labels (e.g., `0_teaching_maayo_method`) that are not human-readable. The `TopicLabelService` calls OpenAI `gpt-4o-mini` with structured output (Zod schema via `zodResponseFormat`) to generate short (2-4 word) English labels for each topic before the recommendations stage.

- **Inline, not queued:** Topic labeling runs synchronously inside the orchestrator's `OnTopicModelComplete()` handler rather than as a separate BullMQ stage. The LLM call is fast (single request for all topics) and doesn't justify queue overhead.
- **Non-blocking fallback:** If the LLM call fails, topics retain their `rawLabel`. Downstream consumers (recommendations aggregation, status endpoint) use `topic.label ?? topic.rawLabel`, so the pipeline never fails due to labeling.
- **Trade-off:** Adds an OpenAI dependency to the pipeline. Acceptable because `OPENAI_API_KEY` is already required for the ChatKit module, and the cost per call is minimal (one request per pipeline run with a small payload).

## 19. Direct LLM Recommendations over External Worker

Recommendations were originally designed as an external HTTP worker (like sentiment and topic modeling). The `RecommendationGenerationService` now calls OpenAI directly from within the NestJS process instead.

- **Rationale:** Recommendations don't require GPU compute — they're purely LLM text generation. Unlike sentiment/topic modeling workers that need specialized ML runtimes (PyTorch, BERTopic), recommendations only need an API key. The service also needs full database access to build rich prompts (dimension scores via SQL aggregation, per-topic sentiment breakdowns, proportional sample comment selection), which an external worker cannot do without duplicating the data model.
- **Still queued:** The `RecommendationsProcessor` still uses BullMQ for retry semantics and pipeline stage progression. The queue dispatches a lightweight job (just pipeline/run IDs) and the processor calls `RecommendationGenerationService.Generate()` in-process.
- **Structured output:** Uses OpenAI's `zodResponseFormat` for type-safe responses — the LLM returns JSON validated against the `llmRecommendationsResponseSchema` (category, headline, description, actionPlan, priority, topicReference).
- **Trade-off:** Recommendation generation now runs in the API process, consuming memory and an OpenAI API call slot. Acceptable because one call per pipeline run is negligible load, and the alternative (an HTTP worker with replicated DB queries) adds complexity without benefit.

## 21. CLS-Based Scope Resolution

Role-based scoping uses NestJS CLS (Continuation-Local Storage) via `nestjs-cls` to propagate the authenticated user through the request lifecycle without passing it as a parameter.

- **Flow:** `CurrentUserInterceptor` loads the user into CLS, then `ScopeResolverService` reads it via `CurrentUserService.getOrFail()`. Services never receive the user directly — they call `ScopeResolverService.ResolveDepartmentIds(semesterId)` which returns `null` (unrestricted) or `string[]` (restricted department IDs).
- **Rationale:** Avoids threading the user through every controller → service method signature. The interceptor + CLS pattern is a single integration point that all scoped modules reuse.
- **Trade-off:** CLS adds an implicit dependency that isn't visible in constructor injection. Mitigated by the `getOrFail()` method which throws immediately if the user isn't set.

## 22. Curriculum Endpoints Without Pagination

The `CurriculumModule` returns flat arrays instead of paginated responses for departments, programs, and courses.

- **Rationale:** Result sets are inherently small within a dean's scope (1-3 departments, 5-15 programs, 20-60 courses). Super admins see more but still manageable for a single university. Pagination would add DTO and service complexity for no practical benefit.
- **Trade-off:** If the system scales to multi-university, super admin result sets could grow. Acceptable risk — pagination can be added later without breaking the API contract (response would change from `T[]` to `{ data: T[], meta: ... }`).

## 23. Per-Card Submission Count over Bulk Endpoint

Faculty card submission counts use a per-card `GET /faculty/:facultyId/submission-count?semesterId=X` endpoint instead of a bulk endpoint that returns counts for all faculty at once.

- **Rationale:** Simpler contract (no array parsing/validation), individually cacheable, matches the React component-per-card pattern where TanStack Query handles parallel fetches with deduplication. Realistic page sizes (10-20 faculty) won't cause performance issues.
- **Scope enforcement deferred:** The endpoint uses role-only guards (`DEAN`, `SUPER_ADMIN`) without re-deriving department scope. Faculty IDs are already scoped by the `GET /faculty` list endpoint. The data exposed is a bare count (not PII). Full department-level scope enforcement is deferred to a future bulk endpoint where it integrates naturally.
- **Trade-off:** N+1 request pattern per page. Acceptable because TanStack Query parallelizes and deduplicates, and a bulk endpoint can be added later if this becomes a bottleneck.

## 20. Confidence-Scored Supporting Evidence

Each recommendation includes a `supportingEvidence` object with computed confidence levels and structured data sources, rather than freeform text justification.

- **Confidence computation:** Based on comment count thresholds and sentiment agreement ratio. HIGH requires ≥ 10 comments and ≥ 70% sentiment agreement; MEDIUM requires ≥ 5 comments; below that is LOW.
- **Typed sources:** Evidence uses a discriminated union (`TopicSource | DimensionScoresSource`) stored as JSONB on `RecommendedAction`. This preserves the raw data the LLM used, enabling the frontend to render topic-specific sentiment breakdowns, dimension score charts, and sample quotes.
- **Trade-off:** More complex entity schema (headline/description/actionPlan instead of a single `actionText`). Justified because the frontend needs structured data to render recommendation cards with actionable detail.

## 24. RunPod Async Polling Fallback

RunPod's `/runsync` endpoint has a ~30-second timeout. If a worker (e.g., topic modeling) takes longer, RunPod returns `{"id":"...","status":"IN_QUEUE"}` instead of the result. `RunPodBatchProcessor.unwrapResponse()` now detects `IN_QUEUE` / `IN_PROGRESS` responses and polls `/status/{jobId}` every 5 seconds until the job completes or the processor's HTTP timeout is reached.

- **Rationale:** Topic modeling routinely exceeds 30 seconds for larger corpora. Without polling, these jobs would exhaust all retry attempts and fail the pipeline.
- **Trade-off:** Polling keeps the BullMQ worker occupied during the wait. Acceptable because topic model concurrency is 1 and the alternative (switching to RunPod's webhook callback model) would add infrastructure complexity.

## 25. Lenient Worker Response Validation

Worker response schemas (`batchAnalysisResultSchema`, `analysisResultSchema`) were tightened during initial development but relaxed based on production integration:

- `jobId` made optional — workers don't echo back the API-assigned job ID.
- `completedAt` accepts timezone offsets (`z.string().datetime({ offset: true })`) in addition to UTC `Z` suffix — real workers may use either format.
- OpenAI structured output schemas use `.nullable().optional()` instead of `.optional()` alone — OpenAI's API requires all fields to be present in the JSON and uses `null` for absent values.

- **Rationale:** Strict schemas caught legitimate responses as validation errors, causing pipeline failures in production. The relaxed schemas accept all valid ISO 8601 datetimes and don't require workers to implement API-internal concepts like `jobId`.
- **Trade-off:** Slightly looser contracts. Mitigated by type-specific schemas (sentiment, topic model) still enforcing strict validation on domain fields.

## 26. BullMQ-Based Moodle Sync Pipeline

The three independent Moodle sync cron jobs (`CategorySyncJob`, `CourseSyncJob`, `EnrollmentSyncJob`) were unified into a single BullMQ composite job (`MoodleSyncProcessor`) with a phase dependency chain.

- **Rationale:** Independent cron jobs couldn't enforce ordering dependencies (enrollments depend on courses, which depend on category hierarchy). BullMQ's `concurrency: 1` eliminates overlap guards (`isRunning` flags), fixed `jobId` handles deduplication across multiple instances, and the queue enables manual trigger via `POST /moodle/sync` without env var toggles and restarts.
- **Startup stays blocking:** `MoodleStartupService` calls sync services directly (not via BullMQ) because the app must have data before accepting HTTP traffic. The processor handles cron and manual triggers.
- **Phase abort:** If category sync fails, downstream phases are skipped rather than running against stale hierarchy data.
- **Trade-off:** Sync jobs now depend on Redis being available. The old `BaseJob` cron pattern worked with just the scheduler. Acceptable because Redis is already required for caching and analysis queues.

## 27. 3-Phase Enrollment Sync Architecture

Enrollment sync was restructured from per-course sequential processing into three distinct phases: concurrent HTTP fetch, batch user upsert, sequential enrollment upsert.

- **Rationale:** The original approach (parallel per-course enrollment sync with `pLimit`) caused deadlocks because the same User rows were upserted by multiple concurrent transactions. The 3-phase architecture separates HTTP I/O (parallel, no DB), User upsert (single batch, no concurrency), and Enrollment upsert (sequential per course, no overlap).
- **`upsertMany` with fallback:** User batch upsert uses `em.fork()` (not `runInTransaction`) so that if `upsertMany` fails at the DB level (e.g., `userName` unique constraint), the fallback uses a fresh `em.fork()` — avoiding the PostgreSQL aborted-transaction problem where all subsequent statements fail.
- **Trade-off:** Users and enrollments are in separate transactions (no course-level atomicity). A crash mid-Phase-3 leaves partially synced enrollments. Acceptable because sync is idempotent — the next run fixes any inconsistency.

## 28. Centralized Queue Name Constants

All BullMQ queue name strings (`'sentiment'`, `'embedding'`, `'moodle-sync'`, etc.) are centralized in `src/configurations/common/queue-names.ts` as a `QueueName` const object.

- **Rationale:** Queue names appeared as string literals in `@Processor()` decorators, `@InjectQueue()` injections, `BullModule.registerQueue()` calls, `queue.add()` invocations, and test `getQueueToken()` calls — a single typo would cause silent runtime failures (unmatched processor, dead queue). Constants provide compile-time safety and single-source-of-truth.
- **Trade-off:** Minor verbosity (`QueueName.SENTIMENT` vs `'sentiment'`). Acceptable for the safety guarantee.

## 29. Materialized Views for Analytics Dashboards

Faculty performance dashboards use PostgreSQL materialized views (`mv_faculty_semester_stats`, `mv_faculty_trends`) instead of live aggregation queries.

- **Rationale:** Dashboard queries aggregate across submissions, sentiment results, topic assignments, and multiple pipeline runs. Live queries would require complex multi-table joins with `LATERAL` subqueries and window functions on every page load. Materialized views pre-compute these once and serve reads in constant time.
- **Refresh strategy:** Views are refreshed asynchronously via a BullMQ job (`analytics-refresh`) triggered after each analysis pipeline completes. `REFRESH CONCURRENTLY` is used so reads are never blocked during refresh. A `system_config` row tracks `analytics_last_refreshed_at` for frontend staleness display.
- **Dependency ordering:** `mv_faculty_trends` depends on `mv_faculty_semester_stats` (it reads from the stats view for linear regression). The refresh processor always refreshes stats first, then trends.
- **Trade-off:** Data is eventually consistent — dashboards may show stale results until the refresh job completes after a pipeline run. Acceptable because analysis pipelines run infrequently and the refresh is fast (seconds).

## 31. Moodle Groups as Institutional Sections

Moodle course groups (e.g., BSCS-4A) are mapped to a local `Section` entity to represent institutional sections — year-level and section subdivisions of students within a course.

- **Design:** `Section` is a new entity with `moodleGroupId` (unique), `name`, `description`, and a `course` FK. `Enrollment` gains a nullable `section` FK. The unique constraint `(user, course)` on Enrollment is unchanged — section is optional metadata.
- **Sync integration:** The `core_enrol_get_enrolled_users` API already returns a `groups` array per user. The enrollment sync extracts groups, upserts Section entities, and assigns the first group to each enrollment. No additional API calls are needed for batch sync.
- **Hydration integration:** The login hydration service makes two additional parallel API calls per course (`core_group_get_course_groups`, `core_group_get_course_user_groups`) alongside the existing role fetch. Sections are upserted and assigned within the same transaction.
- **Naming:** The entity is called `Section` (domain language) rather than `MoodleGroup` (Moodle language), following the convention of `Course` (not `MoodleCourse`) and `Program` (not `MoodleCategory`).
- **Trade-off:** Students with multiple groups in one course get assigned to the first group only (`groups[0]`). This matches the institutional use case (one section per student per course). Multi-group scenarios are not supported in the initial implementation.

## 32. Institutional Role Source Field (Auto vs Manual)

The `UserInstitutionalRole` entity gains a `source` field (`auto` | `manual`) to distinguish between roles detected during login hydration and roles assigned by an administrator.

- **Problem:** The Moodle REST API cannot distinguish between a Dean (Manager at depth 3) and a Chairperson (manager-archetype role at depth 4) — both grant the same `moodle/category:manage` capability, and category-level role assignments are not exposed in course-context API responses.
- **Solution:** Auto-detection defaults to `CHAIRPERSON` at program level (depth 4) for any user with the capability. `DEAN` at department level (depth 3) is assigned manually via an admin endpoint (`POST /admin/institutional-roles`). Hydration only manages `source=auto` roles, leaving `source=manual` roles untouched across logins.
- **Cleanup:** When a manual DEAN exists at a department, any CHAIRPERSON roles at child programs are automatically removed during hydration to prevent redundant roles.
- **Trade-off:** Deans require a one-time manual promotion by an admin. This is accepted because Deans are fewer in number and the Moodle API provides no reliable way to auto-detect the distinction.

## 33. Dynamic Sync Scheduling with SyncLog Observability

The `MoodleSyncScheduler` was rewritten from a static `@Cron(CronExpression.EVERY_HOUR)` decorator to a dynamic `SchedulerRegistry`-based approach, paired with a `SyncLog` audit entity.

- **Dynamic scheduling:** The scheduler implements `OnModuleInit` and registers a `CronJob` via `SchedulerRegistry` at startup. The interval resolves from DB (`SystemConfig`) > env var (`MOODLE_SYNC_INTERVAL_MINUTES`) > per-environment default (dev: 60 min, staging: 360 min, production: 180 min). Super admins can update the interval at runtime via `PUT /moodle/sync/schedule`, which persists to `SystemConfig` and replaces the running cron job.
- **Minimum interval:** 30 minutes, enforced at the DTO validation layer (`@Min(30)`), the Zod env schema (`.min(30)`), and the DB resolution path (values below 30 are ignored).
- **SyncLog entity:** Does not extend `CustomBaseEntity` (no `deletedAt` — audit records are never soft-deleted). Stores per-phase `SyncPhaseResult` as JSONB (fetched, inserted, updated, deactivated, errors, durationMs). Insert vs update counts use a count-before/after strategy — one extra `COUNT` query per phase, no per-record overhead.
- **Soft-delete filter bypass:** Since `SyncLog` has no `deletedAt` column, MikroORM's global `softDelete` filter would fail at query time. Queries must use `filters: { softDelete: false }`. The `@Filter` decorator approach (`cond: {}, default: false`) was found to be insufficient at runtime.
- **Trade-off:** Admin schedule changes don't survive process restarts unless persisted to the database (which they are, via `SystemConfig`). The scheduler reads from DB on init, so restarts pick up the latest admin-configured interval.

## 34. Append-Only Audit Entity (No CustomBaseEntity)

The `AuditLog` entity does not extend `CustomBaseEntity`. It has no `updatedAt` or `deletedAt` — records are immutable and never soft-deleted. The `actorId` column is a plain string, not a `@ManyToOne` FK, so audit records survive user deletion.

- **Rationale:** Audit logs must be tamper-evident and permanent. Soft delete semantics would allow "hiding" audit records. FK constraints would cause cascade failures when users are deleted, creating a perverse incentive to retain user data solely for audit integrity.
- **Precedent:** Follows the `SyncLog` entity pattern. Queries must use `filters: { softDelete: false }` to bypass the global filter.
- **Trade-off:** No ORM-level relationship to `User` — joins require manual `actorId` matching. Acceptable because audit query endpoints (future) will use raw SQL or query builder, not entity relationships.

## 35. Global AuditModule with @Global() Decorator

`AuditModule` uses the `@Global()` class decorator — the only application module to do so. Infrastructure modules achieve global scope via config options (`isGlobal: true`), but `@Global()` is appropriate here because audit is a cross-cutting concern consumed by many modules.

- **Rationale:** Without `@Global()`, every module that uses `@Audited()` endpoints would need to explicitly import `AuditModule`. Since the interceptor is applied per-endpoint (not per-module), this friction discourages adoption with no compensating benefit.
- **Trade-off:** `AuditService` is injectable everywhere, which could lead to misuse. Mitigated by the fire-and-forget API — `Emit()` has no return value and catches all errors internally.

## 36. Dual Audit Emission Paths (Interceptor + Direct)

Audit events are captured through two paths: an interceptor for standard authenticated endpoints, and direct `AuditService.Emit()` calls for auth events.

- **Rationale:** The interceptor path requires CLS context (`CurrentUserService`, `RequestMetadataService`), which is unavailable during login (no JWT yet) and inconsistently available during token refresh. Rather than forcing all audit events through one path, two paths allow each context to use the most natural capture mechanism.
- **Convergence:** Both paths feed the same `AuditService.Emit()` → AUDIT queue → `AuditProcessor` → `audit_log` table pipeline. The entity schema is identical regardless of emission path.
- **Trade-off:** Two integration patterns to understand. Mitigated by clear separation — interceptor path is decorator-driven (declarative), direct path is explicit method calls in `AuthService` only.

## 37. Sanitized Audit Metadata (No Raw Error Messages)

Login failure audit events store a fixed reason code (`no_matching_strategy`, `strategy_execution_failed`) instead of the raw `error.message`.

- **Rationale:** Raw error messages may contain connection strings, hostnames, SQL fragments, or stack traces — especially from Moodle connectivity errors or database driver failures. Persisting these in an immutable, append-only table creates a permanent information disclosure risk.
- **Trade-off:** Less diagnostic detail in audit logs. Full error details are still available in application logs (which are rotatable and not permanent).

## 30. Semester Code Parsing for Display Labels

The Moodle category sync now parses semester codes (e.g., `S22526`) into human-readable `label` ("Semester 2") and `academicYear` ("2025-2026") fields on the `Semester` entity.

- **Rationale:** Moodle's category naming convention encodes the semester number and academic year range in a compact code. Parsing at sync time avoids duplicating the regex in every consumer (frontend, analytics views, reports).
- **Trade-off:** The parser is tightly coupled to the `S{semester}{startYear}{endYear}` convention. If the naming scheme changes, the regex must be updated. Semesters that don't match the pattern get `null` for both fields — no data loss, just no enrichment.
