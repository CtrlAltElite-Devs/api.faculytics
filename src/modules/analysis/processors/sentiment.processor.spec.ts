import { SentimentProcessor } from './sentiment.processor';
import { env } from 'src/configurations/env';

describe('SentimentProcessor', () => {
  let processor: SentimentProcessor;

  beforeEach(() => {
    processor = new SentimentProcessor();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should return SENTIMENT_WORKER_URL from env', () => {
    expect(processor.GetWorkerUrl()).toBe(env.SENTIMENT_WORKER_URL);
  });

  it('should have a Persist method that logs without throwing', async () => {
    const logSpy = jest.spyOn(processor['logger'], 'log').mockImplementation();

    await expect(
      processor.Persist({ id: 'test-job' } as never, {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        version: '1.0',
        status: 'completed',
        completedAt: '2026-03-12T00:00:00.000Z',
      }),
    ).resolves.not.toThrow();

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
