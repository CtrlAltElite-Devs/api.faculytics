# AI & Inference Pipeline — Implementation Spec (Fragment)

> **Status:** Draft — captures early architectural decisions for the Phase 3 inference pipeline. Will be refined as implementation begins.

## 1. Architecture: NestJS Orchestrator + Python Compute Workers

```
┌─────────────┐         ┌─────────────┐         ┌──────────────────┐
│  NestJS API │────────▶│  RabbitMQ   │────────▶│  Python Workers  │
│  (producer) │         │             │         │  (consumers)     │
│             │◀────────│             │◀────────│  - Sentiment     │
│  writes to  │ results │             │ results │  - Topic Model   │
│  database   │  queue  └─────────────┘  queue  │  - Embeddings    │
└─────────────┘                                 └──────────────────┘
```

**Key principle:** Python workers are **pure compute** — they receive text input via message, return analysis results via message. NestJS owns all database access and business logic. Python never touches the database.

## 2. Why RabbitMQ

| Concern                | Decision                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| Cross-language support | First-class Python support (`pika`, `celery`) vs BullMQ's second-class Python SDK |
| Long-running ML jobs   | Built-in acknowledgement, redelivery, and dead-letter queues                      |
| Job routing by type    | Topic exchanges with routing keys (`analysis.sentiment`, `analysis.topic`)        |
| Worker scaling         | Add Python replicas independently without touching the API                        |

## 3. Message Contract (Draft)

```jsonc
// NestJS publishes → analysis exchange
{
  "jobId": "uuid",
  "type": "sentiment | topic_model | embedding",
  "text": "The professor was very helpful and clear...",
  "metadata": { "submissionId": "sub-1", "facultyId": "f-1", "versionId": "v-1" }
}

// Python returns → results queue
{
  "jobId": "uuid",
  "result": {
    "sentiment": "positive",
    "confidence": 0.92,
    "topics": ["teaching_quality", "clarity"]
  }
}

// NestJS consumes results → persists to database
```

## 4. Redis Strategy

Single Redis instance for development/staging. In production, split into two:

| Instance    | Purpose                                  | Eviction Policy | Persistence |
| ----------- | ---------------------------------------- | --------------- | ----------- |
| Cache Redis | API response caching (`CacheService`)    | `allkeys-lru`   | None        |
| Queue Redis | BullMQ for internal NestJS jobs (if any) | `noeviction`    | AOF/RDB     |

RabbitMQ handles cross-service messaging separately — it is not Redis-based.

## 5. Incremental Rollout

1. **Add RabbitMQ infrastructure** — Docker compose service, NestJS `@nestjs/microservices` RMQ transport
2. **Scaffold Python worker repo** — Minimal `pika` consumer, shared message schema (JSON Schema or Protobuf)
3. **Sentiment analysis first** — Smallest scope, validates the full publish → consume → results loop
4. **Topic modeling second** — Reuses the same infrastructure, adds model complexity
5. **Embeddings last** — Requires vector storage decision (pgvector vs dedicated vector DB)

## 6. Open Questions

- **Message schema format:** JSON Schema vs Protobuf for contract enforcement across languages
- **Vector storage:** pgvector extension on existing Postgres vs dedicated vector DB (Qdrant, Pinecone)
- **Worker deployment:** Containerized Python workers (Docker) vs serverless functions
- **Result delivery:** Polling vs results queue vs WebSocket push to frontend
