import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { RefreshTokenCleanupJob } from './refresh-token-cleanup.job';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { REFRESH_TOKEN_RETENTION_DAYS } from './refresh-token-cleanup.constants';

describe('RefreshTokenCleanupJob', () => {
  let job: RefreshTokenCleanupJob;
  let refreshTokenRepository: jest.Mocked<
    Pick<RefreshTokenRepository, 'deleteExpired'>
  >;

  beforeEach(async () => {
    refreshTokenRepository = {
      deleteExpired: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupJob,
        {
          provide: RefreshTokenRepository,
          useValue: refreshTokenRepository,
        },
        {
          provide: SchedulerRegistry,
          useValue: {},
        },
      ],
    }).compile();

    job = module.get<RefreshTokenCleanupJob>(RefreshTokenCleanupJob);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('runStartupTask', () => {
    it('should return skipped status', async () => {
      const result = await job['runStartupTask']();
      expect(result).toEqual({
        status: 'skipped',
        details: 'Cleanup not needed at startup',
      });
    });
  });

  describe('handleCleanup', () => {
    it('should call deleteExpired with correct cutoff date', async () => {
      jest.useFakeTimers();
      const now = new Date('2026-03-04T12:00:00Z').getTime();
      jest.setSystemTime(now);

      refreshTokenRepository.deleteExpired.mockResolvedValue(5);

      await job.handleCleanup();

      const expectedCutoff = new Date(
        now - REFRESH_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      expect(refreshTokenRepository.deleteExpired).toHaveBeenCalledWith(
        expectedCutoff,
      );

      jest.useRealTimers();
    });

    it('should log the number of deleted tokens', async () => {
      refreshTokenRepository.deleteExpired.mockResolvedValue(10);
      const logSpy = jest.spyOn(job['logger'], 'log');

      await job.handleCleanup();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('deleted 10 expired tokens'),
      );
    });

    it('should return failed status when repository throws', async () => {
      refreshTokenRepository.deleteExpired.mockRejectedValue(
        new Error('DB connection lost'),
      );
      const errorSpy = jest.spyOn(job['logger'], 'error');

      await job.handleCleanup();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up refresh tokens'),
        'DB connection lost',
      );
    });

    it('should skip execution when already running', async () => {
      job['isRunning'] = true;
      const logSpy = jest.spyOn(job['logger'], 'log');

      await job.handleCleanup();

      expect(refreshTokenRepository.deleteExpired).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('is already running'),
      );
    });

    it('should reset isRunning after successful execution', async () => {
      refreshTokenRepository.deleteExpired.mockResolvedValue(0);

      await job.handleCleanup();

      expect(job['isRunning']).toBe(false);
    });

    it('should reset isRunning after failed execution', async () => {
      refreshTokenRepository.deleteExpired.mockRejectedValue(
        new Error('failure'),
      );

      await job.handleCleanup();

      expect(job['isRunning']).toBe(false);
    });
  });
});
