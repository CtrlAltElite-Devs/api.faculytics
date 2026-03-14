# Recommendations Worker Contract

**Source of Truth:** `src/modules/analysis/dto/recommendations-worker.dto.ts`

## Endpoint

`POST {RECOMMENDATIONS_WORKER_URL}`

## Request

```json
{
  "scope": {
    "semester": "2nd Semester 2025-2026",
    "department": "CCS",
    "program": "BSCS",
    "campus": "Main",
    "faculty": "Dr. Smith",
    "course": "CS101"
  },
  "data": {
    "submissionCount": 847,
    "commentCount": 612,
    "responseRate": 0.71,
    "scoreDistribution": {
      "1": 12,
      "2": 34,
      "3": 156,
      "4": 345,
      "5": 300
    },
    "sentimentSummary": {
      "positive": 380,
      "neutral": 150,
      "negative": 82
    },
    "topTopics": [
      {
        "label": "Teaching Pace",
        "keywords": ["fast", "rushed", "pace"],
        "docCount": 45,
        "avgSentiment": -0.3
      }
    ],
    "sampleComments": [
      {
        "text": "Too fast, couldn't keep up with the lessons.",
        "sentiment": "negative",
        "topics": ["Teaching Pace"]
      }
    ]
  },
  "metadata": {
    "pipelineId": "uuid-string",
    "runId": "uuid-string"
  }
}
```

### Fields

| Field                    | Type                   | Required | Description                       |
| ------------------------ | ---------------------- | -------- | --------------------------------- |
| `scope`                  | object                 | Yes      | Analysis scope context            |
| `scope.semester`         | string                 | Yes      | Semester label                    |
| `scope.department`       | string                 | No       | Department code                   |
| `scope.program`          | string                 | No       | Program code                      |
| `scope.campus`           | string                 | No       | Campus code                       |
| `scope.faculty`          | string                 | No       | Faculty name                      |
| `scope.course`           | string                 | No       | Course code                       |
| `data.submissionCount`   | int                    | Yes      | Total submissions in scope        |
| `data.commentCount`      | int                    | Yes      | Submissions with comments         |
| `data.responseRate`      | number                 | Yes      | Response rate (0-1)               |
| `data.scoreDistribution` | Record<string, number> | No       | Score frequency distribution      |
| `data.sentimentSummary`  | object                 | No       | Sentiment label counts            |
| `data.topTopics`         | array                  | No       | Top topics with sentiment context |
| `data.sampleComments`    | array                  | No       | Representative comments           |
| `metadata.pipelineId`    | string                 | Yes      | Parent pipeline ID                |
| `metadata.runId`         | string                 | Yes      | Current recommendation run ID     |

## Response

```json
{
  "version": "1.0",
  "status": "completed",
  "actions": [
    {
      "category": "teaching_pace",
      "actionText": "Consider incorporating regular comprehension checks and adjusting lecture speed based on student feedback signals.",
      "priority": "high",
      "supportingEvidence": {
        "topicDocCount": 45,
        "sentimentBreakdown": { "negative": 38, "neutral": 5, "positive": 2 },
        "sampleComment": "Too fast, couldn't keep up."
      }
    }
  ],
  "completedAt": "2026-03-13T10:40:00.000Z"
}
```

### Fields

| Field                          | Type         | Required   | Description                             |
| ------------------------------ | ------------ | ---------- | --------------------------------------- |
| `version`                      | string       | Yes        | Worker/model version identifier         |
| `status`                       | enum         | Yes        | `completed` or `failed`                 |
| `actions`                      | array        | On success | Prioritized recommended actions         |
| `actions[].category`           | string       | Yes        | Action category (e.g., `teaching_pace`) |
| `actions[].actionText`         | string       | Yes        | Human-readable recommendation           |
| `actions[].priority`           | enum         | Yes        | `high`, `medium`, or `low`              |
| `actions[].supportingEvidence` | object       | Yes        | Data points supporting recommendation   |
| `error`                        | string       | On failure | Error message                           |
| `completedAt`                  | ISO datetime | Yes        | Processing completion timestamp         |

## Notes

- Worker architecture is TBD (LLM-based, rule-based, or hybrid)
- Input is aggregated data, not raw submissions
- Supporting evidence structure is flexible (JSONB storage)

## Versioning

The `version` field tracks the recommendation engine version. Stored on `RecommendationRun.workerVersion`.
