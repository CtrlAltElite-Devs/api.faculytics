/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { Job } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { AnalyticsRefreshProcessor } from './analytics-refresh.processor';

const createMockJob = (overrides?: Partial<Job>) =>
  ({
    id: 'p1--analytics-refresh',
    queueName: QueueName.ANALYTICS_REFRESH,
    attemptsMade: 1,
    opts: { attempts: 3 },
    data: { pipelineId: 'p1' },
    ...overrides,
  }) as unknown as Job;

describe('AnalyticsRefreshProcessor', () => {
  let processor: AnalyticsRefreshProcessor;
  let mockExecute: jest.Mock;
  let mockFork: {
    getConnection: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
    flush: jest.Mock;
  };

  beforeEach(async () => {
    mockExecute = jest.fn().mockResolvedValue(undefined);
    mockFork = {
      getConnection: jest.fn().mockReturnValue({ execute: mockExecute }),
      create: jest
        .fn()
        .mockImplementation((_entity, data) => ({ ...data, id: 'mock-id' })),
      upsert: jest.fn(),
      flush: jest.fn(),
    };

    const mockEm = { fork: jest.fn().mockReturnValue(mockFork) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsRefreshProcessor,
        { provide: EntityManager, useValue: mockEm },
      ],
    }).compile();

    processor = module.get<AnalyticsRefreshProcessor>(
      AnalyticsRefreshProcessor,
    );
  });

  it('should refresh both materialized views in order', async () => {
    await processor.process(createMockJob());

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute).toHaveBeenNthCalledWith(
      1,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats',
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_trends',
    );
  });

  it('should refresh stats view before trends view', async () => {
    const callOrder: string[] = [];
    mockExecute.mockImplementation((sql: string) => {
      callOrder.push(sql);
      return Promise.resolve();
    });

    await processor.process(createMockJob());

    expect(callOrder[0]).toContain('mv_faculty_semester_stats');
    expect(callOrder[1]).toContain('mv_faculty_trends');
  });

  it('should upsert system_config with analytics_last_refreshed_at after successful refresh', async () => {
    await processor.process(createMockJob());

    expect(mockFork.upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        key: 'analytics_last_refreshed_at',
        value: expect.any(String),
      }),
      { onConflictFields: ['key'] },
    );
    expect(mockFork.flush).toHaveBeenCalled();
  });

  it('should propagate Postgres errors for BullMQ retry', async () => {
    mockExecute.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(processor.process(createMockJob())).rejects.toThrow(
      'connection terminated',
    );
  });

  it('should not attempt trends refresh if stats refresh fails', async () => {
    mockExecute.mockRejectedValueOnce(new Error('stats refresh failed'));

    await expect(processor.process(createMockJob())).rejects.toThrow(
      'stats refresh failed',
    );

    // Only stats refresh was attempted (1 call, failed)
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats',
    );
  });
});
