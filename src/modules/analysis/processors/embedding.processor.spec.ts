/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { EmbeddingProcessor } from './embedding.processor';
import { env } from 'src/configurations/env';
import { AnalysisJobMessage } from '../dto/analysis-job-message.dto';
import { AnalysisResultMessage } from '../dto/analysis-result-message.dto';
import { Job } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';

const createMockJob = (): Job<AnalysisJobMessage> =>
  ({
    id: 's1:embedding',
    queueName: QueueName.EMBEDDING,
    attemptsMade: 1,
    data: {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      version: '1.0',
      type: QueueName.EMBEDDING,
      text: 'Great professor',
      metadata: { submissionId: 's1', facultyId: 'f1', versionId: 'v1' },
      publishedAt: '2026-03-12T00:00:00.000Z',
    },
  }) as unknown as Job<AnalysisJobMessage>;

describe('EmbeddingProcessor', () => {
  let processor: EmbeddingProcessor;
  let mockFork: {
    findOne: jest.Mock;
    create: jest.Mock;
    flush: jest.Mock;
  };

  beforeEach(async () => {
    mockFork = {
      findOne: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((_entity, data) => ({ ...data, id: 'emb-id' })),
      flush: jest.fn(),
    };

    const mockEm = {
      fork: jest.fn().mockReturnValue(mockFork),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EmbeddingProcessor,
          useFactory: () =>
            new EmbeddingProcessor(mockEm as unknown as EntityManager),
        },
      ],
    }).compile();

    processor = module.get<EmbeddingProcessor>(EmbeddingProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should return EMBEDDINGS_WORKER_URL from env', () => {
    expect(processor.GetWorkerUrl()).toBe(env.EMBEDDINGS_WORKER_URL);
  });

  describe('Persist', () => {
    it('should create SubmissionEmbedding on successful result', async () => {
      const mockSubmission = { id: 's1' };
      mockFork.findOne
        .mockResolvedValueOnce(mockSubmission) // QuestionnaireSubmission
        .mockResolvedValueOnce(null); // No existing embedding

      const job = createMockJob();
      const result: AnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        result: {
          embedding: new Array(768).fill(0.1),
          modelName: 'LaBSE',
        },
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockFork.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          submission: mockSubmission,
          modelName: 'LaBSE',
        }),
      );
      expect(mockFork.flush).toHaveBeenCalled();
    });

    it('should upsert existing embedding', async () => {
      const existingEmbedding = {
        id: 'existing-emb',
        embedding: new Array(768).fill(0),
        modelName: 'old-model',
      };
      mockFork.findOne
        .mockResolvedValueOnce({ id: 's1' }) // Submission
        .mockResolvedValueOnce(existingEmbedding); // Existing embedding

      const job = createMockJob();
      const result: AnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        result: {
          embedding: new Array(768).fill(0.2),
          modelName: 'LaBSE',
        },
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(existingEmbedding.embedding).toEqual(new Array(768).fill(0.2));
      expect(existingEmbedding.modelName).toBe('LaBSE');
      expect(mockFork.create).not.toHaveBeenCalled();
    });

    it('should not persist on failed result', async () => {
      const job = createMockJob();
      const result: AnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'failed',
        error: 'Model load failed',
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockFork.create).not.toHaveBeenCalled();
      expect(mockFork.flush).not.toHaveBeenCalled();
    });

    it('should not persist when embedding array is missing', async () => {
      const job = createMockJob();
      const result: AnalysisResultMessage = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        result: { noEmbedding: true },
        completedAt: '2026-03-12T00:01:00.000Z',
      };

      await processor.Persist(job, result);

      expect(mockFork.create).not.toHaveBeenCalled();
    });
  });
});
