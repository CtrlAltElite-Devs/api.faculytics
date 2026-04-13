import { Migration } from '@mikro-orm/migrations';

export class Migration20260413232204 extends Migration {
  // FAC-130: re-aggregate mv_faculty_semester_stats by the faculty's
  // institutional home department instead of the course-owner department.
  // See _bmad-output/implementation-artifacts/tech-spec-fac-130-analytics-mv-home-department.md
  //
  // TD-2: the MV column name `department_code_snapshot` is preserved; only
  // the expression populating it changes. This keeps every consumer of the
  // MV (analytics.service.ts, DTOs, frontend) untouched.
  //
  // FAC-130 body changes vs. Migration20260412153923's MV_FACULTY_SEMESTER_STATS:
  //   - topic_counts CTE: SELECT list + GROUP BY use COALESCE(faculty_department_code_snapshot, department_code_snapshot)
  //   - outer SELECT: department_code_snapshot column uses same COALESCE
  //   - outer SELECT: department_name_snapshot MODE() input uses COALESCE(faculty_department_name_snapshot, department_name_snapshot)
  //   - outer GROUP BY: third grouping expression uses the same COALESCE as the SELECT
  //   - LEFT JOIN topic_counts: predicate aligns on the same COALESCE so the CTE and outer axis match
  // Historical submissions (pre-FAC-128) fall back to the course-owner code.

  private readonly MV_FACULTY_SEMESTER_STATS = `
    CREATE MATERIALIZED VIEW mv_faculty_semester_stats AS
    WITH topic_counts AS (
      SELECT
        qs.faculty_id,
        qs.semester_id,
        COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot) AS department_code_snapshot,
        COUNT(DISTINCT ta.topic_id) AS distinct_topic_count
      FROM questionnaire_submission qs
      JOIN topic_assignment ta ON ta.submission_id = qs.id
        AND ta.deleted_at IS NULL
        AND ta.is_dominant = true
      JOIN topic t ON t.id = ta.topic_id
      JOIN topic_model_run tmr ON tmr.id = t.run_id
        AND tmr.status = 'COMPLETED'
        AND tmr.deleted_at IS NULL
      JOIN analysis_pipeline ap ON ap.id = tmr.pipeline_id
        AND ap.status = 'COMPLETED'
        AND ap.deleted_at IS NULL
      WHERE qs.deleted_at IS NULL
      GROUP BY qs.faculty_id, qs.semester_id, COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot)
    )
    SELECT
      qs.faculty_id,
      qs.semester_id,
      COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot) AS department_code_snapshot,
      MODE() WITHIN GROUP (ORDER BY COALESCE(qs.faculty_department_name_snapshot, qs.department_name_snapshot)) AS department_name_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.faculty_name_snapshot) AS faculty_name_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.semester_code_snapshot) AS semester_code_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.academic_year_snapshot) AS academic_year_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.program_code_snapshot) AS program_code_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.campus_code_snapshot) AS campus_code_snapshot,
      COUNT(DISTINCT qs.id) AS submission_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE qs.qualitative_comment IS NOT NULL) AS comment_count,
      ROUND(AVG(qs.normalized_score), 4) AS avg_normalized_score,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'positive') AS positive_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'negative') AS negative_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'neutral') AS neutral_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label IS NOT NULL) AS analyzed_count,
      COALESCE(MAX(tc.distinct_topic_count), 0) AS distinct_topic_count
    FROM questionnaire_submission qs
    LEFT JOIN LATERAL (
      SELECT sr2.label
      FROM sentiment_result sr2
      JOIN sentiment_run srun ON srun.id = sr2.run_id
      JOIN analysis_pipeline ap ON ap.id = srun.pipeline_id
      WHERE sr2.submission_id = qs.id
        AND sr2.deleted_at IS NULL
        AND srun.status = 'COMPLETED'
        AND srun.deleted_at IS NULL
        AND ap.status = 'COMPLETED'
        AND ap.deleted_at IS NULL
      ORDER BY sr2.processed_at DESC
      LIMIT 1
    ) sr ON true
    LEFT JOIN topic_counts tc
      ON tc.faculty_id = qs.faculty_id
      AND tc.semester_id = qs.semester_id
      AND tc.department_code_snapshot = COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot)
    WHERE qs.deleted_at IS NULL
    GROUP BY
      qs.faculty_id, qs.semester_id,
      COALESCE(qs.faculty_department_code_snapshot, qs.department_code_snapshot);
  `;

