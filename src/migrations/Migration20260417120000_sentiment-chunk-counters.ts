import { Migration } from '@mikro-orm/migrations';

export class Migration20260417120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "sentiment_run" add column "expected_chunks" int not null default 0;`,
    );
    this.addSql(
      `alter table "sentiment_run" add column "completed_chunks" int not null default 0;`,
    );

    const rows = await this.execute(
      `select count(*)::int as n from (
         select run_id, submission_id
         from sentiment_result
         group by run_id, submission_id
         having count(*) > 1
       ) t`,
    );
    const dupeCount = Number((rows[0] as { n: number } | undefined)?.n ?? 0);
    if (dupeCount > 0) {
      throw new Error(
        `Cannot convert sentiment_result unique index to full: ${dupeCount} duplicate (run_id, submission_id) pairs exist (live + soft-deleted combined). Investigate before re-running.`,
      );
    }

    this.addSql(
      `drop index if exists "sentiment_result_run_id_submission_id_unique";`,
    );
    this.addSql(
      `create unique index "sentiment_result_run_id_submission_id_unique" on "sentiment_result" ("run_id", "submission_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "sentiment_result_run_id_submission_id_unique";`,
    );
    this.addSql(
      `create unique index "sentiment_result_run_id_submission_id_unique" on "sentiment_result" ("run_id", "submission_id") where deleted_at is null;`,
    );
    this.addSql(
      `alter table "sentiment_run" drop column "completed_chunks";`,
    );
    this.addSql(
      `alter table "sentiment_run" drop column "expected_chunks";`,
    );
  }
}
