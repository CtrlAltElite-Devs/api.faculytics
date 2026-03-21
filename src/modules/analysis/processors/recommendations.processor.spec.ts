/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { RecommendationsProcessor } from './recommendations.processor';
import { RecommendationGenerationService } from '../services/recommendation-generation.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { env } from 'src/configurations/env';
import { type RecommendationsJobMessage } from '../dto/recommendations.dto';
import { Job } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { RunStatus } from '../enums';

const createMockJob = (): Job<RecommendationsJobMessage> =>
  ({
    id: 'p1--recommendations',
    queueName: QueueName.RECOMMENDATIONS,
    attemptsMade: 1,
    opts: { attempts: 3 },
    data: {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      version: '1.0',
      type: QueueName.RECOMMENDATIONS,
      metadata: { pipelineId: 'p1', runId: 'r1' },
      publishedAt: '2026-03-12T00:00:00.000Z',
    },
  }) as unknown as Job<RecommendationsJobMessage>;

describe('RecommendationsProcessor', () => {
  let processor: RecommendationsProcessor;
  let mockFork: {
    findOneOrFail: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    flush: jest.Mock;
  };
  let mockGenerationService: { Generate: jest.Mock };
  let mockOrchestrator: {
    OnRecommendationsComplete: jest.Mock;
    OnStageFailed: jest.Mock;
  };

  beforeEach(async () => {
    mockFork = {
      findOneOrFail: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((_entity, data) => ({ ...data, id: 'new-id' })),
      flush: jest.fn(),
    };

    const mockEm = { fork: jest.fn().mockReturnValue(mockFork) };

    mockGenerationService = {
      Generate: jest.fn().mockResolvedValue([]),
    };

    mockOrchestrator = {
      OnRecommendationsComplete: jest.fn().mockResolvedValue(undefined),
      OnStageFailed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: RecommendationsProcessor,
          useFactory: () =>
            new RecommendationsProcessor(
              mockEm as unknown as EntityManager,
              mockGenerationService as unknown as RecommendationGenerationService,
              mockOrchestrator as unknown as PipelineOrchestratorService,
            ),
        },
      ],
    }).compile();

    processor = module.get<RecommendationsProcessor>(RecommendationsProcessor);
  });

  describe('process', () => {
    it('should call Generate with correct pipelineId and runId', async () => {
      const mockRun = { id: 'r1', status: RunStatus.PROCESSING };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockJob();
      await processor.process(job);

      expect(mockGenerationService.Generate).toHaveBeenCalledWith('p1');
    });

    it('should persist RecommendedAction entities with all new fields', async () => {
      const mockRun = { id: 'r1', status: RunStatus.PROCESSING };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      mockGenerationService.Generate.mockResolvedValue([
        {
          category: 'STRENGTH',
          headline: 'Great Teaching',
          description: 'Students love it.',
          actionPlan: 'Keep going.',
          priority: 'HIGH',
          supportingEvidence: {
            sources: [{ type: 'dimension_scores', scores: [] }],
            confidenceLevel: 'HIGH',
            basedOnSubmissions: 50,
          },
        },
        {
          category: 'IMPROVEMENT',
          headline: 'Update Materials',
          description: 'Materials are outdated.',
          actionPlan: 'Refresh content.',
          priority: 'MEDIUM',
          supportingEvidence: {
            sources: [{ type: 'dimension_scores', scores: [] }],
            confidenceLevel: 'MEDIUM',
            basedOnSubmissions: 50,
          },
        },
      ]);

      const job = createMockJob();
      await processor.process(job);

      expect(mockFork.create).toHaveBeenCalledTimes(2);

      const firstCall = mockFork.create.mock.calls[0][1];
      expect(firstCall.category).toBe('STRENGTH');
      expect(firstCall.headline).toBe('Great Teaching');
      expect(firstCall.description).toBe('Students love it.');
      expect(firstCall.actionPlan).toBe('Keep going.');
      expect(firstCall.priority).toBe('HIGH');
      expect(firstCall.supportingEvidence).toBeDefined();

      const secondCall = mockFork.create.mock.calls[1][1];
      expect(secondCall.category).toBe('IMPROVEMENT');
    });

    it('should mark run as COMPLETED with workerVersion from env', async () => {
      const mockRun = {
        id: 'r1',
        status: RunStatus.PROCESSING,
        workerVersion: undefined as string | undefined,
        completedAt: undefined as Date | undefined,
      };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockJob();
      await processor.process(job);

      expect(mockRun.status).toBe(RunStatus.COMPLETED);
      expect(mockRun.workerVersion).toBe(env.RECOMMENDATIONS_MODEL);
      expect(mockRun.completedAt).toBeDefined();
      expect(mockFork.flush).toHaveBeenCalled();
    });

    it('should call OnRecommendationsComplete after successful persistence', async () => {
      const mockRun = { id: 'r1', status: RunStatus.PROCESSING };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockJob();
      await processor.process(job);

      expect(mockOrchestrator.OnRecommendationsComplete).toHaveBeenCalledWith(
        'p1',
      );
    });
  });

  describe('onFailed', () => {
    it('should log error and call OnStageFailed when retries exhausted', () => {
      const job = {
        ...createMockJob(),
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<RecommendationsJobMessage>;

      const error = new Error('LLM timeout');

      processor.onFailed(job, error);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'generating_recommendations',
        'LLM timeout',
      );
    });

    it('should not call OnStageFailed when retries not exhausted', () => {
      const job = {
        ...createMockJob(),
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as unknown as Job<RecommendationsJobMessage>;

      const error = new Error('Temporary error');

      processor.onFailed(job, error);

      expect(mockOrchestrator.OnStageFailed).not.toHaveBeenCalled();
    });
  });
});
