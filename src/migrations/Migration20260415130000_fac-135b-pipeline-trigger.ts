import { Migration } from '@mikro-orm/migrations';

/**
 * FAC-135 Phase B: add `trigger` column to `analysis_pipeline` so we can
 * distinguish pipelines started manually (USER) from those auto-enqueued
 * by `TieredPipelineSchedulerJob` (SCHEDULER). Backfill defaults all
 * historical rows to USER — they predate the scheduler.
 */
export class Migration20260415130000 extends Migration {
  async up(): Promise<void> {
    // Stored as TEXT to match MikroORM's @Enum(() => PipelineTrigger)
    // serialization (see `status` column on the same table).
    this.addSql(
      `ALTER TABLE "analysis_pipeline" ADD COLUMN "trigger" TEXT NULL;`,
    );
    this.addSql(
      `UPDATE "analysis_pipeline" SET "trigger" = 'USER' WHERE "trigger" IS NULL;`,
    );
    this.addSql(
      `ALTER TABLE "analysis_pipeline" ALTER COLUMN "trigger" SET DEFAULT 'USER';`,
    );
    this.addSql(
      `ALTER TABLE "analysis_pipeline" ALTER COLUMN "trigger" SET NOT NULL;`,
    );
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "analysis_pipeline" DROP COLUMN "trigger";`);
  }
}
