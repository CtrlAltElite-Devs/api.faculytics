/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/core';
import { MoodleSyncProcessor } from './moodle-sync.processor';
import { MoodleCategorySyncService } from '../services/moodle-category-sync.service';
import { MoodleCourseSyncService } from '../services/moodle-course-sync.service';
import { EnrollmentSyncService } from '../services/moodle-enrollment-sync.service';
import { CacheService } from 'src/modules/common/cache/cache.service';
import { CacheNamespace } from 'src/modules/common/cache/cache-namespaces';
import { QueueName } from 'src/configurations/common/queue-names';
import type {
  MoodleSyncJobData,
  SyncPhaseResult,
} from '../lib/sync-result.types';

const successPhase = (
  overrides?: Partial<SyncPhaseResult>,
): SyncPhaseResult => ({
  status: 'success',
  durationMs: 100,
  fetched: 10,
  inserted: 2,
  updated: 8,
  deactivated: 0,
  errors: 0,
  ...overrides,
});

const failedPhase = (errorMessage: string): SyncPhaseResult => ({
  status: 'failed',
  durationMs: 50,
  fetched: 0,
  inserted: 0,
  updated: 0,
  deactivated: 0,
  errors: 1,
  errorMessage,
});

describe('MoodleSyncProcessor', () => {
  let processor: MoodleSyncProcessor;
  let categorySyncService: jest.Mocked<MoodleCategorySyncService>;
  let courseSyncService: jest.Mocked<MoodleCourseSyncService>;
  let enrollmentSyncService: jest.Mocked<EnrollmentSyncService>;
  let cacheService: jest.Mocked<CacheService>;
  let mockEm: {
    fork: jest.Mock;
    create: jest.Mock;
    persistAndFlush: jest.Mock;
    flush: jest.Mock;
    getReference: jest.Mock;
  };

  const mockJob = {
    id: 'test-job-1',
    data: { trigger: 'manual' } as MoodleSyncJobData,
    queueName: QueueName.MOODLE_SYNC,
    attemptsMade: 1,
  } as Job<MoodleSyncJobData>;

  beforeEach(async () => {
    mockEm = {
      create: jest.fn().mockReturnValue({ id: 'sync-log-1' }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      getReference: jest.fn().mockReturnValue({ id: 'user-1' }),
      fork: jest.fn(),
    };
    mockEm.fork.mockReturnValue(mockEm);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleSyncProcessor,
        {
          provide: MoodleCategorySyncService,
          useValue: {
            SyncAndRebuildHierarchy: jest
              .fn()
              .mockResolvedValue(successPhase()),
          },
        },
        {
          provide: MoodleCourseSyncService,
          useValue: {
            SyncAllPrograms: jest.fn().mockResolvedValue(successPhase()),
          },
        },
        {
          provide: EnrollmentSyncService,
          useValue: {
            SyncAllCourses: jest.fn().mockResolvedValue(successPhase()),
          },
        },
        {
          provide: CacheService,
          useValue: {
            invalidateNamespace: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EntityManager,
          useValue: mockEm,
        },
      ],
    }).compile();

    processor = module.get(MoodleSyncProcessor);
    categorySyncService = module.get(MoodleCategorySyncService);
    courseSyncService = module.get(MoodleCourseSyncService);
    enrollmentSyncService = module.get(EnrollmentSyncService);
    cacheService = module.get(CacheService);
  });

  it('should run all three phases in sequence when all succeed', async () => {
    const result = await processor.process(mockJob);

    expect(categorySyncService.SyncAndRebuildHierarchy).toHaveBeenCalled();
    expect(courseSyncService.SyncAllPrograms).toHaveBeenCalled();
    expect(enrollmentSyncService.SyncAllCourses).toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });

  it('should invalidate enrollment cache after successful enrollment sync', async () => {
    await processor.process(mockJob);

    expect(cacheService.invalidateNamespace).toHaveBeenCalledWith(
      CacheNamespace.ENROLLMENTS_ME,
    );
  });

  it('should abort courses and enrollments when category sync fails', async () => {
    categorySyncService.SyncAndRebuildHierarchy.mockResolvedValue(
      failedPhase('Moodle down'),
    );

    const result = await processor.process(mockJob);

    expect(courseSyncService.SyncAllPrograms).not.toHaveBeenCalled();
    expect(enrollmentSyncService.SyncAllCourses).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  it('should abort enrollments when course sync fails', async () => {
    courseSyncService.SyncAllPrograms.mockResolvedValue(failedPhase('timeout'));

    const result = await processor.process(mockJob);

    expect(categorySyncService.SyncAndRebuildHierarchy).toHaveBeenCalled();
    expect(enrollmentSyncService.SyncAllCourses).not.toHaveBeenCalled();
    expect(result.status).toBe('partial');
  });

  it('should handle enrollment sync failure without crashing', async () => {
    enrollmentSyncService.SyncAllCourses.mockResolvedValue(
      failedPhase('deadlock'),
    );

    const result = await processor.process(mockJob);

    expect(result.status).toBe('partial');
    expect(cacheService.invalidateNamespace).not.toHaveBeenCalled();
  });

  it('should create a SyncLog entry on job start', async () => {
    await processor.process(mockJob);

    expect(mockEm.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        trigger: 'manual',
        status: 'running',
        jobId: 'test-job-1',
      }),
    );
    expect(mockEm.persistAndFlush).toHaveBeenCalled();
  });
});
