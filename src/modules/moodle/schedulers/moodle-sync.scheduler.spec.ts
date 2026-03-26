import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/core';
import { CronJob } from 'cron';
import { QueueName } from 'src/configurations/common/queue-names';
import { MoodleSyncScheduler } from './moodle-sync.scheduler';

describe('MoodleSyncScheduler', () => {
  let scheduler: MoodleSyncScheduler;
  let mockQueue: { add: jest.Mock };
  let capturedCronJobs: CronJob[];
  let mockSchedulerRegistry: {
    addCronJob: jest.Mock;
    deleteCronJob: jest.Mock;
    getCronJob: jest.Mock;
  };
  let mockEm: { fork: jest.Mock; findOne: jest.Mock; flush: jest.Mock };

  beforeEach(async () => {
    capturedCronJobs = [];
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'test-job-id' }) };
    mockSchedulerRegistry = {
      addCronJob: jest
        .fn()
        .mockImplementation((_name: string, job: CronJob) => {
          capturedCronJobs.push(job);
        }),
      deleteCronJob: jest.fn(),
      getCronJob: jest.fn().mockReturnValue({
        nextDate: () => ({ toISO: () => '2026-03-25T21:00:00.000Z' }),
      }),
    };
    mockEm = {
      findOne: jest.fn().mockResolvedValue(null),
      flush: jest.fn().mockResolvedValue(undefined),
      fork: jest.fn(),
    };
    mockEm.fork.mockReturnValue(mockEm);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleSyncScheduler,
        {
          provide: getQueueToken(QueueName.MOODLE_SYNC),
          useValue: mockQueue,
        },
        {
          provide: SchedulerRegistry,
          useValue: mockSchedulerRegistry,
        },
        {
          provide: EntityManager,
          useValue: mockEm,
        },
      ],
    }).compile();

    scheduler = module.get(MoodleSyncScheduler);
  });

  afterEach(() => {
    for (const job of capturedCronJobs) {
      void job.stop();
    }
  });

  it('should register a cron job on module init', async () => {
    await scheduler.onModuleInit();

    expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'moodle-sync-cron',
      expect.anything(),
    );
  });

  it('should return schedule info after init', async () => {
    await scheduler.onModuleInit();

    const schedule = scheduler.getSchedule();
    expect(schedule.intervalMinutes).toBeDefined();
    expect(schedule.cronExpression).toBeDefined();
  });

  it('should use database config when available', async () => {
    mockEm.findOne.mockResolvedValue({
      key: 'MOODLE_SYNC_INTERVAL_MINUTES',
      value: '120',
    });

    await scheduler.onModuleInit();

    const schedule = scheduler.getSchedule();
    expect(schedule.intervalMinutes).toBe(120);
    expect(schedule.cronExpression).toBe('0 */2 * * *');
  });

  it('should ignore database config below minimum (30 minutes) and fall back to default', async () => {
    mockEm.findOne.mockResolvedValue({
      key: 'MOODLE_SYNC_INTERVAL_MINUTES',
      value: '10',
    });

    await scheduler.onModuleInit();

    const schedule = scheduler.getSchedule();
    expect(schedule.intervalMinutes).toBeGreaterThanOrEqual(30);
  });
});
