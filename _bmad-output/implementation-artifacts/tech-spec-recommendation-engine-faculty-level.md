---
title: 'Recommendation Engine — Faculty-Level AI Recommendations'
slug: 'recommendation-engine-faculty-level'
created: '2026-03-17'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'NestJS v11'
  - 'MikroORM v6 (PostgreSQL)'
  - 'BullMQ / Redis'
  - 'Zod v4'
  - 'OpenAI SDK (openai npm package)'
  - 'Jest v30'
files_to_modify:
  - 'src/modules/analysis/processors/recommendations.processor.ts (modify — extend WorkerHost directly, replace HTTP dispatch with direct LLM call)'
  - 'src/modules/analysis/services/recommendation-generation.service.ts (create — LLM prompt + evidence assembly)'
  - 'src/entities/recommended-action.entity.ts (modify — rename actionText to headline, add description + actionPlan, change category to enum)'
  - 'src/modules/analysis/enums/action-category.enum.ts (create)'
  - 'src/modules/analysis/enums/index.ts (modify — export ActionCategory)'
  - 'src/modules/analysis/dto/recommendations.dto.ts (create — replace recommendations-worker.dto.ts with evidence schemas, LLM schemas, job message type)'
  - 'src/modules/analysis/services/pipeline-orchestrator.service.ts (modify — simplify dispatchRecommendations, add GetRecommendations)'
  - 'src/modules/analysis/analysis.module.ts (modify — register RecommendationGenerationService)'
  - 'src/modules/analysis/analysis.controller.ts (modify — add GET recommendations endpoint)'
  - 'src/modules/analysis/dto/responses/recommendations.response.dto.ts (create)'
  - 'src/configurations/env/bullmq.env.ts (modify — add RECOMMENDATIONS_MODEL optional)'
  - 'DB migration (create — alter recommended_action table: rename action_text to headline, add description + action_plan, convert category to enum)'
  - 'src/modules/analysis/services/recommendation-generation.service.spec.ts (create)'
  - 'src/modules/analysis/processors/recommendations.processor.spec.ts (modify)'
  - 'src/modules/analysis/services/pipeline-orchestrator.service.spec.ts (modify)'
  - 'src/modules/analysis/analysis.controller.spec.ts (modify — add GET recommendations route test)'
code_patterns:
  - 'OpenAI structured output via zodResponseFormat (see TopicLabelService for prompt/parse pattern only)'
  - 'BullMQ processor extending WorkerHost directly (recommendations processor does NOT use BaseBatchProcessor)'
  - 'Entity enums via @Enum(() => EnumType)'
  - 'Zod schemas for request/response validation'
  - 'PascalCase public methods on services'
  - 'UnitOfWork for transactions'
  - 'forwardRef for circular dependencies between processor and orchestrator'
  - 'MikroORM createQueryBuilder for DB-level aggregation (not getKnex)'
test_patterns:
  - 'Co-located .spec.ts files alongside source'
  - 'Test.createTestingModule with mocked providers'
  - 'jest.fn() for dependencies, mockResolvedValue for async'
  - 'EntityManager.fork() chain mocking pattern'
---

# Tech-Spec: Recommendation Engine — Faculty-Level AI Recommendations

**Created:** 2026-03-17

## Overview

### Problem Statement

The analysis pipeline produces sentiment scores, topics, and embeddings, but doesn't synthesize these into actionable faculty-level recommendations. Stakeholders (faculty and deans) lack a clear summary of strengths to maintain and areas to improve, grounded in student feedback data.

### Solution

Add an LLM-based recommendation generation step as the final pipeline stage. The LLM synthesizes aggregated pipeline data (topics, sentiment, dimension scores) into structured recommendations with headlines, descriptions, and action plans. Evidence is system-assembled from pipeline results for transparency and grounding. Direct LLM call from the processor (no separate worker deployment).

### Scope

**In Scope:**

- Faculty-level recommendations (per faculty, per semester)
- Two categories: Strengths (STRENGTH) and Improvements (IMPROVEMENT)
- LLM prompt with structured output schema (headline, description, actionPlan, priority)
- System-assembled supporting evidence from pipeline data (topics, sentiment, dimension scores, sample quotes)
- Confidence thresholds to filter out low-signal noise
- Entity updates (rename `actionText` → `headline`, add `description` + `actionPlan` fields, formalize `category` as enum)
- API endpoint to retrieve recommendations for a pipeline

**Out of Scope:**

- Department/program aggregate recommendations
- Comparative benchmarks/percentiles (faculty vs. department average)
- Semester-over-semester trend analysis
- Dean-specific "attention needed" flags
- Frontend implementation
- Role-based access control on the recommendations endpoint (see Known Limitations — tracked separately)

## Context for Development

### Codebase Patterns

