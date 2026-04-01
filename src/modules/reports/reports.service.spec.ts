import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { ReportsService } from './reports.service';
import { ReportJobRepository } from 'src/repositories/report-job.repository';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { EntityManager } from '@mikro-orm/postgresql';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { UserRole } from 'src/modules/auth/roles.enum';
import type { ReportJobStatus } from 'src/entities/report-job.entity';

describe('ReportsService', () => {
  let service: ReportsService;
  let mockQueue: { add: jest.Mock; addBulk: jest.Mock };
  let mockReportJobRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let mockScopeResolver: { ResolveDepartmentIds: jest.Mock };
  let mockEntityManager: {
    fork: jest.Mock;
    nativeDelete: jest.Mock;
    execute: jest.Mock;
    getConnection: jest.Mock;
  };
  let mockStorageProvider: {
    GetPresignedUrl: jest.Mock;
    Upload: jest.Mock;
    Delete: jest.Mock;
    DeleteByPrefix: jest.Mock;
  };
  let mockCurrentUserService: { getOrFail: jest.Mock };

  // Shared test data
  const userId = 'user-001';
  const facultyId = 'faculty-001';
  const semesterId = 'semester-001';
  const questionnaireTypeCode = 'STUDENT_EVAL';

  const mockForkEm = {
    getReference: jest.fn().mockReturnValue({ id: userId }),
    create: jest.fn(),
    flush: jest.fn(),
  };

  const mockConnection = {
    execute: jest.fn(),
  };

  const baseDeanUser = {
    id: userId,
    roles: [UserRole.DEAN],
  };

  const baseSuperAdminUser = {
    id: userId,
    roles: [UserRole.SUPER_ADMIN],
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-job-1' }),
      addBulk: jest.fn().mockResolvedValue([]),
    };
    mockReportJobRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    mockScopeResolver = {
      ResolveDepartmentIds: jest.fn().mockResolvedValue(null),
    };
    mockConnection.execute = jest.fn().mockResolvedValue([]);
    mockEntityManager = {
      fork: jest.fn().mockReturnValue(mockForkEm),
      nativeDelete: jest.fn().mockResolvedValue(0),
      execute: mockConnection.execute,
      getConnection: jest.fn().mockReturnValue(mockConnection),
    };
    mockStorageProvider = {
      GetPresignedUrl: jest
        .fn()
        .mockResolvedValue('https://storage.example.com/presigned'),
      Upload: jest.fn().mockResolvedValue(undefined),
      Delete: jest.fn().mockResolvedValue(undefined),
      DeleteByPrefix: jest.fn().mockResolvedValue(undefined),
    };
    mockCurrentUserService = {
      getOrFail: jest.fn().mockReturnValue(baseDeanUser),
    };

    // Reset fork em mocks
    mockForkEm.getReference = jest.fn().mockReturnValue({ id: userId });
    mockForkEm.create = jest
      .fn()
      .mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => ({
          id: 'report-job-001',
          ...data,
        }),
      );
    mockForkEm.flush = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getQueueToken(QueueName.REPORT_GENERATION),
          useValue: mockQueue,
        },
        { provide: ReportJobRepository, useValue: mockReportJobRepository },
        { provide: EntityManager, useValue: mockEntityManager },
        { provide: ScopeResolverService, useValue: mockScopeResolver },
        { provide: CurrentUserService, useValue: mockCurrentUserService },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('GenerateSingle', () => {
    const dto = { facultyId, semesterId, questionnaireTypeCode };

    beforeEach(() => {
      // Semester validation passes
      mockConnection.execute.mockImplementation((sql: string) => {
        if (sql.includes('FROM semester')) {
          return [{ id: semesterId }];
        }
        if (sql.includes('FROM "user"')) {
          return [
            { department_id: 'dept-001', first_name: 'John', last_name: 'Doe' },
          ];
        }
        return [];
      });
      // Scope: dean with access
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue(['dept-001']);
    });

    it('should create entity, enqueue job, and return jobId', async () => {
      const result = await service.GenerateSingle(dto, userId);

      expect(result).toEqual({ jobId: 'report-job-001' });

      // Semester was validated
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('FROM semester'),
        [semesterId],
      );

      // Scope was validated
      expect(mockScopeResolver.ResolveDepartmentIds).toHaveBeenCalledWith(
        semesterId,
      );

      // Entity was created via fork
      expect(mockEntityManager.fork).toHaveBeenCalled();
      expect(mockForkEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          reportType: 'faculty_evaluation',
          status: 'waiting',
          facultyId,
          semesterId,
          questionnaireTypeCode,
        }),
      );
      expect(mockForkEm.flush).toHaveBeenCalled();

      // Job was enqueued
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [name, message, opts] = mockQueue.add.mock.calls[0] as [
        string,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(name).toBe('report');
      expect(message).toMatchObject({
        reportJobId: 'report-job-001',
        facultyId,
        semesterId,
        questionnaireTypeCode,
      });
      expect(opts.removeOnComplete).toBe(true);
      expect(opts.removeOnFail).toBe(100);
    });

    it('should throw ForbiddenException when faculty is out of scope', async () => {
      // Faculty belongs to dept-002 but dean only has access to dept-001
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue(['dept-001']);
      mockConnection.execute.mockImplementation((sql: string) => {
        if (sql.includes('FROM semester')) {
          return [{ id: semesterId }];
        }
        if (sql.includes('FROM "user"')) {
          return [
            {
              department_id: 'dept-002',
              first_name: 'Jane',
              last_name: 'Smith',
            },
          ];
        }
        return [];
      });

      await expect(service.GenerateSingle(dto, userId)).rejects.toThrow(
        ForbiddenException,
      );
      // Should never reach entity creation or enqueue
      expect(mockForkEm.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return existing jobId when duplicate pending job exists (dedup)', async () => {
      const existingJob = { id: 'existing-job-id' };
      mockReportJobRepository.findOne.mockResolvedValueOnce(existingJob);

      const result = await service.GenerateSingle(dto, userId);

      expect(result).toEqual({ jobId: 'existing-job-id' });
      // Should not create a new entity or enqueue
      expect(mockForkEm.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should delete entity on BullMQ enqueue failure (orphan protection)', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis ECONNREFUSED'));

      await expect(service.GenerateSingle(dto, userId)).rejects.toThrow(
        'Redis ECONNREFUSED',
      );

      // Entity was created
      expect(mockForkEm.create).toHaveBeenCalled();
      expect(mockForkEm.flush).toHaveBeenCalled();

      // Orphaned entity was cleaned up
      expect(mockEntityManager.nativeDelete).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'report-job-001' },
      );
    });

    it('should throw NotFoundException when semester does not exist', async () => {
      mockConnection.execute.mockImplementation((sql: string) => {
        if (sql.includes('FROM semester')) {
          return [];
        }
        return [];
      });

      await expect(service.GenerateSingle(dto, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GenerateBatch', () => {
    const batchDto = { semesterId, questionnaireTypeCode };

    beforeEach(() => {
      mockConnection.execute.mockImplementation((sql: string) => {
        if (sql.includes('FROM semester')) {
          return [{ id: semesterId }];
        }
        if (sql.includes('questionnaire_submission')) {
          return [
            { faculty_id: 'fac-1', first_name: 'Alice', last_name: 'A' },
            { faculty_id: 'fac-2', first_name: 'Bob', last_name: 'B' },
          ];
        }
        return [];
      });
      // Super admin scope (unrestricted)
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
    });

    it('should enforce batch size cap and throw BadRequestException', async () => {
      // Create an array exceeding REPORT_BATCH_MAX_SIZE (default 100)
      const largeFacultyList = Array.from({ length: 101 }, (_, i) => ({
        faculty_id: `fac-${i}`,
        first_name: `Name${i}`,
        last_name: `Last${i}`,
      }));
      mockConnection.execute.mockImplementation((sql: string) => {
        if (sql.includes('FROM semester')) {
          return [{ id: semesterId }];
        }
        if (sql.includes('questionnaire_submission')) {
          return largeFacultyList;
        }
        return [];
      });

      await expect(service.GenerateBatch(batchDto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should skip already-queued faculty and return correct skippedCount', async () => {
      // Bulk dedup: fac-1 already has a pending job
      mockReportJobRepository.find.mockResolvedValueOnce([
        { id: 'existing-job', facultyId: 'fac-1' },
      ]);

      const result = await service.GenerateBatch(batchDto, userId);

      expect(result.skippedCount).toBe(1);
      expect(result.jobCount).toBe(1);
      // addBulk called with 1 job (fac-2 only)
      expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
      expect(mockQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'report' })]),
      );
    });

    it('should return jobCount 0 and correct skippedCount when all faculty are already queued', async () => {
      // Bulk dedup: both faculty already have pending jobs
      mockReportJobRepository.find.mockResolvedValueOnce([
        { id: 'existing-job-1', facultyId: 'fac-1' },
        { id: 'existing-job-2', facultyId: 'fac-2' },
      ]);

      const result = await service.GenerateBatch(batchDto, userId);

      expect(result.jobCount).toBe(0);
      expect(result.skippedCount).toBe(2);
      expect(mockQueue.addBulk).not.toHaveBeenCalled();
    });
  });

  describe('GetJobStatus', () => {
    it('should generate fresh presigned URL for completed jobs', async () => {
      const completedJob = {
        id: 'job-001',
        status: 'completed' as ReportJobStatus,
        facultyName: 'John Doe',
        storageKey: 'reports/job-001.pdf',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        completedAt: new Date('2026-01-15T10:05:00Z'),
        requestedBy: { id: userId },
      };
      mockReportJobRepository.findOne.mockResolvedValue(completedJob);
      mockCurrentUserService.getOrFail.mockReturnValue(baseDeanUser);

      const result = await service.GetJobStatus('job-001', userId);

      expect(result.jobId).toBe('job-001');
      expect(result.status).toBe('completed');
      expect(result.downloadUrl).toBe('https://storage.example.com/presigned');
      expect(result.expiresAt).toBeDefined();
      expect(result.completedAt).toBe('2026-01-15T10:05:00.000Z');
      expect(mockStorageProvider.GetPresignedUrl).toHaveBeenCalledWith(
        'reports/job-001.pdf',
        expect.any(Number),
      );
    });

    it('should return 404 for jobs not owned by requesting user', async () => {
      const otherUsersJob = {
        id: 'job-002',
        status: 'waiting' as ReportJobStatus,
        facultyName: 'Jane Smith',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        requestedBy: { id: 'other-user-id' },
      };
      mockReportJobRepository.findOne.mockResolvedValue(otherUsersJob);
      // Non-admin user requesting someone else's job
      mockCurrentUserService.getOrFail.mockReturnValue({
        id: userId,
        roles: [UserRole.DEAN],
      });

      await expect(service.GetJobStatus('job-002', userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow super admin to access any job', async () => {
      const otherUsersJob = {
        id: 'job-003',
        status: 'waiting' as ReportJobStatus,
        facultyName: 'Jane Smith',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        requestedBy: { id: 'other-user-id' },
      };
      mockReportJobRepository.findOne.mockResolvedValue(otherUsersJob);
      mockCurrentUserService.getOrFail.mockReturnValue(baseSuperAdminUser);

      const result = await service.GetJobStatus('job-003', userId);

      expect(result.jobId).toBe('job-003');
      expect(result.status).toBe('waiting');
    });

    it('should throw NotFoundException when job does not exist', async () => {
      mockReportJobRepository.findOne.mockResolvedValue(null);

      await expect(
        service.GetJobStatus('nonexistent-id', userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include error field for failed jobs', async () => {
      const failedJob = {
        id: 'job-fail',
        status: 'failed' as ReportJobStatus,
        facultyName: 'Jane Smith',
        error: 'Worker timeout',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        requestedBy: { id: userId },
      };
      mockReportJobRepository.findOne.mockResolvedValue(failedJob);

      const result = await service.GetJobStatus('job-fail', userId);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Worker timeout');
      expect(result.downloadUrl).toBeUndefined();
    });
  });

  describe('GetBatchStatus', () => {
    const setupBatchMocks = (
      batchId: string,
      ownerId: string,
      countRows: { status: string; count: string }[],
      pageJobs: Record<string, unknown>[],
    ) => {
      // findOne for ownership check
      mockReportJobRepository.findOne.mockResolvedValue({
        id: 'j1',
        requestedBy: { id: ownerId },
        batchId,
      });
      // SQL count aggregation
      mockConnection.execute.mockResolvedValue(countRows);
      // find for paginated jobs
      mockReportJobRepository.find.mockResolvedValue(pageJobs);
    };

    it('should aggregate counts correctly', async () => {
      const batchId = 'batch-001';
      const pageJobs = [
        {
          id: 'j1',
          status: 'completed' as ReportJobStatus,
          facultyName: 'Alice A',
          storageKey: 'reports/j1.pdf',
          createdAt: new Date('2026-01-15T10:00:00Z'),
          completedAt: new Date('2026-01-15T10:05:00Z'),
          requestedBy: { id: userId },
        },
        {
          id: 'j2',
          status: 'completed' as ReportJobStatus,
          facultyName: 'Bob B',
          storageKey: 'reports/j2.pdf',
          createdAt: new Date('2026-01-15T10:00:00Z'),
          completedAt: new Date('2026-01-15T10:06:00Z'),
          requestedBy: { id: userId },
        },
        {
          id: 'j3',
          status: 'failed' as ReportJobStatus,
          facultyName: 'Carol C',
          error: 'Worker error',
          createdAt: new Date('2026-01-15T10:00:00Z'),
          requestedBy: { id: userId },
        },
        {
          id: 'j4',
          status: 'waiting' as ReportJobStatus,
          facultyName: 'Dave D',
          createdAt: new Date('2026-01-15T10:00:00Z'),
          requestedBy: { id: userId },
        },
        {
          id: 'j5',
          status: 'active' as ReportJobStatus,
          facultyName: 'Eve E',
          createdAt: new Date('2026-01-15T10:00:00Z'),
          requestedBy: { id: userId },
        },
      ];
      setupBatchMocks(
        batchId,
        userId,
        [
          { status: 'completed', count: '2' },
          { status: 'failed', count: '1' },
          { status: 'waiting', count: '1' },
          { status: 'active', count: '1' },
        ],
        pageJobs,
      );
      mockCurrentUserService.getOrFail.mockReturnValue(baseDeanUser);

      const result = await service.GetBatchStatus(batchId, userId);

      expect(result.batchId).toBe(batchId);
      expect(result.total).toBe(5);
      expect(result.completed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.waiting).toBe(1);
      expect(result.active).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.jobs).toHaveLength(5);

      // Pagination meta
      expect(result.meta.totalItems).toBe(5);
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.itemCount).toBe(5);
    });

    it('should throw NotFoundException for non-existent batch', async () => {
      mockReportJobRepository.findOne.mockResolvedValue(null);

      await expect(
        service.GetBatchStatus('nonexistent-batch', userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user does not own the batch', async () => {
      mockReportJobRepository.findOne.mockResolvedValue({
        id: 'j1',
        requestedBy: { id: 'other-user-id' },
        batchId: 'batch-002',
      });
      mockCurrentUserService.getOrFail.mockReturnValue({
        id: userId,
        roles: [UserRole.DEAN],
      });

      await expect(service.GetBatchStatus('batch-002', userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should paginate results correctly', async () => {
      const batchId = 'batch-paginate';
      const pageJobs = Array.from({ length: 2 }, (_, i) => ({
        id: `j${i + 2}`,
        status: 'waiting' as ReportJobStatus,
        facultyName: `Faculty ${i + 2}`,
        createdAt: new Date('2026-01-15T10:00:00Z'),
        requestedBy: { id: userId },
      }));
      setupBatchMocks(
        batchId,
        userId,
        [{ status: 'waiting', count: '5' }],
        pageJobs,
      );
      mockCurrentUserService.getOrFail.mockReturnValue(baseDeanUser);

      const result = await service.GetBatchStatus(batchId, userId, 2, 2);

      expect(result.meta.currentPage).toBe(2);
      expect(result.meta.itemsPerPage).toBe(2);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.totalItems).toBe(5);
      expect(result.meta.itemCount).toBe(2);
      expect(result.jobs).toHaveLength(2);
      // Verify DB-level pagination was used
      expect(mockReportJobRepository.find).toHaveBeenCalledWith(
        { batchId },
        expect.objectContaining({ limit: 2, offset: 2 }),
      );
    });
  });
});
