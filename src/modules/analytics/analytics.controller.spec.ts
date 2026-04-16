import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { CurrentUserService } from '../common/cls/current-user.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockAnalyticsService: {
    GetDepartmentOverview: jest.Mock;
    GetAttentionList: jest.Mock;
    GetFacultyTrends: jest.Mock;
    GetFacultyReport: jest.Mock;
    GetFacultyReportComments: jest.Mock;
  };

  beforeEach(async () => {
    mockAnalyticsService = {
      GetDepartmentOverview: jest.fn(),
      GetAttentionList: jest.fn(),
      GetFacultyTrends: jest.fn(),
      GetFacultyReport: jest.fn(),
      GetFacultyReportComments: jest.fn(),
    };

    const mockCurrentUserService = {
      // Default: a SUPER_ADMIN-equivalent stub so assertFacultySelfScope
      // never throws in delegation tests. Faculty-specific authz tests can
      // override per-suite.
      getOrFail: jest.fn().mockReturnValue({
        id: 'super-admin-id',
        roles: ['SUPER_ADMIN'],
      }),
      get: jest.fn().mockReturnValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: CurrentUserService, useValue: mockCurrentUserService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CurrentUserInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  describe('GetDepartmentOverview', () => {
    it('should delegate to AnalyticsService with correct parameters', async () => {
      const query = {
        semesterId: '550e8400-e29b-41d4-a716-446655440000',
        programCode: 'BSCS',
      };
      const expectedResult = {
        summary: {
          totalFaculty: 1,
          totalSubmissions: 50,
          totalAnalyzed: 30,
          positiveCount: 20,
          negativeCount: 5,
          neutralCount: 5,
        },
        faculty: [],
        lastRefreshedAt: '2026-03-22T10:00:00.000Z',
      };
      mockAnalyticsService.GetDepartmentOverview.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.GetDepartmentOverview(query);

      expect(mockAnalyticsService.GetDepartmentOverview).toHaveBeenCalledWith(
        query.semesterId,
        query,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('GetAttentionList', () => {
    it('should delegate to AnalyticsService with semesterId and query', async () => {
      const query = {
        semesterId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const expectedResult = {
        items: [],
        lastRefreshedAt: null,
      };
      mockAnalyticsService.GetAttentionList.mockResolvedValue(expectedResult);

      const result = await controller.GetAttentionList(query);

      expect(mockAnalyticsService.GetAttentionList).toHaveBeenCalledWith(
        query.semesterId,
        query,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should pass programCode to service', async () => {
      const query = {
        semesterId: '550e8400-e29b-41d4-a716-446655440000',
        programCode: 'BSCS',
      };
      const expectedResult = {
        items: [],
        lastRefreshedAt: null,
      };
      mockAnalyticsService.GetAttentionList.mockResolvedValue(expectedResult);

      const result = await controller.GetAttentionList(query);

      expect(mockAnalyticsService.GetAttentionList).toHaveBeenCalledWith(
        query.semesterId,
        query,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('GetFacultyTrends', () => {
    it('should delegate to AnalyticsService with query parameters', async () => {
      const query = {
        minSemesters: 3,
        minR2: 0.5,
      };
      const expectedResult = {
        items: [],
        lastRefreshedAt: null,
      };
      mockAnalyticsService.GetFacultyTrends.mockResolvedValue(expectedResult);

      const result = await controller.GetFacultyTrends(query);

      expect(mockAnalyticsService.GetFacultyTrends).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('GetFacultyReport', () => {
    it('should delegate to AnalyticsService with facultyId and query', async () => {
      const facultyId = '550e8400-e29b-41d4-a716-446655440001';
      const query = {
        semesterId: '550e8400-e29b-41d4-a716-446655440000',
        questionnaireTypeCode: 'STUDENT_EVAL',
      };
      const expectedResult = {
        faculty: { id: facultyId, name: 'Dr. Smith' },
        semester: {
          id: query.semesterId,
          code: '1S2526',
          label: '1st Semester',
          academicYear: '2025-2026',
        },
        questionnaireType: { code: 'STUDENT_EVAL', name: 'Student Evaluation' },
        courseFilter: null,
        submissionCount: 0,
        sections: [],
        overallRating: null,
        overallInterpretation: null,
      };
      mockAnalyticsService.GetFacultyReport.mockResolvedValue(expectedResult);

      const result = await controller.GetFacultyReport(facultyId, query);

      expect(mockAnalyticsService.GetFacultyReport).toHaveBeenCalledWith(
        facultyId,
        query,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('GetFacultyReportComments', () => {
    it('should delegate to AnalyticsService with facultyId and query including pagination', async () => {
      const facultyId = '550e8400-e29b-41d4-a716-446655440001';
      const query = {
        semesterId: '550e8400-e29b-41d4-a716-446655440000',
        questionnaireTypeCode: 'STUDENT_EVAL',
        page: 2,
        limit: 10,
      };
      const expectedResult = {
        items: [
          { text: 'Great teacher', submittedAt: '2026-03-20T10:00:00.000Z' },
        ],
        meta: {
          totalItems: 15,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 2,
          currentPage: 2,
        },
      };
      mockAnalyticsService.GetFacultyReportComments.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.GetFacultyReportComments(
        facultyId,
        query,
      );

      expect(
        mockAnalyticsService.GetFacultyReportComments,
      ).toHaveBeenCalledWith(facultyId, query);
      expect(result).toEqual(expectedResult);
    });
  });
});
