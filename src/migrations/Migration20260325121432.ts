import { Migration } from '@mikro-orm/migrations';

export class Migration20260325121432 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "sync_log" ("id" varchar(255) not null, "trigger" varchar(255) not null, "triggered_by_id" varchar(255) null, "status" varchar(255) not null default 'running', "started_at" timestamptz not null, "completed_at" timestamptz null, "duration_ms" int null, "categories" jsonb null, "courses" jsonb null, "enrollments" jsonb null, "error_message" text null, "job_id" varchar(255) null, "cron_expression" varchar(255) null, constraint "sync_log_pkey" primary key ("id"));`);
    this.addSql(`create index "sync_log_started_at_index" on "sync_log" ("started_at");`);

    this.addSql(`alter table "sync_log" add constraint "sync_log_triggered_by_id_foreign" foreign key ("triggered_by_id") references "user" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "sync_log" cascade;`);
  }

}
