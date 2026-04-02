import { Migration } from '@mikro-orm/migrations';

export class Migration20260401120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "report_job" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "report_type" varchar(255) not null, "status" varchar(255) not null default 'waiting', "requested_by_id" varchar(255) not null, "faculty_id" varchar(255) not null, "faculty_name" varchar(255) not null, "semester_id" varchar(255) not null, "questionnaire_type_code" varchar(255) not null, "batch_id" varchar(255) null, "storage_key" varchar(255) null, "error" text null, "completed_at" timestamptz null, constraint "report_job_pkey" primary key ("id"));`);

    this.addSql(`create index "report_job_status_index" on "report_job" ("status");`);
    this.addSql(`create index "report_job_requested_by_id_index" on "report_job" ("requested_by_id");`);
    this.addSql(`create index "report_job_batch_id_index" on "report_job" ("batch_id") where batch_id is not null;`);
    this.addSql(`create index "report_job_status_completed_at_index" on "report_job" ("status", "completed_at");`);

    this.addSql(`create unique index "uq_report_job_pending" on "report_job" ("faculty_id", "semester_id", "questionnaire_type_code", "report_type") where status in ('waiting', 'active') and deleted_at is null;`);

    this.addSql(`alter table "report_job" add constraint "report_job_requested_by_id_foreign" foreign key ("requested_by_id") references "user" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "report_job" cascade;`);
  }

}