- **OpenAI structured output**: `TopicLabelService` (`src/modules/analysis/services/topic-label.service.ts`) demonstrates the OpenAI `chat.completions.parse()` + `zodResponseFormat()` pattern. Use this as reference for prompt construction and structured parsing **only** — error handling differs (see Technical Decisions).
- **Processor pattern**: `RecommendationsProcessor` currently extends `BaseBatchProcessor` which does HTTP POST to external worker. Since we're replacing HTTP dispatch with direct LLM calls, the processor must **extend `WorkerHost` directly** instead of `BaseBatchProcessor`. This eliminates the `GetWorkerUrl()` and `Persist()` abstract contract that doesn't apply to LLM-based processing.
- **Pipeline orchestration**: `PipelineOrchestratorService.dispatchRecommendations()` currently aggregates sentiment counts and top topics. This aggregation moves into the generation service — the orchestrator simplifies to just creating the run and enqueuing the BullMQ job.
- **Evidence data sources**: `SentimentResult` (per-submission sentiment), `Topic` + `TopicAssignment` (theme clusters with comment counts), `QuestionnaireAnswer.dimensionCode` + `numericValue` (quantitative score breakdowns), `QuestionnaireSubmission.cleanedComment` (sample quotes).
- **DB aggregation**: The codebase uses MikroORM's `createQueryBuilder` for raw-ish queries, NOT `em.getKnex()`. Follow this pattern for dimension score aggregation.

### Files to Reference

