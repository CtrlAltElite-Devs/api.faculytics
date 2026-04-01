import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Job } from 'bullmq';
import { ReportJob } from 'src/entities/report-job.entity';
import { AnalyticsService } from 'src/modules/analytics/analytics.service';
import { PdfService } from '../services/pdf.service';
import { STORAGE_PROVIDER } from '../interfaces/storage-provider.interface';
import {
  ReportGenerationProcessor,
  ReportJobMessage,
} from './report-generation.processor';

describe('ReportGenerationProcessor', () => {
  let processor: ReportGenerationProcessor;
  let mockFork: {
    findOneOrFail: jest.Mock;
    findOne: jest.Mock;
    flush: jest.Mock;
  };
  let mockEm: { fork: jest.Mock };
  let mockAnalyticsService: {
    GetFacultyReportUnscoped: jest.Mock;
    GetAllFacultyReportComments: jest.Mock;
  };
  let mockPdfService: { GenerateFacultyEvaluationPdf: jest.Mock };
  let mockStorageProvider: { Upload: jest.Mock };

  const jobData: ReportJobMessage = {
    reportJobId: 'rj-1',
    facultyId: 'faculty-1',
    semesterId: 'sem-1',
    questionnaireTypeCode: 'EVAL',
  };

  const mockReportJob: Partial<ReportJob> = {
    id: 'rj-1',
    status: 'waiting',
    batchId: 'batch-1',
  };

  beforeEach(async () => {
    mockFork = {
      findOneOrFail: jest.fn().mockResolvedValue({ ...mockReportJob }),
      findOne: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    mockEm = { fork: jest.fn().mockReturnValue(mockFork) };

    mockAnalyticsService = {
      GetFacultyReportUnscoped: jest.fn(),
      GetAllFacultyReportComments: jest.fn(),
    };

    mockPdfService = {
      GenerateFacultyEvaluationPdf: jest.fn(),
    };

    mockStorageProvider = {
      Upload: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportGenerationProcessor,
        { provide: EntityManager, useValue: mockEm },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: PdfService, useValue: mockPdfService },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
      ],
    }).compile();

    processor = module.get<ReportGenerationProcessor>(
      ReportGenerationProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process — happy path', () => {
    it('should fetch data, generate PDF, upload, and set status to completed', async () => {
      const reportData = { submissionCount: 10 };
      const comments = [{ text: 'Great course' }];
      const pdfBuffer = Buffer.from('pdf-content');

      mockAnalyticsService.GetFacultyReportUnscoped.mockResolvedValue(
        reportData,
      );
      mockAnalyticsService.GetAllFacultyReportComments.mockResolvedValue(
        comments,
      );
      mockPdfService.GenerateFacultyEvaluationPdf.mockResolvedValue(pdfBuffer);

      const reportJobEntity = { ...mockReportJob };
      mockFork.findOneOrFail.mockResolvedValue(reportJobEntity);

      const mockJob = { data: jobData } as Job<ReportJobMessage>;
      await processor.process(mockJob);

      // Forks the EntityManager
      expect(mockEm.fork).toHaveBeenCalled();

      // Loads the ReportJob entity and sets status to active
      expect(mockFork.findOneOrFail).toHaveBeenCalledWith(ReportJob, 'rj-1');
      expect(reportJobEntity.status).toBe('completed');

      // Fetches report data
      expect(
        mockAnalyticsService.GetFacultyReportUnscoped,
      ).toHaveBeenCalledWith('faculty-1', {
        semesterId: 'sem-1',
        questionnaireTypeCode: 'EVAL',
      });

      // Fetches comments
      expect(
        mockAnalyticsService.GetAllFacultyReportComments,
      ).toHaveBeenCalledWith('faculty-1', {
        semesterId: 'sem-1',
        questionnaireTypeCode: 'EVAL',
      });

      // Generates PDF
      expect(mockPdfService.GenerateFacultyEvaluationPdf).toHaveBeenCalledWith(
        reportData,
        comments,
      );

      // Uploads to storage
      const expectedKey =
        'reports/faculty_evaluation/sem-1/batch-1/faculty-1.pdf';
      expect(mockStorageProvider.Upload).toHaveBeenCalledWith(
        expectedKey,
        pdfBuffer,
        'application/pdf',
      );

      // Updates entity with completed status and storage key
      expect(reportJobEntity.storageKey).toBe(expectedKey);
      expect(reportJobEntity.completedAt).toBeInstanceOf(Date);

      // Flushes changes (initial active + final completed)
      expect(mockFork.flush).toHaveBeenCalledTimes(2);
    });

    it('should use reportJob.id as storage key segment when batchId is absent', async () => {
      const reportJobEntity = { ...mockReportJob, batchId: undefined };
      mockFork.findOneOrFail.mockResolvedValue(reportJobEntity);
      mockAnalyticsService.GetFacultyReportUnscoped.mockResolvedValue({
        submissionCount: 5,
      });
      mockAnalyticsService.GetAllFacultyReportComments.mockResolvedValue([]);
      mockPdfService.GenerateFacultyEvaluationPdf.mockResolvedValue(
        Buffer.from('pdf'),
      );

      await processor.process({ data: jobData } as Job<ReportJobMessage>);

      const expectedKey = 'reports/faculty_evaluation/sem-1/rj-1/faculty-1.pdf';
      expect(mockStorageProvider.Upload).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Buffer),
        'application/pdf',
      );
    });
  });

  describe('process — skipped (no submissions)', () => {
    it('should set status to skipped when submissionCount is 0', async () => {
      const reportJobEntity = { ...mockReportJob };
      mockFork.findOneOrFail.mockResolvedValue(reportJobEntity);
      mockAnalyticsService.GetFacultyReportUnscoped.mockResolvedValue({
        submissionCount: 0,
      });

      await processor.process({ data: jobData } as Job<ReportJobMessage>);

      expect(reportJobEntity.status).toBe('skipped');
      expect(reportJobEntity.completedAt).toBeInstanceOf(Date);

      // Should NOT generate PDF, fetch comments, or upload
      expect(
        mockAnalyticsService.GetAllFacultyReportComments,
      ).not.toHaveBeenCalled();
      expect(
        mockPdfService.GenerateFacultyEvaluationPdf,
      ).not.toHaveBeenCalled();
      expect(mockStorageProvider.Upload).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('should update report job status to failed on final attempt', async () => {
      const reportJobEntity = { status: 'active' as const, error: undefined };
      mockFork.findOne.mockResolvedValue(reportJobEntity);

      const mockJob = {
        id: 'bull-job-1',
        data: jobData,
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job<ReportJobMessage>;

      await processor.onFailed(mockJob, new Error('Worker crashed'));

      expect(mockEm.fork).toHaveBeenCalled();
      expect(mockFork.findOne).toHaveBeenCalledWith(ReportJob, 'rj-1');
      expect(reportJobEntity.status).toBe('failed');
      expect(reportJobEntity.error).toBe('Worker crashed');
      expect(mockFork.flush).toHaveBeenCalled();
    });

    it('should skip DB update on non-final attempt', async () => {
      const mockJob = {
        id: 'bull-job-4',
        data: jobData,
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job<ReportJobMessage>;

      await processor.onFailed(mockJob, new Error('transient error'));

      expect(mockEm.fork).not.toHaveBeenCalled();
      expect(mockFork.flush).not.toHaveBeenCalled();
    });

    it('should not throw if the report job entity is not found', async () => {
      mockFork.findOne.mockResolvedValue(null);

      const mockJob = {
        id: 'bull-job-2',
        data: jobData,
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job<ReportJobMessage>;

      await expect(
        processor.onFailed(mockJob, new Error('some error')),
      ).resolves.toBeUndefined();

      expect(mockFork.flush).not.toHaveBeenCalled();
    });

    it('should not throw if the DB update itself fails', async () => {
      mockFork.findOne.mockRejectedValue(new Error('DB connection lost'));

      const mockJob = {
        id: 'bull-job-3',
        data: jobData,
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job<ReportJobMessage>;

      await expect(
        processor.onFailed(mockJob, new Error('original error')),
      ).resolves.toBeUndefined();
    });
  });
});
