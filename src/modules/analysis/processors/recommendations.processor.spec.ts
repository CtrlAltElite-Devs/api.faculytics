/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { RecommendationsProcessor } from './recommendations.processor';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { env } from 'src/configurations/env';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import { Job } from 'bullmq';
import { RunStatus } from '../enums';

const createMockJob = (): Job<BatchAnalysisJobMessage> =>
  ({
    id: 'p1:recommendations',
    queueName: 'recommendations',
    attemptsMade: 1,
    opts: { attempts: 3 },
    data: {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      version: '1.0',
      type: 'recommendations',
      items: [],
      metadata: { pipelineId: 'p1', runId: 'r1' },
      publishedAt: '2026-03-12T00:00:00.000Z',
    },
  }) as unknown as Job<BatchAnalysisJobMessage>;

describe('RecommendationsProcessor', () => {
  let processor: RecommendationsProcessor;
  let mockFork: {
    findOneOrFail: jest.Mock;
    create: jest.Mock;
    flush: jest.Mock;
  };
  let mockOrchestrator: {
    OnRecommendationsComplete: jest.Mock;
    OnStageFailed: jest.Mock;
  };

  beforeEach(async () => {
    mockFork = {
      findOneOrFail: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((_entity, data) => ({ ...data, id: 'new-id' })),
      flush: jest.fn(),
    };

    const mockEm = { fork: jest.fn().mockReturnValue(mockFork) };

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
              mockOrchestrator as unknown as PipelineOrchestratorService,
            ),
        },
      ],
    }).compile();

    processor = module.get<RecommendationsProcessor>(RecommendationsProcessor);
  });

  it('should return RECOMMENDATIONS_WORKER_URL from env', () => {
    expect(processor.GetWorkerUrl()).toBe(env.RECOMMENDATIONS_WORKER_URL);
  });

  describe('Persist', () => {
    it('should create RecommendedAction entities from results', async () => {
      const mockRun = { id: 'r1', status: RunStatus.PENDING };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      (result as Record<string, unknown>)['actions'] = [
        {
          category: 'teaching_pace',
          actionText: 'Slow down lecture delivery.',
          priority: 'high',
          supportingEvidence: { topicDocCount: 45 },
        },
        {
          category: 'engagement',
          actionText: 'Add more interactive exercises.',
          priority: 'medium',
          supportingEvidence: { topicDocCount: 20 },
        },
      ];

      await processor.Persist(job, result);

      expect(mockFork.create).toHaveBeenCalledTimes(2);
      expect(mockRun.status).toBe(RunStatus.COMPLETED);
      expect(mockOrchestrator.OnRecommendationsComplete).toHaveBeenCalledWith(
        'p1',
      );
    });

    it('should call OnStageFailed when worker returns failure', async () => {
      const job = createMockJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'failed',
        error: 'LLM quota exceeded',
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'generating_recommendations',
        'LLM quota exceeded',
      );
    });
  });
});
