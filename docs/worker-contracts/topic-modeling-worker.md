# Topic Modeling Worker Contract

**Source of Truth:** `src/modules/analysis/dto/topic-model-worker.dto.ts`

## Endpoint

`POST {TOPIC_MODEL_WORKER_URL}`

## Request

```json
{
  "items": [
    {
      "submissionId": "uuid-string",
      "text": "The pace was too fast, couldn't follow along.",
      "embedding": [0.123, -0.456, 0.789, "... (768 floats)"]
    }
  ],
  "params": {
    "min_topic_size": 5,
    "nr_topics": null,
    "umap_n_neighbors": 15,
    "umap_n_components": 5
  },
  "metadata": {
    "pipelineId": "uuid-string",
    "runId": "uuid-string"
  }
}
```

### Fields

| Field                      | Type           | Required | Description                                |
| -------------------------- | -------------- | -------- | ------------------------------------------ |
| `items`                    | array          | Yes      | Filtered submissions (post sentiment gate) |
| `items[].submissionId`     | string         | Yes      | Unique submission identifier               |
| `items[].text`             | string (min 1) | Yes      | Qualitative comment text                   |
| `items[].embedding`        | number[768]    | Yes      | LaBSE 768-dim embedding vector             |
| `params`                   | object         | No       | BERTopic hyperparameters                   |
| `params.min_topic_size`    | int            | No       | Minimum cluster size                       |
| `params.nr_topics`         | int            | No       | Target topic count (auto if omitted)       |
| `params.umap_n_neighbors`  | int            | No       | UMAP neighbor count                        |
| `params.umap_n_components` | int            | No       | UMAP output dimensions                     |
| `metadata.pipelineId`      | string         | Yes      | Parent pipeline ID                         |
| `metadata.runId`           | string         | Yes      | Current topic model run ID                 |

## Response

```json
{
  "version": "1.0",
  "status": "completed",
  "topics": [
    {
      "topicIndex": 0,
      "rawLabel": "0_fast_rushed_pace",
      "keywords": [
        "fast",
        "rushed",
        "pace",
        "speed",
        "hurry",
        "quick",
        "follow",
        "slow",
        "behind",
        "catch"
      ],
      "docCount": 45
    }
  ],
  "assignments": [
    {
      "submissionId": "uuid-string",
      "topicIndex": 0,
      "probability": 0.72
    },
    {
      "submissionId": "uuid-string",
      "topicIndex": 1,
      "probability": 0.15
    }
  ],
  "metrics": {
    "npmi_coherence": 0.42,
    "topic_diversity": 0.85,
    "outlier_ratio": 0.08,
    "silhouette_score": 0.31,
    "embedding_coherence": 0.67
  },
  "outlierCount": 12,
  "completedAt": "2026-03-13T10:35:00.000Z"
}
```

### Fields

| Field                        | Type         | Required   | Description                           |
| ---------------------------- | ------------ | ---------- | ------------------------------------- |
| `version`                    | string       | Yes        | Worker/model version identifier       |
| `status`                     | enum         | Yes        | `completed` or `failed`               |
| `topics`                     | array        | On success | Discovered topic clusters             |
| `topics[].topicIndex`        | int          | Yes        | BERTopic topic_id (0, 1, 2...)        |
| `topics[].rawLabel`          | string       | Yes        | BERTopic auto-generated label         |
| `topics[].keywords`          | string[]     | Yes        | Top keywords from c-TF-IDF            |
| `topics[].docCount`          | int          | Yes        | Number of documents in cluster        |
| `assignments`                | array        | On success | Soft topic assignments per submission |
| `assignments[].submissionId` | string       | Yes        | Matches input submissionId            |
| `assignments[].topicIndex`   | int          | Yes        | Assigned topic index                  |
| `assignments[].probability`  | number (0-1) | Yes        | Assignment probability                |
| `metrics`                    | object       | On success | Model quality metrics                 |
| `outlierCount`               | int          | On success | Count of outlier documents (topic -1) |
| `error`                      | string       | On failure | Error message                         |
| `completedAt`                | ISO datetime | Yes        | Processing completion timestamp       |

## Notes

- Based on `CtrlAltElite-Devs/topic-modeling.faculytics` (BERTopic + LaBSE + UMAP + HDBSCAN)
- Embeddings must be LaBSE 768-dim (same model used for similarity)
- Assignments with probability <= 0.01 are filtered out on persistence
- `isDominant` is computed server-side (highest probability per submission)
- Topic index -1 represents outliers (not persisted as topics)

## Versioning

The `version` field tracks the BERTopic pipeline version. Stored on `TopicModelRun.workerVersion`.
