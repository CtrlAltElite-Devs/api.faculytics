import { Migration } from '@mikro-orm/migrations';

export class Migration20260313170918 extends Migration {

  override async up(): Promise<void> {
    // pgvector extension — must be pre-enabled on Neon.tech dashboard before running this migration
    this.addSql(`create extension if not exists vector;`);

    this.addSql(`create table "submission_embedding" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "submission_id" varchar(255) not null, "embedding" vector(768) not null, "model_name" varchar(255) not null, constraint "submission_embedding_pkey" primary key ("id"));`);
    this.addSql(`create index "submission_embedding_submission_id_index" on "submission_embedding" ("submission_id");`);
    this.addSql(`create unique index "submission_embedding_submission_id_unique" on "submission_embedding" ("submission_id") where "deleted_at" is null;`);

    this.addSql(`create table "analysis_pipeline" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "semester_id" varchar(255) not null, "faculty_id" varchar(255) null, "questionnaire_version_id" varchar(255) null, "department_id" varchar(255) null, "program_id" varchar(255) null, "campus_id" varchar(255) null, "course_id" varchar(255) null, "triggered_by_id" varchar(255) not null, "total_enrolled" int not null, "submission_count" int not null, "comment_count" int not null, "response_rate" numeric(10,4) not null, "warnings" text[] not null, "sentiment_gate_included" int null, "sentiment_gate_excluded" int null, "status" text check ("status" in ('AWAITING_CONFIRMATION', 'EMBEDDING_CHECK', 'SENTIMENT_ANALYSIS', 'SENTIMENT_GATE', 'TOPIC_MODELING', 'GENERATING_RECOMMENDATIONS', 'COMPLETED', 'FAILED', 'CANCELLED')) not null default 'AWAITING_CONFIRMATION', "error_message" text null, "confirmed_at" timestamptz null, "completed_at" timestamptz null, constraint "analysis_pipeline_pkey" primary key ("id"));`);
    this.addSql(`create index "analysis_pipeline_semester_id_status_index" on "analysis_pipeline" ("semester_id", "status");`);

    this.addSql(`create table "topic_model_run" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "pipeline_id" varchar(255) not null, "submission_count" int not null, "topic_count" int not null default 0, "outlier_count" int not null default 0, "model_params" jsonb null, "metrics" jsonb null, "worker_version" varchar(255) null, "job_id" varchar(255) null, "status" text check ("status" in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')) not null default 'PENDING', "completed_at" timestamptz null, constraint "topic_model_run_pkey" primary key ("id"));`);
    this.addSql(`create index "topic_model_run_pipeline_id_index" on "topic_model_run" ("pipeline_id");`);

    this.addSql(`create table "topic" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "run_id" varchar(255) not null, "topic_index" int not null, "raw_label" varchar(255) not null, "label" varchar(255) null, "keywords" text[] not null, "doc_count" int not null, constraint "topic_pkey" primary key ("id"));`);
    this.addSql(`create index "topic_run_id_index" on "topic" ("run_id");`);

    this.addSql(`create table "topic_assignment" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "topic_id" varchar(255) not null, "submission_id" varchar(255) not null, "probability" numeric(10,4) not null, "is_dominant" boolean not null, constraint "topic_assignment_pkey" primary key ("id"));`);
    this.addSql(`create index "topic_assignment_topic_id_index" on "topic_assignment" ("topic_id");`);
    this.addSql(`create index "topic_assignment_submission_id_index" on "topic_assignment" ("submission_id");`);
    this.addSql(`create unique index "topic_assignment_topic_id_submission_id_unique" on "topic_assignment" ("topic_id", "submission_id") where "deleted_at" is null;`);

    this.addSql(`create table "sentiment_run" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "pipeline_id" varchar(255) not null, "submission_count" int not null, "worker_version" varchar(255) null, "job_id" varchar(255) null, "status" text check ("status" in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')) not null default 'PENDING', "completed_at" timestamptz null, constraint "sentiment_run_pkey" primary key ("id"));`);
    this.addSql(`create index "sentiment_run_pipeline_id_index" on "sentiment_run" ("pipeline_id");`);

    this.addSql(`create table "sentiment_result" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "run_id" varchar(255) not null, "submission_id" varchar(255) not null, "positive_score" numeric(10,4) not null, "neutral_score" numeric(10,4) not null, "negative_score" numeric(10,4) not null, "label" varchar(255) not null, "raw_result" jsonb not null, "passed_topic_gate" boolean not null default false, "processed_at" timestamptz not null, constraint "sentiment_result_pkey" primary key ("id"));`);
    this.addSql(`create index "sentiment_result_submission_id_index" on "sentiment_result" ("submission_id");`);
    this.addSql(`create index "sentiment_result_run_id_index" on "sentiment_result" ("run_id");`);
    this.addSql(`create unique index "sentiment_result_run_id_submission_id_unique" on "sentiment_result" ("run_id", "submission_id") where "deleted_at" is null;`);

    this.addSql(`create table "recommendation_run" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "pipeline_id" varchar(255) not null, "submission_count" int not null, "sentiment_coverage" int not null default 0, "topic_coverage" int not null default 0, "worker_version" varchar(255) null, "job_id" varchar(255) null, "status" text check ("status" in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')) not null default 'PENDING', "completed_at" timestamptz null, constraint "recommendation_run_pkey" primary key ("id"));`);
    this.addSql(`create index "recommendation_run_pipeline_id_index" on "recommendation_run" ("pipeline_id");`);

    this.addSql(`create table "recommended_action" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "run_id" varchar(255) not null, "category" varchar(255) not null, "action_text" text not null, "priority" text check ("priority" in ('HIGH', 'MEDIUM', 'LOW')) not null, "supporting_evidence" jsonb not null, constraint "recommended_action_pkey" primary key ("id"));`);
    this.addSql(`create index "recommended_action_run_id_index" on "recommended_action" ("run_id");`);

    this.addSql(`alter table "submission_embedding" add constraint "submission_embedding_submission_id_foreign" foreign key ("submission_id") references "questionnaire_submission" ("id") on update cascade;`);

    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_semester_id_foreign" foreign key ("semester_id") references "semester" ("id") on update cascade;`);
    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_faculty_id_foreign" foreign key ("faculty_id") references "user" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_questionnaire_version_id_foreign" foreign key ("questionnaire_version_id") references "questionnaire_version" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_department_id_foreign" foreign key ("department_id") references "department" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_program_id_foreign" foreign key ("program_id") references "program" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_campus_id_foreign" foreign key ("campus_id") references "campus" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_course_id_foreign" foreign key ("course_id") references "course" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "analysis_pipeline" add constraint "analysis_pipeline_triggered_by_id_foreign" foreign key ("triggered_by_id") references "user" ("id") on update cascade;`);

    this.addSql(`alter table "topic_model_run" add constraint "topic_model_run_pipeline_id_foreign" foreign key ("pipeline_id") references "analysis_pipeline" ("id") on update cascade;`);

    this.addSql(`alter table "topic" add constraint "topic_run_id_foreign" foreign key ("run_id") references "topic_model_run" ("id") on update cascade;`);

    this.addSql(`alter table "topic_assignment" add constraint "topic_assignment_topic_id_foreign" foreign key ("topic_id") references "topic" ("id") on update cascade;`);
    this.addSql(`alter table "topic_assignment" add constraint "topic_assignment_submission_id_foreign" foreign key ("submission_id") references "questionnaire_submission" ("id") on update cascade;`);

    this.addSql(`alter table "sentiment_run" add constraint "sentiment_run_pipeline_id_foreign" foreign key ("pipeline_id") references "analysis_pipeline" ("id") on update cascade;`);

    this.addSql(`alter table "sentiment_result" add constraint "sentiment_result_run_id_foreign" foreign key ("run_id") references "sentiment_run" ("id") on update cascade;`);
    this.addSql(`alter table "sentiment_result" add constraint "sentiment_result_submission_id_foreign" foreign key ("submission_id") references "questionnaire_submission" ("id") on update cascade;`);

    this.addSql(`alter table "recommendation_run" add constraint "recommendation_run_pipeline_id_foreign" foreign key ("pipeline_id") references "analysis_pipeline" ("id") on update cascade;`);

    this.addSql(`alter table "recommended_action" add constraint "recommended_action_run_id_foreign" foreign key ("run_id") references "recommendation_run" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "topic_model_run" drop constraint "topic_model_run_pipeline_id_foreign";`);

    this.addSql(`alter table "sentiment_run" drop constraint "sentiment_run_pipeline_id_foreign";`);

    this.addSql(`alter table "recommendation_run" drop constraint "recommendation_run_pipeline_id_foreign";`);

    this.addSql(`alter table "topic" drop constraint "topic_run_id_foreign";`);

    this.addSql(`alter table "topic_assignment" drop constraint "topic_assignment_topic_id_foreign";`);

    this.addSql(`alter table "sentiment_result" drop constraint "sentiment_result_run_id_foreign";`);

    this.addSql(`alter table "recommended_action" drop constraint "recommended_action_run_id_foreign";`);

    this.addSql(`drop table if exists "submission_embedding" cascade;`);

    this.addSql(`drop table if exists "analysis_pipeline" cascade;`);

    this.addSql(`drop table if exists "topic_model_run" cascade;`);

    this.addSql(`drop table if exists "topic" cascade;`);

    this.addSql(`drop table if exists "topic_assignment" cascade;`);

    this.addSql(`drop table if exists "sentiment_run" cascade;`);

    this.addSql(`drop table if exists "sentiment_result" cascade;`);

    this.addSql(`drop table if exists "recommendation_run" cascade;`);

    this.addSql(`drop table if exists "recommended_action" cascade;`);

    // WARNING: Only drop if no other tables use vector columns. On shared Neon.tech DBs, this may affect other schemas.
    this.addSql(`drop extension if exists vector;`);
  }

}
