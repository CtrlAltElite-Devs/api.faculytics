/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { QueueName } from 'src/configurations/common/queue-names';
import { UserRole } from 'src/modules/auth/roles.enum';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { PipelineOrchestratorService } from './pipeline-orchestrator.service';
import { TopicLabelService } from './topic-label.service';
import { AnalysisService } from '../analysis.service';
import { PipelineStatus, RunStatus } from '../enums';
import { SENTIMENT_GATE } from '../constants';

describe('PipelineOrchestratorService', () => {
  let service: PipelineOrchestratorService;
  let mockFork: Record<string, jest.Mock>;
  let sentimentQueue: { add: jest.Mock };
  let topicModelQueue: { add: jest.Mock };
  let recommendationsQueue: { add: jest.Mock };
  let analyticsRefreshQueue: { add: jest.Mock };
  let mockAnalysisService: { EnqueueJob: jest.Mock };
  let mockScopeResolver: {
    ResolveDepartmentIds: jest.Mock;
    ResolveProgramIds: jest.Mock;
    ResolveCampusIds: jest.Mock;
    ResolveProgramCodes: jest.Mock;
  };
  let mockCurrentUserService: { getOrFail: jest.Mock; get: jest.Mock };

  const createMockQueue = () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  });

  const setCurrentUser = (
    id: string,
    roles: UserRole[] = [UserRole.SUPER_ADMIN],
  ) => {
    mockCurrentUserService.getOrFail.mockReturnValue({ id, roles });
  };

  beforeEach(async () => {
    mockFork = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(
          (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'new-id',
            warnings: (data.warnings as string[]) || [],
          }),
        ),
      getReference: jest
        .fn()
        .mockImplementation((_entity: unknown, id: string) => ({ id })),
      persist: jest.fn(),
      populate: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn(),
      nativeUpdate: jest.fn(),
    };

    const mockEm = {
      fork: jest.fn().mockReturnValue(mockFork),
    };

    sentimentQueue = createMockQueue();
    topicModelQueue = createMockQueue();
    recommendationsQueue = createMockQueue();
    analyticsRefreshQueue = createMockQueue();
    mockAnalysisService = {
      EnqueueJob: jest.fn().mockResolvedValue('mock-job-id'),
    };
    mockScopeResolver = {
      ResolveDepartmentIds: jest.fn().mockResolvedValue(null),
      ResolveProgramIds: jest.fn().mockResolvedValue(null),
      ResolveCampusIds: jest.fn().mockResolvedValue(null),
      ResolveProgramCodes: jest.fn().mockResolvedValue(null),
    };
    mockCurrentUserService = {
      getOrFail: jest.fn().mockReturnValue({
        id: 'user-1',
        roles: [UserRole.SUPER_ADMIN],
      }),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineOrchestratorService,
        { provide: EntityManager, useValue: mockEm },
        { provide: AnalysisService, useValue: mockAnalysisService },
        {
          provide: TopicLabelService,
          useValue: { generateLabels: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ScopeResolverService, useValue: mockScopeResolver },
        { provide: CurrentUserService, useValue: mockCurrentUserService },
        {
          provide: getQueueToken(QueueName.SENTIMENT),
          useValue: sentimentQueue,
        },
        {
          provide: getQueueToken(QueueName.TOPIC_MODEL),
          useValue: topicModelQueue,
        },
        {
          provide: getQueueToken(QueueName.RECOMMENDATIONS),
          useValue: recommendationsQueue,
        },
        {
          provide: getQueueToken(QueueName.ANALYTICS_REFRESH),
          useValue: analyticsRefreshQueue,
        },
      ],
    }).compile();

    service = module.get<PipelineOrchestratorService>(
      PipelineOrchestratorService,
    );
  });

  describe('CreatePipeline', () => {
    const dto = {
      semesterId: '550e8400-e29b-41d4-a716-446655440000',
    };
    const triggeredById = 'user-1';

    it('should return existing active pipeline instead of creating duplicate', async () => {
      const existingPipeline = {
        id: 'existing-p',
        status: PipelineStatus.AWAITING_CONFIRMATION,
      };
      mockFork.findOne.mockResolvedValueOnce(existingPipeline);

      const result = await service.CreatePipeline(dto, triggeredById);

      expect(result).toBe(existingPipeline);
      expect(mockFork.create).not.toHaveBeenCalled();
    });

    it('should create new pipeline with coverage stats', async () => {
      mockFork.findOne
        .mockResolvedValueOnce(null) // No existing pipeline
        .mockResolvedValueOnce({ updatedAt: new Date() }); // Latest enrollment
      mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]); // Scoped submissions for enrollment
      mockFork.count
        .mockResolvedValueOnce(50) // submissionCount
        .mockResolvedValueOnce(40) // commentCount
        .mockResolvedValueOnce(200); // totalEnrolled

      await service.CreatePipeline(dto, triggeredById);

      expect(mockFork.create).toHaveBeenCalled();
      expect(mockFork.flush).toHaveBeenCalled();
    });

    it('should generate warning when response rate is below threshold', async () => {
      mockFork.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ updatedAt: new Date() });
      mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]); // Scoped submissions
      mockFork.count
        .mockResolvedValueOnce(10) // submissionCount
        .mockResolvedValueOnce(8) // commentCount
        .mockResolvedValueOnce(200); // totalEnrolled (5% response rate)

      await service.CreatePipeline(dto, triggeredById);

      const createCall = mockFork.create.mock.calls[0][1] as {
        warnings: string[];
      };
      expect(createCall.warnings.length).toBeGreaterThan(0);
      expect(
        createCall.warnings.some((w: string) => w.includes('Response rate')),
      ).toBe(true);
    });

    it('should generate stale enrollment warning', async () => {
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 48); // 48 hours ago
      mockFork.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ updatedAt: staleDate });
      mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]); // Scoped submissions
      mockFork.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(40)
        .mockResolvedValueOnce(100);

      await service.CreatePipeline(dto, triggeredById);

      const createCall = mockFork.create.mock.calls[0][1] as {
        warnings: string[];
      };
      expect(createCall.warnings.some((w: string) => w.includes('stale'))).toBe(
        true,
      );
    });
  });

  describe('ConfirmPipeline', () => {
    it('should throw NotFoundException if pipeline not found', async () => {
      mockFork.findOne.mockResolvedValue(null);

      await expect(service.ConfirmPipeline('p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if not in awaiting_confirmation', async () => {
      mockFork.findOne.mockResolvedValue({
        id: 'p1',
        status: PipelineStatus.SENTIMENT_ANALYSIS,
      });

      await expect(service.ConfirmPipeline('p1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('OnSentimentComplete', () => {
    it('should apply sentiment gate and update pipeline', async () => {
      const pipeline = {
        id: 'p1',
        status: PipelineStatus.SENTIMENT_ANALYSIS,
        semester: { id: 's1' },
        warnings: [] as string[],
      };
      const sentimentRun = { id: 'r1' };
      const sentimentResults = [
        { id: 'sr1', label: 'negative', submission: { id: 's1' } },
        { id: 'sr2', label: 'positive', submission: { id: 's2' } },
        { id: 'sr3', label: 'neutral', submission: { id: 's3' } },
      ];

      mockFork.findOneOrFail.mockResolvedValue(pipeline);
      mockFork.findOne.mockResolvedValueOnce(sentimentRun);

      // First find: sentimentResults, second find: batch-loaded submissions
      mockFork.find
        .mockResolvedValueOnce(sentimentResults)
        .mockResolvedValueOnce([
          { id: 's1', qualitativeComment: 'bad experience' },
          { id: 's2', qualitativeComment: 'short' },
          { id: 's3', qualitativeComment: 'average course nothing special' },
        ]);

      try {
        await service.OnSentimentComplete('p1');
      } catch {
        // Expected if TOPIC_MODEL_WORKER_URL not configured in test env
      }

      expect(mockFork.nativeUpdate).toHaveBeenCalled();
    });

    it('should always include negative and neutral labels in gate', () => {
      expect(SENTIMENT_GATE.ALWAYS_INCLUDE_LABELS).toContain('negative');
      expect(SENTIMENT_GATE.ALWAYS_INCLUDE_LABELS).toContain('neutral');
    });

    it('should require 10 words for positive comments to pass gate', () => {
      expect(SENTIMENT_GATE.POSITIVE_MIN_WORD_COUNT).toBe(10);
    });
  });

  describe('CancelPipeline', () => {
    it('should transition non-terminal pipeline to cancelled', async () => {
      const pipeline = {
        id: 'p1',
        status: PipelineStatus.SENTIMENT_ANALYSIS,
      };
      mockFork.findOne.mockResolvedValue(pipeline);

      const result = await service.CancelPipeline('p1');

      expect(result.status).toBe(PipelineStatus.CANCELLED);
      expect(mockFork.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException if pipeline not found', async () => {
      mockFork.findOne.mockResolvedValue(null);

      await expect(service.CancelPipeline('p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if pipeline is already completed', async () => {
      mockFork.findOne.mockResolvedValue({
        id: 'p1',
        status: PipelineStatus.COMPLETED,
      });

      await expect(service.CancelPipeline('p1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if pipeline is already failed', async () => {
      mockFork.findOne.mockResolvedValue({
        id: 'p1',
        status: PipelineStatus.FAILED,
      });

      await expect(service.CancelPipeline('p1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if pipeline is already cancelled', async () => {
      mockFork.findOne.mockResolvedValue({
        id: 'p1',
        status: PipelineStatus.CANCELLED,
      });

      await expect(service.CancelPipeline('p1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('OnStageFailed', () => {
    it('should transition pipeline to failed with error message', async () => {
      const pipeline = {
        id: 'p1',
        status: PipelineStatus.SENTIMENT_ANALYSIS,
        errorMessage: undefined as string | undefined,
      };
      mockFork.findOne.mockResolvedValue(pipeline);

      await service.OnStageFailed('p1', 'sentiment_analysis', 'Worker crashed');

      expect(pipeline.status).toBe(PipelineStatus.FAILED);
      expect(pipeline.errorMessage).toBe('sentiment_analysis: Worker crashed');
      expect(mockFork.flush).toHaveBeenCalled();
    });

    it('should not transition if pipeline is already terminal', async () => {
      const pipeline = {
        id: 'p1',
        status: PipelineStatus.COMPLETED,
      };
      mockFork.findOne.mockResolvedValue(pipeline);

      await service.OnStageFailed('p1', 'test', 'error');

      expect(pipeline.status).toBe(PipelineStatus.COMPLETED);
    });
  });

  describe('OnRecommendationsComplete', () => {
    it('should transition pipeline to completed', async () => {
      const pipeline = {
        id: 'p1',
        status: PipelineStatus.GENERATING_RECOMMENDATIONS,
        completedAt: undefined as Date | undefined,
      };
      mockFork.findOneOrFail.mockResolvedValue(pipeline);

      await service.OnRecommendationsComplete('p1');

      expect(pipeline.status).toBe(PipelineStatus.COMPLETED);
      expect(pipeline.completedAt).toBeDefined();
      expect(mockFork.flush).toHaveBeenCalled();
    });

    it('should enqueue analytics refresh job after recommendations complete', async () => {
      const pipeline = {
        id: 'p1',
        status: PipelineStatus.GENERATING_RECOMMENDATIONS,
        completedAt: undefined as Date | undefined,
      };
      mockFork.findOneOrFail.mockResolvedValue(pipeline);

      await service.OnRecommendationsComplete('p1');

      expect(analyticsRefreshQueue.add).toHaveBeenCalledWith(
        'analytics-refresh',
        { pipelineId: 'p1' },
        expect.objectContaining({
          jobId: 'p1--analytics-refresh',
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('should not fail pipeline if analytics refresh enqueue fails', async () => {
      const pipeline = {
        id: 'p1',
        status: PipelineStatus.GENERATING_RECOMMENDATIONS,
        completedAt: undefined as Date | undefined,
      };
      mockFork.findOneOrFail.mockResolvedValue(pipeline);
      analyticsRefreshQueue.add.mockRejectedValueOnce(
        new Error('Redis connection lost'),
      );

      await service.OnRecommendationsComplete('p1');

      expect(pipeline.status).toBe(PipelineStatus.COMPLETED);
      expect(pipeline.completedAt).toBeDefined();
    });
  });

  describe('GetRecommendations', () => {
    it('should return completed recommendations with mapped DTO', async () => {
      const pipeline = { id: 'p1' };
      const run = {
        id: 'r1',
        status: RunStatus.COMPLETED,
        completedAt: new Date('2026-03-17'),
        actions: {
          getItems: () => [
            {
              id: 'a1',
              category: 'STRENGTH',
              headline: 'Great Teaching',
              description: 'Students love it.',
              actionPlan: 'Keep going.',
              priority: 'HIGH',
              supportingEvidence: {
                sources: [],
                confidenceLevel: 'HIGH',
                basedOnSubmissions: 50,
              },
              createdAt: new Date('2026-03-17'),
            },
          ],
        },
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(run);

      const result = await service.GetRecommendations('p1');

      expect(result.pipelineId).toBe('p1');
      expect(result.runId).toBe('r1');
      expect(result.status).toBe(RunStatus.COMPLETED);
      expect(result.actions.length).toBe(1);
      expect(result.actions[0].headline).toBe('Great Teaching');
    });

    it('should throw NotFoundException when pipeline not found', async () => {
      mockFork.findOne.mockResolvedValue(null);

      await expect(service.GetRecommendations('p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return PENDING status with empty actions when no completed run', async () => {
      const pipeline = { id: 'p1' };
      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(null);

      const result = await service.GetRecommendations('p1');

      expect(result.status).toBe(RunStatus.PENDING);
      expect(result.actions).toEqual([]);
      expect(result.runId).toBeNull();
    });

    it('should return run status with empty actions when run exists but not completed', async () => {
      const pipeline = { id: 'p1' };
      const run = { id: 'r1', status: RunStatus.PROCESSING };
      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(run);

      const result = await service.GetRecommendations('p1');

      expect(result.runId).toBe('r1');
      expect(result.actions).toEqual([]);
      expect(result.completedAt).toBeNull();
    });
  });

  describe('GetPipelineStatus', () => {
    const basePipeline = {
      id: 'p1',
      status: PipelineStatus.SENTIMENT_ANALYSIS,
      semester: { id: 's1', code: 'S2026' },
      faculty: null,
      questionnaireVersion: null,
      department: { code: 'CCS' },
      program: null,
      campus: null,
      course: null,
      totalEnrolled: 100,
      submissionCount: 50,
      commentCount: 40,
      responseRate: 0.5,
      warnings: [],
      errorMessage: null,
      sentimentGateIncluded: null,
      sentimentGateExcluded: null,
      createdAt: new Date('2026-03-13'),
      updatedAt: new Date('2026-03-13T12:00:00Z'),
      confirmedAt: new Date('2026-03-13'),
      completedAt: null,
    };

    const sentimentRunCreatedAt = new Date('2026-03-13T10:00:00Z');

    it('should throw NotFoundException if pipeline not found', async () => {
      mockFork.findOne.mockResolvedValue(null);

      await expect(service.GetPipelineStatus('p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return reshaped pipeline status with progress and timestamps', async () => {
      const pipeline = { ...basePipeline };
      const sentimentRun = {
        status: RunStatus.PROCESSING,
        submissionCount: 120,
        createdAt: sentimentRunCreatedAt,
        completedAt: null,
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(sentimentRun) // sentiment run
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null) // recommendation run
        .mockResolvedValueOnce({ updatedAt: new Date() }); // enrollment for lastSyncAt

      // count: sentiment results
      mockFork.count.mockResolvedValueOnce(47);

      // find: submissions for course scoping
      mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.id).toBe('p1');
      expect(status.status).toBe(PipelineStatus.SENTIMENT_ANALYSIS);
      // TD-9 (FAC-132): scope is paired IDs + display values.
      expect(status.scope.semesterId).toBe('s1');
      expect(status.scope.semesterCode).toBe('S2026');
      expect(status.scope.departmentCode).toBe('CCS');
      expect(status.coverage.totalEnrolled).toBe(100);
      expect(status.updatedAt).toBe('2026-03-13T12:00:00.000Z');

      // Sentiment stage: real progress
      expect(status.stages.sentiment.status).toBe('processing');
      expect(status.stages.sentiment.progress).toEqual({
        current: 47,
        total: 120,
      });
      expect(status.stages.sentiment.startedAt).toBe(
        sentimentRunCreatedAt.toISOString(),
      );
      expect(status.stages.sentiment.completedAt).toBeNull();

      // Binary stages: null progress
      expect(status.stages.topicModeling.status).toBe('pending');
      expect(status.stages.topicModeling.progress).toBeNull();
      expect(status.stages.embeddings.progress).toBeNull();
      expect(status.stages.recommendations.progress).toBeNull();

      // All stage fields present (no undefined)
      for (const stage of Object.values(status.stages)) {
        expect(stage).toHaveProperty('status');
        expect(stage).toHaveProperty('progress');
        expect(stage).toHaveProperty('startedAt');
        expect(stage).toHaveProperty('completedAt');
      }
    });

    it('should return retryable: true when pipeline FAILED', async () => {
      const pipeline = {
        ...basePipeline,
        status: PipelineStatus.FAILED,
        errorMessage: 'Worker crashed',
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(null) // sentiment run
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null); // recommendation run

      // find: submissions for course scoping (no courses)
      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.retryable).toBe(true);
    });

    it('should return retryable: false when pipeline not FAILED', async () => {
      const pipeline = { ...basePipeline, status: PipelineStatus.COMPLETED };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(null) // sentiment run
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null); // recommendation run

      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.retryable).toBe(false);
    });

    it('should return sentiment progress.current matching result count', async () => {
      const pipeline = { ...basePipeline };
      const sentimentRun = {
        status: RunStatus.PROCESSING,
        submissionCount: 120,
        createdAt: sentimentRunCreatedAt,
        completedAt: null,
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(sentimentRun)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      mockFork.count.mockResolvedValueOnce(47);
      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.stages.sentiment.progress).toEqual({
        current: 47,
        total: 120,
      });
    });

    it('should return zero progress when sentiment run is PROCESSING with no results yet', async () => {
      const pipeline = { ...basePipeline };
      const sentimentRun = {
        status: RunStatus.PROCESSING,
        submissionCount: 80,
        createdAt: sentimentRunCreatedAt,
        completedAt: null,
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(sentimentRun)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      mockFork.count.mockResolvedValueOnce(0);
      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.stages.sentiment.progress).toEqual({
        current: 0,
        total: 80,
      });
    });

    it('should return skipped stages and retryable: false for CANCELLED pipeline', async () => {
      const pipeline = {
        ...basePipeline,
        status: PipelineStatus.CANCELLED,
        sentimentGateIncluded: null,
        sentimentGateExcluded: null,
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(null) // sentiment run
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null); // recommendation run

      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.retryable).toBe(false);
      expect(status.stages.embeddings.status).toBe('skipped');
      expect(status.stages.sentimentGate.status).toBe('skipped');
    });

    it('should return embeddings failed when pipeline FAILED with no sentiment run', async () => {
      const pipeline = {
        ...basePipeline,
        status: PipelineStatus.FAILED,
        errorMessage: 'Embedding check failed',
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(null) // sentiment run (none = embedding likely failed)
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null); // recommendation run

      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.stages.embeddings.status).toBe('failed');
    });

    it('should recompute coverage stats for AWAITING_CONFIRMATION pipelines', async () => {
      // Pipeline was created with a stale snapshot (200 submissions, 205 enrolled).
      // By the time GetPipelineStatus is called, more submissions have arrived.
      const pipeline = {
        ...basePipeline,
        status: PipelineStatus.AWAITING_CONFIRMATION,
        totalEnrolled: 205,
        submissionCount: 200,
        commentCount: 150,
        responseRate: 200 / 205,
        warnings: ['Only 200 submissions (minimum recommended: 30).'],
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline) // pipeline lookup
        .mockResolvedValueOnce(null) // sentiment run
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null) // recommendation run
        .mockResolvedValueOnce({ updatedAt: new Date() }); // latest enrollment in ComputeCoverageStats

      // ComputeCoverageStats flow: count submissions, count comments, find
      // scoped submissions for course ids, count enrollments.
      mockFork.count
        .mockResolvedValueOnce(520) // fresh submissionCount
        .mockResolvedValueOnce(410) // fresh commentCount
        .mockResolvedValueOnce(600); // fresh totalEnrolled
      mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]);

      const status = await service.GetPipelineStatus('p1');

      // Fresh values, not the stale snapshot
      expect(status.coverage.submissionCount).toBe(520);
      expect(status.coverage.totalEnrolled).toBe(600);
      expect(status.coverage.commentCount).toBe(410);
      expect(status.coverage.responseRate).toBeCloseTo(520 / 600, 5);

      // Pipeline entity was mutated with fresh values and flushed
      expect(pipeline.submissionCount).toBe(520);
      expect(pipeline.totalEnrolled).toBe(600);
      expect(mockFork.flush).toHaveBeenCalled();

      // Stale "Only 200 submissions" warning is replaced with fresh warnings
      expect(
        status.warnings.some((w) => w.includes('Only 200 submissions')),
      ).toBe(false);
    });

    it('should use stored coverage snapshot for confirmed pipelines', async () => {
      const pipeline = {
        ...basePipeline,
        status: PipelineStatus.SENTIMENT_ANALYSIS,
        totalEnrolled: 205,
        submissionCount: 200,
        commentCount: 150,
        responseRate: 200 / 205,
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // No scoped submissions → no fresh recompute; stored snapshot wins
      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.coverage.submissionCount).toBe(200);
      expect(status.coverage.totalEnrolled).toBe(205);
      // ComputeCoverageStats should NOT have been invoked (no count calls)
      expect(mockFork.count).not.toHaveBeenCalled();
    });

    it('should return sentiment gate included/excluded with completed status', async () => {
      const pipeline = {
        ...basePipeline,
        status: PipelineStatus.TOPIC_MODELING,
        sentimentGateIncluded: 80,
        sentimentGateExcluded: 40,
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce(null) // sentiment run
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null); // recommendation run

      mockFork.find.mockResolvedValueOnce([]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.stages.sentimentGate.status).toBe('completed');
      expect(status.stages.sentimentGate.included).toBe(80);
      expect(status.stages.sentimentGate.excluded).toBe(40);
    });
  });

  // FAC-132: service-layer scope authorization matrix. Guard behavior is
  // covered by roles.guard.spec.ts; these tests cover the orchestrator's
  // own scope checks (belt-and-braces + scope-filter validation).
  describe('scope authorization', () => {
    const semesterId = '550e8400-e29b-41d4-a716-446655440000';
    const deptA = '11111111-1111-4111-8111-111111111111';
    const deptA2 = '11111111-1111-4111-8111-111111111112';
    const deptB = '22222222-2222-4222-8222-222222222222';
    const progA = '33333333-3333-4333-8333-333333333333';
    const progB = '44444444-4444-4444-8444-444444444444';
    const campusX = '55555555-5555-4555-8555-555555555555';
    const facultyOneId = '66666666-6666-4666-8666-666666666666';
    const facultyTwoId = '77777777-7777-4777-8777-777777777777';

    const primeCoverageMocks = () => {
      mockFork.findOne
        .mockResolvedValueOnce(null) // existing active duplicate
        .mockResolvedValueOnce({ updatedAt: new Date() }); // latest enrollment
      mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]);
      mockFork.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(40)
        .mockResolvedValueOnce(200);
    };

    describe('CreatePipeline', () => {
      it('SUPER_ADMIN: creates with semesterId only (no scope filter)', async () => {
        setCurrentUser('admin-1', [UserRole.SUPER_ADMIN]);
        primeCoverageMocks();

        await service.CreatePipeline({ semesterId }, 'admin-1');

        expect(mockFork.create).toHaveBeenCalled();
      });

      it('DEAN with multiple departments: 400 when scope filter absent', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([
          deptA,
          deptA2,
        ]);

        await expect(
          service.CreatePipeline({ semesterId }, 'dean-1'),
        ).rejects.toThrow(BadRequestException);
        expect(mockFork.create).not.toHaveBeenCalled();
      });

      // UX gap: dashboard's PipelineTriggerCard only knows {semesterId}.
      // For a single-dept DEAN the service auto-fills the dept so
      // "Run Analysis" works without a picker UI.
      it('DEAN with single department: auto-fills departmentId when omitted', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([deptA]);
        primeCoverageMocks();

        await service.CreatePipeline({ semesterId }, 'dean-1');

        expect(mockFork.create).toHaveBeenCalled();
        // Verify the auto-filled departmentId reaches the entity factory
        const createPayload = mockFork.create.mock.calls[0][1] as {
          department?: { id: string };
        };
        expect(createPayload.department?.id).toBe(deptA);
      });

      it('DEAN: creates with own departmentId', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([deptA]);
        primeCoverageMocks();

        await service.CreatePipeline(
          { semesterId, departmentId: deptA },
          'dean-1',
        );

        expect(mockFork.create).toHaveBeenCalled();
      });

      // Regression: Moodle DEAN users are typically also FACULTY. The
      // service must treat them as DEAN for create purposes — the FACULTY
      // role on the same user must NOT short-circuit to a 403.
      it('DEAN+FACULTY: creates with own departmentId (multi-role precedence)', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN, UserRole.FACULTY]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([deptA]);
        primeCoverageMocks();

        await service.CreatePipeline(
          { semesterId, departmentId: deptA },
          'dean-1',
        );

        expect(mockFork.create).toHaveBeenCalled();
      });

      it('DEAN: 403 with foreign departmentId', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([deptA]);

        await expect(
          service.CreatePipeline({ semesterId, departmentId: deptB }, 'dean-1'),
        ).rejects.toThrow(ForbiddenException);
        expect(mockFork.create).not.toHaveBeenCalled();
      });

      it('CHAIRPERSON: creates with own programId', async () => {
        setCurrentUser('chair-1', [UserRole.CHAIRPERSON]);
        mockScopeResolver.ResolveProgramIds.mockResolvedValue([progA]);
        primeCoverageMocks();

        await service.CreatePipeline(
          { semesterId, programId: progA },
          'chair-1',
        );

        expect(mockFork.create).toHaveBeenCalled();
      });

      it('CHAIRPERSON: 403 with foreign programId', async () => {
        setCurrentUser('chair-1', [UserRole.CHAIRPERSON]);
        mockScopeResolver.ResolveProgramIds.mockResolvedValue([progA]);

        await expect(
          service.CreatePipeline({ semesterId, programId: progB }, 'chair-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('CAMPUS_HEAD: creates with own campusId', async () => {
        setCurrentUser('head-1', [UserRole.CAMPUS_HEAD]);
        mockScopeResolver.ResolveCampusIds.mockResolvedValue([campusX]);
        primeCoverageMocks();

        await service.CreatePipeline(
          { semesterId, campusId: campusX },
          'head-1',
        );

        expect(mockFork.create).toHaveBeenCalled();
      });

      it('CAMPUS_HEAD: 403 with foreign-campus departmentId', async () => {
        setCurrentUser('head-1', [UserRole.CAMPUS_HEAD]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([deptA]);

        await expect(
          service.CreatePipeline({ semesterId, departmentId: deptB }, 'head-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('FACULTY: 403 at service layer even without guard (AC-2a)', async () => {
        setCurrentUser(facultyOneId, [UserRole.FACULTY]);

        await expect(
          service.CreatePipeline(
            { semesterId, facultyId: facultyOneId },
            facultyOneId,
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(mockFork.create).not.toHaveBeenCalled();
        expect(mockFork.flush).not.toHaveBeenCalled();
      });

      it('STUDENT: 403 at service layer', async () => {
        setCurrentUser('stu-1', [UserRole.STUDENT]);

        await expect(
          service.CreatePipeline({ semesterId }, 'stu-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('race handling: UniqueConstraintViolationException → returns winner', async () => {
        setCurrentUser('admin-1', [UserRole.SUPER_ADMIN]);
        const winner = {
          id: 'winner-p',
          status: PipelineStatus.AWAITING_CONFIRMATION,
        };
        // First findOne = no existing duplicate. flush throws. Second findOne
        // (re-fetch in the catch) returns the winner.
        mockFork.findOne
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ updatedAt: new Date() }) // enrollment for coverage
          .mockResolvedValueOnce(winner); // re-fetch after unique violation
        mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]);
        mockFork.count
          .mockResolvedValueOnce(50)
          .mockResolvedValueOnce(40)
          .mockResolvedValueOnce(200);
        mockFork.flush.mockRejectedValueOnce(
          new UniqueConstraintViolationException(
            new Error('duplicate key'),
            // @ts-expect-error — constructor accepts optional query info
            undefined,
          ),
        );

        const result = await service.CreatePipeline({ semesterId }, 'admin-1');

        expect(result).toBe(winner);
      });
    });

    describe('ListPipelines', () => {
      it('SUPER_ADMIN: returns unfiltered', async () => {
        setCurrentUser('admin-1', [UserRole.SUPER_ADMIN]);
        mockFork.find.mockResolvedValueOnce([]);

        await service.ListPipelines({ semesterId });

        expect(mockFork.find).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ semester: semesterId }),
          expect.anything(),
        );
      });

      it('DEAN: fills departmentIds IN-filter when departmentId omitted', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([
          deptA,
          deptA2,
        ]);
        mockFork.find.mockResolvedValueOnce([]);

        await service.ListPipelines({ semesterId });

        const filter = mockFork.find.mock.calls[0][1] as Record<
          string,
          unknown
        >;
        expect(filter).toEqual(
          expect.objectContaining({
            semester: semesterId,
            department: { $in: [deptA, deptA2] },
          }),
        );
      });

      it('DEAN: 403 with foreign departmentId', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([deptA]);

        await expect(
          service.ListPipelines({ semesterId, departmentId: deptB }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('FACULTY: silently overrides facultyId to own id', async () => {
        setCurrentUser(facultyOneId, [UserRole.FACULTY]);
        mockFork.find.mockResolvedValueOnce([]);

        await service.ListPipelines({ semesterId, facultyId: facultyTwoId });

        const filter = mockFork.find.mock.calls[0][1] as Record<
          string,
          unknown
        >;
        expect(filter).toEqual(
          expect.objectContaining({
            semester: semesterId,
            faculty: facultyOneId,
          }),
        );
      });

      it('STUDENT: 403', async () => {
        setCurrentUser('stu-1', [UserRole.STUDENT]);

        await expect(service.ListPipelines({ semesterId })).rejects.toThrow(
          ForbiddenException,
        );
      });
    });

    describe('assertCanAccessPipeline (via GetPipelineStatus / GetRecommendations)', () => {
      const facultyId = facultyOneId;
      const makePipeline = (overrides: Record<string, unknown> = {}) => ({
        id: 'p1',
        status: PipelineStatus.COMPLETED,
        semester: { id: semesterId, code: 'S2026' },
        faculty: null,
        department: null,
        program: null,
        campus: null,
        course: null,
        questionnaireVersion: null,
        totalEnrolled: 100,
        submissionCount: 50,
        commentCount: 40,
        responseRate: 0.5,
        warnings: [],
        errorMessage: null,
        sentimentGateIncluded: null,
        sentimentGateExcluded: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        confirmedAt: new Date(),
        completedAt: new Date(),
        ...overrides,
      });

      it('SUPER_ADMIN: reads any pipeline (foreign faculty / foreign dept) — AC-5a', async () => {
        setCurrentUser('admin-1', [UserRole.SUPER_ADMIN]);
        const pipeline = makePipeline({
          faculty: { id: facultyTwoId, fullName: 'Foreign' },
          department: { id: deptB, code: 'FRG' },
        });
        mockFork.findOne
          .mockResolvedValueOnce(pipeline)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);
        mockFork.find.mockResolvedValueOnce([]);

        const status = await service.GetPipelineStatus('p1');
        expect(status.id).toBe('p1');
      });

      it('FACULTY reads own pipeline — success', async () => {
        setCurrentUser(facultyId, [UserRole.FACULTY]);
        const pipeline = makePipeline({
          faculty: { id: facultyId, fullName: 'Me' },
        });
        mockFork.findOne
          .mockResolvedValueOnce(pipeline)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);
        mockFork.find.mockResolvedValueOnce([]);

        const status = await service.GetPipelineStatus('p1');
        expect(status.id).toBe('p1');
      });

      it('FACULTY reads foreign-faculty pipeline — 403', async () => {
        setCurrentUser(facultyId, [UserRole.FACULTY]);
        const pipeline = makePipeline({
          faculty: { id: facultyTwoId, fullName: 'Other' },
        });
        mockFork.findOne.mockResolvedValueOnce(pipeline);

        await expect(service.GetPipelineStatus('p1')).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('FACULTY reads department-scoped pipeline (null faculty FK) — 403', async () => {
        setCurrentUser(facultyId, [UserRole.FACULTY]);
        const pipeline = makePipeline({
          faculty: null,
          department: { id: deptA, code: 'CCS' },
        });
        mockFork.findOne.mockResolvedValueOnce(pipeline);

        await expect(service.GetPipelineStatus('p1')).rejects.toThrow(
          ForbiddenException,
        );
      });

      // AC-17: `findOne` returning null must surface 404 BEFORE any scope
      // check runs. A DEAN with an out-of-scope-but-nonexistent pipeline id
      // must see 404, not 403.
      it('AC-17: 404 precedes 403 on missing pipeline id for a scoped role', async () => {
        setCurrentUser('dean-1', [UserRole.DEAN]);
        mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([deptA]);
        mockFork.findOne.mockResolvedValueOnce(null);

        await expect(service.GetPipelineStatus('p1')).rejects.toThrow(
          NotFoundException,
        );
        // Scope resolver must not have been consulted — 404 short-circuits
        // before assertCanAccessPipeline runs.
        expect(mockScopeResolver.ResolveDepartmentIds).not.toHaveBeenCalled();
      });
    });
  });
});
