import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BaseBatchProcessor } from './base-batch.processor';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';

class TestBatchProcessor extends BaseBatchProcessor {
  protected readonly logger = new Logger('TestBatchProcessor');
  public workerUrl: string | undefined = 'http://localhost:3001/test';
  public persistMock = jest.fn().mockResolvedValue(undefined);

  GetWorkerUrl(): string | undefined {
    return this.workerUrl;
  }

  Persist(
    job: Job<BatchAnalysisJobMessage>,
    result: BatchAnalysisResultMessage,
  ): Promise<void> {
    return this.persistMock(job, result) as Promise<void>;
  }
}

const createMockBatchJob = (
  overrides?: Partial<Job<BatchAnalysisJobMessage>>,
): Job<BatchAnalysisJobMessage> =>
  ({
    id: 'p1--sentiment',
    queueName: 'sentiment',
    attemptsMade: 1,
    data: {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      version: '1.0',
      type: 'sentiment',
      items: [
        { submissionId: 's1', text: 'Great professor' },
        { submissionId: 's2', text: 'Too fast' },
      ],
      metadata: { pipelineId: 'p1', runId: 'r1' },
      publishedAt: '2026-03-12T00:00:00.000Z',
    },
    ...overrides,
  }) as unknown as Job<BatchAnalysisJobMessage>;

const validResult: BatchAnalysisResultMessage = {
  jobId: '550e8400-e29b-41d4-a716-446655440000',
  version: '1.0',
  status: 'completed',
  results: [
    { submissionId: 's1', positive: 0.85, neutral: 0.1, negative: 0.05 },
    { submissionId: 's2', positive: 0.05, neutral: 0.15, negative: 0.8 },
  ],
  completedAt: '2026-03-12T00:01:00.000Z',
};

describe('BaseBatchProcessor', () => {
  let processor: TestBatchProcessor;
  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(() => {
    processor = new TestBatchProcessor();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(validResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('process', () => {
    it('should call Persist on successful HTTP response with valid envelope', async () => {
      const job = createMockBatchJob();
      await processor.process(job);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3001/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(processor.persistMock).toHaveBeenCalledWith(job, validResult);
    });

    it('should throw when worker URL is not configured', async () => {
      processor.workerUrl = undefined;
      const job = createMockBatchJob();

      await expect(processor.process(job)).rejects.toThrow(
        'Worker URL not configured for sentiment. Set the corresponding env var.',
      );
      expect(processor.persistMock).not.toHaveBeenCalled();
    });

    it('should throw on HTTP 500 response', async () => {
      fetchSpy.mockResolvedValue(new Response('Server Error', { status: 500 }));
      const job = createMockBatchJob();

      await expect(processor.process(job)).rejects.toThrow(
        'Worker responded with HTTP 500',
      );
      expect(processor.persistMock).not.toHaveBeenCalled();
    });

    it('should throw on malformed worker response and not call Persist', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ bad: 'data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const job = createMockBatchJob();

      await expect(processor.process(job)).rejects.toThrow(
        'Worker response validation failed',
      );
      expect(processor.persistMock).not.toHaveBeenCalled();
    });

    it('should throw timeout error when fetch is aborted', async () => {
      fetchSpy.mockRejectedValue(
        Object.assign(
          new DOMException('The operation was aborted.', 'AbortError'),
        ),
      );
      const job = createMockBatchJob();

      await expect(processor.process(job)).rejects.toThrow('timed out');
      expect(processor.persistMock).not.toHaveBeenCalled();
    });

    it('should rethrow non-abort fetch errors', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
      const job = createMockBatchJob();

      await expect(processor.process(job)).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('event handlers', () => {
    it('onFailed should log failure context', () => {
      const logSpy = jest
        .spyOn(processor['logger'], 'error')
        .mockImplementation();
      const job = createMockBatchJob();
      const error = new Error('test error');

      processor.onFailed(job, error);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('p1--sentiment'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('test error'),
      );
      logSpy.mockRestore();
    });

    it('onStalled should log warning', () => {
      const logSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      processor.onStalled('job-123');

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('job-123'));
      logSpy.mockRestore();
    });
  });
});
