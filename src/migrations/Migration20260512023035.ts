import { Migration } from '@mikro-orm/migrations';

export class Migration20260512023035 extends Migration {

  // This migration does two things:
  //
  // 1. Creates the `error_log` table for the new admin diagnostics page that
  //    persists unhandled 5xx exceptions for inspection.
  //
  // 2. Adds the `analysis_pipeline_trigger_check` CHECK constraint declared by
  //    `@Enum(() => PipelineTrigger)` on the entity but missing from the DB.
  //    Verified safe on staging: all existing rows have `trigger = 'USER'` and
  //    no constraint of that name exists yet, so the ADD succeeds without
  //    scanning past row values.
  //
  // The CLI also wanted to drop `uq_analysis_pipeline_active_scope` here —
  // that's the FAC-132 partial unique index, intentionally created via raw SQL
  // because MikroORM decorators can't represent it. It is INTENTIONALLY NOT
  // included; dropping it reintroduces the bug FAC-132 fixed. See
  // `src/entities/CLAUDE.md` for the recurring-drift trap.

  override async up(): Promise<void> {
    this.addSql(`create table "error_log" ("id" varchar(255) not null, "status_code" int not null, "method" varchar(255) not null, "path" varchar(255) not null, "user_id" varchar(255) null, "user_name" varchar(255) null, "error_name" varchar(255) not null, "message" text not null, "stack" text null, "request_body" jsonb null, "request_query" jsonb null, "browser_name" varchar(255) null, "os" varchar(255) null, "ip_address" varchar(255) null, "acknowledged_at" timestamptz null, "acknowledged_by" varchar(255) null, "occurred_at" timestamptz(6) not null default now(), constraint "error_log_pkey" primary key ("id"));`);
    this.addSql(`create index "error_log_status_code_index" on "error_log" ("status_code");`);
    this.addSql(`create index "error_log_path_index" on "error_log" ("path");`);
    this.addSql(`create index "error_log_user_id_index" on "error_log" ("user_id");`);
    this.addSql(`create index "error_log_error_name_index" on "error_log" ("error_name");`);
    this.addSql(`create index "error_log_acknowledged_at_index" on "error_log" ("acknowledged_at");`);
    this.addSql(`create index "error_log_occurred_at_index" on "error_log" ("occurred_at");`);

    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_trigger_check" check("trigger" in ('USER', 'SCHEDULER'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "analysis_pipeline" drop constraint if exists "analysis_pipeline_trigger_check";`);
    this.addSql(`drop table if exists "error_log" cascade;`);
  }

}
