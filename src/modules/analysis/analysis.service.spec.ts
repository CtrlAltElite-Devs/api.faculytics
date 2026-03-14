import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AnalysisService } from './analysis.service';

describe('AnalysisService', () => {
  let service: AnalysisService;
  let sentimentQueue: { add: jest.Mock; addBulk: jest.Mock };
  let embeddingQueue: { add: jest.Mock; addBulk: jest.Mock };
  let topicModelQueue: { add: jest.Mock; addBulk: jest.Mock };
  let recommendationsQueue: { add: jest.Mock; addBulk: jest.Mock };

  const metadata = {
    submissionId: 's1',
    facultyId: 'f1',
    versionId: 'v1',
  };

  const createMockQueue = () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    addBulk: jest.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    sentimentQueue = createMockQueue();
    embeddingQueue = createMockQueue();
    topicModelQueue = createMockQueue();
    recommendationsQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('sentiment'), useValue: sentimentQueue },
        { provide: getQueueToken('embedding'), useValue: embeddingQueue },
        { provide: getQueueToken('topic-model'), useValue: topicModelQueue },
        {
          provide: getQueueToken('recommendations'),
          useValue: recommendationsQueue,
        },
      ],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('EnqueueJob', () => {
    it('should add a job to the sentiment queue with correct envelope', async () => {
      const jobId = await service.EnqueueJob(
        'sentiment',
        'The professor was helpful',
        metadata,
      );

      expect(jobId).toBeDefined();
      expect(sentimentQueue.add).toHaveBeenCalledTimes(1);

      const call = sentimentQueue.add.mock.calls[0] as unknown[];
      const [name, envelope, opts] = call as [
        string,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(name).toBe('sentiment');
      expect(envelope).toMatchObject({
        version: '1.0',
        type: 'sentiment',
        text: 'The professor was helpful',
        metadata,
      });
      expect(envelope.jobId).toBeDefined();
      expect(envelope.publishedAt).toBeDefined();
      expect(opts.jobId).toBe('s1:sentiment');
    });

    it('should add a job to the embedding queue', async () => {
      await service.EnqueueJob('embedding', 'Some text', metadata);

      expect(embeddingQueue.add).toHaveBeenCalledTimes(1);
      const call = embeddingQueue.add.mock.calls[0] as unknown[];
      const opts = call[2] as Record<string, unknown>;
      expect(opts.jobId).toBe('s1:embedding');
    });

    it('should use deterministic job ID based on submissionId and type', async () => {
      await service.EnqueueJob('sentiment', 'Some text', metadata);

      const call = sentimentQueue.add.mock.calls[0] as unknown[];
      const opts = call[2] as Record<string, unknown>;
      expect(opts.jobId).toBe('s1:sentiment');
    });

    it('should throw BadRequestException for unknown analysis type', async () => {
      await expect(
        service.EnqueueJob('unknown_type', 'text', metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ServiceUnavailableException on Redis connection error', async () => {
      sentimentQueue.add.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        service.EnqueueJob('sentiment', 'text', metadata),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should include correct job options from env', async () => {
      await service.EnqueueJob('sentiment', 'text', metadata);

      const call = sentimentQueue.add.mock.calls[0] as unknown[];
      const opts = call[2] as {
        attempts: number;
        backoff: { type: string; delay: number };
      };
      expect(opts.attempts).toBeGreaterThan(0);
      expect(opts.backoff.type).toBe('exponential');
      expect(opts.backoff.delay).toBeGreaterThan(0);
    });
  });

  describe('EnqueueBatch', () => {
    it('should group jobs by type and use addBulk', async () => {
      const jobs = [
        {
          type: 'sentiment',
          text: 'text1',
          metadata: { submissionId: 's1', facultyId: 'f1', versionId: 'v1' },
        },
        {
          type: 'sentiment',
          text: 'text2',
          metadata: { submissionId: 's2', facultyId: 'f1', versionId: 'v1' },
        },
      ];

      const jobIds = await service.EnqueueBatch(jobs);

      expect(jobIds).toHaveLength(2);
      expect(sentimentQueue.addBulk).toHaveBeenCalledTimes(1);

      const bulkCall = sentimentQueue.addBulk.mock.calls[0] as unknown[];
      const bulkArgs = bulkCall[0] as Array<{
        name: string;
        data: { type: string; text: string };
        opts: { jobId: string };
      }>;
      expect(bulkArgs).toHaveLength(2);
      expect(bulkArgs[0].name).toBe('sentiment');
      expect(bulkArgs[0].data.text).toBe('text1');
      expect(bulkArgs[0].opts.jobId).toBe('s1:sentiment');
      expect(bulkArgs[1].data.text).toBe('text2');
      expect(bulkArgs[1].opts.jobId).toBe('s2:sentiment');
    });

    it('should return empty array for empty input', async () => {
      const result = await service.EnqueueBatch([]);
      expect(result).toEqual([]);
    });

    it('should throw BadRequestException for unknown type in batch', async () => {
      const jobs = [{ type: 'unknown', text: 'text', metadata }];

      await expect(service.EnqueueBatch(jobs)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ServiceUnavailableException on connection error in batch', async () => {
      sentimentQueue.addBulk.mockRejectedValue(new Error('ECONNREFUSED'));

      const jobs = [{ type: 'sentiment', text: 'text', metadata }];

      await expect(service.EnqueueBatch(jobs)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
