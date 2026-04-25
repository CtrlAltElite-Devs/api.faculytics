import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { CurrentUserService } from '../common/cls/current-user.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { FacultyOverviewQueryDto } from './dto/analytics-query.dto';
import { UserRole } from 'src/modules/auth/roles.enum';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockCurrentUserService: {
    getOrFail: jest.Mock;
    get: jest.Mock;
  };
  let mockAnalyticsService: {
    GetDepartmentOverview: jest.Mock;
    GetAttentionList: jest.Mock;
    GetFacultyTrends: jest.Mock;
    GetFacultyReport: jest.Mock;
    GetFacultyReportComments: jest.Mock;
    GetFacultyOverview: jest.Mock;
  };

  beforeEach(async () => {
    mockAnalyticsService = {
      GetDepartmentOverview: jest.fn(),
      GetAttentionList: jest.fn(),
      GetFacultyTrends: jest.fn(),
      GetFacultyReport: jest.fn(),
      GetFacultyReportComments: jest.fn(),
      GetFacultyOverview: jest.fn(),
    };

    mockCurrentUserService = {
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

  describe('GetFacultyOverview', () => {
    const facultyId = '550e8400-e29b-41d4-a716-446655440001';
    const semesterId = '550e8400-e29b-41d4-a716-446655440000';

    const stubResponse = {
      faculty: { id: facultyId, name: 'John Doe', profilePicture: null },
      semester: {
        id: semesterId,
        code: '1S2526',
        label: '1st Semester',
        academicYear: '2025-2026',
      },
      composite: {
        rating: 4.0,
        interpretation: 'VERY SATISFACTORY PERFORMANCE',
        coverageStatus: 'FULL' as const,
        coverageWeight: 1.0,
      },
      contributions: [],
    };

    it('delegates to AnalyticsService with facultyId and query (SUPER_ADMIN)', async () => {
      mockAnalyticsService.GetFacultyOverview.mockResolvedValue(stubResponse);

      const result = await controller.GetFacultyOverview(facultyId, {
        semesterId,
      });

      expect(mockAnalyticsService.GetFacultyOverview).toHaveBeenCalledWith(
        facultyId,
        { semesterId },
      );
      expect(result).toEqual(stubResponse);
    });

    it('FACULTY user calling with own facultyId → service invoked', async () => {
      mockCurrentUserService.getOrFail.mockReturnValue({
        id: facultyId,
        roles: [UserRole.FACULTY],
      });
      mockAnalyticsService.GetFacultyOverview.mockResolvedValue(stubResponse);

      await controller.GetFacultyOverview(facultyId, { semesterId });

      expect(mockAnalyticsService.GetFacultyOverview).toHaveBeenCalled();
    });

    it('FACULTY user calling with different facultyId → ForbiddenException', async () => {
      mockCurrentUserService.getOrFail.mockReturnValue({
        id: 'some-other-faculty-id',
        roles: [UserRole.FACULTY],
      });

      await expect(
        controller.GetFacultyOverview(facultyId, { semesterId }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockAnalyticsService.GetFacultyOverview).not.toHaveBeenCalled();
    });

    it('DEAN role → service invoked (assertFacultySelfScope bypass)', async () => {
      mockCurrentUserService.getOrFail.mockReturnValue({
        id: 'dean-id',
        roles: [UserRole.DEAN],
      });
      mockAnalyticsService.GetFacultyOverview.mockResolvedValue(stubResponse);

      await controller.GetFacultyOverview(facultyId, { semesterId });

      expect(mockAnalyticsService.GetFacultyOverview).toHaveBeenCalled();
    });

    it('CHAIRPERSON role → service invoked', async () => {
      mockCurrentUserService.getOrFail.mockReturnValue({
        id: 'chair-id',
        roles: [UserRole.CHAIRPERSON],
      });
      mockAnalyticsService.GetFacultyOverview.mockResolvedValue(stubResponse);

      await controller.GetFacultyOverview(facultyId, { semesterId });

      expect(mockAnalyticsService.GetFacultyOverview).toHaveBeenCalled();
    });

    it('CAMPUS_HEAD role → service invoked', async () => {
      mockCurrentUserService.getOrFail.mockReturnValue({
        id: 'campus-id',
        roles: [UserRole.CAMPUS_HEAD],
      });
      mockAnalyticsService.GetFacultyOverview.mockResolvedValue(stubResponse);

      await controller.GetFacultyOverview(facultyId, { semesterId });

      expect(mockAnalyticsService.GetFacultyOverview).toHaveBeenCalled();
    });

    describe('FacultyOverviewQueryDto validation (GlobalValidationPipe)', () => {
      // Exercises the same ValidationPipe config used at bootstrap
      // (whitelist + forbidNonWhitelisted + transform).
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      });

      it('missing semesterId → BadRequestException', async () => {
        await expect(
          pipe.transform(
            {},
            { type: 'query', metatype: FacultyOverviewQueryDto },
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('extra unknown property (foo=bar) → BadRequestException', async () => {
        await expect(
          pipe.transform(
            { semesterId, foo: 'bar' },
            { type: 'query', metatype: FacultyOverviewQueryDto },
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('valid query passes: semesterId only', async () => {
        const out = (await pipe.transform(
          { semesterId },
          { type: 'query', metatype: FacultyOverviewQueryDto },
        )) as FacultyOverviewQueryDto;
        expect(out.semesterId).toBe(semesterId);
        expect(out.courseId).toBeUndefined();
      });

      it('valid query passes: semesterId + courseId', async () => {
        const courseId = '550e8400-e29b-41d4-a716-4466554400aa';
        const out = (await pipe.transform(
          { semesterId, courseId },
          { type: 'query', metatype: FacultyOverviewQueryDto },
        )) as FacultyOverviewQueryDto;
        expect(out.semesterId).toBe(semesterId);
        expect(out.courseId).toBe(courseId);
      });

      it('trims whitespace on semesterId', async () => {
        const out = (await pipe.transform(
          { semesterId: `  ${semesterId}  ` },
          { type: 'query', metatype: FacultyOverviewQueryDto },
        )) as FacultyOverviewQueryDto;
        expect(out.semesterId).toBe(semesterId);
      });
    });
  });
});
