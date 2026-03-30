import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { getQueueToken } from '@nestjs/bullmq';
import { EntityManager } from '@mikro-orm/core';
import { QueueName } from 'src/configurations/common/queue-names';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import {
  auditTestProviders,
  overrideAuditInterceptors,
} from 'src/modules/audit/testing/audit-test.helpers';
import { validate } from 'class-validator';
import { MoodleSyncController } from './moodle-sync.controller';
import { MoodleSyncScheduler } from '../schedulers/moodle-sync.scheduler';
import { SyncState } from '../dto/responses/sync-status.response.dto';
import { UpdateSyncScheduleDto } from '../dto/requests/update-sync-schedule.request.dto';
import { MOODLE_SYNC_MIN_INTERVAL_MINUTES } from '../schedulers/moodle-sync.constants';

describe('MoodleSyncController', () => {
  let controller: MoodleSyncController;
  let mockQueue: {
    add: jest.Mock;
    getActive: jest.Mock;
    getActiveCount: jest.Mock;
    getWaitingCount: jest.Mock;
    getFailedCount: jest.Mock;
  };
  let mockScheduler: {
    getSchedule: jest.Mock;
    updateSchedule: jest.Mock;
  };
  let mockEm: {
    fork: jest.Mock;
    findAndCount: jest.Mock;
  };
  let mockCurrentUserService: {
    getOrFail: jest.Mock;
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getActive: jest.fn().mockResolvedValue([]),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getFailedCount: jest.fn().mockResolvedValue(0),
    };
    mockScheduler = {
      getSchedule: jest.fn().mockReturnValue({
        intervalMinutes: 60,
        cronExpression: '0 * * * *',
        nextExecution: '2026-03-25T21:00:00.000Z',
      }),
      updateSchedule: jest.fn().mockResolvedValue(undefined),
    };
    mockEm = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      fork: jest.fn(),
    };
    mockEm.fork.mockReturnValue(mockEm);
    mockCurrentUserService = {
      getOrFail: jest.fn().mockReturnValue({ id: 'user-1' }),
    };

    const builder = Test.createTestingModule({
      controllers: [MoodleSyncController],
      providers: [
        {
          provide: getQueueToken(QueueName.MOODLE_SYNC),
          useValue: mockQueue,
        },
        {
          provide: MoodleSyncScheduler,
          useValue: mockScheduler,
        },
        {
          provide: EntityManager,
          useValue: mockEm,
        },
        {
          provide: CurrentUserService,
          useValue: mockCurrentUserService,
        },
        ...auditTestProviders(),
      ],
    });

    const module: TestingModule = await overrideAuditInterceptors(
      builder
        .overrideGuard(AuthGuard('jwt'))
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .overrideInterceptor(CurrentUserInterceptor)
        .useValue({
          intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
            next.handle(),
        }),
    ).compile();

    controller = module.get(MoodleSyncController);
  });

  describe('GetSyncStatus', () => {
    it('should return IDLE when no jobs are active or queued', async () => {
      const result = await controller.GetSyncStatus();

      expect(result.state).toBe(SyncState.IDLE);
      expect(result.waitingCount).toBe(0);
    });

    it('should return ACTIVE when a job is processing', async () => {
      mockQueue.getActive.mockResolvedValue([
        { id: 'job-1', data: { trigger: 'manual' }, processedOn: 1000 },
      ]);

      const result = await controller.GetSyncStatus();

      expect(result.state).toBe(SyncState.ACTIVE);
      expect(result.jobId).toBe('job-1');
      expect(result.trigger).toBe('manual');
    });

    it('should return QUEUED when jobs are waiting but none active', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(2);

      const result = await controller.GetSyncStatus();

      expect(result.state).toBe(SyncState.QUEUED);
      expect(result.waitingCount).toBe(2);
    });
  });

  describe('TriggerSync', () => {
    it('should enqueue a manual sync job with triggeredById from CLS', async () => {
      const result = await controller.TriggerSync();

      expect(result.jobId).toBe('job-1');
      expect(mockCurrentUserService.getOrFail).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        QueueName.MOODLE_SYNC,
        expect.objectContaining({
          trigger: 'manual',
          triggeredById: 'user-1',
        }),
        expect.objectContaining({
          removeOnComplete: true,
          removeOnFail: 50,
        }),
      );
    });

    it('should throw 409 when a sync is already in progress', async () => {
      mockQueue.getActiveCount.mockResolvedValue(1);

      await expect(controller.TriggerSync()).rejects.toThrow(
        new HttpException(
          { error: 'Sync already in progress or queued' },
          HttpStatus.CONFLICT,
        ),
      );
    });

    it('should throw 503 when the queue is unavailable', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(controller.TriggerSync()).rejects.toThrow(HttpException);
    });
  });

  describe('GetSyncHistory', () => {
    it('should return paginated sync logs', async () => {
      const mockLog = {
        id: 'log-1',
        trigger: 'manual',
        triggeredBy: { id: 'user-1' },
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 5000,
        categories: {
          status: 'success',
          fetched: 10,
          inserted: 2,
          updated: 8,
          deactivated: 0,
          errors: 0,
          durationMs: 100,
        },
        courses: null,
        enrollments: null,
      };
      mockEm.findAndCount.mockResolvedValue([[mockLog], 1]);

      const result = await controller.GetSyncHistory(1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('log-1');
      expect(result.data[0].triggeredById).toBe('user-1');
      expect(result.meta.totalItems).toBe(1);
      expect(result.meta.currentPage).toBe(1);
    });

    it('should pass softDelete: false filter to bypass global filter', async () => {
      await controller.GetSyncHistory(1, 20);

      expect(mockEm.findAndCount).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.objectContaining({
          filters: { softDelete: false },
        }),
      );
    });

    it('should clamp limit to max 100', async () => {
      await controller.GetSyncHistory(1, 200);

      expect(mockEm.findAndCount).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.objectContaining({ limit: 100 }),
      );
    });
  });

  describe('GetSyncSchedule', () => {
    it('should return current schedule from scheduler', () => {
      const result = controller.GetSyncSchedule();

      expect(result.intervalMinutes).toBe(60);
      expect(result.cronExpression).toBe('0 * * * *');
      expect(result.nextExecution).toBe('2026-03-25T21:00:00.000Z');
    });
  });

  describe('UpdateSyncSchedule', () => {
    it('should update the schedule and return new values', async () => {
      mockScheduler.getSchedule.mockReturnValue({
        intervalMinutes: 180,
        cronExpression: '0 */3 * * *',
        nextExecution: '2026-03-26T00:00:00.000Z',
      });

      const result = await controller.UpdateSyncSchedule({
        intervalMinutes: 180,
      });

      expect(mockScheduler.updateSchedule).toHaveBeenCalledWith(180);
      expect(result.intervalMinutes).toBe(180);
      expect(result.cronExpression).toBe('0 */3 * * *');
    });

    it('should reject interval below minimum via DTO validation', async () => {
      const dto = new UpdateSyncScheduleDto();
      dto.intervalMinutes = 10;

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should accept interval at minimum via DTO validation', async () => {
      const dto = new UpdateSyncScheduleDto();
      dto.intervalMinutes = MOODLE_SYNC_MIN_INTERVAL_MINUTES;

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