| File                                                             | Purpose                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/modules/analysis/processors/recommendations.processor.ts`   | Current processor — rewrite to extend `WorkerHost`, inject generation service                        |
| `src/modules/analysis/processors/base-batch.processor.ts`        | Reference only — processor will NOT extend this anymore                                              |
| `src/modules/analysis/services/topic-label.service.ts`           | Reference for OpenAI structured output pattern (prompt/parse only, not error handling)               |
| `src/modules/analysis/services/pipeline-orchestrator.service.ts` | Pipeline flow — `dispatchRecommendations()` to simplify, add `GetRecommendations()`                  |
| `src/entities/recommended-action.entity.ts`                      | Entity to modify (rename actionText→headline, add description + actionPlan, change category to enum) |
| `src/entities/recommendation-run.entity.ts`                      | Run entity — no changes needed                                                                       |
| `src/modules/analysis/dto/recommendations-worker.dto.ts`         | Current DTOs — replace with new schemas in `recommendations.dto.ts`                                  |
| `src/modules/analysis/enums/action-priority.enum.ts`             | Existing enum pattern to follow for ActionCategory                                                   |
| `src/modules/analysis/analysis.controller.ts`                    | Controller to add GET recommendations endpoint                                                       |
| `src/modules/analysis/analysis.module.ts`                        | Module registration                                                                                  |
| `src/entities/questionnaire-answer.entity.ts`                    | `dimensionCode` + `numericValue` for score breakdowns                                                |
| `src/entities/topic.entity.ts`                                   | Topic labels, keywords, docCount                                                                     |
| `src/entities/topic-assignment.entity.ts`                        | Links submissions to topics (probability, isDominant)                                                |
| `src/entities/sentiment-result.entity.ts`                        | Per-submission sentiment scores + labels                                                             |
| `src/modules/analysis/constants.ts`                              | Pipeline constants — add recommendation-related thresholds                                           |
| `src/configurations/env/bullmq.env.ts`                           | Env schema — add `RECOMMENDATIONS_MODEL`                                                             |

### Technical Decisions

- **Extend `WorkerHost` directly (not `BaseBatchProcessor`)**: The `BaseBatchProcessor` abstract class requires `GetWorkerUrl()` and `Persist(job, result: BatchAnalysisResultMessage)` — neither applies to direct LLM calls. Extending `WorkerHost` directly gives us just the `process(job)` method to implement, with `@OnWorkerEvent` decorators on the processor itself. Clean inheritance, no dead abstract methods. The processor must implement its own `onFailed` handler with inline logging (no `super.onFailed()` call — `WorkerHost` does not have one).
- **Service extraction**: Create `RecommendationGenerationService` to encapsulate LLM prompt construction, OpenAI call, evidence assembly, and confidence computation. Keeps the processor thin (orchestration only) and the service independently testable.
- **Evidence split**: LLM generates natural language (headline, description, action plan). System assembles supporting evidence (topic sources, sentiment breakdowns, dimension scores, sample quotes) — never LLM-generated.
- **Evidence JSONB schema** (Zod-validated, using `z.discriminatedUnion`):

  ```ts
  const topicSourceSchema = z.object({
    type: z.literal('topic'),
    topicLabel: z.string(),
    commentCount: z.number(),
    sentimentBreakdown: z.object({
      positive: z.number(),
      neutral: z.number(),
      negative: z.number(),
    }),
    sampleQuotes: z.array(z.string()).max(3),
  });

  const dimensionScoresSourceSchema = z.object({
    type: z.literal('dimension_scores'),
    scores: z.array(
      z.object({
        dimensionCode: z.string(),
        avgScore: z.number(),
      }),
    ),
  });

  const supportingEvidenceSourceSchema = z.discriminatedUnion('type', [
    topicSourceSchema,
    dimensionScoresSourceSchema,
  ]);

  const supportingEvidenceSchema = z.object({
    sources: z.array(supportingEvidenceSourceSchema),
    confidenceLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    basedOnSubmissions: z.number(),
  });
  ```

- **Dimension scores as flat context**: ALL dimension score averages are attached as a single `dimension_scores` evidence source on **every** recommendation. No per-recommendation dimension mapping — this avoids unmappable "clearly related" logic. The evidence says "here are the quantitative scores that provide context."
- **Confidence levels** — explicit decision tree (no ambiguity):
  1. If `commentCount < 5` → **LOW**
  2. If `commentCount >= 10` AND `agreementRatio > 0.7` → **HIGH**
  3. Everything else → **MEDIUM**

  Where `agreementRatio` = `max(positive, neutral, negative) / (positive + neutral + negative)` for the recommendation's linked topic. **If no topic match** (topicReference didn't match any label), use the pipeline-level total `commentCount` and global sentiment breakdown for confidence computation.

- **Topic-to-recommendation matching**: The LLM prompt includes exact topic labels and instructs it to use the exact `topicLabel` string as its `topicReference` value. Evidence assembly uses **exact string match only** — no fuzzy matching. If the LLM returns a `topicReference` that doesn't match any topic label, topic evidence is omitted (dimension scores evidence is still attached).
- **Sample quote selection**: For each topic, select quotes from submissions with `isDominant = true` topic assignments. Sort by sentiment strength (`Math.abs(positiveScore - negativeScore)` descending) and take top 3. This selects the most opinionated quotes.
- **Entity rename**: Rename `actionText` → `headline` in the `RecommendedAction` entity and migration. One name everywhere (LLM schema, entity, API response). No mapping confusion.
- **Priority casing**: The LLM schema outputs uppercase priority values (`'HIGH'`/`'MEDIUM'`/`'LOW'`) directly matching the `ActionPriority` enum. No `PRIORITY_MAP` needed — the old lowercase-to-uppercase mapping is removed.
- **Category enum**: Formalize recommendation categories as `STRENGTH` | `IMPROVEMENT` enum. Migration uses safe `ALTER COLUMN ... USING CASE` cast (no data deletion).
- **Dimension score aggregation**: Use MikroORM's `createQueryBuilder` with `.select()` and `.groupBy()` for dimension scores, matching codebase patterns. Do NOT use `em.getKnex()` which has no precedent in this codebase.
- **Submission ID resolution**: The generation service builds a submission scope filter from the loaded `AnalysisPipeline` entity's populated relations (`semester`, `faculty`, `department`, `program`, `campus`, `course`, `questionnaireVersion`) — same logic as the orchestrator's `buildSubmissionScope()`. Then queries `em.find(QuestionnaireSubmission, scopeFilter, { fields: ['id'] })` to get the set of submission IDs for all downstream queries.
- **Job message type**: Define a new `RecommendationsJobMessage` type (subset of `BatchAnalysisJobMessage` without the `items` field) for type-safe job data. The recommendations queue does not carry submission items — the generation service queries the DB directly.
- **Error handling**: OpenAI errors **throw** (BullMQ retries handle recovery). This differs from `TopicLabelService` which silently catches errors and falls back to `rawLabel`. Recommendations have no fallback — if the LLM fails, the pipeline cannot produce recommendations, so retrying is the correct strategy.
- **Institutional framing**: LLM system prompt emphasizes "students are telling us..." framing for institutional trust and adoption.
- **Model**: Default to `gpt-4o-mini` (matching `TopicLabelService`). Add optional `RECOMMENDATIONS_MODEL` env var for override. Processor reads `env.RECOMMENDATIONS_MODEL` directly for `workerVersion`.

## Implementation Plan

### Tasks

- [x] **Task 1: Create ActionCategory enum**
  - File: `src/modules/analysis/enums/action-category.enum.ts` (create)
  - Action: Create enum with two values: `STRENGTH = 'STRENGTH'` and `IMPROVEMENT = 'IMPROVEMENT'`. Follow `ActionPriority` enum as reference.
  - File: `src/modules/analysis/enums/index.ts` (modify)
  - Action: Add `export { ActionCategory } from './action-category.enum';`

- [x] **Task 2: DB migration — alter recommended_action table**
  - File: `src/migrations/MigrationXXXX.ts` (create via `npx mikro-orm migration:create`)
  - Action: Create migration that:
    1. Creates PostgreSQL enum type `action_category` with values `'STRENGTH'`, `'IMPROVEMENT'`
    2. Alters `recommended_action.category` column from `varchar(255)` to the new enum type using safe cast:
       ```sql
       ALTER TABLE recommended_action
         ALTER COLUMN category TYPE action_category
         USING CASE
           WHEN category IN ('STRENGTH','IMPROVEMENT') THEN category::action_category
           ELSE 'IMPROVEMENT'::action_category
         END;
       ```
    3. Renames `action_text` column to `headline`:
       ```sql
       ALTER TABLE recommended_action RENAME COLUMN action_text TO headline;
       ```
    4. Adds `description` column (`text`, NOT NULL, default `''`)
    5. Adds `action_plan` column (`text`, NOT NULL, default `''`)
  - Notes: Run `npx mikro-orm migration:create` to scaffold, then edit the generated file. Verify with `npx mikro-orm migration:up`.

- [x] **Task 3: Update RecommendedAction entity**
  - File: `src/entities/recommended-action.entity.ts` (modify)
  - Action:
    1. Import `ActionCategory` from `src/modules/analysis/enums`
    2. Change `category` from `@Property() category!: string` to `@Enum(() => ActionCategory) category!: ActionCategory`
    3. Rename `actionText` to `headline` (keep `@Property({ type: 'text' })`)
    4. Add `@Property({ type: 'text' }) description!: string`
    5. Add `@Property({ type: 'text' }) actionPlan!: string`
    6. Keep `supportingEvidence` as `@Property({ type: 'jsonb' })` — validation happens at the service layer via Zod

- [x] **Task 4: Define evidence schemas, LLM schemas, and job message type**
  - File: `src/modules/analysis/dto/recommendations.dto.ts` (create — replaces `recommendations-worker.dto.ts`)
  - Action: Create the following schemas:
    1. **Evidence schemas** using `z.discriminatedUnion`:

       ```ts
       const topicSourceSchema = z.object({
         type: z.literal('topic'),
         topicLabel: z.string(),
         commentCount: z.number(),
         sentimentBreakdown: z.object({
           positive: z.number(),
           neutral: z.number(),
           negative: z.number(),
         }),
         sampleQuotes: z.array(z.string()).max(3),
       });

       const dimensionScoresSourceSchema = z.object({
         type: z.literal('dimension_scores'),
         scores: z.array(
           z.object({ dimensionCode: z.string(), avgScore: z.number() }),
         ),
       });

       const supportingEvidenceSourceSchema = z.discriminatedUnion('type', [
         topicSourceSchema,
         dimensionScoresSourceSchema,
       ]);

       const supportingEvidenceSchema = z.object({
         sources: z.array(supportingEvidenceSourceSchema),
         confidenceLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
         basedOnSubmissions: z.number(),
       });
       ```

    2. **LLM response schema** (for `zodResponseFormat`):

       ```ts
       const llmRecommendationItemSchema = z.object({
         category: z.enum(['STRENGTH', 'IMPROVEMENT']),
         headline: z.string(),
         description: z.string(),
         actionPlan: z.string(),
         priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
         topicReference: z.string().optional(),
       });

       const llmRecommendationsResponseSchema = z.object({
         recommendations: z.array(llmRecommendationItemSchema),
       });
       ```

    3. **Recommendations job message type** (no `items` field — the generation service queries DB directly):

       ```ts
       const recommendationsJobSchema = z.object({
         jobId: z.string().uuid(),
         version: z.string(),
         type: z.literal('recommendations'),
         metadata: z.object({ pipelineId: z.string(), runId: z.string() }),
         publishedAt: z.string().datetime(),
       });

       type RecommendationsJobMessage = z.infer<
         typeof recommendationsJobSchema
       >;
       ```

    4. **Persisted action schema** (for processor validation after generation):
       ```ts
       const recommendedActionItemSchema = z.object({
         category: z.enum(['STRENGTH', 'IMPROVEMENT']),
         headline: z.string(),
         description: z.string(),
         actionPlan: z.string(),
         priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
         supportingEvidence: supportingEvidenceSchema,
       });
       ```

  - File: `src/modules/analysis/dto/recommendations-worker.dto.ts` (delete or keep as empty re-export)
  - Action: Remove old schemas. Update any imports across the codebase that referenced `recommendations-worker.dto.ts`.
  - Notes: Export all schemas and their inferred types.

- [x] **Task 5: Add env configuration for recommendations model**
  - File: `src/configurations/env/bullmq.env.ts` (modify)
  - Action: Add `RECOMMENDATIONS_MODEL: z.string().default('gpt-4o-mini')` to the schema. Keep `RECOMMENDATIONS_WORKER_URL` as optional (unused but no breaking change).
  - File: `.env.sample` (modify)
  - Action: Add `RECOMMENDATIONS_MODEL=gpt-4o-mini` comment

- [x] **Task 6: Add recommendation constants**
  - File: `src/modules/analysis/constants.ts` (modify)
  - Action: Add `RECOMMENDATION_THRESHOLDS` constant:
    ```ts
    export const RECOMMENDATION_THRESHOLDS = {
      /** Minimum comments for HIGH confidence */
      HIGH_CONFIDENCE_MIN_COMMENTS: 10,
      /** Minimum sentiment agreement ratio for HIGH confidence */
      HIGH_CONFIDENCE_MIN_AGREEMENT: 0.7,
      /** Minimum comments for MEDIUM confidence (below this = LOW) */
      MEDIUM_CONFIDENCE_MIN_COMMENTS: 5,
      /** Maximum sample quotes per evidence source */
      MAX_SAMPLE_QUOTES: 3,
      /** Maximum topics to include in LLM prompt */
      MAX_TOPICS_FOR_PROMPT: 10,
      /** Maximum sample comments to include in LLM prompt */
      MAX_SAMPLE_COMMENTS_FOR_PROMPT: 20,
    } as const;
    ```

- [x] **Task 7: Create RecommendationGenerationService**
  - File: `src/modules/analysis/services/recommendation-generation.service.ts` (create)
  - Action: Create injectable service with the following structure:
    1. **Constructor**: Inject `EntityManager`, instantiate `OpenAI` client (using `env.OPENAI_API_KEY`), read model from `env.RECOMMENDATIONS_MODEL`
    2. **`Generate(pipelineId: string, runId: string)` method** (public, PascalCase):
       - a) **Gather pipeline data**: Fork EM. Load `AnalysisPipeline` by `pipelineId` with scope relations populated (`semester`, `faculty`, `department`, `program`, `campus`, `course`, `questionnaireVersion`). Build submission scope filter from these relations (same logic as orchestrator's `buildSubmissionScope()`: `{ semester: pipeline.semester, faculty: pipeline.faculty, ... }` omitting undefined values). Query submission IDs: `em.find(QuestionnaireSubmission, { ...scopeFilter, cleanedComment: { $ne: null } }, { fields: ['id'] })`.
       - b) **Load latest runs**: `em.findOne(SentimentRun, { pipeline: pipelineId }, { orderBy: { createdAt: 'DESC' } })` → load its `SentimentResult[]`. `em.findOne(TopicModelRun, { pipeline: pipelineId }, { orderBy: { createdAt: 'DESC' } })` → load `Topic[]` (top 10 by docCount) and their `TopicAssignment[]`.
       - c) **Build per-topic sentiment breakdown**: For each topic, get submission IDs from `TopicAssignment`, cross-reference with `SentimentResult` to compute `{positive, neutral, negative}` counts per topic. **Select sample quotes**: from submissions with `isDominant = true` for that topic, sort by sentiment strength (`Math.abs(positiveScore - negativeScore)` descending), take top 3 `cleanedComment` values.
       - d) **Build dimension score summary via DB aggregation**: Use `createQueryBuilder`:
         ```ts
         const results = await fork
           .createQueryBuilder(QuestionnaireAnswer, 'a')
           .select(['a.dimensionCode', 'avg(a.numericValue) as avgScore'])
           .where({ submission: { $in: submissionIds } })
           .groupBy('a.dimensionCode')
           .execute();
         ```
         If submission count > 1000, log a performance warning.
       - e) **Load sample comments for prompt**: Load up to 20 `cleanedComment` strings from scoped submissions, mixing diverse sentiment (positive/negative/neutral) based on their `SentimentResult.label`.
       - f) **Construct LLM prompt**: System message instructs the LLM to generate faculty-level recommendations as structured output. Include:
         - Overall context: submission count, comment count, response rate, global sentiment summary
         - Top topics with their **exact labels** (instruct the LLM: "You MUST use the exact topicLabel string from the list below as your topicReference value"), keywords, doc counts, and per-topic sentiment
         - Dimension score averages per dimension code
         - Sample student comments (anonymized)
         - Instructions: generate 3-7 recommendations, split between STRENGTH and IMPROVEMENT, each with headline (short), description (1-2 sentences explaining the pattern), actionPlan (2-4 sentences with concrete steps), and priority (HIGH/MEDIUM/LOW)
         - Framing guidance: "Base recommendations on what students are telling us, not abstract AI analysis"
       - g) **Call OpenAI**: Use `openai.chat.completions.parse()` with `zodResponseFormat(llmRecommendationsResponseSchema, 'recommendations')`. Model from `env.RECOMMENDATIONS_MODEL`.
       - h) **Assemble evidence**: For each LLM recommendation:
         - Match `topicReference` to pipeline topics via **exact string match**
         - If matched: attach `topic` evidence source with commentCount, sentimentBreakdown, sampleQuotes
         - If not matched: omit topic evidence entirely (no crash, no fuzzy match)
         - **Always** attach a single `dimension_scores` evidence source with ALL dimension score averages (flat context for every recommendation)
         - Compute `confidenceLevel`: if topic matched, use that topic's commentCount + sentimentBreakdown. If no topic match, use pipeline-level `commentCount` and global sentiment breakdown. Apply the 3-step decision tree.
         - Set `basedOnSubmissions` from pipeline submission count
       - i) **Return**: Array of `{ category, headline, description, actionPlan, priority, supportingEvidence }` ready for persistence
    3. **`private ComputeConfidence(commentCount, sentimentBreakdown)` method**: Implements the 3-step decision tree:
       1. If `commentCount < MEDIUM_CONFIDENCE_MIN_COMMENTS` → LOW
       2. If `commentCount >= HIGH_CONFIDENCE_MIN_COMMENTS` AND `agreementRatio > HIGH_CONFIDENCE_MIN_AGREEMENT` → HIGH
       3. Else → MEDIUM

       Where `agreementRatio = max(positive, neutral, negative) / (positive + neutral + negative)`

    4. **Error handling**: Wrap OpenAI call in try/catch. On failure, log error and **re-throw** so BullMQ retries. Do NOT silently swallow errors.

  - Notes: Keep the service focused — no DB writes, just computation. The processor handles persistence.

- [x] **Task 8: Rewrite RecommendationsProcessor to extend WorkerHost**
  - File: `src/modules/analysis/processors/recommendations.processor.ts` (modify)
  - Action: **Rewrite** the processor:
    1. Change class to `extends WorkerHost` (NOT `BaseBatchProcessor`). Remove all `BaseBatchProcessor` imports and abstract method implementations (`GetWorkerUrl()`, old `Persist()`). Remove the `PRIORITY_MAP` constant — LLM outputs uppercase priorities matching `ActionPriority` directly.
    2. Inject `RecommendationGenerationService`, `EntityManager`, and `PipelineOrchestratorService` (via `forwardRef`) in constructor
    3. Implement `async process(job: Job<RecommendationsJobMessage>): Promise<void>`:
       - Extract `pipelineId` and `runId` from `job.data.metadata`
       - Call `this.generationService.Generate(pipelineId, runId)` to get recommendations array
       - Persist results: fork EM, load `RecommendationRun` by `runId`, create `RecommendedAction` entities with all fields (`category` as `ActionCategory`, `headline`, `description`, `actionPlan`, `priority` as `ActionPriority`, `supportingEvidence`), mark run COMPLETED, set `workerVersion` to `env.RECOMMENDATIONS_MODEL`, flush
       - Call `orchestrator.OnRecommendationsComplete(pipelineId)`
    4. Implement `@OnWorkerEvent('failed')` handler with **inline logging** (no `super.onFailed()` — `WorkerHost` does not have this method):
       ```ts
       @OnWorkerEvent('failed')
       onFailed(job: Job<RecommendationsJobMessage>, error: Error) {
         this.logger.error(
           `Job ${job.id} (${job.queueName}) failed on attempt ${job.attemptsMade}: ${error.message}`,
         );
         const pipelineId = job.data?.metadata?.pipelineId;
         if (pipelineId && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
           this.orchestrator.OnStageFailed(pipelineId, 'generating_recommendations', error.message)
             .catch((err: Error) => this.logger.error(`Failed to update pipeline on failure: ${err.message}`));
         }
       }
       ```
    5. Add `@OnWorkerEvent('stalled')` handler with warning log:
       ```ts
       @OnWorkerEvent('stalled')
       onStalled(jobId: string) {
         this.logger.warn(`Job ${jobId} stalled — investigating`);
       }
       ```

- [x] **Task 9: Simplify pipeline orchestrator dispatch**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts` (modify)
  - Action:
    1. In `OnTopicModelComplete()`: Remove the `RECOMMENDATIONS_WORKER_URL` check (the `if (!env.RECOMMENDATIONS_WORKER_URL)` block). The recommendation step no longer needs a worker URL — it calls OpenAI directly.
    2. Simplify `dispatchRecommendations()`: Remove all the sentiment aggregation and topic aggregation code (the `sentimentCounts` loop, `topTopics` query, and the `scope`/`data` fields in the payload). The method now just:
       - Creates a `RecommendationRun` record (keeping `submissionCount`, `sentimentCoverage`, `topicCoverage` from latest runs)
       - Enqueues a minimal BullMQ job with type `RecommendationsJobMessage`: `{ jobId, version: '1.0', type: 'recommendations', metadata: { pipelineId, runId }, publishedAt }`
       - The `RecommendationGenerationService` queries the DB directly for all data it needs
    3. Add `GetRecommendations(pipelineId: string)` method (see Task 12)