  private readonly MV_FACULTY_TRENDS = `
    CREATE MATERIALIZED VIEW mv_faculty_trends AS
    SELECT
      sub.faculty_id,
      sub.department_code_snapshot,
      MODE() WITHIN GROUP (ORDER BY sub.faculty_name_snapshot) AS faculty_name_snapshot,
      COUNT(*) AS semester_count,
      (array_agg(sub.avg_normalized_score ORDER BY sub.ordinal DESC))[1] AS latest_avg_normalized_score,
      (array_agg(sub.positive_rate ORDER BY sub.ordinal DESC))[1] AS latest_positive_rate,
      regr_slope(sub.avg_normalized_score, sub.ordinal) AS score_slope,
      regr_r2(sub.avg_normalized_score, sub.ordinal) AS score_r2,
      regr_slope(sub.positive_rate, sub.ordinal) AS sentiment_slope,
      regr_r2(sub.positive_rate, sub.ordinal) AS sentiment_r2
    FROM (
      SELECT
        fss.faculty_id,
        fss.department_code_snapshot,
        fss.faculty_name_snapshot,
        fss.avg_normalized_score,
        fss.positive_count::float / NULLIF(fss.analyzed_count, 0) AS positive_rate,
        ROW_NUMBER() OVER (
          PARTITION BY fss.faculty_id, fss.department_code_snapshot
          ORDER BY s.created_at
        ) AS ordinal
      FROM mv_faculty_semester_stats fss
      JOIN semester s ON s.id = fss.semester_id AND s.deleted_at IS NULL
    ) sub
    GROUP BY sub.faculty_id, sub.department_code_snapshot;
  `;

  // Pre-FAC-130 body of mv_faculty_semester_stats — course-owner axis.
  // Copied verbatim from Migration20260412153923.MV_FACULTY_SEMESTER_STATS so
  // down() can restore the pre-FAC-130 semantics. MV_FACULTY_TRENDS is
  // unchanged across pre/post FAC-130, so down() reuses MV_FACULTY_TRENDS.
  private readonly MV_FACULTY_SEMESTER_STATS_PRE_FAC130 = `
    CREATE MATERIALIZED VIEW mv_faculty_semester_stats AS
    WITH topic_counts AS (
      SELECT
        qs.faculty_id,
        qs.semester_id,
        qs.department_code_snapshot,
        COUNT(DISTINCT ta.topic_id) AS distinct_topic_count
      FROM questionnaire_submission qs
      JOIN topic_assignment ta ON ta.submission_id = qs.id
        AND ta.deleted_at IS NULL
        AND ta.is_dominant = true
      JOIN topic t ON t.id = ta.topic_id
      JOIN topic_model_run tmr ON tmr.id = t.run_id
        AND tmr.status = 'COMPLETED'
        AND tmr.deleted_at IS NULL
      JOIN analysis_pipeline ap ON ap.id = tmr.pipeline_id
        AND ap.status = 'COMPLETED'
        AND ap.deleted_at IS NULL
      WHERE qs.deleted_at IS NULL
      GROUP BY qs.faculty_id, qs.semester_id, qs.department_code_snapshot
    )
    SELECT
      qs.faculty_id,
      qs.semester_id,
      qs.department_code_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.department_name_snapshot) AS department_name_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.faculty_name_snapshot) AS faculty_name_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.semester_code_snapshot) AS semester_code_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.academic_year_snapshot) AS academic_year_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.program_code_snapshot) AS program_code_snapshot,
      MODE() WITHIN GROUP (ORDER BY qs.campus_code_snapshot) AS campus_code_snapshot,
      COUNT(DISTINCT qs.id) AS submission_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE qs.qualitative_comment IS NOT NULL) AS comment_count,
      ROUND(AVG(qs.normalized_score), 4) AS avg_normalized_score,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'positive') AS positive_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'negative') AS negative_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label = 'neutral') AS neutral_count,
      COUNT(DISTINCT qs.id) FILTER (WHERE sr.label IS NOT NULL) AS analyzed_count,
      COALESCE(MAX(tc.distinct_topic_count), 0) AS distinct_topic_count
    FROM questionnaire_submission qs
    LEFT JOIN LATERAL (
      SELECT sr2.label
      FROM sentiment_result sr2
      JOIN sentiment_run srun ON srun.id = sr2.run_id
      JOIN analysis_pipeline ap ON ap.id = srun.pipeline_id
      WHERE sr2.submission_id = qs.id
        AND sr2.deleted_at IS NULL
        AND srun.status = 'COMPLETED'
        AND srun.deleted_at IS NULL
        AND ap.status = 'COMPLETED'
        AND ap.deleted_at IS NULL
      ORDER BY sr2.processed_at DESC
      LIMIT 1
    ) sr ON true
    LEFT JOIN topic_counts tc
      ON tc.faculty_id = qs.faculty_id
      AND tc.semester_id = qs.semester_id
      AND tc.department_code_snapshot = qs.department_code_snapshot
    WHERE qs.deleted_at IS NULL
    GROUP BY
      qs.faculty_id, qs.semester_id,
      qs.department_code_snapshot;
  `;

