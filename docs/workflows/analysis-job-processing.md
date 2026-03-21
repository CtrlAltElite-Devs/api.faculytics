# Analysis Job Processing

The analysis system processes qualitative feedback through a multi-stage pipeline, dispatching batch jobs to external HTTP workers via BullMQ queues.

## Pipeline-Driven Flow

```mermaid
sequenceDiagram
    participant Client
    participant Controller as AnalysisController
    participant Orch as PipelineOrchestrator
    participant DB
    participant BullMQ
    participant Worker as External Workers

    Client->>Controller: POST /analysis/pipelines
    Controller->>Orch: CreatePipeline(scope, userId)
    Orch->>DB: Count submissions, comments, enrollments
    Orch->>DB: Create AnalysisPipeline (AWAITING_CONFIRMATION)
    Orch-->>Client: Pipeline with coverage stats + warnings

    Client->>Controller: POST /analysis/pipelines/:id/confirm
    Controller->>Orch: ConfirmPipeline(id)
    Orch->>DB: Create SentimentRun
    Orch->>BullMQ: Add batch job to sentiment queue
    Orch-->>Client: Pipeline (SENTIMENT_ANALYSIS)

    BullMQ->>Worker: HTTP POST batch to sentiment worker
    Worker-->>BullMQ: Sentiment results
    Note over BullMQ: SentimentProcessor.Persist()
    BullMQ->>Orch: OnSentimentComplete(pipelineId)

    Orch->>Orch: Apply sentiment gate
    Orch->>DB: Update passedTopicGate flags (bulk nativeUpdate)
    Orch->>DB: Create TopicModelRun
    Orch->>BullMQ: Add batch job to topic-model queue

    BullMQ->>Worker: HTTP POST batch to topic model worker
    Worker-->>BullMQ: Topics + assignments
    Note over BullMQ: TopicModelProcessor.Persist()
    BullMQ->>Orch: OnTopicModelComplete(pipelineId)

    Orch->>DB: Create RecommendationRun
    Orch->>BullMQ: Add job to recommendations queue

    BullMQ->>Worker: HTTP POST aggregated data to recommendations worker
    Worker-->>BullMQ: Recommended actions
    Note over BullMQ: RecommendationsProcessor.Persist()
    BullMQ->>Orch: OnRecommendationsComplete(pipelineId)
    Orch->>DB: Pipeline status → COMPLETED
```

## Ad-Hoc Job Flow

Individual jobs (e.g., embedding backfill) still use the original single-item `AnalysisService.EnqueueJob()` path:

```mermaid
sequenceDiagram
    participant Caller
    participant AnalysisService
    participant Zod
    participant BullMQ
    participant Redis

    Caller->>AnalysisService: EnqueueJob(type, text, metadata)
    AnalysisService->>Zod: analysisJobSchema.parse(envelope)
    AnalysisService->>BullMQ: queue.add(envelope, deterministicId)
    BullMQ->>Redis: Store job (key: submissionId:type)
    AnalysisService-->>Caller: jobId (UUID)
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

## Sentiment Gate

```mermaid
flowchart TD
    A[Sentiment results] --> B{For each result}
    B --> C{Label is negative or neutral?}
    C -- Yes --> D[passedTopicGate = true]
    C -- No --> E{Comment word count >= 10?}
    E -- Yes --> D
    E -- No --> F[passedTopicGate = false]
    D --> G[Bulk nativeUpdate passing IDs]
    F --> G
    G --> H{Post-gate corpus >= 30?}
    H -- No --> I[Add warning to pipeline]
    H -- Yes --> J[Dispatch topic modeling]
    I --> J
```

## Deduplication

Pipeline jobs use deterministic IDs: `${pipelineId}--${type}`. Ad-hoc jobs use: `${submissionId}--${type}`. If the same pipeline/submission + analysis type is enqueued twice, BullMQ silently rejects the duplicate.

> **Note:** BullMQ does not allow `:` in custom job IDs. The `--` separator is used instead.

## Resilience

| Mechanism          | Configuration                               | Behavior                                                                            |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Retry              | `BULLMQ_DEFAULT_ATTEMPTS` (default: 3)      | Exponential backoff starting at `BULLMQ_DEFAULT_BACKOFF_MS`                         |
| HTTP Timeout       | `BULLMQ_HTTP_TIMEOUT_MS` (default: 90s)     | `AbortController` cancels request; job retries. Topic model uses 300s via override  |
| Stall Detection    | `BULLMQ_STALLED_INTERVAL_MS` (default: 30s) | Re-queues stalled jobs up to `BULLMQ_MAX_STALLED_COUNT` times                       |
| Validation Failure | —                                           | Malformed worker responses fail the stage (no retry)                                |
| Redis Down         | —                                           | `ServiceUnavailableException` returned to caller; API continues serving             |
| Stage Failure      | —                                           | Pipeline moves to `FAILED` with error message; can be inspected via status endpoint |

## Adding a New Analysis Type

1. Create `NewTypeProcessor extends BaseBatchProcessor` (or `RunPodBatchProcessor` for RunPod workers) in `src/modules/analysis/processors/`
2. Add `NEW_TYPE_WORKER_URL` and `NEW_TYPE_CONCURRENCY` to `src/configurations/env/bullmq.env.ts`
3. Register queue in `AnalysisModule`: add to `BullModule.registerQueue()`
4. Add `@InjectQueue('new-type')` to `PipelineOrchestratorService`
5. Add dispatch and completion methods in `PipelineOrchestratorService`
6. Update `PipelineStatus` enum with new stage
7. Add worker contract doc in `docs/worker-contracts/`
8. Add mock endpoint in `mock-worker/server.ts`
