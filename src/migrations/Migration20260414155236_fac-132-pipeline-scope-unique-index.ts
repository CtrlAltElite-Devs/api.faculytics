import { Migration } from '@mikro-orm/migrations';

export class Migration20260414155236 extends Migration {
  // FAC-132: partial unique index enforcing one canonical pipeline per
  // (semester, scope) tuple while any non-terminal pipeline exists.
  //
  // Why a partial index (not @Unique decorator or plain unique constraint):
  // - `analysis_pipeline` scope FKs (faculty_id, department_id, ...) are
  //   nullable. Postgres treats NULL as distinct in unique constraints, so a
  //   plain constraint would permit unlimited duplicate (semester, NULL,
  //   NULL, ...) active pipelines. COALESCE-to-sentinel fixes this.
  // - Soft-deleted rows and terminal-state pipelines (COMPLETED/FAILED/
  //   CANCELLED) must NOT participate — a new active pipeline for a scope
  //   should always be insertable once the previous one settles.
  //
  // FK columns are varchar(255) (see Migration20260313170918) — the text
  // literal 'NONE' is the sentinel. Do NOT cast to uuid; the columns are
  // text-typed.

  private readonly INDEX_NAME = 'uq_analysis_pipeline_active_scope';

  override async up(): Promise<void> {
    this.addSql(`
      CREATE UNIQUE INDEX "${this.INDEX_NAME}"
        ON "analysis_pipeline" (
          "semester_id",
          COALESCE("faculty_id", 'NONE'),
          COALESCE("department_id", 'NONE'),
          COALESCE("program_id", 'NONE'),
          COALESCE("campus_id", 'NONE'),
          COALESCE("course_id", 'NONE'),
          COALESCE("questionnaire_version_id", 'NONE')
        )
        WHERE "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')
          AND "deleted_at" IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "${this.INDEX_NAME}";`);
  }
}