  override async up(): Promise<void> {
    this.addSql(`DROP MATERIALIZED VIEW IF EXISTS mv_faculty_trends;`);
    this.addSql(`DROP MATERIALIZED VIEW IF EXISTS mv_faculty_semester_stats;`);

    this.addSql(this.MV_FACULTY_SEMESTER_STATS);
    this.addSql(`CREATE UNIQUE INDEX uq_mv_faculty_semester_stats
      ON mv_faculty_semester_stats (faculty_id, semester_id, department_code_snapshot);`);
    this.addSql(`CREATE INDEX idx_mv_fss_dept_semester
      ON mv_faculty_semester_stats (department_code_snapshot, semester_id);`);

    this.addSql(this.MV_FACULTY_TRENDS);
    this.addSql(`CREATE UNIQUE INDEX uq_mv_faculty_trends
      ON mv_faculty_trends (faculty_id, department_code_snapshot);`);
    this.addSql(`CREATE INDEX idx_mv_ft_dept
      ON mv_faculty_trends (department_code_snapshot);`);

    // Invalidate stale freshness timestamp so /analytics reports null until
    // the next scheduled refresh repopulates it.
    this.addSql(`DELETE FROM system_config WHERE key = 'analytics_last_refreshed_at';`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP MATERIALIZED VIEW IF EXISTS mv_faculty_trends;`);
    this.addSql(`DROP MATERIALIZED VIEW IF EXISTS mv_faculty_semester_stats;`);

    this.addSql(this.MV_FACULTY_SEMESTER_STATS_PRE_FAC130);
    this.addSql(`CREATE UNIQUE INDEX uq_mv_faculty_semester_stats
      ON mv_faculty_semester_stats (faculty_id, semester_id, department_code_snapshot);`);
    this.addSql(`CREATE INDEX idx_mv_fss_dept_semester
      ON mv_faculty_semester_stats (department_code_snapshot, semester_id);`);

    this.addSql(this.MV_FACULTY_TRENDS);
    this.addSql(`CREATE UNIQUE INDEX uq_mv_faculty_trends
      ON mv_faculty_trends (faculty_id, department_code_snapshot);`);
    this.addSql(`CREATE INDEX idx_mv_ft_dept
      ON mv_faculty_trends (department_code_snapshot);`);

    this.addSql(`DELETE FROM system_config WHERE key = 'analytics_last_refreshed_at';`);
  }
}
