# Sentiment Analysis Worker Contract

**Source of Truth:** `src/modules/analysis/dto/sentiment-worker.dto.ts`

## Endpoint

`POST {SENTIMENT_WORKER_URL}`

## Request

```json
{
  "items": [
    {
      "submissionId": "uuid-string",
      "text": "The professor was very helpful and engaging."
    },
    {
      "submissionId": "uuid-string-2",
      "text": "Too fast. Couldn't keep up."
    }
  ],
  "metadata": {
    "pipelineId": "uuid-string",
    "runId": "uuid-string",
    "chunkIndex": 0,
    "chunkCount": 17
  },
  "vllmConfig": {
    "url": "https://vllm.internal.example/v1",
    "model": "llama-3.1-8b-instruct",
    "enabled": true
  }
}
```

### Fields

| Field                  | Type           | Required        | Description                                                                             |
| ---------------------- | -------------- | --------------- | --------------------------------------------------------------------------------------- |
| `items`                | array          | Yes             | Array of submissions to analyze                                                         |
| `items[].submissionId` | string         | Yes             | Unique submission identifier                                                            |
| `items[].text`         | string (min 1) | Yes             | Qualitative comment text                                                                |
| `metadata.pipelineId`  | string         | Yes             | Parent pipeline ID                                                                      |
| `metadata.runId`       | string         | Yes             | Current sentiment run ID                                                                |
| `metadata.chunkIndex`  | int (≥ 0)      | No              | 0-based index of this chunk within the run (omitted on legacy single-batch dispatch)    |
| `metadata.chunkCount`  | int (≥ 1)      | No              | Total chunks for this run                                                               |
| `vllmConfig`           | object         | No              | When present + `enabled=true`, the worker should route through the vLLM URL/model below |
| `vllmConfig.url`       | string (https) | If `vllmConfig` | Must start with `https://` (SSRF mitigation)                                            |
| `vllmConfig.model`     | string         | If `vllmConfig` | Model identifier passed to vLLM                                                         |
| `vllmConfig.enabled`   | boolean        | If `vllmConfig` | When `false`, worker may treat the request as if `vllmConfig` was omitted               |

### Chunked Dispatch

The API splits each pipeline run into N chunks of `SENTIMENT_CHUNK_SIZE` (default 50) and sends one request per chunk. Workers should treat each chunk independently and return results only for the `items` in that request — counter-based completion tracking on the API side reassembles the run. See [AI Inference Pipeline — Chunked Sentiment Dispatch](../architecture/ai-inference-pipeline.md#13-chunked-sentiment-dispatch).

## Response

```json
{
  "version": "1.0",
  "status": "completed",
  "results": [
    {
      "submissionId": "uuid-string",
      "positive": 0.85,
      "neutral": 0.1,
      "negative": 0.05
    },
    {
      "submissionId": "uuid-string-2",
      "positive": 0.05,
      "neutral": 0.15,
      "negative": 0.8
    }
  ],
  "completedAt": "2026-03-13T10:30:00.000Z"
}
```

### Fields

| Field                    | Type             | Required   | Description                                                                                   |
| ------------------------ | ---------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `version`                | string           | Yes        | Worker/model version identifier                                                               |
| `status`                 | enum             | Yes        | `completed` or `failed`                                                                       |
| `results`                | array            | On success | Per-submission sentiment scores                                                               |
| `results[].submissionId` | string           | Yes        | Matches input submissionId                                                                    |
| `results[].positive`     | number (0-1)     | Yes        | Positive sentiment score                                                                      |
| `results[].neutral`      | number (0-1)     | Yes        | Neutral sentiment score                                                                       |
| `results[].negative`     | number (0-1)     | Yes        | Negative sentiment score                                                                      |
| `results[].servedBy`     | `vllm \| openai` | No         | Which path actually served this item; persisted on `SentimentResult.rawResult` for provenance |
| `error`                  | string           | On failure | Error message when status is `failed`                                                         |
| `completedAt`            | ISO datetime     | Yes        | Processing completion timestamp                                                               |

## Error Response

```json
{
  "version": "1.0",
  "status": "failed",
  "error": "Model inference failed: CUDA out of memory",
  "completedAt": "2026-03-13T10:30:00.000Z"
}
```

## RunPod Envelope

When deployed on RunPod, the request and response are wrapped by `RunPodBatchProcessor`:

- **Request:** Sent as `{ "input": <request body above> }` to the RunPod `/runsync` endpoint.
- **Response:** RunPod returns `{ "output": <response body above> }` on completion. If the job exceeds the `/runsync` timeout (~30s), RunPod returns `{"id":"...","status":"IN_QUEUE"}` and the processor polls `/status/{id}` until done.
- **Auth:** `Authorization: Bearer <RUNPOD_API_KEY>` header is added when `RUNPOD_API_KEY` is configured.

## `completedAt` Format

Accepts any valid ISO 8601 datetime with timezone: both `2026-03-13T10:30:00.000Z` and `2026-03-13T10:30:00.000+00:00` are valid.

## Deployment

- **Platform:** RunPod (serverless GPU)
- **Model:** Multilingual sentiment classifier (positive/neutral/negative)
- **Batch size:** Entire run in one request

## Versioning

The `version` field in responses tracks the model/worker version. This is stored on the `SentimentRun.workerVersion` field for provenance tracking.
