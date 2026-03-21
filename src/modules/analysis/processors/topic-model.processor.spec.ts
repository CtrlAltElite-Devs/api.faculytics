/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { TopicModelProcessor } from './topic-model.processor';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { env } from 'src/configurations/env';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import { Job } from 'bullmq';
import { RunStatus } from '../enums';

const createMockJob = (): Job<BatchAnalysisJobMessage> =>
  ({
    id: 'p1--topic-model',
    queueName: 'topic-model',
    attemptsMade: 1,
    opts: { attempts: 3 },
    data: {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      version: '1.0',
      type: 'topic-model',
      items: [
        { submissionId: 's1', text: 'Too fast' },
        { submissionId: 's2', text: 'Great pace' },
      ],
      metadata: { pipelineId: 'p1', runId: 'r1' },
      publishedAt: '2026-03-12T00:00:00.000Z',
    },
  }) as unknown as Job<BatchAnalysisJobMessage>;

describe('TopicModelProcessor', () => {
  let processor: TopicModelProcessor;
  let mockFork: {
    findOneOrFail: jest.Mock;
    getReference: jest.Mock;
    create: jest.Mock;
    persist: jest.Mock;
    flush: jest.Mock;
  };
  let mockOrchestrator: {
    OnTopicModelComplete: jest.Mock;
    OnStageFailed: jest.Mock;
  };

  beforeEach(async () => {
    mockFork = {
      findOneOrFail: jest.fn(),
      getReference: jest.fn().mockImplementation((_entity, id) => ({ id })),
      create: jest
        .fn()
        .mockImplementation((_entity, data) => ({ ...data, id: 'new-id' })),
      persist: jest.fn(),
      flush: jest.fn(),
    };

    const mockEm = { fork: jest.fn().mockReturnValue(mockFork) };

    mockOrchestrator = {
      OnTopicModelComplete: jest.fn().mockResolvedValue(undefined),
      OnStageFailed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TopicModelProcessor,
          useFactory: () =>
            new TopicModelProcessor(
              mockEm as unknown as EntityManager,
              mockOrchestrator as unknown as PipelineOrchestratorService,
            ),
        },
      ],
    }).compile();

    processor = module.get<TopicModelProcessor>(TopicModelProcessor);
  });

  it('should return TOPIC_MODEL_WORKER_URL from env', () => {
    expect(processor.GetWorkerUrl()).toBe(env.TOPIC_MODEL_WORKER_URL);
  });

  describe('Persist', () => {
    it('should create Topic and TopicAssignment entities', async () => {
      const mockRun = {
        id: 'r1',
        status: RunStatus.PENDING,
        topicCount: 0,
        outlierCount: 0,
      };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      // Override raw result to include topic model response fields
      (result as Record<string, unknown>)['topics'] = [
        {
          topicIndex: 0,
          rawLabel: '0_fast_pace',
          keywords: ['fast', 'pace'],
          docCount: 2,
        },
      ];
      (result as Record<string, unknown>)['assignments'] = [
        { submissionId: 's1', topicIndex: 0, probability: 0.8 },
        { submissionId: 's2', topicIndex: 0, probability: 0.02 },
      ];
      (result as Record<string, unknown>)['outlierCount'] = 0;

      await processor.Persist(job, result);

      // Should create topic + assignments (both pass > 0.01 threshold)
      expect(mockFork.create).toHaveBeenCalled();
      expect(mockRun.status).toBe(RunStatus.COMPLETED);
      expect(mockRun.topicCount).toBe(1);
      expect(mockOrchestrator.OnTopicModelComplete).toHaveBeenCalledWith('p1');
    });

    it('should call OnStageFailed when worker returns failure', async () => {
      const job = createMockJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'failed',
        error: 'UMAP failed',
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'topic_modeling',
        'UMAP failed',
      );
    });

    it('should filter out assignments with probability <= 0.01', async () => {
      const mockRun = {
        id: 'r1',
        status: RunStatus.PENDING,
        topicCount: 0,
        outlierCount: 0,
      };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      (result as Record<string, unknown>)['topics'] = [
        {
          topicIndex: 0,
          rawLabel: '0_topic',
          keywords: ['test'],
          docCount: 1,
        },
      ];
      (result as Record<string, unknown>)['assignments'] = [
        { submissionId: 's1', topicIndex: 0, probability: 0.8 },
        { submissionId: 's2', topicIndex: 0, probability: 0.005 }, // Below threshold
      ];

      await processor.Persist(job, result);

      // create called for: 1 topic + 1 assignment (s2 filtered out)
      // The topic create is 1, assignment create (with persist: false) is 1
      const assignmentCreates = mockFork.create.mock.calls.filter(
        (call: unknown[]) => {
          const data = call[1] as Record<string, unknown>;
          return 'probability' in data;
        },
      );
      expect(assignmentCreates).toHaveLength(1);
    });
  });
});
