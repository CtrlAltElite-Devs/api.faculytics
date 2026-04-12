/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { SentimentProcessor } from './sentiment.processor';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { env } from 'src/configurations/env';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import { Job } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { RunStatus } from '../enums';

const createMockBatchJob = (
  overrides?: Partial<BatchAnalysisJobMessage>,
): Job<BatchAnalysisJobMessage> =>
  ({
    id: 'pipeline1--sentiment',
    queueName: QueueName.SENTIMENT,
    attemptsMade: 1,
    opts: { attempts: 3 },
    data: {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      version: '1.0',
      type: QueueName.SENTIMENT,
      items: [
        { submissionId: 's1', text: 'Great professor' },
        { submissionId: 's2', text: 'Too fast' },
      ],
      metadata: { pipelineId: 'p1', runId: 'r1' },
      publishedAt: '2026-03-12T00:00:00.000Z',
      ...overrides,
    },
  }) as unknown as Job<BatchAnalysisJobMessage>;

describe('SentimentProcessor', () => {
  let processor: SentimentProcessor;
  let mockEm: {
    fork: jest.Mock;
    findOneOrFail: jest.Mock;
    getReference: jest.Mock;
    create: jest.Mock;
    flush: jest.Mock;
  };
  let mockOrchestrator: {
    OnSentimentComplete: jest.Mock;
    OnStageFailed: jest.Mock;
  };
  let mockFork: {
    findOneOrFail: jest.Mock;
    getReference: jest.Mock;
    create: jest.Mock;
    flush: jest.Mock;
  };

  beforeEach(async () => {
    mockFork = {
      findOneOrFail: jest.fn(),
      getReference: jest.fn().mockImplementation((_entity, id) => ({ id })),
      create: jest
        .fn()
        .mockImplementation((_entity, data) => ({ ...data, id: 'new-id' })),
      flush: jest.fn(),
    };

    mockEm = {
      fork: jest.fn().mockReturnValue(mockFork),
      findOneOrFail: jest.fn(),
      getReference: jest.fn(),
      create: jest.fn(),
      flush: jest.fn(),
    };

    mockOrchestrator = {
      OnSentimentComplete: jest.fn().mockResolvedValue(undefined),
      OnStageFailed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SentimentProcessor,
          useFactory: () => {
            const proc = new SentimentProcessor(
              mockEm as unknown as EntityManager,
              mockOrchestrator as unknown as PipelineOrchestratorService,
            );
            return proc;
          },
        },
      ],
    }).compile();

    processor = module.get<SentimentProcessor>(SentimentProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should return SENTIMENT_WORKER_URL from env', () => {
    expect(processor.GetWorkerUrl()).toBe(env.SENTIMENT_WORKER_URL);
  });

  describe('Persist', () => {
    it('should create SentimentResult entities from batch results', async () => {
      const mockRun = { id: 'r1', status: RunStatus.PENDING };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockBatchJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [
          {
            submissionId: 's1',
            positive: 0.85,
            neutral: 0.1,
            negative: 0.05,
          },
          {
            submissionId: 's2',
            positive: 0.05,
            neutral: 0.15,
            negative: 0.8,
          },
        ],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      // Should create 2 SentimentResult entities
      expect(mockFork.create).toHaveBeenCalledTimes(2);

      // First result: positive label
      const firstCall = mockFork.create.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(firstCall).toMatchObject({
        positiveScore: 0.85,
        neutralScore: 0.1,
        negativeScore: 0.05,
        label: 'positive',
      });

      // Second result: negative label
      const secondCall = mockFork.create.mock.calls[1][1] as Record<
        string,
        unknown
      >;
      expect(secondCall).toMatchObject({
        positiveScore: 0.05,
        neutralScore: 0.15,
        negativeScore: 0.8,
        label: 'negative',
      });

      // Run should be completed
      expect(mockRun.status).toBe(RunStatus.COMPLETED);
      expect(mockRun.workerVersion).toBe('1.0');

      expect(mockFork.flush).toHaveBeenCalled();
      expect(mockOrchestrator.OnSentimentComplete).toHaveBeenCalledWith('p1');
    });

    it('should call OnStageFailed when worker returns failure', async () => {
      const job = createMockBatchJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'failed',
        error: 'CUDA out of memory',
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        'CUDA out of memory',
      );
      expect(mockOrchestrator.OnSentimentComplete).not.toHaveBeenCalled();
    });

    it('should call OnStageFailed when results array is empty', async () => {
      const job = createMockBatchJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        'Sentiment worker returned no results',
      );
    });

    it('should drop unknown submissionId and persist valid majority', async () => {
      const mockRun = { id: 'r1', status: RunStatus.PENDING };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);
      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      const job = createMockBatchJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [
          { submissionId: 's1', positive: 0.8, neutral: 0.1, negative: 0.1 },
          { submissionId: 's2', positive: 0.1, neutral: 0.1, negative: 0.8 },
          {
            submissionId: 'unknown-id',
            positive: 0.5,
            neutral: 0.3,
            negative: 0.2,
          },
        ],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockFork.create).toHaveBeenCalledTimes(2);
      expect(mockOrchestrator.OnSentimentComplete).toHaveBeenCalledWith('p1');
      expect(mockOrchestrator.OnStageFailed).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dropped 1 of 3'),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('r1'));
    });

    it('should call OnStageFailed and skip fork when all submissionIds are unknown', async () => {
      const job = createMockBatchJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [
          {
            submissionId: 'bad-id-1',
            positive: 0.8,
            neutral: 0.1,
            negative: 0.1,
          },
          {
            submissionId: 'bad-id-2',
            positive: 0.1,
            neutral: 0.1,
            negative: 0.8,
          },
        ],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        expect.stringContaining('All sentiment results were dropped'),
      );
      expect(mockFork.create).not.toHaveBeenCalled();
      expect(mockOrchestrator.OnSentimentComplete).not.toHaveBeenCalled();
      expect(mockFork.findOneOrFail).not.toHaveBeenCalled();
    });

    it('should skip invalid result items and continue', async () => {
      const mockRun = { id: 'r1', status: RunStatus.PENDING };
      mockFork.findOneOrFail.mockResolvedValue(mockRun);

      const job = createMockBatchJob();
      const result: BatchAnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        results: [
          { submissionId: 's1', positive: 0.85, neutral: 0.1, negative: 0.05 },
          { invalid: 'data' }, // Invalid item
        ],
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      // Only 1 valid result should be created
      expect(mockFork.create).toHaveBeenCalledTimes(1);
    });
  });
});
