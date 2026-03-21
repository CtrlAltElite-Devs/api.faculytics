/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { QueueName } from 'src/configurations/common/queue-names';
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
  let mockAnalysisService: { EnqueueJob: jest.Mock };

  const createMockQueue = () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  });

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
      flush: jest.fn(),
      nativeUpdate: jest.fn(),
    };

    const mockEm = {
      fork: jest.fn().mockReturnValue(mockFork),
    };

    sentimentQueue = createMockQueue();
    topicModelQueue = createMockQueue();
    recommendationsQueue = createMockQueue();
    mockAnalysisService = {
      EnqueueJob: jest.fn().mockResolvedValue('mock-job-id'),
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
    it('should throw NotFoundException if pipeline not found', async () => {
      mockFork.findOne.mockResolvedValue(null);

      await expect(service.GetPipelineStatus('p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return composed pipeline status', async () => {
      const pipeline = {
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
        confirmedAt: new Date('2026-03-13'),
        completedAt: null,
      };

      mockFork.findOne
        .mockResolvedValueOnce(pipeline)
        .mockResolvedValueOnce({ status: RunStatus.PROCESSING })
        .mockResolvedValueOnce(null) // topic model run
        .mockResolvedValueOnce(null) // recommendation run
        .mockResolvedValueOnce({ updatedAt: new Date() }); // enrollment for lastSyncAt

      // find: submissions for course scoping
      mockFork.find.mockResolvedValueOnce([{ course: { id: 'c1' } }]);

      const status = await service.GetPipelineStatus('p1');

      expect(status.id).toBe('p1');
      expect(status.status).toBe(PipelineStatus.SENTIMENT_ANALYSIS);
      expect(status.scope.semester).toBe('S2026');
      expect(status.scope.department).toBe('CCS');
      expect(status.coverage.totalEnrolled).toBe(100);
      expect(status.stages.sentiment.status).toBe('processing');
      expect(status.stages.topicModeling.status).toBe('pending');
    });
  });
});
