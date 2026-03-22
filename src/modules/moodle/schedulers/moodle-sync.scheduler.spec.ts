import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { MoodleSyncScheduler } from './moodle-sync.scheduler';

describe('MoodleSyncScheduler', () => {
  let scheduler: MoodleSyncScheduler;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'test-job-id' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleSyncScheduler,
        {
          provide: getQueueToken(QueueName.MOODLE_SYNC),
          useValue: mockQueue,
        },
      ],
    }).compile();

    scheduler = module.get(MoodleSyncScheduler);
  });

  it('should enqueue a moodle-sync job with correct options', async () => {
    await scheduler.HandleScheduledSync();

    expect(mockQueue.add).toHaveBeenCalledWith(
      QueueName.MOODLE_SYNC,
      { trigger: 'scheduled' },
      {
        jobId: 'moodle-sync-scheduled',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  });

  it('should catch and log error when Redis is unavailable', async () => {
    mockQueue.add.mockRejectedValue(new Error('Redis connection refused'));
    const errorSpy = jest.spyOn(scheduler['logger'], 'error');

    await scheduler.HandleScheduledSync();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to enqueue scheduled sync'),
    );
  });
});
