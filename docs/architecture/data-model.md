# Data Model (ERD)

The database schema reflects the institutional hierarchy derived from Moodle's category structure, the questionnaire management system, and supporting modules (ChatKit, system config).

## Core Domain

```mermaid
erDiagram
    USER ||--o{ MOODLE_TOKEN : "owns"
    USER ||--o{ REFRESH_TOKEN : "has"
    USER ||--o{ ENROLLMENT : "enrolled"
    USER ||--o{ USER_INSTITUTIONAL_ROLE : "holds authority"
    USER ||--o{ QUESTIONNAIRE_SUBMISSION : "submits (respondent)"
    USER ||--o{ QUESTIONNAIRE_SUBMISSION : "evaluated (faculty)"
    USER ||--o{ QUESTIONNAIRE_DRAFT : "drafts (respondent)"
    USER ||--o{ CHATKIT_THREAD : "owns"
    USER }o--o| CAMPUS : "belongs to"
    USER }o--o| DEPARTMENT : "belongs to"
    USER }o--o| PROGRAM : "belongs to"

    MOODLE_CATEGORY ||--o{ USER_INSTITUTIONAL_ROLE : "context for"
    CAMPUS }|--|| MOODLE_CATEGORY : "mapped to"
    SEMESTER }|--|| MOODLE_CATEGORY : "mapped to"
    DEPARTMENT }|--|| MOODLE_CATEGORY : "mapped to"
    PROGRAM }|--|| MOODLE_CATEGORY : "mapped to"

    CAMPUS ||--o{ SEMESTER : "contains"
    SEMESTER ||--o{ DEPARTMENT : "contains"
    DEPARTMENT ||--o{ PROGRAM : "contains"
    PROGRAM ||--o{ COURSE : "contains"

    COURSE ||--o{ SECTION : "has sections"
    COURSE ||--o{ ENROLLMENT : "has"
    COURSE ||--o{ QUESTIONNAIRE_SUBMISSION : "linked to"
    SECTION ||--o{ ENROLLMENT : "groups students"

    QUESTIONNAIRE ||--o{ QUESTIONNAIRE_VERSION : "has"
    QUESTIONNAIRE_VERSION ||--o{ QUESTIONNAIRE_SUBMISSION : "used for"
    QUESTIONNAIRE_VERSION ||--o{ QUESTIONNAIRE_DRAFT : "draft for"
    QUESTIONNAIRE_SUBMISSION ||--o{ QUESTIONNAIRE_ANSWER : "contains"
    QUESTIONNAIRE_SUBMISSION }|--|| SEMESTER : "in semester"
    QUESTIONNAIRE_SUBMISSION }|--|| DEPARTMENT : "in department"
    QUESTIONNAIRE_SUBMISSION }|--|| PROGRAM : "in program"
    QUESTIONNAIRE_SUBMISSION }|--|| CAMPUS : "in campus"
    DIMENSION ||--o{ QUESTIONNAIRE_ANSWER : "categorizes"

    CHATKIT_THREAD ||--o{ CHATKIT_THREAD_ITEM : "contains"

    ANALYSIS_PIPELINE ||--o{ SENTIMENT_RUN : "has"
    ANALYSIS_PIPELINE ||--o{ TOPIC_MODEL_RUN : "has"
    ANALYSIS_PIPELINE ||--o{ RECOMMENDATION_RUN : "has"
    ANALYSIS_PIPELINE }|--|| SEMESTER : "scoped to"
    ANALYSIS_PIPELINE }o--o| USER : "faculty (optional)"
    ANALYSIS_PIPELINE }o--o| QUESTIONNAIRE_VERSION : "version (optional)"
    ANALYSIS_PIPELINE }o--o| DEPARTMENT : "dept (optional)"
    ANALYSIS_PIPELINE }o--o| PROGRAM : "program (optional)"
    ANALYSIS_PIPELINE }o--o| CAMPUS : "campus (optional)"
    ANALYSIS_PIPELINE }o--o| COURSE : "course (optional)"
    ANALYSIS_PIPELINE }|--|| USER : "triggered by"

    SENTIMENT_RUN ||--o{ SENTIMENT_RESULT : "contains"
    SENTIMENT_RESULT }|--|| QUESTIONNAIRE_SUBMISSION : "analyzes"

    TOPIC_MODEL_RUN ||--o{ TOPIC : "discovers"
    TOPIC ||--o{ TOPIC_ASSIGNMENT : "has"
    TOPIC_ASSIGNMENT }|--|| QUESTIONNAIRE_SUBMISSION : "assigns"

    RECOMMENDATION_RUN ||--o{ RECOMMENDED_ACTION : "generates"

    QUESTIONNAIRE_SUBMISSION ||--o| SUBMISSION_EMBEDDING : "embedded as"

    USER {
        uuid id
        string userName UK
        int moodleUserId UK
        string password "nullable, hidden"
        string firstName
        string lastName
        string fullName "nullable"
        string userProfilePicture
        date lastLoginAt
        boolean isActive
        string[] roles
    }

    MOODLE_TOKEN {
        uuid id
        string token
        int moodleUserId UK
        date lastValidatedAt "nullable"
        date invalidatedAt "nullable"
        boolean isValid
    }

    REFRESH_TOKEN {
        uuid id
        string tokenHash
        string userId
        date expiresAt
        date revokedAt "nullable"
        string replacedByTokenId "nullable"
        boolean isActive
        string browserName
        string os
        string ipAddress
    }

    USER_INSTITUTIONAL_ROLE {
        uuid id
        uuid userId
        uuid moodleCategoryId
        string role
    }

    MOODLE_CATEGORY {
        uuid id
        int moodleCategoryId UK
        string name
        string description "nullable"
        int parentMoodleCategoryId
        int depth
        string path
        int sortOrder
        boolean isVisible
        date timeModified
    }

    CAMPUS {
        uuid id
        int moodleCategoryId UK
        string code
        string name "nullable"
    }

    SEMESTER {
        uuid id
        int moodleCategoryId UK
        string code
        string label "nullable"
        string academicYear "nullable"
        string description "nullable"
    }

    DEPARTMENT {
        uuid id
        int moodleCategoryId UK
        string code
        string name "nullable"
    }

    PROGRAM {
        uuid id
        int moodleCategoryId UK
        string code
        string name "nullable"
    }

    COURSE {
        uuid id
        int moodleCourseId UK
        string shortname
        string fullname
        date startDate
        date endDate
        boolean isVisible
        date timeModified
        boolean isActive
    }

    SECTION {
        uuid id
        int moodleGroupId UK
        string name
        string description "nullable"
        uuid courseId
    }

    ENROLLMENT {
        uuid id
        uuid userId
        uuid courseId
        uuid sectionId "nullable"
        string role
        boolean isActive
        date timeModified
    }

    QUESTIONNAIRE {
        uuid id
        string title
        enum type
        enum status
    }

    QUESTIONNAIRE_VERSION {
        uuid id
        int versionNumber
        jsonb schemaSnapshot
        enum status
        date publishedAt "nullable"
        boolean isActive
    }

    QUESTIONNAIRE_SUBMISSION {
        uuid id
        uuid respondentId
        uuid facultyId
        uuid versionId
        uuid semesterId
        uuid courseId "nullable"
        uuid departmentId
        uuid programId
        uuid campusId
        enum respondentRole
        decimal totalScore "10,2"
        decimal normalizedScore "10,2"
        text qualitativeComment "nullable"
        text cleanedComment "nullable"
        date submittedAt
        string facultyNameSnapshot
        string departmentCodeSnapshot
        string programCodeSnapshot
        string campusCodeSnapshot
        string semesterCodeSnapshot
        string academicYearSnapshot
    }

    QUESTIONNAIRE_ANSWER {
        uuid id
        uuid submissionId
        string questionId
        string sectionId
        string dimensionCode
        decimal numericValue "10,2"
    }

    QUESTIONNAIRE_DRAFT {
        uuid id
        uuid respondentId
        uuid versionId
        uuid facultyId
        uuid semesterId
        uuid courseId "nullable"
        jsonb answers
        text qualitativeComment "nullable"
    }

    DIMENSION {
        uuid id
        string code
        string displayName
        enum questionnaireType
        boolean active
    }

    SYSTEM_CONFIG {
        uuid id
        string key UK
        text value
        string description "nullable"
    }

    ANALYSIS_PIPELINE {
        uuid id
        uuid semesterId
        uuid facultyId "nullable"
        uuid questionnaireVersionId "nullable"
        uuid departmentId "nullable"
        uuid programId "nullable"
        uuid campusId "nullable"
        uuid courseId "nullable"
        uuid triggeredById
        int totalEnrolled
        int submissionCount
        int commentCount
        decimal responseRate "10,4"
        text[] warnings
        int sentimentGateIncluded "nullable"
        int sentimentGateExcluded "nullable"
        enum status "PipelineStatus"
        text errorMessage "nullable"
        date confirmedAt "nullable"
        date completedAt "nullable"
    }

    SENTIMENT_RUN {
        uuid id
        uuid pipelineId
        int submissionCount
        string workerVersion "nullable"
        string jobId "nullable"
        enum status "RunStatus"
        date completedAt "nullable"
    }

    SENTIMENT_RESULT {
        uuid id
        uuid runId
        uuid submissionId
        decimal positiveScore "10,4"
        decimal neutralScore "10,4"
        decimal negativeScore "10,4"
        string label
        jsonb rawResult
        boolean passedTopicGate
        date processedAt
    }

    TOPIC_MODEL_RUN {
        uuid id
        uuid pipelineId
        int submissionCount
        int topicCount
        int outlierCount
        jsonb modelParams "nullable"
        jsonb metrics "nullable"
        string workerVersion "nullable"
        string jobId "nullable"
        enum status "RunStatus"
        date completedAt "nullable"
    }

    TOPIC {
        uuid id
        uuid runId
        int topicIndex
        string rawLabel
        string label "nullable"
        text[] keywords
        int docCount
    }

    TOPIC_ASSIGNMENT {
        uuid id
        uuid topicId
        uuid submissionId
        decimal probability "10,4"
        boolean isDominant
    }

    RECOMMENDATION_RUN {
        uuid id
        uuid pipelineId
        int submissionCount
        int sentimentCoverage
        int topicCoverage
        string workerVersion "nullable"
        string jobId "nullable"
        enum status "RunStatus"
        date completedAt "nullable"
    }

    RECOMMENDED_ACTION {
        uuid id
        uuid runId
        string category
        text actionText
        enum priority "ActionPriority"
        jsonb supportingEvidence
    }

    SUBMISSION_EMBEDDING {
        uuid id
        uuid submissionId
        vector embedding "768-dim"
        string modelName
    }

    CHATKIT_THREAD {
        string id PK
        uuid userId
        string title "nullable"
        jsonb status
        jsonb metadata
        date createdAt
        date updatedAt
    }

    CHATKIT_THREAD_ITEM {
        string id PK
        uuid threadId
        string type
        jsonb payload
        date createdAt
    }
```

