import { Migration } from '@mikro-orm/migrations';

/**
 * FAC-135: adds `facet` column to `recommended_action` so recommendations can
 * be grouped into the aggregate-scope rework's four facets
 * (overall | facultyFeedback | inClassroom | outOfClassroom).
 *
 * Strategy:
 *  1. Add nullable column.
 *  2. Backfill by JOINing each action's parent pipeline's
 *     questionnaire_version -> questionnaire -> questionnaire_type.code.
 *     `AnalysisPipeline.questionnaire_type_code` was never persisted as a
 *     column (it only ever existed in the DTO surface), so we derive facet
 *     via the version linkage. Pipelines that had no version pinned
 *     (rare; mostly historical aggregate-flavoured rows) fall back to
 *     `overall`.
 *  3. Set default 'overall' and apply NOT NULL. The default catches any
 *     row the backfill missed and any future writes that don't set facet.
 */
export class Migration20260415120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "recommended_action" ADD COLUMN "facet" VARCHAR(32) NULL;`,
    );

    // Backfill via join chain. Primary codes map to their facets; everything
    // else (and NULLs through outer join) becomes 'overall'.
    this.addSql(`
      UPDATE "recommended_action" ra
         SET "facet" = CASE qt.code
           WHEN 'FACULTY_FEEDBACK' THEN 'facultyFeedback'
           WHEN 'FACULTY_IN_CLASSROOM' THEN 'inClassroom'
           WHEN 'FACULTY_OUT_OF_CLASSROOM' THEN 'outOfClassroom'
           ELSE 'overall'
         END
        FROM "recommendation_run" rr
        JOIN "analysis_pipeline" ap ON ap.id = rr.pipeline_id
   LEFT JOIN "questionnaire_version" qv ON qv.id = ap.questionnaire_version_id
   LEFT JOIN "questionnaire" q ON q.id = qv.questionnaire_id
   LEFT JOIN "questionnaire_type" qt ON qt.id = q.type_id
       WHERE rr.id = ra.run_id;
    `);

    // Safety net for any action not reached by the UPDATE above.
    this.addSql(
      `UPDATE "recommended_action" SET "facet" = 'overall' WHERE "facet" IS NULL;`,
    );

    this.addSql(
      `ALTER TABLE "recommended_action" ALTER COLUMN "facet" SET DEFAULT 'overall';`,
    );
    this.addSql(
      `ALTER TABLE "recommended_action" ALTER COLUMN "facet" SET NOT NULL;`,
    );
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "recommended_action" DROP COLUMN "facet";`);
  }
}
