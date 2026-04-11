import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import {
  QuestionnaireSchemaSnapshot,
  SectionNode,
} from 'src/modules/questionnaires/lib/questionnaire.types';
import { getInterpretation } from './lib/interpretation.util';
import {
  DepartmentOverviewQueryDto,
  AttentionListQueryDto,
  FacultyTrendsQueryDto,
  FacultyReportQueryDto,
  FacultyReportCommentsQueryDto,
  BaseFacultyReportQueryDto,
} from './dto/analytics-query.dto';
import { ReportCommentDto } from './dto/responses/faculty-report-comments.response.dto';
import {
  DepartmentOverviewResponseDto,
  FacultySemesterStatsDto,
} from './dto/responses/department-overview.response.dto';
import {
  AttentionListResponseDto,
  AttentionItemDto,
  AttentionFlagDto,
} from './dto/responses/attention-list.response.dto';
import {
  FacultyTrendsResponseDto,
  FacultyTrendDto,
} from './dto/responses/faculty-trends.response.dto';
import { FacultyReportResponseDto } from './dto/responses/faculty-report.response.dto';
import { FacultyReportCommentsResponseDto } from './dto/responses/faculty-report-comments.response.dto';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';

interface QuestionMeta {
  text: string;
  order: number;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  weight: number;
  dimensionCode: string;
}

interface SectionMeta {
  title: string;
  order: number;
  weight: number;
}

/** Convert a JS array to a PG array literal for use with em.execute() + ? bindings */
function pgArray(arr: string[]): string {
  return `{${arr.join(',')}}`;
}

