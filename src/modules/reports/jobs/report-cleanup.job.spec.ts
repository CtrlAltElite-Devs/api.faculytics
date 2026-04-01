import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/postgresql';
import { ReportCleanupJob } from './report-cleanup.job';
import { ReportJobRepository } from 'src/repositories/report-job.repository';
import { ReportJob } from 'src/entities/report-job.entity';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from '../interfaces/storage-provider.interface';

jest.mock('src/configurations/index.config', () => ({
  env: { REPORT_RETENTION_DAYS: 7 },
}));

describe('ReportCleanupJob', () => {
  let job: ReportCleanupJob;
  let reportJobRepository: jest.Mocked<
    Pick<ReportJobRepository, 'FindExpiredCompleted'>
  >;
  let storageProvider: jest.Mocked<
    Pick<StorageProvider, 'Delete' | 'DeleteByPrefix'>
  >;
  let em: jest.Mocked<Pick<EntityManager, 'nativeDelete'>>;

  beforeEach(async () => {
    reportJobRepository = {
      FindExpiredCompleted: jest.fn(),
    };

    storageProvider = {
      Delete: jest.fn(),
      DeleteByPrefix: jest.fn(),
    };

    em = {
      nativeDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCleanupJob,
        {
          provide: ReportJobRepository,
          useValue: reportJobRepository,
        },
        {
          provide: STORAGE_PROVIDER,
          useValue: storageProvider,
        },
        {
          provide: EntityManager,
          useValue: em,
        },
        {
          provide: SchedulerRegistry,
          useValue: {},
        },
      ],
    }).compile();

    job = module.get<ReportCleanupJob>(ReportCleanupJob);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('runStartupTask', () => {
    it('should return skipped status', async () => {
      const result = await job['runStartupTask']();
      expect(result).toEqual({
        status: 'skipped',
        details: 'Cleanup runs on schedule only',
      });
    });
  });

  describe('handleCleanup', () => {
    it('should delete R2 objects by prefix and hard-delete expired completed jobs', async () => {
      jest.useFakeTimers();
      const now = new Date('2026-04-01T03:00:00Z').getTime();
      jest.setSystemTime(now);

      const expiredJobs = [
        { id: 'job-1', storageKey: 'reports/batch-a/job-1.pdf' },
        { id: 'job-2', storageKey: 'reports/batch-a/job-2.pdf' },
      ] as ReportJob[];

      reportJobRepository.FindExpiredCompleted.mockResolvedValue(expiredJobs);
      storageProvider.DeleteByPrefix.mockResolvedValue(undefined);
      em.nativeDelete.mockResolvedValue(2);

      await job.handleCleanup();

      const expectedCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
      expect(reportJobRepository.FindExpiredCompleted).toHaveBeenCalledWith(
        expectedCutoff,
      );

      // Same prefix — only one DeleteByPrefix call
      expect(storageProvider.DeleteByPrefix).toHaveBeenCalledTimes(1);
      expect(storageProvider.DeleteByPrefix).toHaveBeenCalledWith(
        'reports/batch-a/',
      );

      expect(em.nativeDelete).toHaveBeenCalledWith(ReportJob, {
        id: { $in: ['job-1', 'job-2'] },
      });

      jest.useRealTimers();
    });

    it('should skip R2 deletion for jobs without storageKey', async () => {
      const expiredJobs = [
        { id: 'job-1', storageKey: undefined },
        { id: 'job-2', storageKey: 'reports/batch-b/job-2.pdf' },
      ] as ReportJob[];

      reportJobRepository.FindExpiredCompleted.mockResolvedValue(expiredJobs);
      storageProvider.DeleteByPrefix.mockResolvedValue(undefined);
      em.nativeDelete.mockResolvedValue(2);

      await job.handleCleanup();

      expect(storageProvider.DeleteByPrefix).toHaveBeenCalledTimes(1);
      expect(storageProvider.DeleteByPrefix).toHaveBeenCalledWith(
        'reports/batch-b/',
      );
    });

    it('should continue cleanup when R2 deletion fails', async () => {
      const expiredJobs = [
        { id: 'job-1', storageKey: 'reports/batch-c/job-1.pdf' },
        { id: 'job-2', storageKey: 'reports/batch-d/job-2.pdf' },
      ] as ReportJob[];

      reportJobRepository.FindExpiredCompleted.mockResolvedValue(expiredJobs);
      storageProvider.DeleteByPrefix.mockRejectedValueOnce(
        new Error('R2 unavailable'),
      ).mockResolvedValueOnce(undefined);
      em.nativeDelete.mockResolvedValue(2);

      const warnSpy = jest.spyOn(job['logger'], 'warn');

      await job.handleCleanup();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete R2 prefix reports/batch-c/'),
      );
      // Both prefixes attempted
      expect(storageProvider.DeleteByPrefix).toHaveBeenCalledTimes(2);
      expect(em.nativeDelete).toHaveBeenCalledWith(ReportJob, {
        id: { $in: ['job-1', 'job-2'] },
      });
    });

    it('should not call nativeDelete when no expired jobs found', async () => {
      reportJobRepository.FindExpiredCompleted.mockResolvedValue([]);
      em.nativeDelete.mockResolvedValue(0);

      await job.handleCleanup();

      // First nativeDelete call should be for orphaned jobs only
      expect(em.nativeDelete).toHaveBeenCalledTimes(1);
      expect(em.nativeDelete).toHaveBeenCalledWith(ReportJob, {
        status: 'waiting',
        createdAt: { $lt: expect.any(Date) as Date },
      });
    });

    it('should hard-delete orphaned waiting jobs older than 1 hour', async () => {
      jest.useFakeTimers();
      const now = new Date('2026-04-01T03:00:00Z').getTime();
      jest.setSystemTime(now);

      reportJobRepository.FindExpiredCompleted.mockResolvedValue([]);
      em.nativeDelete.mockResolvedValue(3);

      await job.handleCleanup();

      const orphanCutoff = new Date(now - 60 * 60 * 1000);
      expect(em.nativeDelete).toHaveBeenCalledWith(ReportJob, {
        status: 'waiting',
        createdAt: { $lt: orphanCutoff },
      });

      jest.useRealTimers();
    });

    it('should log the cleanup summary', async () => {
      reportJobRepository.FindExpiredCompleted.mockResolvedValue([
        { id: 'job-1', storageKey: 'key' },
      ] as ReportJob[]);
      storageProvider.Delete.mockResolvedValue(undefined);
      em.nativeDelete
        .mockResolvedValueOnce(1) // expired jobs delete
        .mockResolvedValueOnce(2); // orphaned jobs delete

      const logSpy = jest.spyOn(job['logger'], 'log');

      await job.handleCleanup();

      expect(logSpy).toHaveBeenCalledWith(
        'Cleaned up 1 expired + 2 orphaned report jobs',
      );
    });

    it('should skip execution when already running', async () => {
      job['isRunning'] = true;
      const logSpy = jest.spyOn(job['logger'], 'log');

      await job.handleCleanup();

      expect(reportJobRepository.FindExpiredCompleted).not.toHaveBeenCalled();
      expect(em.nativeDelete).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        'ReportCleanupJob is already running',
      );
    });

    it('should reset isRunning after successful execution', async () => {
      reportJobRepository.FindExpiredCompleted.mockResolvedValue([]);
      em.nativeDelete.mockResolvedValue(0);

      await job.handleCleanup();

      expect(job['isRunning']).toBe(false);
    });

    it('should reset isRunning after failed execution', async () => {
      reportJobRepository.FindExpiredCompleted.mockRejectedValue(
        new Error('DB error'),
      );

      await job.handleCleanup();

      expect(job['isRunning']).toBe(false);
    });

    it('should return failed status and log error when an exception occurs', async () => {
      reportJobRepository.FindExpiredCompleted.mockRejectedValue(
        new Error('DB connection lost'),
      );
      const errorSpy = jest.spyOn(job['logger'], 'error');

      await job.handleCleanup();

      expect(errorSpy).toHaveBeenCalledWith(
        'Error during report cleanup:',
        'DB connection lost',
      );
    });
  });
});
