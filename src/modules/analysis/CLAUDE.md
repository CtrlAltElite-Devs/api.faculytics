# Analysis Module

AI analysis pipeline orchestration: sentiment, topic modeling, embeddings, and recommendations. All heavy work runs async via BullMQ and dispatches to external HTTP workers.

## File map

- `analysis.service.ts` — public entry points: `EnqueueJob()` and `EnqueueBatch()`. Other modules use these — do NOT reach directly into processors.
- `analysis.module.ts` — wires queues, processors, services.
- `constants.ts` — queue names, default timeouts.
- `controllers/` — `admin-sentiment-config.controller.ts` handles `GET/PUT /admin/sentiment/vllm-config` (SUPER_ADMIN only).
- `dto/` — request/response contracts, Zod-validated worker payloads.
- `enums/` — `PipelineStatus`, `RunStatus`, `Trigger` (`MANUAL` | `SCHEDULER`).
- `lib/` — helpers (chunking, scheduling math).
- `processors/` — one BullMQ processor per analysis type; all extend `BaseAnalysisProcessor` (`base.processor.ts`) or `BaseBatchProcessor` (`base-batch.processor.ts`). `runpod-batch.processor.ts` is the RunPod dispatch variant.
- `services/pipeline-orchestrator.service.ts` — **the** source of truth for pipeline advancement (>2k lines). Every state transition goes through this.
- `services/sentiment-config.service.ts` — reads/writes the `SENTIMENT_VLLM_CONFIG` system-config row.
- `services/recommendation-generation.service.ts`, `topic-label.service.ts`, `analysis-access.service.ts` — supporting services.

## Key patterns

- **Queue-per-type**: sentiment, topic-model, embedding, recommendations each have their own BullMQ queue and processor. Names come from `constants.ts`.
- **BaseAnalysisProcessor** handles: HTTP dispatch, Zod validation of worker responses, retry/backoff (via BullMQ env vars), observability events.
- **Sentiment chunking**: `PipelineOrchestratorService.dispatchSentiment()` splits a run into chunks of `SENTIMENT_CHUNK_SIZE` (default 50) and enqueues one job per chunk. `SentimentRun.expectedChunks` / `completedChunks` counters are updated atomically with row inserts; the orchestrator advances the pipeline when `completedChunks === expectedChunks`.
- **vLLM snapshot dispatch**: when `SENTIMENT_VLLM_CONFIG` is enabled, the orchestrator snapshots the config once at dispatch time and attaches `vllmConfig` to every chunk envelope — so a mid-run config edit cannot split a run across two configs.
- **Trigger tagging**: pipelines enqueued by the scheduler get `trigger=SCHEDULER` and are attributed to the seeded SUPER_ADMIN; user-triggered runs get `trigger=MANUAL`.

## Gotchas

- **Production vLLM gate**: enabling `SENTIMENT_VLLM_CONFIG` with `NODE_ENV=production` requires `ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true` — the admin endpoint will refuse otherwise.
- Don't bypass `PipelineOrchestratorService` for state changes. Writing statuses directly from a processor will desync chunk counters.
- Worker responses must pass Zod validation; malformed responses are retried by BullMQ, not silently accepted.
- Mock worker at `mock-worker/` (Hono server) stands in for RunPod/vLLM in local dev (`docker compose up`).

## Pointers

- `docs/architecture/ai-inference-pipeline.md` — end-to-end pipeline narrative.
- `docs/workflows/analysis-pipeline.md` — sequence flows.
- `docs/workflows/analysis-job-processing.md` — processor-level flows.
- `docs/worker-contracts/{sentiment,topic-modeling,recommendations}-worker.md` — authoritative worker HTTP contracts.
