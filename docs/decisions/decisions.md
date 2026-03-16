# Architectural Decisions

This document tracks key architectural decisions and patterns used in the `api.faculytics` project.

## 1. External ID Stability

Moodle's `moodleCategoryId` and `moodleCourseId` are used as business keys for idempotent upserts to ensure primary key stability in the local database. This prevents local UUIDs from changing during synchronization.

## 2. Unit of Work Pattern

Leveraging MikroORM's `EntityManager` to ensure transactional integrity during complex synchronization processes. This ensures that either a full sync operation succeeds or none of it is committed.

## 3. Base Job Pattern

All background jobs extend `BaseJob` to provide consistent logging, startup execution logic, and error handling. This standardization simplifies monitoring and debugging of scheduled tasks.

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