### Constraints & Idempotency

- **Dimension Registry:** Composite unique on `(code, questionnaireType)`. Allows the same code (e.g., 'PLANNING') across different questionnaire types.
- **Enrollment:** Composite unique on `(user, course)`. Prevents duplicate enrollments. Optional `section` FK links to the student's institutional section (e.g., BSCS-4A).
- **Section:** Unique on `moodleGroupId`. Maps Moodle course groups to institutional sections. A course can have multiple sections; each enrollment optionally belongs to one.
- **User Institutional Role:** Composite unique on `(user, moodleCategory, role)`.
- **Questionnaire Version:** Composite unique on `(questionnaire, versionNumber)`.
- **Questionnaire Submission:** Composite unique on `(respondent, faculty, questionnaireVersion, semester, course)`. Indexed on `(faculty, semester)`, `(department, semester)`, `(program, semester)`, `(campus, semester)`.
- **Questionnaire Draft:** Partial unique indexes handling nullable `course_id` and soft deletes.

### Analytics Pipeline Indexes

- **Analysis Pipeline:** Composite index on `(semester, status)` for scoped pipeline lookups.
- **Sentiment Run / Topic Model Run / Recommendation Run:** Indexed on `pipeline` for per-pipeline run queries.
- **Sentiment Result:** Indexed on `run` and `submission` for gate processing and per-submission lookups.
- **Topic / Topic Assignment:** Indexed on `run` / `topic` / `submission` for topic model result traversal.
- **Submission Embedding:** Indexed on `submission` for upsert lookups. Uses `pgvector` `VectorType` (768-dim).

### Institutional Snapshots

`QUESTIONNAIRE_SUBMISSION` stores denormalized snapshots of institutional data at submission time (faculty name, department code, program code, campus code, semester, academic year). This decouples historical submissions from future hierarchy changes — if a department is renamed, existing submission reports retain the original values.

### Notes

- All entities except `CHATKIT_THREAD` and `CHATKIT_THREAD_ITEM` extend `CustomBaseEntity` (UUID pk, `createdAt`, `updatedAt`, `deletedAt` with soft-delete filter).
- `REFRESH_TOKEN` stores `userId` as a string rather than a foreign key relation.
- `SYSTEM_CONFIG` is a standalone key-value store with no relationships.
