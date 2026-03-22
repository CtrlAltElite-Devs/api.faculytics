import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { AnalyticsService } from './analytics.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockExecute: jest.Mock;
  let mockScopeResolver: { ResolveDepartmentIds: jest.Mock };

  beforeEach(async () => {
    mockExecute = jest.fn().mockResolvedValue([]);

    const mockEm = {
      getConnection: jest.fn().mockReturnValue({ execute: mockExecute }),
    };

    mockScopeResolver = {
      ResolveDepartmentIds: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: EntityManager, useValue: mockEm },
        { provide: ScopeResolverService, useValue: mockScopeResolver },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('GetDepartmentOverview', () => {
    const semesterId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return overview with faculty stats for super admin (no scope filter)', async () => {
      // Call order for super admin: prev semester query, main query, GetLastRefreshedAt
      mockExecute
        // Pre-compute previous semester
        .mockResolvedValueOnce([{ id: 'prev-sem' }])
        // Main query
        .mockResolvedValueOnce([
          {
            faculty_id: 'f1',
            faculty_name: 'Dr. Smith',
            department_code: 'CCS',
            submission_count: 50,
            comment_count: 30,
            avg_normalized_score: 85.5,
            positive_count: 20,
            negative_count: 5,
            neutral_count: 5,
            analyzed_count: 30,
            topic_count: 4,
            percentile_rank: 0.75,
            score_delta: 2.5,
            sentiment_delta: 0.1,
          },
        ])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([{ value: '2026-03-22T10:00:00.000Z' }]);

      const result = await service.GetDepartmentOverview(semesterId, {
        semesterId,
      });

      expect(result.summary.totalFaculty).toBe(1);
      expect(result.summary.totalSubmissions).toBe(50);
      expect(result.faculty).toHaveLength(1);
      expect(result.faculty[0].facultyName).toBe('Dr. Smith');
      expect(result.faculty[0].scoreDelta).toBe(2.5);
      expect(result.lastRefreshedAt).toBe('2026-03-22T10:00:00.000Z');
    });

    it('should apply department scope for dean users', async () => {
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue(['dept-uuid-1']);
      // Call order for dean: ResolveDeptCodes, prev semester query, main query, GetLastRefreshedAt
      mockExecute
        .mockResolvedValueOnce([{ code: 'CCS' }])
        .mockResolvedValueOnce([{ id: 'prev-sem' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.GetDepartmentOverview(semesterId, {
        semesterId,
      });

      expect(result.faculty).toHaveLength(0);
      expect(mockScopeResolver.ResolveDepartmentIds).toHaveBeenCalledWith(
        semesterId,
      );
    });

    it('should return empty results when no data exists for semester', async () => {
      // Super admin: prev semester, main query, GetLastRefreshedAt
      mockExecute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.GetDepartmentOverview(semesterId, {
        semesterId,
      });

      expect(result.summary.totalFaculty).toBe(0);
      expect(result.summary.totalSubmissions).toBe(0);
      expect(result.faculty).toHaveLength(0);
    });

    it('should return empty results when dean has empty scope (no departments)', async () => {
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([]);
      // ResolveDeptCodes returns [] (empty), prev semester, main query, GetLastRefreshedAt
      mockExecute
        .mockResolvedValueOnce([{ id: 'prev-sem' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.GetDepartmentOverview(semesterId, {
        semesterId,
      });

      expect(result.summary.totalFaculty).toBe(0);
      expect(result.faculty).toHaveLength(0);
    });

    it('should return null scoreDelta when no previous semester data', async () => {
      // Super admin: prev semester (none), main query, GetLastRefreshedAt
      mockExecute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            faculty_id: 'f1',
            faculty_name: 'Dr. Smith',
            department_code: 'CCS',
            submission_count: 50,
            comment_count: 30,
            avg_normalized_score: 85.5,
            positive_count: 20,
            negative_count: 5,
            neutral_count: 5,
            analyzed_count: 30,
            topic_count: 4,
            percentile_rank: 1.0,
            score_delta: null,
            sentiment_delta: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.GetDepartmentOverview(semesterId, {
        semesterId,
      });

      expect(result.faculty[0].scoreDelta).toBeNull();
      expect(result.faculty[0].sentimentDelta).toBeNull();
    });
  });

  describe('GetAttentionList', () => {
    const semesterId = '550e8400-e29b-41d4-a716-446655440000';

    it('should flag faculty with declining trends', async () => {
      // Declining trends query
      mockExecute
        .mockResolvedValueOnce([
          {
            faculty_id: 'f1',
            faculty_name: 'Dr. Smith',
            department_code: 'CCS',
            score_slope: -0.5,
            score_r2: 0.8,
            sentiment_slope: 0.1,
            sentiment_r2: 0.3,
          },
        ])
        // Quant-qual gap query
        .mockResolvedValueOnce([])
        // Low coverage query
        .mockResolvedValueOnce([])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      const result = await service.GetAttentionList(semesterId);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].flags).toHaveLength(1);
      expect(result.items[0].flags[0].type).toBe('declining_trend');
    });

    it('should flag faculty with quant-qual gap', async () => {
      // Declining trends query
      mockExecute
        .mockResolvedValueOnce([])
        // Quant-qual gap query
        .mockResolvedValueOnce([
          {
            faculty_id: 'f2',
            faculty_name: 'Dr. Jones',
            department_code: 'CCS',
            avg_normalized_score: 90,
            positive_count: 5,
            analyzed_count: 20,
            divergence: 0.65,
          },
        ])
        // Low coverage query
        .mockResolvedValueOnce([])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      const result = await service.GetAttentionList(semesterId);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].flags[0].type).toBe('quant_qual_gap');
    });

    it('should flag faculty with low coverage', async () => {
      // Declining trends query
      mockExecute
        .mockResolvedValueOnce([])
        // Quant-qual gap query
        .mockResolvedValueOnce([])
        // Low coverage query
        .mockResolvedValueOnce([
          {
            faculty_id: 'f3',
            faculty_name: 'Dr. Lee',
            department_code: 'CCS',
            analyzed_count: 5,
            submission_count: 40,
          },
        ])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      const result = await service.GetAttentionList(semesterId);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].flags[0].type).toBe('low_coverage');
      expect(result.items[0].flags[0].metrics.coverageRate).toBeCloseTo(0.125);
    });

    it('should deduplicate faculty with multiple flags', async () => {
      // Declining trends query
      mockExecute
        .mockResolvedValueOnce([
          {
            faculty_id: 'f1',
            faculty_name: 'Dr. Smith',
            department_code: 'CCS',
            score_slope: -0.5,
            score_r2: 0.8,
            sentiment_slope: 0.1,
            sentiment_r2: 0.3,
          },
        ])
        // Quant-qual gap query
        .mockResolvedValueOnce([
          {
            faculty_id: 'f1',
            faculty_name: 'Dr. Smith',
            department_code: 'CCS',
            avg_normalized_score: 90,
            positive_count: 5,
            analyzed_count: 20,
            divergence: 0.65,
          },
        ])
        // Low coverage query
        .mockResolvedValueOnce([])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      const result = await service.GetAttentionList(semesterId);

      // Same faculty should be deduplicated into one item with 2 flags
      expect(result.items).toHaveLength(1);
      expect(result.items[0].flags).toHaveLength(2);
    });

    it('should apply department scope for dean users', async () => {
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue(['dept-uuid-1']);
      // ResolveDepartmentCodes
      mockExecute
        .mockResolvedValueOnce([{ code: 'CCS' }])
        // Declining trends
        .mockResolvedValueOnce([])
        // Quant-qual gap
        .mockResolvedValueOnce([])
        // Low coverage
        .mockResolvedValueOnce([])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      const result = await service.GetAttentionList(semesterId);

      expect(result.items).toHaveLength(0);
      expect(mockScopeResolver.ResolveDepartmentIds).toHaveBeenCalledWith(
        semesterId,
      );
    });
  });

  describe('GetFacultyTrends', () => {
    it('should return trends with correct trend direction and latest values', async () => {
      // 1. Latest semester query (no semesterId provided)
      mockExecute
        .mockResolvedValueOnce([{ id: 'latest-sem' }])
        // 2. Main trends query
        .mockResolvedValueOnce([
          {
            faculty_id: 'f1',
            faculty_name: 'Dr. Smith',
            department_code: 'CCS',
            semester_count: 4,
            latest_avg_normalized_score: 78.5,
            latest_positive_rate: 0.6,
            score_slope: -0.5,
            score_r2: 0.8,
            sentiment_slope: -0.1,
            sentiment_r2: 0.7,
          },
          {
            faculty_id: 'f2',
            faculty_name: 'Dr. Jones',
            department_code: 'CCS',
            semester_count: 3,
            latest_avg_normalized_score: 92.0,
            latest_positive_rate: 0.85,
            score_slope: 1.2,
            score_r2: 0.9,
            sentiment_slope: 0.05,
            sentiment_r2: 0.6,
          },
        ])
        // 3. GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      const result = await service.GetFacultyTrends({});

      expect(result.items).toHaveLength(2);
      expect(result.items[0].trendDirection).toBe('declining');
      expect(result.items[0].latestAvgScore).toBe(78.5);
      expect(result.items[0].latestPositiveRate).toBe(0.6);
      expect(result.items[1].trendDirection).toBe('improving');
      expect(result.items[1].latestAvgScore).toBe(92.0);
    });

    it('should fall back to latest semester when no semesterId provided', async () => {
      // Latest semester query
      mockExecute
        .mockResolvedValueOnce([{ id: 'latest-sem' }])
        // Main trends query
        .mockResolvedValueOnce([])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      await service.GetFacultyTrends({});

      // Verify latest semester was fetched
      expect(mockExecute).toHaveBeenCalledTimes(3);
    });

    it('should apply minimum semester and R2 filters', async () => {
      // Latest semester query (no semesterId provided)
      mockExecute
        .mockResolvedValueOnce([{ id: 'latest-sem' }])
        // Main trends query
        .mockResolvedValueOnce([])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      await service.GetFacultyTrends({ minSemesters: 5, minR2: 0.7 });

      // Verify parameters were passed to SQL (second call = main trends query)
      const trendsCall = mockExecute.mock.calls[1] as [string, unknown[]];
      expect(trendsCall[1]).toContain(5);
      expect(trendsCall[1]).toContain(0.7);
    });

    it('should return empty results for dean with empty scope', async () => {
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([]);
      // Latest semester query
      mockExecute
        .mockResolvedValueOnce([{ id: 'latest-sem' }])
        // Main trends query
        .mockResolvedValueOnce([])
        // GetLastRefreshedAt
        .mockResolvedValueOnce([]);

      const result = await service.GetFacultyTrends({});

      expect(result.items).toHaveLength(0);
    });
  });
});
