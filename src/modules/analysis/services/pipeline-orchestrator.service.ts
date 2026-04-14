/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { v4 } from 'uuid';
import { env } from 'src/configurations/env';
import { QueueName } from 'src/configurations/common/queue-names';
import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import { SentimentRun } from 'src/entities/sentiment-run.entity';
import { SentimentResult } from 'src/entities/sentiment-result.entity';
import { TopicModelRun } from 'src/entities/topic-model-run.entity';
import { Topic } from 'src/entities/topic.entity';
import { RecommendationRun } from 'src/entities/recommendation-run.entity';
import { SubmissionEmbedding } from 'src/entities/submission-embedding.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { Semester } from 'src/entities/semester.entity';
import { User } from 'src/entities/user.entity';
import { QuestionnaireVersion } from 'src/entities/questionnaire-version.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { Campus } from 'src/entities/campus.entity';
import { Course } from 'src/entities/course.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { PipelineStatus, RunStatus } from '../enums';
import { SENTIMENT_GATE, COVERAGE_WARNINGS } from '../constants';
import { buildSubmissionScope } from '../lib/build-submission-scope';
import {
  CreatePipelineInput,
  createPipelineSchema,
} from '../dto/create-pipeline.dto';
import {
  ListPipelinesQueryInput,
  listPipelinesQuerySchema,
} from '../dto/list-pipelines.dto';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { batchAnalysisJobSchema } from '../dto/batch-analysis-job-message.dto';
import { PipelineStatusResponse } from '../dto/pipeline-status.dto';
import {
  type RecommendationsJobMessage,
  recommendationsJobSchema,
} from '../dto/recommendations.dto';
import { RecommendationsResponseDto } from '../dto/responses/recommendations.response.dto';
import { AnalysisService } from '../analysis.service';
import { TopicLabelService } from './topic-label.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';

interface CoverageStats {
  totalEnrolled: number;
  submissionCount: number;
  commentCount: number;
  responseRate: number;
  lastEnrollmentSyncAt: Date | null;
}

interface ScopeFilter {
  semester: string;
  faculty?: string;
  questionnaireVersion?: string;
  department?: string;
  program?: string;
  campus?: string;
  course?: string;
}

const TERMINAL_STATUSES = [
  PipelineStatus.COMPLETED,
  PipelineStatus.FAILED,
  PipelineStatus.CANCELLED,
];

// Populate list for endpoints that return a PipelineSummary to the
// frontend. Covers every scope FK + the faculty name used in the summary
// DTO. Keeping this centralized prevents drift between Create/Confirm/
// Cancel and ListPipelines.
const SUMMARY_POPULATE = [
  'semester',
  'faculty',
  'questionnaireVersion',
  'department',
  'program',
  'campus',
  'course',
] as const;

@Injectable()
export class PipelineOrchestratorService {
  private readonly logger = new Logger(PipelineOrchestratorService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly analysisService: AnalysisService,
    private readonly topicLabelService: TopicLabelService,
    private readonly scopeResolver: ScopeResolverService,
    private readonly currentUserService: CurrentUserService,
    @InjectQueue(QueueName.SENTIMENT) private readonly sentimentQueue: Queue,
    @InjectQueue(QueueName.TOPIC_MODEL) private readonly topicModelQueue: Queue,
    @InjectQueue(QueueName.RECOMMENDATIONS)
    private readonly recommendationsQueue: Queue,
    @InjectQueue(QueueName.ANALYTICS_REFRESH)
    private readonly analyticsRefreshQueue: Queue,
  ) {}

  async CreatePipeline(
    dto: CreatePipelineInput,
    triggeredById: string,
  ): Promise<AnalysisPipeline> {
    const parsed = createPipelineSchema.parse(dto);

    // Belt-and-braces service-layer scope check. The controller-level
    // @UseJwtGuard + RolesGuard blocks STUDENT/FACULTY before reaching here,
    // but this guards against future guard misconfiguration (see AC-2a).
    // Returns input augmented with auto-filled scope when the caller has
    // exactly one assigned scope and didn't specify one explicitly.
    const input = await this.assertCanCreatePipeline(parsed);

    const fork = this.em.fork();

    // Check for active duplicate
    const activeStatuses = Object.values(PipelineStatus).filter(
      (s) => !TERMINAL_STATUSES.includes(s),
    );

    // Every scope field is bound exactly — non-provided fields become
    // `null`. This matches the partial unique index's COALESCE-to-sentinel
    // behavior (TD-8). Without the explicit nulls, a too-loose `findOne`
    // can match a superset-scoped pipeline (e.g. a DEAN asking for
    // `{sem, dept}` would match a pipeline `{sem, dept, faculty, program}`),
    // returning a mis-scoped pipeline and bypassing the index intent.
    const existingFilter: Record<string, unknown> = {
      semester: input.semesterId,
      status: { $in: activeStatuses },
      faculty: input.facultyId ?? null,
      department: input.departmentId ?? null,
      program: input.programId ?? null,
      campus: input.campusId ?? null,
      course: input.courseId ?? null,
      questionnaireVersion: input.questionnaireVersionId ?? null,
    };

    const existingPipeline = await fork.findOne(
      AnalysisPipeline,
      existingFilter,
      { populate: SUMMARY_POPULATE },
    );
    if (existingPipeline) {
      return existingPipeline;
    }

    // Compute coverage stats
    const scope: ScopeFilter = { semester: input.semesterId };
    if (input.facultyId) scope.faculty = input.facultyId;
    if (input.questionnaireVersionId)
      scope.questionnaireVersion = input.questionnaireVersionId;
    if (input.departmentId) scope.department = input.departmentId;
    if (input.programId) scope.program = input.programId;
    if (input.campusId) scope.campus = input.campusId;
    if (input.courseId) scope.course = input.courseId;

    const coverage = await this.ComputeCoverageStats(fork, scope);
    const warnings = this.BuildCoverageWarnings(coverage);

    const pipeline = fork.create(AnalysisPipeline, {
      semester: fork.getReference(Semester, input.semesterId),
      faculty: input.facultyId
        ? fork.getReference(User, input.facultyId)
        : undefined,
      questionnaireVersion: input.questionnaireVersionId
        ? fork.getReference(QuestionnaireVersion, input.questionnaireVersionId)
        : undefined,
      department: input.departmentId
        ? fork.getReference(Department, input.departmentId)
        : undefined,
      program: input.programId
        ? fork.getReference(Program, input.programId)
        : undefined,
      campus: input.campusId
        ? fork.getReference(Campus, input.campusId)
        : undefined,
      course: input.courseId
        ? fork.getReference(Course, input.courseId)
        : undefined,
      triggeredBy: fork.getReference(User, triggeredById),
      totalEnrolled: coverage.totalEnrolled,
      submissionCount: coverage.submissionCount,
      commentCount: coverage.commentCount,
      responseRate: coverage.responseRate,
      warnings,
      status: PipelineStatus.AWAITING_CONFIRMATION,
    });

    // TD-8: partial unique index enforces one-canonical-pipeline-per-scope at
    // the DB. A concurrent insert that lost the race throws
    // UniqueConstraintViolationException — re-fetch the winner so both
    // requests see the same pipeline id (idempotent).
    try {
      await fork.flush();
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        const winner = await fork.findOne(AnalysisPipeline, existingFilter, {
          populate: SUMMARY_POPULATE,
        });
        if (winner) {
          this.logger.log(
            `CreatePipeline race resolved: returning existing ${winner.id} for semester ${input.semesterId}`,
          );
          return winner;
        }
      }
      throw err;
    }

