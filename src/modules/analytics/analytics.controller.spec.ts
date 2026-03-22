import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockAnalyticsService: {
    GetDepartmentOverview: jest.Mock;
    GetAttentionList: jest.Mock;
    GetFacultyTrends: jest.Mock;
  };

  beforeEach(async () => {
    mockAnalyticsService = {
      GetDepartmentOverview: jest.fn(),
      GetAttentionList: jest.fn(),
      GetFacultyTrends: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
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
    it('should delegate to AnalyticsService with semesterId', async () => {
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
});
