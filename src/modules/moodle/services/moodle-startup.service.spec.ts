/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { MoodleStartupService } from './moodle-startup.service';
import { MoodleCategorySyncService } from './moodle-category-sync.service';
import { MoodleCourseSyncService } from './moodle-course-sync.service';
import { EnrollmentSyncService } from './moodle-enrollment-sync.service';
import { CacheService } from 'src/modules/common/cache/cache.service';
import { CacheNamespace } from 'src/modules/common/cache/cache-namespaces';
import { StartupJobRegistry } from 'src/crons/startup-job-registry';
import { env } from 'src/configurations/env';

describe('MoodleStartupService', () => {
  let service: MoodleStartupService;
  let categorySyncService: jest.Mocked<MoodleCategorySyncService>;
  let courseSyncService: jest.Mocked<MoodleCourseSyncService>;
  let enrollmentSyncService: jest.Mocked<EnrollmentSyncService>;
  let cacheService: jest.Mocked<CacheService>;
  let mockCount: jest.Mock;
  let registrySpy: jest.SpyInstance;

  beforeEach(async () => {
    mockCount = jest.fn().mockResolvedValue(0);
    const forkEm = { count: mockCount };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleStartupService,
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
        {
          provide: EntityManager,
          useValue: { fork: jest.fn().mockReturnValue(forkEm) },
        },
      ],
    }).compile();

    service = module.get(MoodleStartupService);
    categorySyncService = module.get(MoodleCategorySyncService);
    courseSyncService = module.get(MoodleCourseSyncService);
    enrollmentSyncService = module.get(EnrollmentSyncService);
    cacheService = module.get(CacheService);

    registrySpy = jest
      .spyOn(StartupJobRegistry, 'record')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    registrySpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('when SYNC_ON_STARTUP is false', () => {
    beforeEach(() => {
      Object.defineProperty(env, 'SYNC_ON_STARTUP', {
        value: false,
        configurable: true,
      });
    });

    it('should only sync categories', async () => {
      await service.RunStartupSync();

      expect(categorySyncService.SyncAndRebuildHierarchy).toHaveBeenCalled();
      expect(courseSyncService.SyncAllPrograms).not.toHaveBeenCalled();
      expect(enrollmentSyncService.SyncAllCourses).not.toHaveBeenCalled();
    });

    it('should register category as executed, courses and enrollments as skipped', async () => {
      await service.RunStartupSync();

      expect(registrySpy).toHaveBeenCalledWith(
        'CategorySync',
        expect.objectContaining({ status: 'executed' }),
      );
      expect(registrySpy).toHaveBeenCalledWith('CourseSync', {
        status: 'skipped',
      });
      expect(registrySpy).toHaveBeenCalledWith('EnrollmentSync', {
        status: 'skipped',
      });
    });

    it('should log warning when zero courses exist', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.RunStartupSync();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No courses found'),
      );
    });

    it('should not log warning when courses exist', async () => {
      mockCount.mockResolvedValue(5);
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.RunStartupSync();

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('when SYNC_ON_STARTUP is true', () => {
    beforeEach(() => {
      Object.defineProperty(env, 'SYNC_ON_STARTUP', {
        value: true,
        configurable: true,
      });
    });

    it('should sync categories, courses, and enrollments in sequence', async () => {
      const callOrder: string[] = [];
      categorySyncService.SyncAndRebuildHierarchy.mockImplementation(() => {
        callOrder.push('categories');
        return Promise.resolve();
      });
      courseSyncService.SyncAllPrograms.mockImplementation(() => {
        callOrder.push('courses');
        return Promise.resolve();
      });
      enrollmentSyncService.SyncAllCourses.mockImplementation(() => {
        callOrder.push('enrollments');
        return Promise.resolve();
      });

      await service.RunStartupSync();

      expect(callOrder).toEqual(['categories', 'courses', 'enrollments']);
    });

    it('should register all three as executed', async () => {
      await service.RunStartupSync();

      expect(registrySpy).toHaveBeenCalledWith(
        'CategorySync',
        expect.objectContaining({ status: 'executed' }),
      );
      expect(registrySpy).toHaveBeenCalledWith(
        'CourseSync',
        expect.objectContaining({ status: 'executed' }),
      );
      expect(registrySpy).toHaveBeenCalledWith(
        'EnrollmentSync',
        expect.objectContaining({ status: 'executed' }),
      );
    });

    it('should invalidate enrollment cache after enrollment sync', async () => {
      await service.RunStartupSync();

      expect(cacheService.invalidateNamespace).toHaveBeenCalledWith(
        CacheNamespace.ENROLLMENTS_ME,
      );
    });

    it('should not invalidate cache if enrollment sync fails', async () => {
      enrollmentSyncService.SyncAllCourses.mockRejectedValue(
        new Error('sync failed'),
      );

      await service.RunStartupSync();

      expect(cacheService.invalidateNamespace).not.toHaveBeenCalled();
      expect(registrySpy).toHaveBeenCalledWith(
        'EnrollmentSync',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('should abort course and enrollment sync when category sync fails', async () => {
      categorySyncService.SyncAndRebuildHierarchy.mockRejectedValue(
        new Error('Moodle unreachable'),
      );

      await service.RunStartupSync();

      expect(courseSyncService.SyncAllPrograms).not.toHaveBeenCalled();
      expect(enrollmentSyncService.SyncAllCourses).not.toHaveBeenCalled();
      const courseSyncCall = registrySpy.mock.calls.find(
        (call: [string, unknown]) => call[0] === 'CourseSync',
      ) as [string, { status: string; details?: string }] | undefined;
      expect(courseSyncCall).toBeDefined();
      expect(courseSyncCall![1].status).toBe('skipped');
      expect(courseSyncCall![1].details).toContain('category sync failed');
    });

    it('should abort enrollment sync when course sync fails', async () => {
      courseSyncService.SyncAllPrograms.mockRejectedValue(new Error('timeout'));

      await service.RunStartupSync();

      expect(enrollmentSyncService.SyncAllCourses).not.toHaveBeenCalled();
      const enrollSyncCall = registrySpy.mock.calls.find(
        (call: [string, unknown]) => call[0] === 'EnrollmentSync',
      ) as [string, { status: string; details?: string }] | undefined;
      expect(enrollSyncCall).toBeDefined();
      expect(enrollSyncCall![1].status).toBe('skipped');
      expect(enrollSyncCall![1].details).toContain('course sync failed');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      Object.defineProperty(env, 'SYNC_ON_STARTUP', {
        value: false,
        configurable: true,
      });
    });

    it('should register failed phase when category sync throws', async () => {
      categorySyncService.SyncAndRebuildHierarchy.mockRejectedValue(
        new Error('Moodle unreachable'),
      );

      await service.RunStartupSync();

      expect(registrySpy).toHaveBeenCalledWith(
        'CategorySync',
        expect.objectContaining({
          status: 'failed',
          details: 'Moodle unreachable',
        }),
      );
    });
  });
});
