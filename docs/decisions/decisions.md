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