- [x] **Task 10: Register service in module**
  - File: `src/modules/analysis/analysis.module.ts` (modify)
  - Action:
    1. Import `RecommendationGenerationService`
    2. Add to `providers` array
  - Notes: `QuestionnaireSubmission` and `QuestionnaireAnswer` do NOT need to be added to `MikroOrmModule.forFeature()` — the generation service uses `em.fork()` which accesses all metadata-registered entities and `createQueryBuilder` for aggregation. `forFeature` is only needed for repository injection.

- [x] **Task 11: Create recommendations response DTO**
  - File: `src/modules/analysis/dto/responses/recommendations.response.dto.ts` (create)
  - Action: Create a response DTO class for the GET endpoint:

    ```ts
    class RecommendedActionResponseDto {
      id: string;
      category: ActionCategory;
      headline: string;
      description: string;
      actionPlan: string;
      priority: ActionPriority;
      supportingEvidence: SupportingEvidence; // typed from Zod schema
      createdAt: string;
    }

    class RecommendationsResponseDto {
      pipelineId: string;
      runId: string;
      status: RunStatus;
      actions: RecommendedActionResponseDto[];
      completedAt: string | null;
    }
    ```

    Add Swagger decorators (`@ApiProperty`) on all fields.
    Add a static `Map()` factory method following the `PipelineResponseDto.Map()` pattern.

