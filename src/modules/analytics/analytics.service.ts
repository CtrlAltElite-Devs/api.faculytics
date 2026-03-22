import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import {
  DepartmentOverviewQueryDto,
  FacultyTrendsQueryDto,
} from './dto/analytics-query.dto';
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

    // F5 fix: pre-compute previous semester ID (same for all rows since semester_id is constant)
    const prevSemRows: { id: string }[] = await this.em.getConnection().execute(
      `SELECT s2.id FROM semester s2
         WHERE s2.campus_id = (SELECT s1.campus_id FROM semester s1 WHERE s1.id = $1)
           AND s2.created_at < (SELECT s1.created_at FROM semester s1 WHERE s1.id = $1)
           AND s2.deleted_at IS NULL
         ORDER BY s2.created_at DESC LIMIT 1`,
      [semesterId],
    );
    const prevSemesterId = prevSemRows[0]?.id ?? null;

    const params: unknown[] = [semesterId, prevSemesterId];
    let paramIdx = 3;

    let deptFilter = '';
    if (deptCodes !== null) {
      deptFilter = ` AND curr.department_code_snapshot = ANY($${paramIdx})`;
      params.push(deptCodes);
      paramIdx++;
    }

    let programFilter = '';
    if (query.programCode) {
      programFilter = ` AND curr.program_code_snapshot = $${paramIdx}`;
      params.push(query.programCode);
      paramIdx++;
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
        AND prev.semester_id = $2
      WHERE curr.semester_id = $1${deptFilter}${programFilter}
      ORDER BY curr.department_code_snapshot, curr.avg_normalized_score DESC
    `;

    const rows = await this.em.getConnection().execute(sql, params);

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
  ): Promise<AttentionListResponseDto> {
    const deptCodes = await this.ResolveDepartmentCodes(semesterId);

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
      let paramIdx = 3;

      let deptFilter = '';
      if (deptCodes !== null) {
        deptFilter = ` AND department_code_snapshot = ANY($${paramIdx})`;
        params.push(deptCodes);
        paramIdx++;
      }

      const sql = `
        SELECT faculty_id, faculty_name_snapshot AS faculty_name,
               department_code_snapshot AS department_code,
               score_slope, score_r2, sentiment_slope, sentiment_r2
        FROM mv_faculty_trends
        WHERE semester_count >= $1
          AND (
            (score_slope < 0 AND score_r2 >= $2)
            OR (sentiment_slope < 0 AND sentiment_r2 >= $2)
          )${deptFilter}
      `;

      const rows = await this.em.getConnection().execute(sql, params);

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
      let paramIdx = 4;

      let deptFilter = '';
      if (deptCodes !== null) {
        deptFilter = ` AND department_code_snapshot = ANY($${paramIdx})`;
        params.push(deptCodes);
        paramIdx++;
      }

      const sql = `
        SELECT faculty_id, faculty_name_snapshot AS faculty_name,
               department_code_snapshot AS department_code,
               avg_normalized_score, positive_count, analyzed_count,
               (avg_normalized_score / 100.0) - (positive_count::float / analyzed_count) AS divergence
        FROM mv_faculty_semester_stats
        WHERE semester_id = $1
          AND analyzed_count >= $2
          AND ABS((avg_normalized_score / 100.0) - (positive_count::float / analyzed_count)) > $3${deptFilter}
      `;

      const rows = await this.em.getConnection().execute(sql, params);

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
      let paramIdx = 2;

      let deptFilter = '';
      if (deptCodes !== null) {
        deptFilter = ` AND department_code_snapshot = ANY($${paramIdx})`;
        params.push(deptCodes);
        paramIdx++;
      }

      const sql = `
        SELECT faculty_id, faculty_name_snapshot AS faculty_name,
               department_code_snapshot AS department_code,
               analyzed_count, submission_count
        FROM mv_faculty_semester_stats
        WHERE semester_id = $1
          AND submission_count > 0
          AND (analyzed_count::float / submission_count) < 0.5${deptFilter}
      `;

      const rows = await this.em.getConnection().execute(sql, params);

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
      const rows: { id: string }[] = await this.em
        .getConnection()
        .execute(
          'SELECT id FROM semester WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
        );
      scopeSemesterId = rows[0]?.id;
    }

    let deptCodes: string[] | null = null;
    if (scopeSemesterId) {
      deptCodes = await this.ResolveDepartmentCodes(scopeSemesterId);
    }

    const params: unknown[] = [minSemesters, minR2];
    let paramIdx = 3;

    let deptFilter = '';
    if (deptCodes !== null) {
      deptFilter = ` AND department_code_snapshot = ANY($${paramIdx})`;
      params.push(deptCodes);
      paramIdx++;
    }

    const sql = `
      SELECT faculty_id, faculty_name_snapshot AS faculty_name,
             department_code_snapshot AS department_code,
             semester_count, latest_avg_normalized_score, latest_positive_rate,
             score_slope, score_r2,
             sentiment_slope, sentiment_r2
      FROM mv_faculty_trends
      WHERE semester_count >= $1
        AND COALESCE(score_r2, 0) >= $2${deptFilter}
      ORDER BY score_slope ASC
    `;

    const rows = await this.em.getConnection().execute(sql, params);

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

  private async GetLastRefreshedAt(): Promise<string | null> {
    const rows: { value: string }[] = await this.em
      .getConnection()
      .execute(
        "SELECT value FROM system_config WHERE key = 'analytics_last_refreshed_at' AND deleted_at IS NULL",
      );

    return rows[0]?.value ?? null;
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

    const rows: { code: string }[] = await this.em
      .getConnection()
      .execute(
        'SELECT DISTINCT code FROM department WHERE id = ANY($1) AND deleted_at IS NULL',
        [deptIds],
      );

    return rows.map((r) => r.code);
  }
}
