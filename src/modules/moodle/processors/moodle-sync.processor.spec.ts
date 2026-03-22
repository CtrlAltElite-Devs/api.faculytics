/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MoodleSyncProcessor } from './moodle-sync.processor';
import { MoodleCategorySyncService } from '../services/moodle-category-sync.service';
import { MoodleCourseSyncService } from '../services/moodle-course-sync.service';
import { EnrollmentSyncService } from '../services/moodle-enrollment-sync.service';
import { CacheService } from 'src/modules/common/cache/cache.service';
import { CacheNamespace } from 'src/modules/common/cache/cache-namespaces';
import { QueueName } from 'src/configurations/common/queue-names';

describe('MoodleSyncProcessor', () => {
  let processor: MoodleSyncProcessor;
  let categorySyncService: jest.Mocked<MoodleCategorySyncService>;
  let courseSyncService: jest.Mocked<MoodleCourseSyncService>;
  let enrollmentSyncService: jest.Mocked<EnrollmentSyncService>;
  let cacheService: jest.Mocked<CacheService>;

  const mockJob = {
    id: 'test-job-1',
    data: { trigger: 'manual' },
    queueName: QueueName.MOODLE_SYNC,
    attemptsMade: 1,
  } as Job<{ trigger?: string }>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleSyncProcessor,
        {
          provide: MoodleCategorySyncService,
          useValue: {
            SyncAndRebuildHierarchy: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MoodleCourseSyncService,
          useValue: { SyncAllPrograms: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EnrollmentSyncService,
          useValue: { SyncAllCourses: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CacheService,
          useValue: {
            invalidateNamespace: jest.fn().mockResolvedValue(undefined),
          },
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
    expect(result).toEqual({
      categories: true,
      courses: true,
      enrollments: true,
    });
  });

  it('should invalidate enrollment cache after successful enrollment sync', async () => {
    await processor.process(mockJob);

    expect(cacheService.invalidateNamespace).toHaveBeenCalledWith(
      CacheNamespace.ENROLLMENTS_ME,
    );
  });

  it('should abort courses and enrollments when category sync fails', async () => {
    categorySyncService.SyncAndRebuildHierarchy.mockRejectedValue(
      new Error('Moodle down'),
    );

    const result = await processor.process(mockJob);

    expect(courseSyncService.SyncAllPrograms).not.toHaveBeenCalled();
    expect(enrollmentSyncService.SyncAllCourses).not.toHaveBeenCalled();
    expect(result).toEqual({
      categories: false,
      courses: false,
      enrollments: false,
    });
  });

  it('should abort enrollments when course sync fails', async () => {
    courseSyncService.SyncAllPrograms.mockRejectedValue(new Error('timeout'));

    const result = await processor.process(mockJob);

    expect(categorySyncService.SyncAndRebuildHierarchy).toHaveBeenCalled();
    expect(enrollmentSyncService.SyncAllCourses).not.toHaveBeenCalled();
    expect(result).toEqual({
      categories: true,
      courses: false,
      enrollments: false,
    });
  });

  it('should handle enrollment sync failure without crashing', async () => {
    enrollmentSyncService.SyncAllCourses.mockRejectedValue(
      new Error('deadlock'),
    );

    const result = await processor.process(mockJob);

    expect(result).toEqual({
      categories: true,
      courses: true,
      enrollments: false,
    });
    expect(cacheService.invalidateNamespace).not.toHaveBeenCalled();
  });
});