    this.logger.log(
      `Created pipeline ${pipeline.id} for semester ${input.semesterId}`,
    );
    // Populate references before returning so controller can map to the
    // full PipelineSummary shape (frontend relies on scope codes/names).
    await fork.populate(pipeline, SUMMARY_POPULATE);
    return pipeline;
  }

  async ListPipelines(
    query: ListPipelinesQueryInput,
  ): Promise<AnalysisPipeline[]> {
    const parsed = listPipelinesQuerySchema.parse(query);
    const filled = await this.fillAndAssertListScope(parsed);

    const fork = this.em.fork();
    const filter: Record<string, unknown> = {
      semester: filled.semesterId,
    };
    if (filled.facultyId) filter['faculty'] = filled.facultyId;
    if (filled.questionnaireVersionId)
      filter['questionnaireVersion'] = filled.questionnaireVersionId;
    if (filled.courseId) filter['course'] = filled.courseId;
    if (filled.programId) filter['program'] = filled.programId;
    if (filled.campusId) filter['campus'] = filled.campusId;

    // Default-filled departmentIds come through as string[] (via $in), a
    // client-provided scalar departmentId still works.
    if (filled.departmentIdSet) {
      filter['department'] = { $in: filled.departmentIdSet };
    } else if (filled.departmentId) {
      filter['department'] = filled.departmentId;
    }
    if (filled.programIdSet) {
      filter['program'] = { $in: filled.programIdSet };
    }
    if (filled.campusIdSet) {
      filter['campus'] = { $in: filled.campusIdSet };
    }

    return fork.find(AnalysisPipeline, filter, {
      populate: SUMMARY_POPULATE,
      orderBy: { createdAt: 'DESC' },
      limit: 10,
    });
  }

  async ConfirmPipeline(pipelineId: string): Promise<AnalysisPipeline> {
    const fork = this.em.fork();
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId, {
      populate: SUMMARY_POPULATE,
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    // Scope check MUST precede every flush / status write / enqueue below —
    // a foreign user must never cause side effects even when the worker URL
    // is misconfigured (the SENTIMENT_WORKER_URL check used to flip status
    // to FAILED on any caller).
    await this.assertCanAccessPipeline(pipeline);

    if (pipeline.status !== PipelineStatus.AWAITING_CONFIRMATION) {
      throw new BadRequestException(
        `Pipeline is in "${pipeline.status}" status, not awaiting_confirmation`,
      );
    }

    // Validate sentiment worker URL
    if (!env.SENTIMENT_WORKER_URL) {
      pipeline.status = PipelineStatus.FAILED;
      pipeline.errorMessage = 'SENTIMENT_WORKER_URL not configured';
      await fork.flush();
      throw new BadRequestException('SENTIMENT_WORKER_URL not configured');
    }

    pipeline.confirmedAt = new Date();

    // Check embedding coverage (use cleanedComment — text that survived preprocessing)
    const scope = buildSubmissionScope(pipeline);
    const submissions = await fork.find(QuestionnaireSubmission, {
      ...scope,
      cleanedComment: { $ne: null },
    });

    const submissionIds = submissions.map((s) => s.id);

    const embeddedCount = await fork.count(SubmissionEmbedding, {
      submission: { $in: submissionIds },
      deletedAt: null,
    });

    const missingEmbeddings = submissionIds.length - embeddedCount;

    // Fire-and-forget embedding backfill (best-effort, processed alongside sentiment)
    if (missingEmbeddings > 0 && env.EMBEDDINGS_WORKER_URL) {
      const unembeddedSubmissions = await this.getUnembeddedSubmissions(
        fork,
        submissionIds,
      );

      for (const sub of unembeddedSubmissions) {
        try {
          await this.analysisService.EnqueueJob(
            QueueName.EMBEDDING,
            sub.cleanedComment!,
            { submissionId: sub.id, facultyId: '', versionId: '' },
          );
        } catch (err) {
          this.logger.warn(
            `Failed to enqueue embedding backfill for ${sub.id}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Enqueued ${unembeddedSubmissions.length} embedding backfill jobs for pipeline ${pipelineId}`,
      );
    }

    // Proceed directly to sentiment analysis
    pipeline.status = PipelineStatus.SENTIMENT_ANALYSIS;
    await fork.flush();
    await this.dispatchSentiment(fork, pipeline);

    return pipeline;
  }

  async OnSentimentComplete(pipelineId: string): Promise<void> {
    const fork = this.em.fork();
    const pipeline = await fork.findOneOrFail(AnalysisPipeline, pipelineId);

    if (pipeline.status !== PipelineStatus.SENTIMENT_ANALYSIS) return;

    // Apply sentiment gate
    pipeline.status = PipelineStatus.SENTIMENT_GATE;

    // Find latest sentiment run for this pipeline
    const sentimentRun = await fork.findOne(
      SentimentRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' } },
    );

    if (!sentimentRun) {
      await this.failPipeline(
        fork,
        pipeline,
        'No sentiment run found for gate processing',
      );
      return;
    }

    const sentimentResults = await fork.find(SentimentResult, {
      run: sentimentRun,
    });

    // Batch load all submissions referenced by sentiment results (avoids N+1)
    const submissionIds = [
      ...new Set(sentimentResults.map((r) => r.submission.id)),
    ];
    const submissions = await fork.find(QuestionnaireSubmission, {
      id: { $in: submissionIds },
    });
    const submissionMap = new Map(submissions.map((s) => [s.id, s]));

    // Apply gate logic in-memory
    const passingIds: string[] = [];
    const failingIds: string[] = [];

    for (const result of sentimentResults) {
      const alwaysInclude = (
        SENTIMENT_GATE.ALWAYS_INCLUDE_LABELS as readonly string[]
      ).includes(result.label);

      if (alwaysInclude) {
        passingIds.push(result.id);
      } else {
        // For positive sentiment, check word count
        const submission = submissionMap.get(result.submission.id);
        const wordCount =
          submission?.cleanedComment?.split(/\s+/).filter(Boolean).length ?? 0;

        if (wordCount >= SENTIMENT_GATE.POSITIVE_MIN_WORD_COUNT) {
          passingIds.push(result.id);
        } else {
          failingIds.push(result.id);
        }
      }
    }

    // Bulk UPDATE via nativeUpdate
    if (passingIds.length > 0) {
      await fork.nativeUpdate(
        SentimentResult,
        { id: { $in: passingIds } },
        { passedTopicGate: true },
      );
    }
    if (failingIds.length > 0) {
      await fork.nativeUpdate(
        SentimentResult,
        { id: { $in: failingIds } },
        { passedTopicGate: false },
      );
    }

    pipeline.sentimentGateIncluded = passingIds.length;
    pipeline.sentimentGateExcluded = failingIds.length;

    // Post-gate validation warning
    if (passingIds.length < COVERAGE_WARNINGS.MIN_POST_GATE_CORPUS) {
      pipeline.warnings = [
        ...pipeline.warnings,
        `Sentiment gate reduced corpus to ${passingIds.length} submissions. Topic modeling results may be unreliable.`,
      ];
    }

    await fork.flush();

    this.logger.log(
      `Sentiment gate: ${passingIds.length} included, ${failingIds.length} excluded`,
    );

    // Dispatch topic modeling
    if (!env.TOPIC_MODEL_WORKER_URL) {
      await this.failPipeline(
        fork,
        pipeline,
        'TOPIC_MODEL_WORKER_URL not configured',
      );
      return;
    }

    pipeline.status = PipelineStatus.TOPIC_MODELING;
    await fork.flush();

    await this.dispatchTopicModeling(fork, pipeline, sentimentRun);
  }

  async OnTopicModelComplete(pipelineId: string): Promise<void> {
    const fork = this.em.fork();
    const pipeline = await fork.findOneOrFail(AnalysisPipeline, pipelineId);

    if (pipeline.status !== PipelineStatus.TOPIC_MODELING) return;

    // Generate human-readable labels before dispatching recommendations
    const topicModelRun = await fork.findOne(
      TopicModelRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' } },
    );
    if (topicModelRun) {
      const topics = await fork.find(Topic, { run: topicModelRun });
      await this.topicLabelService.generateLabels(topics);
      await fork.flush();
    }

    pipeline.status = PipelineStatus.GENERATING_RECOMMENDATIONS;
    await fork.flush();

    await this.dispatchRecommendations(fork, pipeline);
  }

  async OnRecommendationsComplete(pipelineId: string): Promise<void> {
    const fork = this.em.fork();
    const pipeline = await fork.findOneOrFail(AnalysisPipeline, pipelineId);

    if (pipeline.status !== PipelineStatus.GENERATING_RECOMMENDATIONS) return;

    pipeline.status = PipelineStatus.COMPLETED;
    pipeline.completedAt = new Date();
    await fork.flush();

    this.logger.log(`Pipeline ${pipelineId} completed`);

    // Best-effort: enqueue analytics refresh (decoupled from pipeline lifecycle)
    try {
      await this.analyticsRefreshQueue.add(
        QueueName.ANALYTICS_REFRESH,
        { pipelineId },
        {
          jobId: `${pipelineId}--analytics-refresh`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
      this.logger.log(`Enqueued analytics refresh for pipeline ${pipelineId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue analytics refresh for pipeline ${pipelineId}: ${(err as Error).message}`,
      );
    }
  }

  async GetPipelineStatus(pipelineId: string): Promise<PipelineStatusResponse> {
    const fork = this.em.fork();
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId, {
      populate: [
        'semester',
        'faculty',
        'questionnaireVersion',
        'department',
        'program',
        'campus',
        'course',
      ],
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    await this.assertCanAccessPipeline(pipeline);

    // Get latest runs
    const sentimentRun = await fork.findOne(
      SentimentRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' } },
    );
    const topicModelRun = await fork.findOne(
      TopicModelRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' } },
    );
    const recommendationRun = await fork.findOne(
      RecommendationRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' } },
    );

    // Sentiment progress count
    let sentimentCompleted = 0;
    if (sentimentRun && sentimentRun.status !== RunStatus.PENDING) {
      sentimentCompleted = await fork.count(SentimentResult, {
        run: sentimentRun,
      });
    }

    // Coverage stats are cached on the pipeline entity at creation time. For
    // pipelines still awaiting confirmation, recompute on every status fetch
    // so the user sees the latest submission/enrollment counts before they
    // lock in the snapshot. After confirmation, the stored values represent
    // what was actually analyzed and must not drift.
    const scope = this.BuildScopeFromPipeline(pipeline);
    let totalEnrolled = pipeline.totalEnrolled;
    let submissionCount = pipeline.submissionCount;
    let commentCount = pipeline.commentCount;
    let responseRate = Number(pipeline.responseRate);
    let warnings = pipeline.warnings;
    let lastEnrollmentSyncAt: Date | null = null;

    if (pipeline.status === PipelineStatus.AWAITING_CONFIRMATION) {
      const freshCoverage = await this.ComputeCoverageStats(fork, scope);
      totalEnrolled = freshCoverage.totalEnrolled;
      submissionCount = freshCoverage.submissionCount;
      commentCount = freshCoverage.commentCount;
      responseRate = freshCoverage.responseRate;
      lastEnrollmentSyncAt = freshCoverage.lastEnrollmentSyncAt;
      warnings = this.BuildCoverageWarnings(freshCoverage);

      // Persist refreshed snapshot so the values shown here match what will
      // be locked in at confirmation time.
      pipeline.totalEnrolled = freshCoverage.totalEnrolled;
      pipeline.submissionCount = freshCoverage.submissionCount;
      pipeline.commentCount = freshCoverage.commentCount;
      pipeline.responseRate = freshCoverage.responseRate;
      pipeline.warnings = warnings;
      await fork.flush();
    } else {
      // For confirmed/terminal pipelines, derive lastEnrollmentSyncAt from
      // courses in the original submission scope (snapshot view).
      const scopedSubs = await fork.find(
        QuestionnaireSubmission,
        {
          ...scope,
          qualitativeComment: { $ne: null },
        },
        { fields: ['course'] },
      );
      const courseIds = [
        ...new Set(
          scopedSubs
            .map((s) => s.course?.id)
            .filter((id): id is string => !!id),
        ),
      ];
      if (courseIds.length > 0) {
        const latestEnrollment = await fork.findOne(
          Enrollment,
          { isActive: true, course: { $in: courseIds } },
          { orderBy: { updatedAt: 'DESC' } },
        );
        if (latestEnrollment) {
          lastEnrollmentSyncAt = latestEnrollment.updatedAt;
        }
      }
    }

    const buildStage = (
      status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped',
      run: { createdAt: Date; completedAt?: Date | null } | null,
      progress: { current: number; total: number } | null = null,
    ) => ({
      status,
      progress,
      startedAt: run?.createdAt?.toISOString() ?? null,
      completedAt: run?.completedAt?.toISOString() ?? null,
    });

    // If RunStatus gains new values, update this mapping to match the stage status union
    const getRunStatus = (
      run: SentimentRun | TopicModelRun | RecommendationRun | null,
    ) =>
      run
        ? (run.status.toLowerCase() as
            | 'pending'
            | 'processing'
            | 'completed'
            | 'failed')
        : 'pending';

    // Gate either completed (has data) or didn't. Top-level pipeline.status
    // handles failure attribution — no per-stage failure tracking for MVP.
    // FAILED pipelines: gate shows 'pending' (never completed) which is correct.
    // CANCELLED pipelines: gate shows 'skipped' (explicitly not attempted).
    const gateStatus =
      pipeline.sentimentGateIncluded != null
        ? 'completed'
        : pipeline.status === PipelineStatus.SENTIMENT_GATE
          ? 'processing'
          : pipeline.status === PipelineStatus.CANCELLED
            ? 'skipped'
            : 'pending';

    return {
      id: pipeline.id,
      status: pipeline.status,
      scope: {
        semesterId: pipeline.semester?.id ?? '',
        semesterCode: pipeline.semester?.code ?? '',
        departmentId: pipeline.department?.id ?? null,
        departmentCode: pipeline.department?.code ?? null,
        facultyId: pipeline.faculty?.id ?? null,
        facultyName: pipeline.faculty?.fullName ?? null,
        programId: pipeline.program?.id ?? null,
        programCode: pipeline.program?.code ?? null,
        campusId: pipeline.campus?.id ?? null,
        campusCode: pipeline.campus?.code ?? null,
        courseId: pipeline.course?.id ?? null,
        courseShortname: pipeline.course?.shortname ?? null,
        questionnaireVersionId: pipeline.questionnaireVersion?.id ?? null,
      },
      coverage: {
        totalEnrolled,
        submissionCount,
        commentCount,
        responseRate,
        lastEnrollmentSyncAt: lastEnrollmentSyncAt?.toISOString() || null,
      },
      stages: {
        embeddings: buildStage(
          this.getEmbeddingStageStatus(pipeline, sentimentRun),
          null,
        ),
        sentiment: sentimentRun
          ? buildStage(getRunStatus(sentimentRun), sentimentRun, {
              current: Math.min(
                sentimentCompleted,
                sentimentRun.submissionCount,
              ),
              total: sentimentRun.submissionCount,
            })
          : buildStage('pending', null),
        sentimentGate: {
          ...buildStage(gateStatus, null),
          included: pipeline.sentimentGateIncluded ?? null,
          excluded: pipeline.sentimentGateExcluded ?? null,
        },
        topicModeling: buildStage(getRunStatus(topicModelRun), topicModelRun),
        recommendations: buildStage(
          getRunStatus(recommendationRun),
          recommendationRun,
        ),
      },
      warnings,
      errorMessage: pipeline.errorMessage ?? null,
      // Intent signal for future error categorization — currently equivalent to status === FAILED
      retryable: pipeline.status === PipelineStatus.FAILED,
      createdAt: pipeline.createdAt.toISOString(),
      updatedAt: pipeline.updatedAt.toISOString(),
      confirmedAt: pipeline.confirmedAt?.toISOString() || null,
      completedAt: pipeline.completedAt?.toISOString() || null,
    };
  }

  async CancelPipeline(pipelineId: string): Promise<AnalysisPipeline> {
    const fork = this.em.fork();
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId, {
      populate: SUMMARY_POPULATE,
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    // Scope check BEFORE setting CANCELLED / flushing — foreign callers must
    // not mutate pipeline state.
    await this.assertCanAccessPipeline(pipeline);

    if (TERMINAL_STATUSES.includes(pipeline.status)) {
      throw new BadRequestException(
        `Pipeline is already in terminal status "${pipeline.status}"`,
      );
    }

    pipeline.status = PipelineStatus.CANCELLED;
    await fork.flush();

    this.logger.log(`Pipeline ${pipelineId} cancelled`);
    return pipeline;
  }

  async OnStageFailed(
    pipelineId: string,
    stage: string,
    error: string,
  ): Promise<void> {
    const fork = this.em.fork();
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId);

    if (!pipeline || TERMINAL_STATUSES.includes(pipeline.status)) return;

    pipeline.status = PipelineStatus.FAILED;
    pipeline.errorMessage = `${stage}: ${error}`;
    await fork.flush();

    this.logger.error(`Pipeline ${pipelineId} failed at ${stage}: ${error}`);
  }

  // --- Scope Authorization (FAC-132) ---

  private async assertCanCreatePipeline(
    input: CreatePipelineInput,
  ): Promise<CreatePipelineInput> {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return input;
    }

    // Roles are not mutually exclusive — a Moodle user provisioned as
    // DEAN is typically also FACULTY. Try the scoped roles in order of
    // precedence; the catch-all `throw` at the bottom rejects users who
    // have ONLY FACULTY/STUDENT (or no recognized role).
    //
    // Auto-fill rule: if the caller has exactly ONE assigned scope on
    // their axis and didn't specify one explicitly, fill it in. This
    // closes the UX gap where the dashboard's PipelineTriggerCard only
    // knows {semesterId}. Multi-scope users still get 400 — they need to
    // pick (future picker UI).

    if (user.roles.includes(UserRole.DEAN)) {
      let departmentId = input.departmentId;
      const allowed = await this.scopeResolver.ResolveDepartmentIds(
        input.semesterId,
      );
      if (!departmentId) {
        if (allowed === null) {
          return input; // SUPER_ADMIN-equivalent, won't normally hit
        }
        if (allowed.length === 0) {
          throw new ForbiddenException(
            'No departments assigned to your account for this semester',
          );
        }
        if (allowed.length === 1) {
          departmentId = allowed[0];
        } else {
          throw new BadRequestException(
            'Multiple departments assigned — please specify departmentId',
          );
        }
      } else if (allowed !== null && !allowed.includes(departmentId)) {
        throw new ForbiddenException('scope not in your assigned access');
      }
      return { ...input, departmentId };
    }

    if (user.roles.includes(UserRole.CHAIRPERSON)) {
      let programId = input.programId;
      const allowed = await this.scopeResolver.ResolveProgramIds(
        input.semesterId,
      );
      if (!programId) {
        if (allowed === null) {
          return input;
        }
        if (allowed.length === 0) {
          throw new ForbiddenException(
            'No programs assigned to your account for this semester',
          );
        }
        if (allowed.length === 1) {
          programId = allowed[0];
        } else {
          throw new BadRequestException(
            'Multiple programs assigned — please specify programId',
          );
        }
      } else if (allowed !== null && !allowed.includes(programId)) {
        throw new ForbiddenException('scope not in your assigned access');
      }
      return { ...input, programId };
    }

    if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
      let campusId = input.campusId;
      const departmentId = input.departmentId;
      const allowedCampuses = await this.scopeResolver.ResolveCampusIds(
        input.semesterId,
      );
      if (!campusId && !departmentId) {
        if (allowedCampuses === null) {
          return input;
        }
        if (allowedCampuses.length === 0) {
          throw new ForbiddenException(
            'No campuses assigned to your account for this semester',
          );
        }
        if (allowedCampuses.length === 1) {
          campusId = allowedCampuses[0];
        } else {
          throw new BadRequestException(
            'Multiple campuses assigned — please specify campusId or departmentId',
          );
        }
      } else {
        if (
          campusId &&
          allowedCampuses !== null &&
          !allowedCampuses.includes(campusId)
        ) {
          throw new ForbiddenException('scope not in your assigned access');
        }
        if (departmentId) {
          const allowedDepts = await this.scopeResolver.ResolveDepartmentIds(
            input.semesterId,
          );
          if (allowedDepts !== null && !allowedDepts.includes(departmentId)) {
            throw new ForbiddenException('scope not in your assigned access');
          }
        }
      }
      return { ...input, campusId };
    }

    throw new ForbiddenException('scope not in your assigned access');
  }

  private async fillAndAssertListScope(query: ListPipelinesQueryInput): Promise<
    ListPipelinesQueryInput & {
      departmentIdSet?: string[];
      programIdSet?: string[];
      campusIdSet?: string[];
    }
  > {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return { ...query };
    }

    // Try scoped roles BEFORE the FACULTY auto-override — a Moodle DEAN
    // is typically also FACULTY, and the more-permissive DEAN behavior
    // must win.

    if (user.roles.includes(UserRole.DEAN)) {
      const allowed = await this.scopeResolver.ResolveDepartmentIds(
        query.semesterId,
      );
      if (allowed === null) return { ...query };
      if (query.departmentId) {
        if (!allowed.includes(query.departmentId)) {
          throw new ForbiddenException('scope not in your assigned access');
        }
        return { ...query };
      }
      return { ...query, departmentIdSet: allowed };
    }

    if (user.roles.includes(UserRole.CHAIRPERSON)) {
      const allowed = await this.scopeResolver.ResolveProgramIds(
        query.semesterId,
      );
      if (allowed === null) return { ...query };
      if (query.programId) {
        if (!allowed.includes(query.programId)) {
          throw new ForbiddenException('scope not in your assigned access');
        }
        return { ...query };
      }
      return { ...query, programIdSet: allowed };
    }

    if (user.roles.includes(UserRole.CAMPUS_HEAD)) {
      const allowed = await this.scopeResolver.ResolveCampusIds(
        query.semesterId,
      );
      if (allowed === null) return { ...query };
      if (query.campusId) {
        if (!allowed.includes(query.campusId)) {
          throw new ForbiddenException('scope not in your assigned access');
        }
        return { ...query };
      }
      return { ...query, campusIdSet: allowed };
    }

    if (user.roles.includes(UserRole.FACULTY)) {
      // Silently override any facultyId in the query to the caller's own
      // user id. Rationale: prevents enumeration of other faculty's
      // pipelines via the list endpoint — a FACULTY querying
      // `{ facultyId: 'other' }` must see their own list, not a 403
      // (which would leak the existence of the foreign faculty's pipeline).
      return { ...query, facultyId: user.id };
    }

    if (user.roles.includes(UserRole.STUDENT)) {
      throw new ForbiddenException('STUDENT cannot list analysis pipelines.');
    }

    throw new ForbiddenException('scope not in your assigned access');
  }

  private async assertCanAccessPipeline(
    pipeline: AnalysisPipeline,
  ): Promise<void> {
    const user = this.currentUserService.getOrFail();

    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return;
    }

    // Roles are not mutually exclusive (e.g. DEAN+FACULTY). Try EACH role
    // the user holds; if ANY grants access the pipeline is readable. Only
    // throw if none qualifies. The Resolve*Ids resolvers throw on roles
    // they don't recognize, so each branch is gated by an explicit role
    // membership check before invoking.

    // DEAN: pipeline must have a non-null department in the user's
    // resolved set. Null department = no filter on that axis = broader
    // than DEAN scope = SUPER_ADMIN only.
    if (user.roles.includes(UserRole.DEAN) && pipeline.department) {
      const allowed = await this.scopeResolver.ResolveDepartmentIds(
        pipeline.semester.id,
      );
      if (allowed === null || allowed.includes(pipeline.department.id)) {
        return;
      }
    }

    if (user.roles.includes(UserRole.CHAIRPERSON) && pipeline.program) {
      const allowed = await this.scopeResolver.ResolveProgramIds(
        pipeline.semester.id,
      );
      if (allowed === null || allowed.includes(pipeline.program.id)) {
        return;
      }
    }

    if (
      user.roles.includes(UserRole.CAMPUS_HEAD) &&
      (pipeline.campus || pipeline.department)
    ) {
      let campusOk = !pipeline.campus;
      let deptOk = !pipeline.department;
      if (pipeline.campus) {
        const allowedCampuses = await this.scopeResolver.ResolveCampusIds(
          pipeline.semester.id,
        );
        campusOk =
          allowedCampuses === null ||
          allowedCampuses.includes(pipeline.campus.id);
      }
      if (pipeline.department) {
        const allowedDepts = await this.scopeResolver.ResolveDepartmentIds(
          pipeline.semester.id,
        );
        deptOk =
          allowedDepts === null ||
          allowedDepts.includes(pipeline.department.id);
      }
      // Every non-null axis must be in scope.
      if (campusOk && deptOk) {
        return;
      }
    }

    // FACULTY: ownership only — the pipeline's faculty FK must match.
    if (
      user.roles.includes(UserRole.FACULTY) &&
      pipeline.faculty &&
      pipeline.faculty.id === user.id
    ) {
      return;
    }

    throw new ForbiddenException('scope not in your assigned access');
  }

  // --- Private Helpers ---

  private BuildScopeFromPipeline(pipeline: AnalysisPipeline): ScopeFilter {
    const scope: ScopeFilter = { semester: pipeline.semester.id };
    if (pipeline.faculty) scope.faculty = pipeline.faculty.id;
    if (pipeline.questionnaireVersion)
      scope.questionnaireVersion = pipeline.questionnaireVersion.id;
    if (pipeline.department) scope.department = pipeline.department.id;
    if (pipeline.program) scope.program = pipeline.program.id;
    if (pipeline.campus) scope.campus = pipeline.campus.id;
    if (pipeline.course) scope.course = pipeline.course.id;
    return scope;
  }

  private BuildCoverageWarnings(coverage: CoverageStats): string[] {
    const warnings: string[] = [];
    if (coverage.responseRate < COVERAGE_WARNINGS.MIN_RESPONSE_RATE) {
      warnings.push(
        `Response rate is ${(coverage.responseRate * 100).toFixed(1)}% (below ${COVERAGE_WARNINGS.MIN_RESPONSE_RATE * 100}% threshold).`,
      );
    }
    if (coverage.submissionCount < COVERAGE_WARNINGS.MIN_SUBMISSIONS) {
      warnings.push(
        `Only ${coverage.submissionCount} submissions (minimum recommended: ${COVERAGE_WARNINGS.MIN_SUBMISSIONS}).`,
      );
    }
    if (coverage.commentCount < COVERAGE_WARNINGS.MIN_COMMENTS) {
      warnings.push(
        `Only ${coverage.commentCount} qualitative comments (minimum recommended: ${COVERAGE_WARNINGS.MIN_COMMENTS}).`,
      );
    }
    if (coverage.lastEnrollmentSyncAt) {
      const hoursSinceSync =
        (Date.now() - coverage.lastEnrollmentSyncAt.getTime()) / 3_600_000;
      if (hoursSinceSync > COVERAGE_WARNINGS.STALE_SYNC_HOURS) {
        const daysStale = Math.floor(hoursSinceSync / 24);
        warnings.push(
          `Enrollment data may be stale (last synced ${daysStale} day${daysStale !== 1 ? 's' : ''} ago).`,
        );
      }
    }
    return warnings;
  }

  private async ComputeCoverageStats(
    em: EntityManager,
    scope: ScopeFilter,
  ): Promise<CoverageStats> {
    const submissionFilter: Record<string, unknown> = {
      semester: scope.semester,
    };
    if (scope.faculty) submissionFilter['faculty'] = scope.faculty;
    if (scope.questionnaireVersion)
      submissionFilter['questionnaireVersion'] = scope.questionnaireVersion;
    if (scope.department) submissionFilter['department'] = scope.department;
    if (scope.program) submissionFilter['program'] = scope.program;
    if (scope.campus) submissionFilter['campus'] = scope.campus;
    if (scope.course) submissionFilter['course'] = scope.course;

    const submissionCount = await em.count(
      QuestionnaireSubmission,
      submissionFilter,
    );
    const commentCount = await em.count(QuestionnaireSubmission, {
      ...submissionFilter,
      qualitativeComment: { $ne: null },
    });

    // Enrollment count for response rate — scope by courses in submission scope
    const scopedSubmissions = await em.find(
      QuestionnaireSubmission,
      submissionFilter,
      {
        fields: ['course'],
      },
    );
    const courseIdsInScope = [
      ...new Set(
        scopedSubmissions
          .map((s) => s.course?.id)
          .filter((id): id is string => !!id),
      ),
    ];

    const enrollmentFilter: Record<string, unknown> = {
      isActive: true,
    };
    if (courseIdsInScope.length > 0) {
      enrollmentFilter['course'] = { $in: courseIdsInScope };
    }

    const totalEnrolled = await em.count(Enrollment, enrollmentFilter);

    const responseRate =
      totalEnrolled > 0 ? submissionCount / totalEnrolled : 0;

    // Get last enrollment sync timestamp
    let lastEnrollmentSyncAt: Date | null = null;
    const latestEnrollment = await em.findOne(Enrollment, enrollmentFilter, {
      orderBy: { updatedAt: 'DESC' },
    });
    if (latestEnrollment) {
      lastEnrollmentSyncAt = latestEnrollment.updatedAt;
    }

    return {
      totalEnrolled,
      submissionCount,
      commentCount,
      responseRate,
      lastEnrollmentSyncAt,
    };
  }

  private async getUnembeddedSubmissions(
    em: EntityManager,
    submissionIds: string[],
  ): Promise<QuestionnaireSubmission[]> {
    if (submissionIds.length === 0) return [];

    const embeddedIds = (
      await em.find(
        SubmissionEmbedding,
        { submission: { $in: submissionIds }, deletedAt: null },
        { fields: ['submission'] },
      )
    ).map((e) => e.submission.id);

    const unembeddedIds = submissionIds.filter(
      (id) => !embeddedIds.includes(id),
    );
    if (unembeddedIds.length === 0) return [];

    return em.find(QuestionnaireSubmission, { id: { $in: unembeddedIds } });
  }

  private async dispatchSentiment(
    em: EntityManager,
    pipeline: AnalysisPipeline,
  ): Promise<void> {
    const scope = buildSubmissionScope(pipeline);
    const submissions = await em.find(QuestionnaireSubmission, {
      ...scope,
      cleanedComment: { $ne: null },
    });

    if (submissions.length === 0) {
      await this.failPipeline(
        em,
        pipeline,
        'No submissions with cleaned comments found for sentiment analysis',
      );
      return;
    }

    const run = em.create(SentimentRun, {
      pipeline,
      submissionCount: submissions.length,
      status: RunStatus.PROCESSING,
    });
    await em.flush();

    const jobId = v4();
    const envelope: BatchAnalysisJobMessage = {
      jobId,
      version: '1.0',
      type: QueueName.SENTIMENT,
      items: submissions.map((s) => ({
        submissionId: s.id,
        text: s.cleanedComment!,
      })),
      metadata: {
        pipelineId: pipeline.id,
        runId: run.id,
      },
      publishedAt: new Date().toISOString(),
    };

    batchAnalysisJobSchema.parse(envelope);

    run.jobId = jobId;
    await em.flush();

    await this.sentimentQueue.add(QueueName.SENTIMENT, envelope, {
      jobId: `${pipeline.id}--sentiment`,
      attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: env.BULLMQ_DEFAULT_BACKOFF_MS },
    });

    this.logger.log(
      `Dispatched sentiment batch job for pipeline ${pipeline.id} (${submissions.length} items)`,
    );
  }

  private async dispatchTopicModeling(
    em: EntityManager,
    pipeline: AnalysisPipeline,
    sentimentRun: SentimentRun,
  ): Promise<void> {
    // Get submissions that passed the sentiment gate
    const passingResults = await em.find(SentimentResult, {
      run: sentimentRun,
      passedTopicGate: true,
    });

    const passingSubmissionIds = passingResults.map((r) => r.submission.id);

    if (passingSubmissionIds.length === 0) {
      await this.failPipeline(
        em,
        pipeline,
        'No submissions passed the sentiment gate',
      );
      return;
    }

    // Get submissions with embeddings (use cleanedComment for topic modeling text)
    const submissions = await em.find(QuestionnaireSubmission, {
      id: { $in: passingSubmissionIds },
      cleanedComment: { $ne: null },
    });

    const embeddings = await em.find(SubmissionEmbedding, {
      submission: { $in: passingSubmissionIds },
      deletedAt: null,
    });

    const embeddingMap = new Map(
      embeddings.map((e) => [e.submission.id, e.embedding]),
    );

    const withEmbeddings = submissions.filter((s) => embeddingMap.has(s.id));

    if (withEmbeddings.length === 0) {
      await this.failPipeline(
        em,
        pipeline,
        `No submissions have embeddings (${submissions.length} passed the sentiment gate but none had embeddings)`,
      );
      return;
    }

    if (withEmbeddings.length < submissions.length) {
      this.logger.warn(
        `${submissions.length - withEmbeddings.length} of ${submissions.length} submissions lack embeddings — proceeding with ${withEmbeddings.length}`,
      );
    }

    const items = withEmbeddings.map((s) => ({
      submissionId: s.id,
      text: s.cleanedComment!,
      embedding: embeddingMap.get(s.id)!,
    }));

    const run = em.create(TopicModelRun, {
      pipeline,
      submissionCount: items.length,
      status: RunStatus.PROCESSING,
    });
    await em.flush();

    const jobId = v4();

    run.jobId = jobId;
    await em.flush();

    // Topic model payload includes embeddings alongside standard envelope fields
    const payload = {
      jobId,
      version: '1.0',
      type: QueueName.TOPIC_MODEL,
      items: items.map((i) => ({
        submissionId: i.submissionId,
        text: i.text,
        embedding: i.embedding,
      })),
      metadata: {
        pipelineId: pipeline.id,
        runId: run.id,
      },
      publishedAt: new Date().toISOString(),
    };

    await this.topicModelQueue.add(QueueName.TOPIC_MODEL, payload, {
      jobId: `${pipeline.id}--topic-model`,
      attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: env.BULLMQ_DEFAULT_BACKOFF_MS },
    });

    this.logger.log(
      `Dispatched topic model batch job for pipeline ${pipeline.id} (${items.length} items)`,
    );
  }

  async GetRecommendations(
    pipelineId: string,
  ): Promise<RecommendationsResponseDto> {
    const fork = this.em.fork();
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId, {
      populate: ['faculty', 'department', 'program', 'campus'],
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    // Populate faculty above is load-bearing for assertCanAccessPipeline's
    // ownership check — reading pipeline.faculty?.id through a reference
    // proxy without populate is fragile.
    await this.assertCanAccessPipeline(pipeline);

    const run = await fork.findOne(
      RecommendationRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' }, populate: ['actions'] },
    );

    return RecommendationsResponseDto.Map(pipelineId, run ?? null);
  }

  private async dispatchRecommendations(
    em: EntityManager,
    pipeline: AnalysisPipeline,
  ): Promise<void> {
    // Get latest runs for coverage counts
    const sentimentRun = await em.findOne(
      SentimentRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' } },
    );
    const topicModelRun = await em.findOne(
      TopicModelRun,
      { pipeline },
      { orderBy: { createdAt: 'DESC' } },
    );

    const run = em.create(RecommendationRun, {
      pipeline,
      submissionCount: pipeline.commentCount,
      sentimentCoverage: sentimentRun?.submissionCount ?? 0,
      topicCoverage: topicModelRun?.submissionCount ?? 0,
      status: RunStatus.PROCESSING,
    });
    await em.flush();

    const jobId = v4();
    const payload: RecommendationsJobMessage = recommendationsJobSchema.parse({
      jobId,
      version: '1.0',
      type: QueueName.RECOMMENDATIONS,
      metadata: {
        pipelineId: pipeline.id,
        runId: run.id,
      },
      publishedAt: new Date().toISOString(),
    });

    run.jobId = jobId;
    await em.flush();

    await this.recommendationsQueue.add(QueueName.RECOMMENDATIONS, payload, {
      jobId: `${pipeline.id}--recommendations`,
      attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: env.BULLMQ_DEFAULT_BACKOFF_MS },
    });

    this.logger.log(
      `Dispatched recommendations job for pipeline ${pipeline.id}`,
    );
  }

  private async failPipeline(
    em: EntityManager,
    pipeline: AnalysisPipeline,
    error: string,
  ): Promise<void> {
    pipeline.status = PipelineStatus.FAILED;
    pipeline.errorMessage = error;
    await em.flush();
    this.logger.error(`Pipeline ${pipeline.id} failed: ${error}`);
  }

  private getEmbeddingStageStatus(
    pipeline: AnalysisPipeline,
    sentimentRun: SentimentRun | null,
  ): 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' {
    if (pipeline.status === PipelineStatus.EMBEDDING_CHECK) {
      return 'processing';
    }
    if (pipeline.status === PipelineStatus.AWAITING_CONFIRMATION) {
      return 'pending';
    }
    if (pipeline.status === PipelineStatus.CANCELLED) {
      return 'skipped';
    }
    // If pipeline failed and never created a sentiment run, embedding is the likely failure point
    if (pipeline.status === PipelineStatus.FAILED && !sentimentRun) {
      return 'failed';
    }
    // Past embedding check (sentiment, topic modeling, recommendations, completed, or failed later)
    return 'completed';
  }
}
