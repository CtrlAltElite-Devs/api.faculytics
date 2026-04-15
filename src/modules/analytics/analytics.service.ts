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
  QualitativeSummaryQueryDto,
  SentimentLabel,
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
import {
  QualitativeSummaryResponseDto,
  QualitativeThemeDto,
} from './dto/responses/qualitative-summary.response.dto';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import { SentimentRun } from 'src/entities/sentiment-run.entity';
import { SentimentResult } from 'src/entities/sentiment-result.entity';
import { TopicModelRun } from 'src/entities/topic-model-run.entity';
import { Topic } from 'src/entities/topic.entity';
import { TopicAssignment } from 'src/entities/topic-assignment.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { PipelineStatus } from 'src/modules/analysis/enums';

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

const QUALITATIVE_SUMMARY_LIMITS = {
  MAX_SAMPLE_QUOTES_PER_THEME: 3,
  QUOTE_MAX_LENGTH: 280,
} as const;

const SENTIMENT_LABEL_VALUES: SentimentLabel[] = [
  'positive',
  'neutral',
  'negative',
];

function scrubQuote(raw: string): string {
  const truncated =
    raw.length > QUALITATIVE_SUMMARY_LIMITS.QUOTE_MAX_LENGTH
      ? `${raw.slice(0, QUALITATIVE_SUMMARY_LIMITS.QUOTE_MAX_LENGTH)}…`
      : raw;
  return truncated.replace(/[A-Z][a-z]+\s[A-Z][a-z]+/g, '[name]');
}

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

    const page = query.page!;
    const limit = query.limit!;

    if (versionIds.length === 0) {
      return this.emptyCommentsResponse(page, limit);
    }

    // Resolve pipeline (for per-row annotations + sentiment/theme filters).
    const pipeline = await this.findLatestCompletedPipelineByScope(
      facultyId,
      query.semesterId,
      query.questionnaireTypeCode,
      query.courseId,
    );

    // If filters require a pipeline but none exists, return empty.
    if (!pipeline && (query.sentiment || query.themeId)) {
      return this.emptyCommentsResponse(page, limit);
    }

    let sentimentRunId: string | null = null;
    let topicModelRunId: string | null = null;
    if (pipeline) {
      const runs = await this.resolvePipelineRuns(pipeline.id);
      sentimentRunId = runs.sentimentRun?.id ?? null;
      topicModelRunId = runs.topicModelRun?.id ?? null;
    }

    // Filters whose runs are missing → empty (cannot satisfy filter).
    if (query.sentiment && !sentimentRunId) {
      return this.emptyCommentsResponse(page, limit);
    }
    if (query.themeId && !topicModelRunId) {
      return this.emptyCommentsResponse(page, limit);
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

    let sentimentFilterSql = '';
    if (query.sentiment) {
      sentimentFilterSql = ` AND EXISTS (
        SELECT 1 FROM sentiment_result sr
        WHERE sr.submission_id = qs.id
          AND sr.run_id = ?
          AND sr.label = ?
          AND sr.deleted_at IS NULL
      )`;
      baseParams.push(sentimentRunId!, query.sentiment);
    }

    let themeFilterSql = '';
    if (query.themeId) {
      themeFilterSql = ` AND EXISTS (
        SELECT 1 FROM topic_assignment ta_f
        JOIN topic t_f ON t_f.id = ta_f.topic_id
        WHERE ta_f.submission_id = qs.id
          AND ta_f.topic_id = ?
          AND ta_f.is_dominant = true
          AND ta_f.deleted_at IS NULL
          AND t_f.run_id = ?
          AND t_f.deleted_at IS NULL
      )`;
      baseParams.push(query.themeId, topicModelRunId!);
    }

    const whereClause = `
      WHERE qs.faculty_id = ?
        AND qs.semester_id = ?
        AND qs.questionnaire_version_id = ANY(?)
        AND qs.qualitative_comment IS NOT NULL
        AND TRIM(qs.qualitative_comment) != ''
        AND qs.deleted_at IS NULL${courseFilter}${sentimentFilterSql}${themeFilterSql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM questionnaire_submission qs ${whereClause}`;

    const offset = (page - 1) * limit;

    // Per-row annotation LEFT JOINs when a pipeline is resolved.
    let annotationSelect = '';
    let annotationJoins = '';
    const annotationParams: unknown[] = [];
    if (sentimentRunId) {
      annotationSelect += `, sr_ann.label AS sentiment`;
      annotationJoins += `
        LEFT JOIN LATERAL (
          SELECT sr.label FROM sentiment_result sr
          WHERE sr.submission_id = qs.id
            AND sr.run_id = ?
            AND sr.deleted_at IS NULL
          ORDER BY sr.processed_at DESC
          LIMIT 1
        ) sr_ann ON true`;
      annotationParams.push(sentimentRunId);
    }
    if (topicModelRunId) {
      annotationSelect += `, ta_ann.theme_ids AS theme_ids`;
      annotationJoins += `
        LEFT JOIN LATERAL (
          SELECT array_agg(DISTINCT ta.topic_id) AS theme_ids
          FROM topic_assignment ta
          JOIN topic t ON t.id = ta.topic_id
          WHERE ta.submission_id = qs.id
            AND ta.is_dominant = true
            AND ta.deleted_at IS NULL
            AND t.run_id = ?
            AND t.deleted_at IS NULL
        ) ta_ann ON true`;
      annotationParams.push(topicModelRunId);
    }

    const paginatedSql = `
      SELECT qs.qualitative_comment AS text, qs.submitted_at${annotationSelect}
      FROM questionnaire_submission qs
      ${annotationJoins}
      ${whereClause}
      ORDER BY qs.submitted_at DESC
      LIMIT ? OFFSET ?
    `;

    const paginatedParams = [...annotationParams, ...baseParams, limit, offset];

    const [countRows, commentRows] = await Promise.all([
      this.em.execute(countSql, baseParams),
      this.em.execute(paginatedSql, paginatedParams),
    ]);

    const totalItems = Number(countRows[0]?.total ?? 0);
    const items: ReportCommentDto[] = commentRows.map((r) => {
      const row = r as {
        text: string;
        submitted_at: string;
        sentiment?: string | null;
        theme_ids?: string[] | null;
      };
      const dto: ReportCommentDto = {
        text: row.text,
        submittedAt: new Date(row.submitted_at).toISOString(),
      };
      if (
        row.sentiment &&
        SENTIMENT_LABEL_VALUES.includes(row.sentiment as SentimentLabel)
      ) {
        dto.sentiment = row.sentiment as SentimentLabel;
      }
      if (row.theme_ids && row.theme_ids.length > 0) {
        dto.themeIds = row.theme_ids;
      }
      return dto;
    });

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

  async GetQualitativeSummary(
    facultyId: string,
    query: QualitativeSummaryQueryDto,
  ): Promise<QualitativeSummaryResponseDto> {
    await this.validateFacultyScope(facultyId, query.semesterId);

    const emptyResponse: QualitativeSummaryResponseDto = {
      sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
      themes: [],
    };

    const pipeline = await this.findLatestCompletedPipelineByScope(
      facultyId,
      query.semesterId,
      query.questionnaireTypeCode,
      query.courseId,
    );

    if (!pipeline) {
      return emptyResponse;
    }

    const { sentimentRun, topicModelRun } = await this.resolvePipelineRuns(
      pipeline.id,
    );

    // Global sentiment distribution from all SentimentResults of the run.
    const sentimentDistribution = { positive: 0, neutral: 0, negative: 0 };
    const sentimentBySubmission = new Map<
      string,
      { label: string; strength: number }
    >();
    if (sentimentRun) {
      const sentimentResults = await this.em.find(
        SentimentResult,
        { run: sentimentRun.id },
        { populate: ['submission'] },
      );
      for (const sr of sentimentResults) {
        if (sr.label === 'positive') sentimentDistribution.positive++;
        else if (sr.label === 'neutral') sentimentDistribution.neutral++;
        else if (sr.label === 'negative') sentimentDistribution.negative++;
        sentimentBySubmission.set(sr.submission.id, {
          label: sr.label,
          strength: Math.abs(
            Number(sr.positiveScore) - Number(sr.negativeScore),
          ),
        });
      }
    }

    if (!topicModelRun) {
      return { sentimentDistribution, themes: [] };
    }

    const topics = await this.em.find(
      Topic,
      { run: topicModelRun.id },
      { orderBy: { docCount: 'DESC' } },
    );

    if (topics.length === 0) {
      return { sentimentDistribution, themes: [] };
    }

    const topicIds = topics.map((t) => t.id);
    const dominantAssignments = await this.em.find(
      TopicAssignment,
      { topic: { $in: topicIds }, isDominant: true },
      { populate: ['submission'] },
    );

    // Group dominant assignments by topic id.
    const assignmentsByTopic = new Map<string, TopicAssignment[]>();
    for (const ta of dominantAssignments) {
      const list = assignmentsByTopic.get(ta.topic.id) ?? [];
      list.push(ta);
      assignmentsByTopic.set(ta.topic.id, list);
    }

    // Collect submission ids whose comments we need for sample quotes.
    const quoteSubmissionIds = new Set<string>();
    const selectionsByTopic = new Map<
      string,
      { submissionId: string; strength: number }[]
    >();
    for (const topic of topics) {
      const assignments = assignmentsByTopic.get(topic.id) ?? [];
      const ranked = assignments
        .map((a) => {
          const senti = sentimentBySubmission.get(a.submission.id);
          return senti
            ? { submissionId: a.submission.id, strength: senti.strength }
            : null;
        })
        .filter(
          (
            x,
          ): x is {
            submissionId: string;
            strength: number;
          } => x !== null,
        )
        .sort((a, b) => b.strength - a.strength)
        .slice(0, QUALITATIVE_SUMMARY_LIMITS.MAX_SAMPLE_QUOTES_PER_THEME);
      selectionsByTopic.set(topic.id, ranked);
      for (const r of ranked) quoteSubmissionIds.add(r.submissionId);
    }

    const submissionTextMap = new Map<string, string>();
    if (quoteSubmissionIds.size > 0) {
      const subs = await this.em.find(QuestionnaireSubmission, {
        id: { $in: Array.from(quoteSubmissionIds) },
      });
      for (const s of subs) {
        const text = s.cleanedComment ?? s.qualitativeComment ?? '';
        if (text) submissionTextMap.set(s.id, text);
      }
    }

    const themes: QualitativeThemeDto[] = topics
      .map((topic) => {
        const assignments = assignmentsByTopic.get(topic.id) ?? [];
        const split = { positive: 0, neutral: 0, negative: 0 };
        for (const ta of assignments) {
          const senti = sentimentBySubmission.get(ta.submission.id);
          if (!senti) continue;
          if (senti.label === 'positive') split.positive++;
          else if (senti.label === 'neutral') split.neutral++;
          else if (senti.label === 'negative') split.negative++;
        }

        const selection = selectionsByTopic.get(topic.id) ?? [];
        const sampleQuotes = selection
          .map((s) => submissionTextMap.get(s.submissionId))
          .filter((t): t is string => !!t)
          .map((t) => scrubQuote(t));

        return {
          themeId: topic.id,
          label: topic.label ?? topic.rawLabel,
          count: assignments.length,
          sentimentSplit: split,
          sampleQuotes: sampleQuotes.length > 0 ? sampleQuotes : undefined,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      sentimentDistribution,
      themes,
    };
  }

  private emptyCommentsResponse(
    page: number,
    limit: number,
  ): FacultyReportCommentsResponseDto {
    return {
      items: [],
      meta: {
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: limit,
        totalPages: 0,
        currentPage: page,
      } as PaginationMeta,
    };
  }

  private async findLatestCompletedPipelineByScope(
    facultyId: string,
    semesterId: string,
    questionnaireTypeCode: string,
    courseId?: string,
  ): Promise<AnalysisPipeline | null> {
    const filter: Record<string, unknown> = {
      status: PipelineStatus.COMPLETED,
      faculty: facultyId,
      semester: semesterId,
      questionnaireVersion: {
        questionnaire: { type: { code: questionnaireTypeCode } },
      },
    };
    if (courseId) {
      filter.course = courseId;
    } else {
      filter.course = null;
    }

    return this.em.findOne(AnalysisPipeline, filter, {
      orderBy: { createdAt: 'DESC' },
    });
  }

  private async resolvePipelineRuns(pipelineId: string): Promise<{
    sentimentRun: SentimentRun | null;
    topicModelRun: TopicModelRun | null;
  }> {
    const [sentimentRun, topicModelRun] = await Promise.all([
      this.em.findOne(
        SentimentRun,
        { pipeline: pipelineId },
        { orderBy: { createdAt: 'DESC' } },
      ),
      this.em.findOne(
        TopicModelRun,
        { pipeline: pipelineId },
        { orderBy: { createdAt: 'DESC' } },
      ),
    ]);
    return { sentimentRun, topicModelRun };
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
