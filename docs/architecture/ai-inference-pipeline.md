# AI & Inference Pipeline — Implementation Spec (Fragment)

> **Status:** Draft — captures early architectural decisions for the Phase 3 inference pipeline. Will be refined as implementation begins.

## 1. Architecture: NestJS Orchestrator + HTTP Workers

```
┌─────────────┐         ┌─────────────┐         ┌──────────────────┐
│  NestJS API │────────▶│   BullMQ    │────────▶│  Job Processors  │
│  (producer  │         │  (Redis)    │         │  (HTTP dispatch) │
│   & consumer│         │             │         │  - Sentiment     │
│             │         │  sentiment  │         │  - Topic Model   │
│  writes to  │◀────────│  topic-model│         │  - Embeddings    │
│  database   │ results │  embeddings │         └────────┬─────────┘
└─────────────┘         └─────────────┘                  │ HTTP POST
                                                         ▼
                                              ┌──────────────────┐
                                              │  External Workers │
                                              │  (HTTP endpoints) │
                                              │  - RunPod (GPU)   │
                                              │  - OpenAI / Gemini│
                                              │  - Mock Worker    │
                                              └──────────────────┘
```

**Key principle:** Workers are **pure compute** HTTP endpoints — they receive JSON input via POST, return JSON results. NestJS owns all database access, business logic, queuing, and retry logic. Workers never touch the database.

## 2. Why BullMQ

| Concern               | Decision                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| No new infrastructure | Reuses existing Redis — no separate broker (RabbitMQ) needed                 |
| All workers are HTTP  | RunPod serverless, LLM APIs — all HTTP endpoints, no AMQP consumers          |
| Queue-per-type        | Independent concurrency, retry policies, and rate limiting per analysis type |
| Built-in resilience   | Retry with exponential backoff, stall detection, failed job tracking         |
| NestJS integration    | First-class `@nestjs/bullmq` module with decorators and dependency injection |

## 3. Message Contract

```typescript
// Outbound: NestJS enqueues → BullMQ queue
AnalysisJobMessage {
  jobId: string;       // UUID
  version: string;     // Contract version (e.g., "1.0")
  type: string;        // "sentiment" | "topic_model" | "embedding"
  text: string;        // Input text for analysis
  metadata: {
    submissionId: string;
    facultyId: string;
    versionId: string;
  };
  publishedAt: string; // ISO 8601 timestamp
}

// Inbound: Worker HTTP response → validated by processor
AnalysisResultMessage {
  jobId: string;       // UUID matching the request
  version: string;     // Contract version
  status: "completed" | "failed";
  result?: Record<string, unknown>; // Type-specific payload
  error?: string;      // Error message if status is "failed"
  completedAt: string; // ISO 8601 timestamp
}
```

Both envelopes are validated with Zod schemas — outbound at enqueue time, inbound at process time.

## 4. Redis Strategy

Single Redis instance for development/staging. In production, split into two:

| Instance    | Purpose                               | Eviction Policy | Persistence |
| ----------- | ------------------------------------- | --------------- | ----------- |
| Cache Redis | API response caching (`CacheService`) | `allkeys-lru`   | None        |
| Queue Redis | BullMQ job queues (analysis jobs)     | `noeviction`    | AOF/RDB     |

Redis now serves both caching and job queues. BullMQ data must not be evicted — use `noeviction` policy for production queue Redis.

## 5. Incremental Rollout

1. **BullMQ infrastructure** — `@nestjs/bullmq` setup, env config, queue registration, `docker-compose.yml` with Redis
2. **Sentiment analysis first** — `SentimentProcessor` with mock worker, validates full enqueue → process → HTTP dispatch → result loop
3. **Topic modeling second** — New processor extending `BaseAnalysisProcessor`, reuses same infrastructure
4. **Embeddings last** — Requires vector storage decision (pgvector vs dedicated vector DB)
5. **RunPod integration** — Replace mock worker URLs with deployed RunPod endpoint URLs

## 6. Open Questions

- **Vector storage:** pgvector extension on existing Postgres vs dedicated vector DB (Qdrant, Pinecone)
- **RunPod auth:** Authentication mechanism for RunPod serverless endpoints
- **Rate limiting tuning:** Optimal `limiter` settings per queue to avoid overwhelming external workers
- **Result delivery:** Polling vs WebSocket push to frontend for analysis completion
- **Failed job monitoring:** Bull Board or custom dashboard for inspecting failed jobs
