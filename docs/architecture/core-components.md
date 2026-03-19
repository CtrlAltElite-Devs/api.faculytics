# Core Components

This document describes the high-level components, technology stack, and module architecture of the `api.faculytics` project.

## 1. System Overview

`api.faculytics` serves as an intermediary layer between Moodle and local institutional data. Its primary responsibilities include:

- **Authentication:** Authenticating users via Moodle tokens and issuing local JWTs.
- **Data Synchronization:** Mirroring Moodle's institutional hierarchy (Campuses, Semesters, Departments, Programs) and course enrollments.
- **Entity Management:** Maintaining a normalized local database for analytics and extended features.
- **Questionnaire Management:** Managing weighted questionnaires for student and faculty feedback. See [Questionnaire Management](./questionnaire-management.md) for detailed architecture.

## 2. Technology Stack

- **Backend Framework:** [NestJS](https://nestjs.com/) (v10+)
- **Database ORM:** [MikroORM](https://mikro-orm.io/) with PostgreSQL
- **Authentication:** Passport.js (JWT and Refresh Token strategies)
- **External API:** Moodle Web Services (REST)
- **Task Scheduling:** NestJS Schedule (Cron)
- **Caching:** `@nestjs/cache-manager` with Redis (`@keyv/redis`)
- **Job Queue:** BullMQ (`@nestjs/bullmq`) on Redis
- **Health Checks:** `@nestjs/terminus` with custom indicators
- **Validation:** Zod (Environment variables), class-validator (DTOs)

## 3. Module Architecture

The application is structured into **Infrastructure** and **Application** layers, coordinated by the `AppModule`.

```mermaid
classDiagram
    class AppModule {
        +onApplicationBootstrap()
    }
    class InfrastructureModules {
        <<Namespace>>
        ConfigModule
        MikroOrmModule
        JwtModule
        PassportModule
        ScheduleModule
        CacheModule
        BullModule
    }
    class ApplicationModules {
        <<Namespace>>
        AuthModule
        MoodleModule
        EnrollmentsModule
        HealthModule
        ChatKitModule
        QuestionnaireModule
        AnalysisModule
        DimensionsModule
        FacultyModule
        CurriculumModule
    }

    AppModule --> InfrastructureModules : "imports"
    AppModule --> ApplicationModules : "imports"

    AuthModule --> MoodleModule : "uses MoodleService"
    AuthModule --> CommonModule : "uses CustomJwtService"
    MoodleModule --> CommonModule : "uses UnitOfWork"
    EnrollmentsModule --> MoodleModule : "uses MoodleService"
    QuestionnaireModule --> CommonModule : "uses UnitOfWork"
    AnalysisModule --> BullModule : "uses BullMQ queues"
    FacultyModule --> CommonModule : "uses ScopeResolverService"
    CurriculumModule --> CommonModule : "uses ScopeResolverService"

    class AnalysisModule {
        +AnalysisService
        +AnalysisController
        +PipelineOrchestratorService
        +TopicLabelService
        +RecommendationGenerationService
        +SentimentProcessor
        +TopicModelProcessor
        +RecommendationsProcessor
        +EmbeddingProcessor
        +BaseBatchProcessor
    }

    class MoodleModule {
        +MoodleService
        +MoodleSyncService
        +MoodleCategorySyncService
        +MoodleCourseSyncService
        +EnrollmentSyncService
    }

    class AuthModule {
        +AuthService
        +JwtStrategy
        +JwtRefreshStrategy
        +LocalLoginStrategy
        +MoodleLoginStrategy
    }

    class QuestionnaireModule {
        +QuestionnaireService
        +ScoringService
        +QuestionnaireSchemaValidator
        +IngestionEngine
        +IngestionMapperService
    }
```

## 4. Login Strategy Pattern

Authentication uses a priority-based strategy pattern (`src/modules/auth/strategies/`). Each strategy implements the `LoginStrategy` interface:

- **`CanHandle(localUser, body)`**: Determines if this strategy applies to the login request.
- **`Execute(em, localUser, body)`**: Performs authentication and returns the user + optional Moodle token.
- **`priority`**: Numeric ordering (lower = higher precedence).

| Strategy              | Priority | When it handles                                 |
| --------------------- | -------- | ----------------------------------------------- |
| `LocalLoginStrategy`  | 10       | User exists and has a local password            |
| `MoodleLoginStrategy` | 100      | User has no local password or doesn't exist yet |

Priority ranges: `0-99` core auth, `100-199` external providers, `200+` fallbacks. To add a new provider, implement `LoginStrategy` and register it under the `LOGIN_STRATEGIES` injection token.

## 5. Cron Jobs

Background jobs extend `BaseJob` and register in `StartupJobRegistry`. All jobs are in `src/crons/jobs/`.

| Job                      | Schedule       | Purpose                                                               |
| ------------------------ | -------------- | --------------------------------------------------------------------- |
| `CategorySyncJob`        | Startup + cron | Syncs Moodle categories to local hierarchy                            |
| `CourseSyncJob`          | Startup + cron | Syncs Moodle courses                                                  |
| `EnrollmentSyncJob`      | Startup + cron | Syncs user-course enrollments and roles; invalidates enrollment cache |
| `RefreshTokenCleanupJob` | Every 12 hours | Purges refresh tokens older than 7 days                               |

## 6. Moodle Connectivity & Error Handling

The `MoodleClient` enforces a 10-second timeout (`MOODLE_REQUEST_TIMEOUT_MS`) on all Moodle API calls via `AbortSignal.timeout()`. Network failures are wrapped in `MoodleConnectivityError`:

- **Timeout**: `"Moodle request timed out during {operation}"`
- **Connection failure**: `"Failed to connect to Moodle service during {operation}"`
- **General network error**: `"Network error during Moodle {operation}"`

The `MoodleLoginStrategy` catches `MoodleConnectivityError` and translates it to a `401 Unauthorized` with a user-friendly message.

## 7. Analysis Pipeline

The `AnalysisModule` provides a multi-stage analysis pipeline that orchestrates AI processing of qualitative feedback. See [AI Inference Pipeline](./ai-inference-pipeline.md) for the full architecture and [Analysis Pipeline Workflow](../workflows/analysis-pipeline.md) for the stage-by-stage flow.

### Pipeline Orchestrator

The `PipelineOrchestratorService` manages the full analysis lifecycle through a confirm-before-execute pattern:

1. **Create** — Computes coverage stats (response rate, submission/comment counts) and generates warnings
2. **Confirm** — Validates configuration and dispatches the first stage
3. **Stage progression** — Each processor calls back into the orchestrator to advance to the next stage
4. **Terminal states** — `COMPLETED`, `FAILED`, or `CANCELLED`

### Components

| Component                         | Purpose                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `PipelineOrchestratorService`     | Creates pipelines, manages stage transitions, dispatches batch jobs                 |
| `AnalysisService`                 | Low-level entry point — `EnqueueJob()` and `EnqueueBatch()` for ad-hoc jobs         |
| `AnalysisController`              | REST API for pipeline CRUD (`POST/GET /analysis/pipelines`)                         |
| `BaseBatchProcessor`              | Abstract base — HTTP dispatch, Zod validation, retry, stall detection               |
| `RunPodBatchProcessor`            | RunPod-specific subclass — auth headers, `{ input/output }` envelope handling       |
| `SentimentProcessor`              | Batch sentiment analysis, triggers sentiment gate on completion                     |
| `TopicModelProcessor`             | Batch topic modeling via RunPod, chunked assignment persistence                     |
| `TopicLabelService`               | LLM-based labeling of BERTopic topics (gpt-4o-mini, inline before recommendations)  |
| `RecommendationGenerationService` | Builds LLM prompts from DB data, calls OpenAI, computes confidence and evidence     |
| `RecommendationsProcessor`        | BullMQ processor — delegates to `RecommendationGenerationService`, persists results |
| `EmbeddingProcessor`              | Per-submission embedding generation (upsert, extends `BaseAnalysisProcessor`)       |

### Pipeline Stages

```
AWAITING_CONFIRMATION → SENTIMENT_ANALYSIS → SENTIMENT_GATE → TOPIC_MODELING → TOPIC_LABELING → GENERATING_RECOMMENDATIONS → COMPLETED
```

Each stage has a corresponding `RunStatus` (`PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`).

### Queue Architecture

Four BullMQ queues with independent concurrency:

| Queue             | Processor                  | Concurrency Default |
| ----------------- | -------------------------- | ------------------- |
| `sentiment`       | `SentimentProcessor`       | 3                   |
| `embedding`       | `EmbeddingProcessor`       | 3                   |
| `topic-model`     | `TopicModelProcessor`      | 1                   |
| `recommendations` | `RecommendationsProcessor` | 1                   |

### REST Endpoints

| Method | Path                                      | Description                                           |
| ------ | ----------------------------------------- | ----------------------------------------------------- |
| POST   | `/analysis/pipelines`                     | Create a pipeline (returns coverage stats + warnings) |
| POST   | `/analysis/pipelines/:id/confirm`         | Confirm and start execution                           |
| POST   | `/analysis/pipelines/:id/cancel`          | Cancel a non-terminal pipeline                        |
| GET    | `/analysis/pipelines/:id/status`          | Get pipeline status with stage details                |
| GET    | `/analysis/pipelines/:id/recommendations` | Get recommendations for a completed pipeline          |

**Resilience:** Exponential backoff retries, stall detection, graceful degradation when Redis is unavailable (`ServiceUnavailableException`), HTTP timeout via `AbortController`.

**Local development:** `docker compose up` starts Redis and a mock worker (Hono HTTP server on port 3001) that simulates worker responses.

## 8. Health Checks

The `HealthModule` uses `@nestjs/terminus` to provide structured health checks at `GET /health`:

| Indicator  | Checks                                  |
| ---------- | --------------------------------------- |
| `database` | `SELECT 1` via MikroORM `EntityManager` |
| `redis`    | Read/write test via cache manager       |

Returns HTTP 200 with `status: 'ok'` when healthy, HTTP 503 with `status: 'error'` and per-indicator details when unhealthy.

## 9. Scoped Query Pattern (Faculty & Curriculum)

The `FacultyModule` and `CurriculumModule` use a shared role-based scoping pattern for administrative queries. This ensures deans only see data within their assigned departments while super admins see everything.

### Scope Resolution Chain

```
Request → JwtAuthGuard → RolesGuard → CurrentUserInterceptor → CLS Store → ScopeResolverService
```

1. `@UseJwtGuard(SUPER_ADMIN, DEAN)` validates JWT and checks role membership via `RolesGuard`
2. `CurrentUserInterceptor` loads the full `User` entity via `UserLoader` and stores it in CLS (`CurrentUserService.set()`)
3. `ScopeResolverService.ResolveDepartmentIds(semesterId)` reads the user from CLS and returns:
   - `null` — unrestricted (super admin)
   - `string[]` — department UUIDs the dean is assigned to for that semester

### Filter Validation Cascade

When explicit filter params (`departmentId`, `programId`) are provided, they are validated against the resolved scope:

| Scenario                              | Result            |
| ------------------------------------- | ----------------- |
| `departmentId` outside scope          | `403 Forbidden`   |
| `programId` not found                 | `404 Not Found`   |
| `programId` department outside scope  | `403 Forbidden`   |
| `departmentId` + `programId` mismatch | `400 Bad Request` |

### Modules

| Module             | Endpoints                                              | Purpose                                            |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| `FacultyModule`    | `GET /faculty`                                         | Paginated faculty list with course assignments     |
| `FacultyModule`    | `GET /faculty/:facultyId/submission-count`             | Submission count for a faculty member per semester |
| `CurriculumModule` | `GET /curriculum/departments`, `/programs`, `/courses` | Institutional hierarchy for filter dropdowns       |

Both modules import `CommonModule` (for `ScopeResolverService`) and `DataLoaderModule` (for `CurrentUserInterceptor` → `UserLoader`).

The `CurriculumModule` endpoints return flat arrays (no pagination) since result sets are small within a dean's scope. All three endpoints require `semesterId`; the courses endpoint additionally requires at least one of `programId` or `departmentId` to prevent unbounded queries.

## 10. Startup & Initialization Flow

The application enforces a strict initialization sequence in `InitializeDatabase` before it begins accepting traffic. This ensures that the database schema and required infrastructure state are always synchronized with the code.

1.  **Migration (`orm.migrator.up()`):** Automatically applies any pending database migrations.
2.  **Infrastructure Seeding (`orm.seeder.seed(DatabaseSeeder)`):** Executes idempotent seeders (e.g., `DimensionSeeder`) to populate required reference data.
3.  **Application Bootstrap:** Only after both steps succeed does `app.listen()` execute. If any step fails, the process exits with code 1.
