# Analysis Job Processing

The analysis system dispatches text analysis jobs to external HTTP workers (RunPod GPU endpoints, LLM APIs) via BullMQ queues, validates responses, and persists results.

## Job Enqueue Flow

```mermaid
sequenceDiagram
    participant Caller
    participant AnalysisService
    participant Zod
    participant BullMQ
    participant Redis

    Caller->>AnalysisService: EnqueueJob(type, text, metadata)
    AnalysisService->>AnalysisService: Build AnalysisJobMessage envelope
    AnalysisService->>Zod: analysisJobSchema.parse(envelope)
    Zod-->>AnalysisService: Validated envelope

    alt Valid type (e.g. "sentiment")
        AnalysisService->>BullMQ: queue.add(envelope, deterministicId)
        BullMQ->>Redis: Store job (key: submissionId:type)
        Redis-->>BullMQ: OK
        BullMQ-->>AnalysisService: Job added
        AnalysisService-->>Caller: jobId (UUID)
    else Unknown type
        AnalysisService-->>Caller: BadRequestException
    else Redis unavailable
        AnalysisService-->>Caller: ServiceUnavailableException
    end
```

## Job Processing Flow

```mermaid
sequenceDiagram
    participant Redis
    participant BullMQ
    participant Processor as SentimentProcessor
    participant Base as BaseAnalysisProcessor
    participant Worker as External Worker (HTTP)
    participant Zod

    BullMQ->>Processor: Pick up job from queue
    Processor->>Base: process(job)

    alt Worker URL not configured
        Base-->>BullMQ: Error("Worker URL not configured...")
        Note over BullMQ: Job moves to failed
    else Worker URL configured
        Base->>Worker: HTTP POST (AnalysisJobMessage)

        alt Success (HTTP 200)
            Worker-->>Base: AnalysisResultMessage (JSON)
            Base->>Zod: analysisResultSchema.safeParse(response)

            alt Valid response
                Zod-->>Base: Parsed result
                Base->>Processor: Persist(job, result)
                Processor-->>BullMQ: Job completed
            else Malformed response
                Base-->>BullMQ: Error (validation failed, no retry)
                Note over BullMQ: Job moves to failed
            end

        else HTTP 5xx / Network error
            Worker-->>Base: Error
            Base-->>BullMQ: Throw error
            Note over BullMQ: Retry with exponential backoff

        else HTTP Timeout (AbortController)
            Base-->>BullMQ: Throw timeout error
            Note over BullMQ: Retry with exponential backoff
        end
    end
```

## Batch Enqueue Flow

```mermaid
flowchart TD
    A[EnqueueBatch - array of jobs] --> B{Empty array?}
    B -- Yes --> C[Return empty array]
    B -- No --> D[Validate all types exist]
    D --> E[Build & validate envelopes with Zod]
    E --> F[Group jobs by queue type]
    F --> G[queue.addBulk per type]
    G --> H[Return array of jobIds]

    D -- Unknown type --> I[BadRequestException]
    G -- Redis error --> J[ServiceUnavailableException]
```

## Queue Architecture

```mermaid
flowchart LR
    subgraph NestJS API
        AS[AnalysisService]
        SP[SentimentProcessor]
        TP[TopicModelProcessor - future]
        EP[EmbeddingsProcessor - future]
    end

    subgraph Redis
        SQ[sentiment queue]
        TQ[topic-model queue - future]
        EQ[embeddings queue - future]
    end

    subgraph External Workers
        SW[Sentiment Worker - RunPod/Mock]
        TW[Topic Model Worker - future]
        EW[Embeddings Worker - future]
    end

    AS -->|enqueue| SQ
    AS -.->|enqueue| TQ
    AS -.->|enqueue| EQ

    SQ -->|process| SP
    TQ -.->|process| TP
    EQ -.->|process| EP

    SP -->|HTTP POST| SW
    TP -.->|HTTP POST| TW
    EP -.->|HTTP POST| EW
```

## Deduplication

Jobs use a deterministic ID format: `${submissionId}:${type}`. If the same submission + analysis type combination is enqueued twice, BullMQ silently rejects the duplicate. This prevents redundant processing when upstream systems retry.

## Resilience

| Mechanism          | Configuration                               | Behavior                                                                |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| Retry              | `BULLMQ_DEFAULT_ATTEMPTS` (default: 3)      | Exponential backoff starting at `BULLMQ_DEFAULT_BACKOFF_MS`             |
| HTTP Timeout       | `BULLMQ_HTTP_TIMEOUT_MS` (default: 90s)     | `AbortController` cancels request; job retries                          |
| Stall Detection    | `BULLMQ_STALLED_INTERVAL_MS` (default: 30s) | Re-queues stalled jobs up to `BULLMQ_MAX_STALLED_COUNT` times           |
| Validation Failure | —                                           | Malformed worker responses fail immediately (no retry)                  |
| Redis Down         | —                                           | `ServiceUnavailableException` returned to caller; API continues serving |

## Adding a New Analysis Type

1. Create `NewTypeProcessor extends BaseAnalysisProcessor` in `src/modules/analysis/processors/`
2. Add `NEW_TYPE_WORKER_URL` to `src/configurations/env/bullmq.env.ts`
3. Register queue in `AnalysisModule`: `BullModule.registerQueue({ name: 'new-type' })`
4. Add `@InjectQueue('new-type')` to `AnalysisService` and update the `queues` map
5. Add mock endpoint in `mock-worker/server.ts`