- [x] **Task 12: Add GET recommendations endpoint**
  - File: `src/modules/analysis/analysis.controller.ts` (modify)
  - Action: Add endpoint:
    ```ts
    @Get('pipelines/:id/recommendations')
    @ApiOperation({ summary: 'Get recommendations for a completed pipeline' })
    async GetRecommendations(@Param('id') id: string) {
      return this.orchestrator.GetRecommendations(id);
    }
    ```
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.ts` (modify)
  - Action: Add `GetRecommendations(pipelineId: string)` method:
    1. Fork EM, find pipeline (throw `NotFoundException` if missing)
    2. Find latest `RecommendationRun` for pipeline: `em.findOne(RecommendationRun, { pipeline }, { orderBy: { createdAt: 'DESC' }, populate: ['actions'] })`
    3. If no run or run status is not `RunStatus.COMPLETED`, return `{ pipelineId, runId: null, status: RunStatus.PENDING, actions: [], completedAt: null }`
    4. Map to `RecommendationsResponseDto` and return

- [x] **Task 13: Unit tests — RecommendationGenerationService**
  - File: `src/modules/analysis/services/recommendation-generation.service.spec.ts` (create)
  - Action: Test cases:
    1. `Generate()` calls OpenAI with correct prompt structure and zodResponseFormat
    2. `Generate()` assembles evidence from pipeline data (mock EM queries for topics, sentiment results, `createQueryBuilder` for dimension scores)
    3. `Generate()` computes confidence levels correctly — test all 3 decision tree branches: LOW (<5 comments), HIGH (>=10, >70% agreement), MEDIUM (everything else including >=10 comments with <=70% agreement)
    4. `Generate()` handles OpenAI API failure — throws error (does NOT silently catch)
    5. `Generate()` handles empty topics gracefully (still generates recommendations from sentiment/dimension data)
    6. Evidence `sampleQuotes` are capped at `MAX_SAMPLE_QUOTES` per source, selected by `isDominant` and sentiment strength
    7. `topicReference` exact match: matched topic gets topic evidence, unmatched `topicReference` results in no topic evidence (only dimension_scores source)
    8. No topic match → confidence uses pipeline-level comment count and global sentiment
    9. All recommendations get `dimension_scores` evidence source regardless of topic match
  - Notes: Mock `OpenAI` class, `EntityManager`, and `createQueryBuilder` chain.

- [x] **Task 14: Update processor tests**
  - File: `src/modules/analysis/processors/recommendations.processor.spec.ts` (modify)
  - Action:
    1. Rewrite test setup — processor now extends `WorkerHost`, inject mock `RecommendationGenerationService`, `EntityManager`, and `PipelineOrchestratorService`. Job type is `RecommendationsJobMessage`.
    2. Test that `process()` calls `Generate()` with correct pipelineId/runId from job metadata
    3. Test that `process()` persists `RecommendedAction` entities with all new fields (`headline`, `description`, `actionPlan`, `category` as `ActionCategory` enum, `priority` as `ActionPriority` — uppercase directly, no mapping)
    4. Test that run is marked COMPLETED with `workerVersion` set to `env.RECOMMENDATIONS_MODEL`
    5. Test that `OnRecommendationsComplete` is called after successful persistence
    6. Test `onFailed` handler: logs error inline, calls `OnStageFailed` when retries exhausted (no `super.onFailed()`)

- [x] **Task 15: Update orchestrator tests**
  - File: `src/modules/analysis/services/pipeline-orchestrator.service.spec.ts` (modify)
  - Action:
    1. Remove the `RECOMMENDATIONS_WORKER_URL` check assertion in `OnTopicModelComplete` tests
    2. Update `dispatchRecommendations` tests for simplified payload (no more aggregated data block — just `RecommendationsJobMessage` with metadata only)
    3. Add tests for new `GetRecommendations()` method: pipeline found with completed run returns mapped DTO with `RunStatus.COMPLETED`; pipeline not found throws NotFoundException; no run returns `RunStatus.PENDING` status with empty actions

- [x] **Task 16: Add controller endpoint test**
  - File: `src/modules/analysis/analysis.controller.spec.ts` (modify)
  - Action: Add test for `GET /analysis/pipelines/:id/recommendations`:
    1. Verify the route is wired to `orchestrator.GetRecommendations()` with the correct `id` param
    2. Verify `@UseJwtGuard()` is enforced on the endpoint (inherited from controller class)

### Acceptance Criteria

- [ ] **AC 1**: Given a completed pipeline with sentiment and topic data, when the recommendation stage runs, then the LLM generates 3-7 structured recommendations split between STRENGTH and IMPROVEMENT categories, each with headline, description, and actionPlan fields populated.
- [ ] **AC 2**: Given a generated recommendation, when its supporting evidence is inspected, then all evidence fields (topic sources, comment counts, sentiment breakdowns, sample quotes, dimension scores) are system-assembled from actual pipeline data — none are LLM-generated. Every recommendation has a `dimension_scores` evidence source.
- [ ] **AC 3**: Given a recommendation's linked topic with `commentCount < 5`, when confidence is computed, then it is LOW. Given `commentCount >= 10 AND agreementRatio > 0.7`, then HIGH. Given any other combination (including >=10 comments with <=70% agreement), then MEDIUM.
- [ ] **AC 4**: Given a completed pipeline, when `GET /analysis/pipelines/:id/recommendations` is called, then the response includes all `RecommendedAction` entities with category (STRENGTH/IMPROVEMENT), headline, description, actionPlan, priority, and supportingEvidence.
- [ ] **AC 5**: Given a pipeline where the recommendation stage has not completed, when `GET /analysis/pipelines/:id/recommendations` is called, then the response returns `status: RunStatus.PENDING` with an empty actions array.
- [ ] **AC 6**: Given the OpenAI API returns an error during recommendation generation, when the BullMQ job fails, then the job is retried according to `BULLMQ_DEFAULT_ATTEMPTS` with exponential backoff. After all retries are exhausted, the pipeline status is set to FAILED with an error message.
- [ ] **AC 7**: Given the `RecommendedAction` entity, when a record is persisted, then the `category` column stores an `ActionCategory` enum value (STRENGTH or IMPROVEMENT), `headline`, `description` and `actionPlan` are non-empty text, `priority` stores an `ActionPriority` enum value (uppercase), and `supportingEvidence` validates against the `supportingEvidenceSchema`.
- [ ] **AC 8**: Given an LLM recommendation with a `topicReference` that doesn't match any topic label exactly, when evidence is assembled, then topic evidence is omitted for that recommendation. Dimension scores evidence is still attached. Confidence uses pipeline-level data as fallback.

## Additional Context

### Dependencies

- **OpenAI SDK** (`openai` npm package) — already installed and configured via `OPENAI_API_KEY`. Used by `TopicLabelService`.
- **Completed pipeline stages** — Recommendations depend on `SentimentRun` (COMPLETED) and `TopicModelRun` (COMPLETED) existing for the pipeline. The orchestrator already enforces this ordering.
- **pgvector / embeddings** — Not directly used by recommendations, but embeddings must exist for topic modeling to succeed upstream.
- **No new npm packages required.**

### Testing Strategy

**Unit Tests (mandatory):**

- `RecommendationGenerationService` — Mock OpenAI client, EntityManager, and createQueryBuilder chain. Test prompt construction, evidence assembly (topic match + miss + dimension scores always present), confidence computation (all 3 branches + no-topic-match fallback), error propagation, sample quote selection by isDominant + sentiment strength.
- `RecommendationsProcessor` — Mock generation service and EntityManager. Test `process()` flow with `RecommendationsJobMessage` type, persistence with new fields, `onFailed` with inline logging (no super call), `workerVersion` from env.
- `PipelineOrchestratorService` — Mock queues and EntityManager. Test simplified dispatch with `RecommendationsJobMessage`, `GetRecommendations()` method returning `RunStatus.PENDING`/`RunStatus.COMPLETED`.
- `AnalysisController` — Test GET recommendations route wiring and param passing.

**Integration Testing (manual):**

- Run full pipeline locally with `docker compose up` (Redis + mock worker for sentiment/topic stages), then verify:
  1. Pipeline reaches GENERATING_RECOMMENDATIONS status
  2. Recommendation processor calls OpenAI (requires valid `OPENAI_API_KEY`)
  3. Recommendations are persisted with all fields
  4. GET endpoint returns structured response

**Edge Cases to Test:**

- Pipeline with no topics (all outliers) — should still generate recommendations from sentiment/dimension data; all confidence uses pipeline-level fallback
- Pipeline with all positive sentiment — should produce STRENGTH recommendations, minimal/no IMPROVEMENT
- Pipeline with very few comments (<5) — all recommendations should have LOW confidence
- OpenAI returns fewer recommendations than expected — should persist what's returned
- LLM returns `topicReference` that doesn't match any topic — evidence assembly gracefully skips topic source, attaches dimension scores, uses pipeline-level confidence
- Large corpus (>1000 submissions) — dimension score aggregation uses `createQueryBuilder` `GROUP BY`, performance warning logged

### Notes

**High-risk items:**

- **LLM output quality**: The prompt must be carefully tuned to produce grounded, specific recommendations rather than generic advice. The `topicReference` field uses exact label match — prompt must instruct the LLM to use exact topic labels from the provided list.
- **Dimension score aggregation**: Uses MikroORM's `createQueryBuilder` for `GROUP BY AVG()` — must ensure the query builder is properly scoped to the pipeline's submission IDs.

**Known limitations:**

- **No RBAC on recommendations endpoint**: The GET endpoint inherits `@UseJwtGuard()` from the controller but has no role-based access control. Any authenticated user can access any pipeline's recommendations. This is consistent with the existing analysis controller endpoints (none have `@Roles` guards). A separate ticket should add RBAC across the entire analysis module.
- No caching — each pipeline run calls the LLM fresh. Recommendation regeneration requires re-running the full pipeline.
- `gpt-4o-mini` may produce lower-quality action plans compared to `gpt-4o`. The `RECOMMENDATIONS_MODEL` env var allows upgrading without code changes.
- Evidence `sampleQuotes` are drawn from `cleanedComment` which may contain multilingual text (Cebuano, Tagalog, English). The LLM prompt should acknowledge this and generate English-language recommendations regardless of quote language.

**Future considerations (out of scope):**

- Department/program aggregate recommendations (aggregate across multiple faculty pipelines)
- Comparative percentiles ("your score is in the Nth percentile")
- Trend analysis ("improved from last semester")
- Dean-facing "attention needed" flags based on recommendation severity
- Recommendation feedback loop (faculty can mark recommendations as helpful/not helpful)
- Role-based access control across the analysis module
