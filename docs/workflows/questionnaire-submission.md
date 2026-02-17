# Questionnaire Submission & Scoring

The questionnaire system handles recursive section weighting and institutional snapshotting during submission.

```mermaid
sequenceDiagram
    participant User
    participant QuestionnaireController
    participant QuestionnaireService
    participant QuestionnaireSchemaValidator
    participant ScoringService
    participant Database

    User->>QuestionnaireController: POST /questionnaires/submit (responses)
    QuestionnaireController->>QuestionnaireService: Submit(respondentId, dto)
    QuestionnaireService->>Database: Fetch Active Version & Context (Course, Semester)
    QuestionnaireService->>ScoringService: CalculateScores(schema, answers)
    ScoringService-->>QuestionnaireService: TotalScore, NormalizedScore, Breakdown
    QuestionnaireService->>QuestionnaireService: Create Institutional Snapshot
    QuestionnaireService->>Database: Persist Submission, Answers, and Snapshot
    Database-->>QuestionnaireService: Success
    QuestionnaireService-->>QuestionnaireController: SubmissionResult
    QuestionnaireController-->>User: 201 Created
```

## Batch Ingestion Flow

In addition to direct API submissions, the system supports bulk ingestion via the Universal Ingestion Adapter. This is primarily used for importing historical data or synchronizing with external files (CSV/Excel).

```mermaid
sequenceDiagram
    participant Admin
    participant IngestionController
    participant IngestionEngine
    participant SourceAdapter
    participant QuestionnaireService
    participant Database

    Admin->>IngestionController: POST /ingest (File/Config)
    IngestionController->>IngestionEngine: Execute(SourceType, Payload)
    IngestionEngine->>SourceAdapter: Extract(Payload)
    loop For each Record in Stream
        SourceAdapter-->>IngestionEngine: IngestionRecord (Raw Data)
        IngestionEngine->>IngestionEngine: Map to Dimensions
        IngestionEngine->>QuestionnaireService: Submit(Mapped Data)
        QuestionnaireService->>Database: Persist
    end
    IngestionEngine-->>IngestionController: IngestionSummary (Success/Failures)
    IngestionController-->>Admin: 200 OK (Summary)
```

For more details on the adapter design, see the [Universal Ingestion Architecture](../architecture/universal-ingestion.md).

### Adapter Notes

- CSV/Excel adapters stream records and emit `IngestionRecord.error` for malformed rows without stopping the stream.
- Header normalization trims, lowercases, and removes non-alphanumerics (keeping `_` and `-`) to align with DTO keys.
- `sourceIdentifier` is 1-based for data rows (header row excluded).
