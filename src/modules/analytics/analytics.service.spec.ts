import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { AnalyticsService } from './analytics.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { QuestionnaireSchemaSnapshot } from 'src/modules/questionnaires/lib/questionnaire.types';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockExecute: jest.Mock;
  let mockScopeResolver: { ResolveDepartmentIds: jest.Mock };

  beforeEach(async () => {
    mockExecute = jest.fn().mockResolvedValue([]);

    const mockEm = {
      execute: mockExecute,
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

  describe('GetFacultyReport', () => {
    const facultyId = '550e8400-e29b-41d4-a716-446655440001';
    const semesterId = '550e8400-e29b-41d4-a716-446655440000';
    const baseQuery = {
      semesterId,
      questionnaireTypeCode: 'STUDENT_EVAL',
    };

    const sampleSchema: QuestionnaireSchemaSnapshot = {
      meta: {
        questionnaireType: 'STUDENT_EVAL',
        scoringModel: 'SECTION_WEIGHTED',
        version: 1,
        maxScore: 5,
      },
      sections: [
        {
          id: 'sec-1',
          title: 'Teaching Effectiveness',
          order: 1,
          weight: 60,
          questions: [
            {
              id: 'q-1',
              text: 'Explains clearly',
              type: 'LIKERT_1_5' as const,
              dimensionCode: 'TEACH',
              required: true,
              order: 1,
            },
            {
              id: 'q-2',
              text: 'Uses examples',
              type: 'LIKERT_1_5' as const,
              dimensionCode: 'TEACH',
              required: true,
              order: 2,
            },
          ],
        },
        {
          id: 'sec-2',
          title: 'Classroom Management',
          order: 2,
          weight: 40,
          questions: [
            {
              id: 'q-3',
              text: 'Starts on time',
              type: 'LIKERT_1_5' as const,
              dimensionCode: 'MGMT',
              required: true,
              order: 1,
            },
          ],
        },
      ],
    };

    function setupSuperAdminReportMocks(
      schema: QuestionnaireSchemaSnapshot,
      aggRows: Record<string, unknown>[],
      countResult: number,
    ) {
      // Super admin: scope returns null (no validateFacultyScope execute call)
      // 1. resolveVersionIds: phase 1 (type check), phase 2 (versions)
      // 2. BuildFacultyReportData: faculty metadata + semester metadata (parallel)
      // 3. aggregation + submission count (parallel)
      mockExecute
        // phase 1: type check
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // phase 2: versions
        .mockResolvedValueOnce([
          {
            id: 'v-1',
            version_number: 1,
            schema_snapshot: schema,
          },
        ])
        // faculty metadata
        .mockResolvedValueOnce([{ first_name: 'John', last_name: 'Doe' }])
        // semester metadata
        .mockResolvedValueOnce([
          {
            id: semesterId,
            code: '1S2526',
            label: '1st Semester',
            academic_year: '2025-2026',
          },
        ])
        // aggregation query
        .mockResolvedValueOnce(aggRows)
        // submission count
        .mockResolvedValueOnce([{ count: countResult }]);
    }

    it('should return full report for super admin', async () => {
      setupSuperAdminReportMocks(
        sampleSchema,
        [
          {
            question_id: 'q-1',
            section_id: 'sec-1',
            average: '4.50',
            response_count: '30',
          },
          {
            question_id: 'q-2',
            section_id: 'sec-1',
            average: '4.00',
            response_count: '30',
          },
          {
            question_id: 'q-3',
            section_id: 'sec-2',
            average: '3.80',
            response_count: '28',
          },
        ],
        30,
      );

      const result = await service.GetFacultyReport(facultyId, baseQuery);

      expect(result.faculty.name).toBe('John Doe');
      expect(result.semester.code).toBe('1S2526');
      expect(result.questionnaireType.code).toBe('STUDENT_EVAL');
      expect(result.questionnaireType.name).toBe('Student Evaluation');
      expect(result.submissionCount).toBe(30);
      expect(result.sections).toHaveLength(2);

      // Section 1: avg = (4.50 + 4.00) / 2 = 4.25
      expect(result.sections[0].sectionAverage).toBe(4.25);
      expect(result.sections[0].sectionInterpretation).toBe(
        'VERY SATISFACTORY PERFORMANCE',
      );
      expect(result.sections[0].questions).toHaveLength(2);

      // Section 2: avg = 3.80
      expect(result.sections[1].sectionAverage).toBe(3.8);
      expect(result.sections[1].sectionInterpretation).toBe(
        'VERY SATISFACTORY PERFORMANCE',
      );

      // Overall: (60 * 4.25 + 40 * 3.80) / (60 + 40) = (255 + 152) / 100 = 4.07
      expect(result.overallRating).toBe(4.07);
      expect(result.overallInterpretation).toBe(
        'VERY SATISFACTORY PERFORMANCE',
      );
    });

    it('should return empty report when no submissions found', async () => {
      // Super admin — no scope execute call
      // 1. resolveVersionIds: type check, no versions
      // 2. BuildFacultyReportData: faculty + semester (still fetched for metadata)
      mockExecute
        // phase 1: type check
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // phase 2: no versions found
        .mockResolvedValueOnce([])
        // faculty metadata
        .mockResolvedValueOnce([{ first_name: 'John', last_name: 'Doe' }])
        // semester metadata
        .mockResolvedValueOnce([
          {
            id: semesterId,
            code: '1S2526',
            label: '1st Semester',
            academic_year: '2025-2026',
          },
        ]);

      const result = await service.GetFacultyReport(facultyId, baseQuery);

      expect(result.submissionCount).toBe(0);
      expect(result.sections).toHaveLength(0);
      expect(result.overallRating).toBeNull();
      expect(result.overallInterpretation).toBeNull();
      expect(result.faculty.name).toBe('John Doe');
    });

    it('should throw NotFoundException for invalid questionnaireTypeCode', async () => {
      // resolveVersionIds: type not found (throws before BuildFacultyReportData)
      mockExecute
        // phase 1: type not found
        .mockResolvedValueOnce([]);

      await expect(
        service.GetFacultyReport(facultyId, baseQuery),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when faculty does not exist', async () => {
      // resolveVersionIds succeeds, BuildFacultyReportData: faculty returns empty
      mockExecute
        // phase 1: type check
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // phase 2: versions
        .mockResolvedValueOnce([
          { id: 'v-1', version_number: 1, schema_snapshot: sampleSchema },
        ])
        // faculty metadata returns empty
        .mockResolvedValueOnce([])
        // semester metadata
        .mockResolvedValueOnce([
          {
            id: semesterId,
            code: '1S2526',
            label: '1st Semester',
            academic_year: '2025-2026',
          },
        ]);

      await expect(
        service.GetFacultyReport(facultyId, baseQuery),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when semester does not exist', async () => {
      // resolveVersionIds succeeds, BuildFacultyReportData: semester returns empty
      mockExecute
        // phase 1: type check
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // phase 2: versions
        .mockResolvedValueOnce([
          { id: 'v-1', version_number: 1, schema_snapshot: sampleSchema },
        ])
        // faculty metadata
        .mockResolvedValueOnce([{ first_name: 'John', last_name: 'Doe' }])
        // semester metadata returns empty
        .mockResolvedValueOnce([]);

      await expect(
        service.GetFacultyReport(facultyId, baseQuery),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when dean accesses faculty outside scope', async () => {
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([
        'dept-allowed',
      ]);
      // validateFacultyScope: user query (includes name fields now)
      mockExecute.mockResolvedValueOnce([
        {
          id: facultyId,
          department_id: 'dept-other',
          first_name: 'John',
          last_name: 'Doe',
        },
      ]);

      await expect(
        service.GetFacultyReport(facultyId, baseQuery),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow dean to access faculty within scope', async () => {
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([
        'dept-allowed',
      ]);
      // 1. validateFacultyScope: user query
      // 2. resolveVersionIds: type check, no versions
      // 3. BuildFacultyReportData: faculty metadata, semester metadata
      mockExecute
        // validateFacultyScope: user query
        .mockResolvedValueOnce([
          {
            id: facultyId,
            department_id: 'dept-allowed',
            first_name: 'Jane',
            last_name: 'Smith',
          },
        ])
        // phase 1: type check
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // phase 2: no versions
        .mockResolvedValueOnce([])
        // faculty metadata (BuildFacultyReportData fetches independently)
        .mockResolvedValueOnce([{ first_name: 'Jane', last_name: 'Smith' }])
        // semester metadata
        .mockResolvedValueOnce([
          {
            id: semesterId,
            code: '1S2526',
            label: '1st Semester',
            academic_year: '2025-2026',
          },
        ]);

      const result = await service.GetFacultyReport(facultyId, baseQuery);

      expect(result.faculty.name).toBe('Jane Smith');
    });

    it('should include courseId filter in SQL when provided', async () => {
      const courseId = '550e8400-e29b-41d4-a716-446655440099';
      setupSuperAdminReportMocks(
        sampleSchema,
        [
          {
            question_id: 'q-1',
            section_id: 'sec-1',
            average: '4.00',
            response_count: '10',
          },
        ],
        10,
      );
      // course snapshot query
      mockExecute.mockResolvedValueOnce([
        { course_code_snapshot: 'CS101', course_title_snapshot: 'Intro to CS' },
      ]);

      const result = await service.GetFacultyReport(facultyId, {
        ...baseQuery,
        courseId,
      });

      expect(result.courseFilter).toEqual({
        id: courseId,
        code: 'CS101',
        title: 'Intro to CS',
      });
    });

    it('should compute interpretation labels correctly per question', async () => {
      setupSuperAdminReportMocks(
        sampleSchema,
        [
          {
            question_id: 'q-1',
            section_id: 'sec-1',
            average: '4.50',
            response_count: '30',
          },
          {
            question_id: 'q-2',
            section_id: 'sec-1',
            average: '2.49',
            response_count: '30',
          },
          {
            question_id: 'q-3',
            section_id: 'sec-2',
            average: '1.49',
            response_count: '28',
          },
        ],
        30,
      );

      const result = await service.GetFacultyReport(facultyId, baseQuery);

      expect(result.sections[0].questions[0].interpretation).toBe(
        'EXCELLENT PERFORMANCE',
      );
      expect(result.sections[0].questions[1].interpretation).toBe(
        'FAIR PERFORMANCE',
      );
      expect(result.sections[1].questions[0].interpretation).toBe(
        'NEEDS IMPROVEMENT',
      );
    });

    it('should exclude questions without SQL results from section average', async () => {
      // Only q-1 has data, q-2 is missing
      setupSuperAdminReportMocks(
        sampleSchema,
        [
          {
            question_id: 'q-1',
            section_id: 'sec-1',
            average: '4.00',
            response_count: '30',
          },
          {
            question_id: 'q-3',
            section_id: 'sec-2',
            average: '3.50',
            response_count: '28',
          },
        ],
        30,
      );

      const result = await service.GetFacultyReport(facultyId, baseQuery);

      // Section 1 has only q-1: sectionAverage = 4.00
      expect(result.sections[0].sectionAverage).toBe(4.0);
      expect(result.sections[0].questions).toHaveLength(1);
    });

    describe('schema flattening', () => {
      it('should handle nested sections (parent → child with questions)', async () => {
        const nestedSchema: QuestionnaireSchemaSnapshot = {
          meta: {
            questionnaireType: 'STUDENT_EVAL',
            scoringModel: 'SECTION_WEIGHTED',
            version: 1,
            maxScore: 5,
          },
          sections: [
            {
              id: 'parent-1',
              title: 'Parent Section',
              order: 1,
              sections: [
                {
                  id: 'child-1',
                  title: 'Child Section A',
                  order: 1,
                  weight: 50,
                  questions: [
                    {
                      id: 'q-nested-1',
                      text: 'Nested Q1',
                      type: 'LIKERT_1_5' as const,
                      dimensionCode: 'DIM',
                      required: true,
                      order: 1,
                    },
                  ],
                },
                {
                  id: 'child-2',
                  title: 'Child Section B',
                  order: 2,
                  weight: 50,
                  questions: [
                    {
                      id: 'q-nested-2',
                      text: 'Nested Q2',
                      type: 'LIKERT_1_5' as const,
                      dimensionCode: 'DIM',
                      required: true,
                      order: 1,
                    },
                  ],
                },
              ],
            },
          ],
        };

        setupSuperAdminReportMocks(
          nestedSchema,
          [
            {
              question_id: 'q-nested-1',
              section_id: 'child-1',
              average: '4.00',
              response_count: '20',
            },
            {
              question_id: 'q-nested-2',
              section_id: 'child-2',
              average: '3.00',
              response_count: '20',
            },
          ],
          20,
        );

        const result = await service.GetFacultyReport(facultyId, baseQuery);

        // Only child (leaf) sections appear
        expect(result.sections).toHaveLength(2);
        expect(result.sections[0].title).toBe('Child Section A');
        expect(result.sections[1].title).toBe('Child Section B');

        // Overall: (50 * 4.00 + 50 * 3.00) / 100 = 3.50
        expect(result.overallRating).toBe(3.5);
      });

      it('should only produce entries for leaf sections with questions', async () => {
        const mixedSchema: QuestionnaireSchemaSnapshot = {
          meta: {
            questionnaireType: 'STUDENT_EVAL',
            scoringModel: 'SECTION_WEIGHTED',
            version: 1,
            maxScore: 5,
          },
          sections: [
            {
              id: 'empty-parent',
              title: 'Empty Parent',
              order: 1,
              sections: [],
            },
            {
              id: 'leaf-1',
              title: 'Real Section',
              order: 2,
              weight: 100,
              questions: [
                {
                  id: 'q-only',
                  text: 'Only question',
                  type: 'LIKERT_1_5' as const,
                  dimensionCode: 'DIM',
                  required: true,
                  order: 1,
                },
              ],
            },
          ],
        };

        setupSuperAdminReportMocks(
          mixedSchema,
          [
            {
              question_id: 'q-only',
              section_id: 'leaf-1',
              average: '4.50',
              response_count: '10',
            },
          ],
          10,
        );

        const result = await service.GetFacultyReport(facultyId, baseQuery);

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].title).toBe('Real Section');
      });
    });
  });

  describe('GetFacultyReportComments', () => {
    const facultyId = '550e8400-e29b-41d4-a716-446655440001';
    const semesterId = '550e8400-e29b-41d4-a716-446655440000';
    const baseQuery = {
      semesterId,
      questionnaireTypeCode: 'STUDENT_EVAL',
      page: 1,
      limit: 10,
    };

    it('should return paginated comments for super admin', async () => {
      // Super admin: scope returns null
      mockExecute
        // resolveVersionIds phase 1
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // resolveVersionIds phase 2
        .mockResolvedValueOnce([
          {
            id: 'v-1',
            version_number: 1,
            schema_snapshot: { meta: {}, sections: [] },
          },
        ])
        // count query
        .mockResolvedValueOnce([{ total: '2' }])
        // paginated query
        .mockResolvedValueOnce([
          {
            text: 'Great teacher',
            submitted_at: '2026-03-20T10:00:00.000Z',
          },
          {
            text: 'Very helpful',
            submitted_at: '2026-03-19T10:00:00.000Z',
          },
        ]);

      const result = await service.GetFacultyReportComments(
        facultyId,
        baseQuery,
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0].text).toBe('Great teacher');
      expect(result.meta.totalItems).toBe(2);
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.itemsPerPage).toBe(10);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should return empty items when no versions found', async () => {
      mockExecute
        // resolveVersionIds phase 1
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // resolveVersionIds phase 2: no versions
        .mockResolvedValueOnce([]);

      const result = await service.GetFacultyReportComments(
        facultyId,
        baseQuery,
      );

      expect(result.items).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
    });

    it('should compute pagination meta correctly for page 2', async () => {
      mockExecute
        // resolveVersionIds phase 1
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // resolveVersionIds phase 2
        .mockResolvedValueOnce([
          {
            id: 'v-1',
            version_number: 1,
            schema_snapshot: { meta: {}, sections: [] },
          },
        ])
        // count query
        .mockResolvedValueOnce([{ total: '15' }])
        // paginated query
        .mockResolvedValueOnce([
          {
            text: 'Page 2 comment',
            submitted_at: '2026-03-15T10:00:00.000Z',
          },
        ]);

      const result = await service.GetFacultyReportComments(facultyId, {
        ...baseQuery,
        page: 2,
      });

      expect(result.meta.totalItems).toBe(15);
      expect(result.meta.totalPages).toBe(2);
      expect(result.meta.currentPage).toBe(2);
      expect(result.meta.itemCount).toBe(1);
    });

    it('should throw ForbiddenException for unauthorized dean', async () => {
      mockScopeResolver.ResolveDepartmentIds.mockResolvedValue([
        'dept-allowed',
      ]);
      // validateFacultyScope: user query
      mockExecute.mockResolvedValueOnce([
        {
          id: facultyId,
          department_id: 'dept-other',
          first_name: 'John',
          last_name: 'Doe',
        },
      ]);

      await expect(
        service.GetFacultyReportComments(facultyId, baseQuery),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for invalid questionnaireTypeCode', async () => {
      // resolveVersionIds phase 1: type not found
      mockExecute.mockResolvedValueOnce([]);

      await expect(
        service.GetFacultyReportComments(facultyId, baseQuery),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include courseId filter when provided', async () => {
      const courseId = '550e8400-e29b-41d4-a716-446655440099';
      mockExecute
        // resolveVersionIds phase 1
        .mockResolvedValueOnce([{ id: 'type-1', name: 'Student Evaluation' }])
        // resolveVersionIds phase 2
        .mockResolvedValueOnce([
          {
            id: 'v-1',
            version_number: 1,
            schema_snapshot: { meta: {}, sections: [] },
          },
        ])
        // count query
        .mockResolvedValueOnce([{ total: '1' }])
        // paginated query
        .mockResolvedValueOnce([
          {
            text: 'Course-specific comment',
            submitted_at: '2026-03-20T10:00:00.000Z',
          },
        ]);

      const result = await service.GetFacultyReportComments(facultyId, {
        ...baseQuery,
        courseId,
      });

      expect(result.items).toHaveLength(1);
      // Verify courseId was passed in SQL params
      const countCall = mockExecute.mock.calls[2] as [string, unknown[]];
      expect(countCall[1]).toContain(courseId);
    });
  });
});