const ATTENTION_THRESHOLDS = {
  MIN_ANALYZED_FOR_GAP: 10,
  QUANT_QUAL_DIVERGENCE: 0.2,
  MIN_SEMESTERS_FOR_TREND: 3,
  MIN_R2_FOR_TREND: 0.5,
} as const;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly em: EntityManager,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  async GetDepartmentOverview(
    semesterId: string,
    query: DepartmentOverviewQueryDto,
  ): Promise<DepartmentOverviewResponseDto> {
    const deptCodes = await this.ResolveDepartmentCodes(semesterId);

    if (!(await this.IsProgramCodeInScope(semesterId, query.programCode))) {
      const lastRefreshedAt = await this.GetLastRefreshedAt();
      return {
        summary: {
          totalFaculty: 0,
          totalSubmissions: 0,
          totalAnalyzed: 0,
          positiveCount: 0,
          negativeCount: 0,
          neutralCount: 0,
        },
        faculty: [],
        lastRefreshedAt,
      };
    }

    const prevSemRows: { id: string }[] = await this.em.execute(
      `SELECT s2.id FROM semester s2
         WHERE s2.campus_id = (SELECT s1.campus_id FROM semester s1 WHERE s1.id = ?)
           AND s2.created_at < (SELECT s1.created_at FROM semester s1 WHERE s1.id = ?)
           AND s2.deleted_at IS NULL
         ORDER BY s2.created_at DESC LIMIT 1`,
      [semesterId, semesterId],
    );
    const prevSemesterId = prevSemRows[0]?.id ?? null;

    const params: unknown[] = [semesterId, prevSemesterId];

    let deptFilter = '';
    if (deptCodes !== null) {
      deptFilter = ` AND curr.department_code_snapshot = ANY(?)`;
      params.push(pgArray(deptCodes));
    }

    let programFilter = '';
    if (query.programCode) {
      programFilter = ` AND curr.program_code_snapshot = ?`;
      params.push(query.programCode);
    }

    const sql = `
      SELECT
        curr.faculty_id,
        curr.faculty_name_snapshot AS faculty_name,
        curr.department_code_snapshot AS department_code,
        curr.submission_count,
        curr.comment_count,
        curr.avg_normalized_score,
        curr.positive_count,
        curr.negative_count,
        curr.neutral_count,
        curr.analyzed_count,
        curr.distinct_topic_count AS topic_count,
        PERCENT_RANK() OVER (
          PARTITION BY curr.department_code_snapshot
          ORDER BY curr.avg_normalized_score
        ) AS percentile_rank,
        curr.avg_normalized_score - prev.avg_normalized_score AS score_delta,
        CASE
          WHEN curr.analyzed_count > 0 AND prev.analyzed_count > 0
          THEN (curr.positive_count::float / curr.analyzed_count)
               - (prev.positive_count::float / prev.analyzed_count)
          ELSE NULL
        END AS sentiment_delta
      FROM mv_faculty_semester_stats curr
      LEFT JOIN mv_faculty_semester_stats prev
        ON prev.faculty_id = curr.faculty_id
        AND prev.department_code_snapshot = curr.department_code_snapshot
        AND prev.semester_id = ?
      WHERE curr.semester_id = ?${deptFilter}${programFilter}
      ORDER BY curr.department_code_snapshot, curr.avg_normalized_score DESC
    `;

    // prev.semester_id and curr.semester_id use positional ? — reorder params
    const reorderedParams = [prevSemesterId, semesterId, ...params.slice(2)];
    const rows = await this.em.execute(sql, reorderedParams);

    const faculty: FacultySemesterStatsDto[] = rows.map((r) => ({
      facultyId: r.faculty_id as string,
      facultyName: r.faculty_name as string,
      departmentCode: r.department_code as string,
      submissionCount: Number(r.submission_count),
      commentCount: Number(r.comment_count),
      avgNormalizedScore: Number(r.avg_normalized_score),
      positiveCount: Number(r.positive_count),
      negativeCount: Number(r.negative_count),
      neutralCount: Number(r.neutral_count),
      analyzedCount: Number(r.analyzed_count),
      topicCount: Number(r.topic_count),
      percentileRank: Number(r.percentile_rank),
      scoreDelta: r.score_delta != null ? Number(r.score_delta) : null,
      sentimentDelta:
        r.sentiment_delta != null ? Number(r.sentiment_delta) : null,
    }));

    const summary = {
      totalFaculty: new Set(faculty.map((f) => f.facultyId)).size,
      totalSubmissions: faculty.reduce((s, f) => s + f.submissionCount, 0),
      totalAnalyzed: faculty.reduce((s, f) => s + f.analyzedCount, 0),
      positiveCount: faculty.reduce((s, f) => s + f.positiveCount, 0),
      negativeCount: faculty.reduce((s, f) => s + f.negativeCount, 0),
      neutralCount: faculty.reduce((s, f) => s + f.neutralCount, 0),
    };

    const lastRefreshedAt = await this.GetLastRefreshedAt();

    return { summary, faculty, lastRefreshedAt };
  }

  async GetAttentionList(
    semesterId: string,
    query: AttentionListQueryDto,
  ): Promise<AttentionListResponseDto> {
    const { programCode } = query;
    const deptCodes = await this.ResolveDepartmentCodes(semesterId);

    if (!(await this.IsProgramCodeInScope(semesterId, programCode))) {
      const lastRefreshedAt = await this.GetLastRefreshedAt();
      return { items: [], lastRefreshedAt };
    }

    const flagMap = new Map<
      string,
      {
        facultyId: string;
        facultyName: string;
        departmentCode: string;
        flags: AttentionFlagDto[];
      }
    >();

    const addFlag = (
      facultyId: string,
      facultyName: string,
      departmentCode: string,
      flag: AttentionFlagDto,
    ) => {
      const key = `${facultyId}::${departmentCode}`;
      const existing = flagMap.get(key);
      if (existing) {
        existing.flags.push(flag);
      } else {
        flagMap.set(key, {
          facultyId,
          facultyName,
          departmentCode,
          flags: [flag],
        });
      }
    };

    // 1. Declining trends
    {
      const params: unknown[] = [
        ATTENTION_THRESHOLDS.MIN_SEMESTERS_FOR_TREND,
        ATTENTION_THRESHOLDS.MIN_R2_FOR_TREND,
      ];

      let fromClause: string;
      let colPrefix: string;
      let deptPrefix: string;
      let extraFilters = '';

      if (programCode) {
        fromClause = `FROM mv_faculty_trends t
          JOIN mv_faculty_semester_stats s
            ON s.faculty_id = t.faculty_id
            AND s.department_code_snapshot = t.department_code_snapshot`;
        colPrefix = 't.';
        deptPrefix = 't.';
        extraFilters = ` AND s.semester_id = ? AND s.program_code_snapshot = ?`;
        params.push(semesterId, programCode);
      } else {
        fromClause = 'FROM mv_faculty_trends';
        colPrefix = '';
        deptPrefix = '';
      }

      let deptFilter = '';
      if (deptCodes !== null) {
        deptFilter = ` AND ${deptPrefix}department_code_snapshot = ANY(?)`;
        params.push(pgArray(deptCodes));
      }

      const sql = `
        SELECT ${colPrefix}faculty_id,
               ${colPrefix}faculty_name_snapshot AS faculty_name,
               ${colPrefix}department_code_snapshot AS department_code,
               ${colPrefix}score_slope, ${colPrefix}score_r2,
               ${colPrefix}sentiment_slope, ${colPrefix}sentiment_r2
        ${fromClause}
        WHERE ${colPrefix}semester_count >= ?
          AND (
            (${colPrefix}score_slope < 0 AND ${colPrefix}score_r2 >= ?)
            OR (${colPrefix}sentiment_slope < 0 AND ${colPrefix}sentiment_r2 >= ?)
          )${extraFilters}${deptFilter}
      `;

      // PARAM CONTRACT: params[0] = minSemesters, params[1] = minR2 (used twice in SQL).
      // params[2..] = optional filters pushed conditionally: [semesterId?, programCode?, deptCodes?].
      // Expansion duplicates minR2 for the two R2 comparisons, then appends the rest.
      const sqlParams = [params[0], params[1], params[1], ...params.slice(2)];
      const rows = await this.em.execute(sql, sqlParams);

      for (const r of rows) {
        const scoreSlope = Number(r.score_slope);
        const scoreR2 = Number(r.score_r2);
        const sentimentSlope = Number(r.sentiment_slope);
        const sentimentR2 = Number(r.sentiment_r2);

        if (
          scoreSlope < 0 &&
          scoreR2 >= ATTENTION_THRESHOLDS.MIN_R2_FOR_TREND
        ) {
          addFlag(
            r.faculty_id as string,
            r.faculty_name as string,
            r.department_code as string,
            {
              type: 'declining_trend',
              description: `Score trend is declining (slope: ${scoreSlope.toFixed(2)}, R²: ${scoreR2.toFixed(2)})`,
              metrics: { scoreSlope, scoreR2 },
            },
          );
        }

        if (
          sentimentSlope < 0 &&
          sentimentR2 >= ATTENTION_THRESHOLDS.MIN_R2_FOR_TREND
        ) {
          addFlag(
            r.faculty_id as string,
            r.faculty_name as string,
            r.department_code as string,
            {
              type: 'declining_trend',
              description: `Sentiment trend is declining (slope: ${sentimentSlope.toFixed(2)}, R²: ${sentimentR2.toFixed(2)})`,
              metrics: { sentimentSlope, sentimentR2 },
            },
          );
        }
      }
    }

    // 2. Quant-qual gap
    {
      const params: unknown[] = [
        semesterId,
        ATTENTION_THRESHOLDS.MIN_ANALYZED_FOR_GAP,
        ATTENTION_THRESHOLDS.QUANT_QUAL_DIVERGENCE,
      ];

      let deptFilter = '';
      if (deptCodes !== null) {
        deptFilter = ` AND department_code_snapshot = ANY(?)`;
        params.push(pgArray(deptCodes));
      }

      let programFilter = '';
      if (programCode) {
        programFilter = ` AND program_code_snapshot = ?`;
        params.push(programCode);
      }

      const sql = `
        SELECT faculty_id, faculty_name_snapshot AS faculty_name,
               department_code_snapshot AS department_code,
               avg_normalized_score, positive_count, analyzed_count,
               (avg_normalized_score / 100.0) - (positive_count::float / analyzed_count) AS divergence
        FROM mv_faculty_semester_stats
        WHERE semester_id = ?
          AND analyzed_count >= ?
          AND ABS((avg_normalized_score / 100.0) - (positive_count::float / analyzed_count)) > ?${deptFilter}${programFilter}
      `;

      const rows = await this.em.execute(sql, params);

      for (const r of rows) {
        const normalizedScore = Number(r.avg_normalized_score);
        const positiveRate =
          Number(r.positive_count) / Number(r.analyzed_count);
        const divergence = Number(r.divergence);

        addFlag(
          r.faculty_id as string,
          r.faculty_name as string,
          r.department_code as string,
          {
            type: 'quant_qual_gap',
            description: `Quantitative-qualitative gap detected (score: ${normalizedScore.toFixed(1)}, positive rate: ${(positiveRate * 100).toFixed(1)}%)`,
            metrics: {
              normalizedScore,
              positiveRate,
              divergence: Math.abs(divergence),
            },
          },
        );
      }
    }

    // 3. Low coverage
    {
      const params: unknown[] = [semesterId];

      let deptFilter = '';
      if (deptCodes !== null) {
        deptFilter = ` AND department_code_snapshot = ANY(?)`;
        params.push(pgArray(deptCodes));
      }

      let programFilter = '';
      if (programCode) {
        programFilter = ` AND program_code_snapshot = ?`;
        params.push(programCode);
      }

      const sql = `
        SELECT faculty_id, faculty_name_snapshot AS faculty_name,
               department_code_snapshot AS department_code,
               analyzed_count, submission_count
        FROM mv_faculty_semester_stats
        WHERE semester_id = ?
          AND submission_count > 0
          AND (analyzed_count::float / submission_count) < 0.5${deptFilter}${programFilter}
      `;

      const rows = await this.em.execute(sql, params);

      for (const r of rows) {
        const analyzedCount = Number(r.analyzed_count);
        const submissionCount = Number(r.submission_count);
        const coverageRate = analyzedCount / submissionCount;

        addFlag(
          r.faculty_id as string,
          r.faculty_name as string,
          r.department_code as string,
          {
            type: 'low_coverage',
            description: `Low analysis coverage (${analyzedCount}/${submissionCount} submissions analyzed, ${(coverageRate * 100).toFixed(1)}%)`,
            metrics: { analyzedCount, submissionCount, coverageRate },
          },
        );
      }
    }

    const items: AttentionItemDto[] = [...flagMap.values()];
    const lastRefreshedAt = await this.GetLastRefreshedAt();

    return { items, lastRefreshedAt };
  }

  async GetFacultyTrends(
    query: FacultyTrendsQueryDto,
  ): Promise<FacultyTrendsResponseDto> {
    const minSemesters = query.minSemesters ?? 3;
    const minR2 = query.minR2 ?? 0.5;

    // Resolve scope — use provided semesterId or fall back to latest semester
    let scopeSemesterId = query.semesterId;
    if (!scopeSemesterId) {
      const rows: { id: string }[] = await this.em.execute(
        'SELECT id FROM semester WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
      );
      scopeSemesterId = rows[0]?.id;
    }

    let deptCodes: string[] | null = null;
    if (scopeSemesterId) {
      deptCodes = await this.ResolveDepartmentCodes(scopeSemesterId);
    }

    const params: unknown[] = [minSemesters, minR2];

    let deptFilter = '';
    if (deptCodes !== null) {
      deptFilter = ` AND department_code_snapshot = ANY(?)`;
      params.push(pgArray(deptCodes));
    }

    const sql = `
      SELECT faculty_id, faculty_name_snapshot AS faculty_name,
             department_code_snapshot AS department_code,
             semester_count, latest_avg_normalized_score, latest_positive_rate,
             score_slope, score_r2,
             sentiment_slope, sentiment_r2
      FROM mv_faculty_trends
      WHERE semester_count >= ?
        AND COALESCE(score_r2, 0) >= ?${deptFilter}
      ORDER BY score_slope ASC
    `;

    const rows = await this.em.execute(sql, params);

    const items: FacultyTrendDto[] = rows.map((r) => {
      const scoreSlope = r.score_slope != null ? Number(r.score_slope) : null;
      const scoreR2 = r.score_r2 != null ? Number(r.score_r2) : null;

      let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
      if (scoreSlope !== null && scoreR2 !== null && scoreR2 >= minR2) {
        trendDirection =
          scoreSlope > 0
            ? 'improving'
            : scoreSlope < 0
              ? 'declining'
              : 'stable';
      }

      return {
        facultyId: r.faculty_id as string,
        facultyName: r.faculty_name as string,
        departmentCode: r.department_code as string,
        semesterCount: Number(r.semester_count),
        latestAvgScore:
          r.latest_avg_normalized_score != null
            ? Number(r.latest_avg_normalized_score)
            : null,
        latestPositiveRate:
          r.latest_positive_rate != null
            ? Number(r.latest_positive_rate)
            : null,
        scoreSlope,
        scoreR2,
        sentimentSlope:
          r.sentiment_slope != null ? Number(r.sentiment_slope) : null,
        sentimentR2: r.sentiment_r2 != null ? Number(r.sentiment_r2) : null,
        trendDirection,
      };
    });

    const lastRefreshedAt = await this.GetLastRefreshedAt();

    return { items, lastRefreshedAt };
  }

  async GetFacultyReport(
    facultyId: string,
    query: FacultyReportQueryDto,
  ): Promise<FacultyReportResponseDto> {
    await this.validateFacultyScope(facultyId, query.semesterId);

    const { versionIds, canonicalSchema, questionnaireTypeName } =
      await this.resolveVersionIds(
        facultyId,
        query.semesterId,
        query.questionnaireTypeCode,
      );

    return this.BuildFacultyReportData(
      facultyId,
      versionIds,
      canonicalSchema,
      questionnaireTypeName,
      query,
    );
  }

  /** @internal Called by report processor only — scope validation was performed at enqueue time. Do NOT expose via HTTP. */
  async GetFacultyReportUnscoped(
    facultyId: string,
    query: FacultyReportQueryDto,
  ): Promise<FacultyReportResponseDto> {
    const { versionIds, canonicalSchema, questionnaireTypeName } =
      await this.resolveVersionIds(
        facultyId,
        query.semesterId,
        query.questionnaireTypeCode,
      );

    return this.BuildFacultyReportData(
      facultyId,
      versionIds,
      canonicalSchema,
      questionnaireTypeName,
      query,
    );
  }

  /** @internal Called by report processor only — scope validation was performed at enqueue time. Do NOT expose via HTTP. */
  async GetAllFacultyReportComments(
    facultyId: string,
    query: BaseFacultyReportQueryDto,
  ): Promise<ReportCommentDto[]> {
    const { versionIds } = await this.resolveVersionIds(
      facultyId,
      query.semesterId,
      query.questionnaireTypeCode,
    );

    if (versionIds.length === 0) {
      return [];
    }

    return this.queryComments(facultyId, versionIds, query);
  }

  async GetFacultyReportComments(
    facultyId: string,
    query: FacultyReportCommentsQueryDto,
  ): Promise<FacultyReportCommentsResponseDto> {
    await this.validateFacultyScope(facultyId, query.semesterId);

    const { versionIds } = await this.resolveVersionIds(
      facultyId,
      query.semesterId,
      query.questionnaireTypeCode,
    );

    if (versionIds.length === 0) {
      return {
        items: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: query.limit!,
          totalPages: 0,
          currentPage: query.page!,
        } as PaginationMeta,
      };
    }

    const baseParams: unknown[] = [
      facultyId,
      query.semesterId,
      pgArray(versionIds),
    ];
    let courseFilter = '';
    if (query.courseId) {
      courseFilter = ` AND qs.course_id = ?`;
      baseParams.push(query.courseId);
    }

    const whereClause = `
      WHERE qs.faculty_id = ?
        AND qs.semester_id = ?
        AND qs.questionnaire_version_id = ANY(?)
        AND qs.qualitative_comment IS NOT NULL
        AND TRIM(qs.qualitative_comment) != ''
        AND qs.deleted_at IS NULL${courseFilter}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM questionnaire_submission qs ${whereClause}`;

    const page = query.page!;
    const limit = query.limit!;
    const offset = (page - 1) * limit;

    const paginatedParams = [...baseParams, limit, offset];
    const paginatedSql = `
      SELECT qs.qualitative_comment AS text, qs.submitted_at
      FROM questionnaire_submission qs
      ${whereClause}
      ORDER BY qs.submitted_at DESC
      LIMIT ? OFFSET ?
    `;

    const [countRows, commentRows] = await Promise.all([
      this.em.execute(countSql, baseParams),
      this.em.execute(paginatedSql, paginatedParams),
    ]);

    const totalItems = Number(countRows[0]?.total ?? 0);
    const items = commentRows.map((r) => ({
      text: r.text as string,
      submittedAt: new Date(r.submitted_at as string).toISOString(),
    }));

    const totalPages = Math.ceil(totalItems / limit) || 0;

    return {
      items,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      } as PaginationMeta,
    };
  }

  private async BuildFacultyReportData(
    facultyId: string,
    versionIds: string[],
    canonicalSchema: QuestionnaireSchemaSnapshot | null,
    questionnaireTypeName: string,
    query: FacultyReportQueryDto,
  ): Promise<FacultyReportResponseDto> {
    const [facultyRow, semesterRow] = await Promise.all([
      this.em
        .execute(
          'SELECT u.first_name, u.last_name FROM "user" u WHERE u.id = ? AND u.deleted_at IS NULL',
          [facultyId],
        )
        .then((rows: { first_name: string; last_name: string }[]) => {
          if (rows.length === 0)
            throw new NotFoundException('Faculty not found');
          return rows[0];
        }),
      this.em
        .execute(
          'SELECT s.id, s.code, s.label, s.academic_year FROM semester s WHERE s.id = ? AND s.deleted_at IS NULL',
          [query.semesterId],
        )
        .then(
          (
            rows: {
              id: string;
              code: string;
              label: string;
              academic_year: string;
            }[],
          ) => {
            if (rows.length === 0)
              throw new NotFoundException('Semester not found');
            return rows[0];
          },
        ),
    ]);

    const facultyDto = {
      id: facultyId,
      name: `${facultyRow.first_name} ${facultyRow.last_name}`,
    };
    const semesterDto = {
      id: semesterRow.id,
      code: semesterRow.code,
      label: semesterRow.label,
      academicYear: semesterRow.academic_year,
    };
    const questionnaireTypeDto = {
      code: query.questionnaireTypeCode,
      name: questionnaireTypeName,
    };

    if (versionIds.length === 0 || !canonicalSchema) {
      return {
        faculty: facultyDto,
        semester: semesterDto,
        questionnaireType: questionnaireTypeDto,
        courseFilter: null,
        submissionCount: 0,
        sections: [],
        overallRating: null,
        overallInterpretation: null,
      };
    }

    const { questionMap, sectionMap } = this.flattenSchema(
      canonicalSchema.sections,
    );

    // Aggregate scores
    const aggParams: unknown[] = [
      facultyId,
      query.semesterId,
      pgArray(versionIds),
    ];
    let courseFilter = '';
    if (query.courseId) {
      courseFilter = ` AND qs.course_id = ?`;
      aggParams.push(query.courseId);
    }

    const aggSql = `
      SELECT qa.question_id, qa.section_id,
             ROUND(AVG(qa.numeric_value), 2) AS average,
             COUNT(*) AS response_count
      FROM questionnaire_answer qa
      JOIN questionnaire_submission qs ON qs.id = qa.submission_id
      WHERE qs.faculty_id = ?
        AND qs.semester_id = ?
        AND qs.questionnaire_version_id = ANY(?)
        AND qs.deleted_at IS NULL
        AND qa.deleted_at IS NULL${courseFilter}
      GROUP BY qa.question_id, qa.section_id
    `;

    const countSql = `
      SELECT COUNT(DISTINCT qs.id) AS count
      FROM questionnaire_submission qs
      WHERE qs.faculty_id = ?
        AND qs.semester_id = ?
        AND qs.questionnaire_version_id = ANY(?)
        AND qs.deleted_at IS NULL${courseFilter}
    `;

    const [aggRows, countRows] = await Promise.all([
      this.em.execute(aggSql, aggParams),
      this.em.execute(countSql, aggParams),
    ]);

    const submissionCount = Number(countRows[0]?.count ?? 0);

    // Build score lookup: key = "questionId::sectionId"
    const scoreMap = new Map<
      string,
      { average: number; responseCount: number }
    >();
    for (const row of aggRows) {
      scoreMap.set(`${row.question_id}::${row.section_id}`, {
        average: Number(row.average),
        responseCount: Number(row.response_count),
      });
    }

    // Assemble sections
    const sectionEntries = [...sectionMap.entries()].sort(
      (a, b) => a[1].order - b[1].order,
    );

    const sections = sectionEntries
      .map(([sectionId, meta]) => {
        const sectionQuestions = [...questionMap.entries()]
          .filter(([, qm]) => qm.sectionId === sectionId)
          .sort((a, b) => a[1].order - b[1].order);

        const questions = sectionQuestions
          .map(([questionId, qm]) => {
            const score = scoreMap.get(`${questionId}::${sectionId}`);
            if (!score) return null;
            return {
              questionId,
              order: qm.order,
              text: qm.text,
              average: score.average,
              responseCount: score.responseCount,
              interpretation: getInterpretation(score.average),
            };
          })
          .filter((q): q is NonNullable<typeof q> => q !== null);

        if (questions.length === 0) return null;

        const sectionAverage =
          Math.round(
            (questions.reduce((sum, q) => sum + q.average, 0) /
              questions.length) *
              100,
          ) / 100;

        return {
          sectionId,
          title: meta.title,
          order: meta.order,
          weight: meta.weight,
          questions,
          sectionAverage,
          sectionInterpretation: getInterpretation(sectionAverage),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Overall weighted rating
    let overallRating: number | null = null;
    let overallInterpretation: string | null = null;

    if (sections.length > 0) {
      const weightedSum = sections.reduce(
        (sum, s) => sum + s.weight * s.sectionAverage,
        0,
      );
      const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0);
      if (totalWeight > 0) {
        overallRating = Math.round((weightedSum / totalWeight) * 100) / 100;
        overallInterpretation = getInterpretation(overallRating);
      }
    }

    // Course filter metadata
    let courseFilterDto: FacultyReportResponseDto['courseFilter'] = null;
    if (query.courseId) {
      const courseRows = await this.em.execute(
        `SELECT qs.course_code_snapshot, qs.course_title_snapshot
           FROM questionnaire_submission qs
           WHERE qs.faculty_id = ?
             AND qs.semester_id = ?
             AND qs.questionnaire_version_id = ANY(?)
             AND qs.course_id = ?
             AND qs.deleted_at IS NULL
           LIMIT 1`,
        [facultyId, query.semesterId, pgArray(versionIds), query.courseId],
      );
      const courseRow = courseRows[0];
      if (courseRow) {
        courseFilterDto = {
          id: query.courseId,
          code: courseRow.course_code_snapshot as string,
          title: courseRow.course_title_snapshot as string,
        };
      }
    }

    return {
      faculty: facultyDto,
      semester: semesterDto,
      questionnaireType: questionnaireTypeDto,
      courseFilter: courseFilterDto,
      submissionCount,
      sections,
      overallRating,
      overallInterpretation,
    };
  }

  private async queryComments(
    facultyId: string,
    versionIds: string[],
    query: BaseFacultyReportQueryDto,
  ): Promise<ReportCommentDto[]> {
    const params: unknown[] = [
      facultyId,
      query.semesterId,
      pgArray(versionIds),
    ];
    let courseFilter = '';
    if (query.courseId) {
      courseFilter = ` AND qs.course_id = ?`;
      params.push(query.courseId);
    }

    const sql = `
      SELECT qs.qualitative_comment AS text, qs.submitted_at
      FROM questionnaire_submission qs
      WHERE qs.faculty_id = ?
        AND qs.semester_id = ?
        AND qs.questionnaire_version_id = ANY(?)
        AND qs.qualitative_comment IS NOT NULL
        AND TRIM(qs.qualitative_comment) != ''
        AND qs.deleted_at IS NULL${courseFilter}
      ORDER BY qs.submitted_at DESC
    `;

    const rows = await this.em.execute(sql, params);

    return rows.map((r) => ({
      text: r.text as string,
      submittedAt: new Date(r.submitted_at as string).toISOString(),
    }));
  }

  private async validateFacultyScope(
    facultyId: string,
    semesterId: string,
  ): Promise<{ first_name: string; last_name: string } | null> {
    const deptIds = await this.scopeResolver.ResolveDepartmentIds(semesterId);

    if (deptIds === null) {
      return null; // super admin — unrestricted, caller fetches metadata
    }

    const userRows: {
      id: string;
      department_id: string;
      first_name: string;
      last_name: string;
    }[] = await this.em.execute(
      'SELECT u.id, u.department_id, u.first_name, u.last_name FROM "user" u WHERE u.id = ? AND u.deleted_at IS NULL',
      [facultyId],
    );

    if (userRows.length === 0) {
      throw new NotFoundException('Faculty not found');
    }

    if (!deptIds.includes(userRows[0].department_id)) {
      throw new ForbiddenException(
        'You do not have access to this faculty member',
      );
    }

    return {
      first_name: userRows[0].first_name,
      last_name: userRows[0].last_name,
    };
  }

  private async resolveVersionIds(
    facultyId: string,
    semesterId: string,
    questionnaireTypeCode: string,
  ): Promise<{
    versionIds: string[];
    canonicalSchema: QuestionnaireSchemaSnapshot | null;
    questionnaireTypeName: string;
  }> {
    // Phase 1: Verify type exists
    const typeRows: { id: string; name: string }[] = await this.em.execute(
      'SELECT qt.id, qt.name FROM questionnaire_type qt WHERE qt.code = ? AND qt.deleted_at IS NULL',
      [questionnaireTypeCode],
    );

    if (typeRows.length === 0) {
      throw new NotFoundException('Questionnaire type not found');
    }

    const typeId = typeRows[0].id;
    const questionnaireTypeName = typeRows[0].name;

    // Phase 2: Find versions with submissions
    const versionRows: {
      id: string;
      version_number: number;
      schema_snapshot: QuestionnaireSchemaSnapshot;
    }[] = await this.em.execute(
      `SELECT DISTINCT qv.id, qv.version_number, qv.schema_snapshot
       FROM questionnaire_version qv
       JOIN questionnaire q ON q.id = qv.questionnaire_id
       JOIN questionnaire_submission qs ON qs.questionnaire_version_id = qv.id
       WHERE q.type_id = ?
         AND qs.faculty_id = ?
         AND qs.semester_id = ?
         AND qv.status IN ('ACTIVE', 'DEPRECATED')
         AND qv.deleted_at IS NULL
         AND q.deleted_at IS NULL
         AND qs.deleted_at IS NULL
       ORDER BY qv.version_number DESC`,
      [typeId, facultyId, semesterId],
    );

    if (versionRows.length === 0) {
      return { versionIds: [], canonicalSchema: null, questionnaireTypeName };
    }

    const versionIds = versionRows.map((r) => r.id);
    const canonicalSchema =
      typeof versionRows[0].schema_snapshot === 'string'
        ? (JSON.parse(
            versionRows[0].schema_snapshot,
          ) as QuestionnaireSchemaSnapshot)
        : versionRows[0].schema_snapshot;

    return { versionIds, canonicalSchema, questionnaireTypeName };
  }

  private flattenSchema(sections: SectionNode[]): {
    questionMap: Map<string, QuestionMeta>;
    sectionMap: Map<string, SectionMeta>;
  } {
    const questionMap = new Map<string, QuestionMeta>();
    const sectionMap = new Map<string, SectionMeta>();

    const walk = (nodes: SectionNode[]) => {
      for (const node of nodes) {
        if (node.questions && node.questions.length > 0) {
          // Leaf section
          sectionMap.set(node.id, {
            title: node.title,
            order: node.order,
            weight: node.weight ?? 0,
          });

          for (const q of node.questions) {
            questionMap.set(q.id, {
              text: q.text,
              order: q.order,
              sectionId: node.id,
              sectionTitle: node.title,
              sectionOrder: node.order,
              weight: node.weight ?? 0,
              dimensionCode: q.dimensionCode,
            });
          }
        } else if (node.sections && node.sections.length > 0) {
          walk(node.sections);
        }
      }
    };

    walk(sections);
    return { questionMap, sectionMap };
  }

  private async GetLastRefreshedAt(): Promise<string | null> {
    const rows: { value: string }[] = await this.em.execute(
      "SELECT value FROM system_config WHERE key = 'analytics_last_refreshed_at' AND deleted_at IS NULL",
    );

    return rows[0]?.value ?? null;
  }

  private async IsProgramCodeInScope(
    semesterId: string,
    programCode?: string,
  ): Promise<boolean> {
    if (!programCode) return true;
    const allowedCodes =
      await this.scopeResolver.ResolveProgramCodes(semesterId);
    if (allowedCodes === null) return true;
    return allowedCodes.includes(programCode);
  }

  private async ResolveDepartmentCodes(
    semesterId: string,
  ): Promise<string[] | null> {
    const deptIds = await this.scopeResolver.ResolveDepartmentIds(semesterId);

    if (deptIds === null) {
      return null; // super admin — unrestricted
    }

    if (deptIds.length === 0) {
      return [];
    }

    const rows: { code: string }[] = await this.em.execute(
      'SELECT DISTINCT code FROM department WHERE id = ANY(?) AND deleted_at IS NULL',
      [pgArray(deptIds)],
    );

    return rows.map((r) => r.code);
  }
}
