import { Migration } from '@mikro-orm/migrations';

export class Migration20260425120100 extends Migration {
  // Rebuilds mv_faculty_trends so the per-faculty semester ordinal is driven
  // by semester.start_date (academic chronology) rather than semester.created_at
  // (DB insertion order). Without this change, backfilling a past semester AFTER
  // the current semester silently flips every faculty's trend slope — an
  // improving faculty reads as declining and vice versa.
  //
  // mv_faculty_semester_stats is untouched (it doesn't use semester ordering).

  private readonly MV_FACULTY_TRENDS_BY_START_DATE = `
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
          ORDER BY s.start_date
        ) AS ordinal
      FROM mv_faculty_semester_stats fss
      JOIN semester s ON s.id = fss.semester_id AND s.deleted_at IS NULL
    ) sub
    GROUP BY sub.faculty_id, sub.department_code_snapshot;
  `;

  // Pre-FAC-startdate body — restores ordering by semester.created_at so down()
  // returns to the FAC-130 semantics.
  private readonly MV_FACULTY_TRENDS_BY_CREATED_AT = `
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

  override async up(): Promise<void> {
    this.addSql(`DROP MATERIALIZED VIEW IF EXISTS mv_faculty_trends;`);

    this.addSql(this.MV_FACULTY_TRENDS_BY_START_DATE);
    this.addSql(`CREATE UNIQUE INDEX uq_mv_faculty_trends
      ON mv_faculty_trends (faculty_id, department_code_snapshot);`);
    this.addSql(`CREATE INDEX idx_mv_ft_dept
      ON mv_faculty_trends (department_code_snapshot);`);

    // Invalidate stale freshness timestamp so /analytics reports null until
    // the next scheduled refresh repopulates it.
    this.addSql(
      `DELETE FROM system_config WHERE key = 'analytics_last_refreshed_at';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`DROP MATERIALIZED VIEW IF EXISTS mv_faculty_trends;`);

    this.addSql(this.MV_FACULTY_TRENDS_BY_CREATED_AT);
    this.addSql(`CREATE UNIQUE INDEX uq_mv_faculty_trends
      ON mv_faculty_trends (faculty_id, department_code_snapshot);`);
    this.addSql(`CREATE INDEX idx_mv_ft_dept
      ON mv_faculty_trends (department_code_snapshot);`);

    this.addSql(
      `DELETE FROM system_config WHERE key = 'analytics_last_refreshed_at';`,
    );
  }
}
