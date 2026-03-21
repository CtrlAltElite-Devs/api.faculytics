/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { v4 } from 'uuid';
import { env } from 'src/configurations/env';
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
import { PipelineStatus, RunStatus } from '../enums';
import { SENTIMENT_GATE, COVERAGE_WARNINGS } from '../constants';
import { buildSubmissionScope } from '../lib/build-submission-scope';
import {
  CreatePipelineInput,
  createPipelineSchema,
} from '../dto/create-pipeline.dto';
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

@Injectable()
export class PipelineOrchestratorService {
  private readonly logger = new Logger(PipelineOrchestratorService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly analysisService: AnalysisService,
    private readonly topicLabelService: TopicLabelService,
    @InjectQueue('sentiment') private readonly sentimentQueue: Queue,
    @InjectQueue('topic-model') private readonly topicModelQueue: Queue,
    @InjectQueue('recommendations')
    private readonly recommendationsQueue: Queue,
  ) {}

  async CreatePipeline(
    dto: CreatePipelineInput,
    triggeredById: string,
  ): Promise<AnalysisPipeline> {
    const input = createPipelineSchema.parse(dto);
    const fork = this.em.fork();

    // Check for active duplicate
    const activeStatuses = Object.values(PipelineStatus).filter(
      (s) => !TERMINAL_STATUSES.includes(s),
    );

    const existingFilter: Record<string, unknown> = {
      semester: input.semesterId,
      status: { $in: activeStatuses },
    };
    if (input.facultyId) existingFilter['faculty'] = input.facultyId;
    if (input.departmentId) existingFilter['department'] = input.departmentId;
    if (input.programId) existingFilter['program'] = input.programId;
    if (input.campusId) existingFilter['campus'] = input.campusId;
    if (input.courseId) existingFilter['course'] = input.courseId;
    if (input.questionnaireVersionId)
      existingFilter['questionnaireVersion'] = input.questionnaireVersionId;

    const existingPipeline = await fork.findOne(
      AnalysisPipeline,
      existingFilter,
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

    // Generate warnings
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

    await fork.flush();

    this.logger.log(
      `Created pipeline ${pipeline.id} for semester ${input.semesterId}`,
    );
    return pipeline;
  }

  async ConfirmPipeline(pipelineId: string): Promise<AnalysisPipeline> {
    const fork = this.em.fork();
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId);

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

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
            'embedding',
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

    // Compute lastEnrollmentSyncAt by scoping through courses in submission scope
    const scope = buildSubmissionScope(pipeline);
    let lastEnrollmentSyncAt: Date | null = null;
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
        scopedSubs.map((s) => s.course?.id).filter((id): id is string => !!id),
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

    const stageStatus = (status: string, extras?: Record<string, unknown>) => ({
      status: status as
        | 'pending'
        | 'processing'
        | 'completed'
        | 'failed'
        | 'skipped',
      ...extras,
    });

    const getRunStageStatus = (
      run: SentimentRun | TopicModelRun | RecommendationRun | null,
    ) => {
      if (!run) return stageStatus('pending');
      return stageStatus(run.status.toLowerCase());
    };

    // Determine embedding stage status based on pipeline status
    const embeddingStatus = this.getEmbeddingStageStatus(pipeline);

    return {
      id: pipeline.id,
      status: pipeline.status,
      scope: {
        semester: pipeline.semester?.code || pipeline.semester?.id || '',
        department: pipeline.department?.code || null,
        faculty: pipeline.faculty?.fullName || null,
        questionnaireVersion: pipeline.questionnaireVersion?.id || null,
        program: pipeline.program?.code || null,
        campus: pipeline.campus?.code || null,
        course: pipeline.course?.shortname || null,
      },
      coverage: {
        totalEnrolled: pipeline.totalEnrolled,
        submissionCount: pipeline.submissionCount,
        commentCount: pipeline.commentCount,
        responseRate: Number(pipeline.responseRate),
        lastEnrollmentSyncAt: lastEnrollmentSyncAt?.toISOString() || null,
      },
      stages: {
        embeddings: embeddingStatus,
        sentiment: {
          ...getRunStageStatus(sentimentRun),
          total: pipeline.commentCount,
        },
        sentimentGate: stageStatus(
          pipeline.sentimentGateIncluded !== null &&
            pipeline.sentimentGateIncluded !== undefined
            ? 'completed'
            : 'pending',
          {
            included: pipeline.sentimentGateIncluded ?? null,
            excluded: pipeline.sentimentGateExcluded ?? null,
          },
        ),
        topicModeling: getRunStageStatus(topicModelRun),
        recommendations: getRunStageStatus(recommendationRun),
      },
      warnings: pipeline.warnings,
      errorMessage: pipeline.errorMessage || null,
      createdAt: pipeline.createdAt.toISOString(),
      confirmedAt: pipeline.confirmedAt?.toISOString() || null,
      completedAt: pipeline.completedAt?.toISOString() || null,
    };
  }

  async CancelPipeline(pipelineId: string): Promise<AnalysisPipeline> {
    const fork = this.em.fork();
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId);

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

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

  // --- Private Helpers ---

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
      type: 'sentiment',
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

    await this.sentimentQueue.add('sentiment', envelope, {
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
      type: 'topic-model',
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

    await this.topicModelQueue.add('topic-model', payload, {
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
    const pipeline = await fork.findOne(AnalysisPipeline, pipelineId);

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

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
      type: 'recommendations',
      metadata: {
        pipelineId: pipeline.id,
        runId: run.id,
      },
      publishedAt: new Date().toISOString(),
    });

    run.jobId = jobId;
    await em.flush();

    await this.recommendationsQueue.add('recommendations', payload, {
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

  private getEmbeddingStageStatus(pipeline: AnalysisPipeline): {
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  } {
    if (pipeline.status === PipelineStatus.EMBEDDING_CHECK) {
      return { status: 'processing' };
    }
    if (pipeline.status === PipelineStatus.AWAITING_CONFIRMATION) {
      return { status: 'pending' };
    }
    if (pipeline.status === PipelineStatus.CANCELLED) {
      return { status: 'skipped' };
    }
    // Past embedding check (sentiment, topic modeling, recommendations, completed, or failed later)
    return { status: 'completed' };
  }
}
