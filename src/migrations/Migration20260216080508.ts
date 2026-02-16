import { Migration } from '@mikro-orm/migrations';

export class Migration20260216080508 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "dimension" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "code" varchar(255) not null, "display_name" varchar(255) not null, "questionnaire_type" text check ("questionnaire_type" in ('FACULTY_IN_CLASSROOM', 'FACULTY_OUT_OF_CLASSROOM', 'FACULTY_FEEDBACK')) not null, "active" boolean not null default true, constraint "dimension_pkey" primary key ("id"));`);
    this.addSql(`create index "dimension_code_index" on "dimension" ("code");`);
    this.addSql(`alter table "dimension" add constraint "dimension_code_unique" unique ("code");`);

    this.addSql(`create table "questionnaire" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "title" varchar(255) not null, "status" text check ("status" in ('DRAFT', 'PUBLISHED', 'ARCHIVED')) not null default 'DRAFT', "type" text check ("type" in ('FACULTY_IN_CLASSROOM', 'FACULTY_OUT_OF_CLASSROOM', 'FACULTY_FEEDBACK')) not null, constraint "questionnaire_pkey" primary key ("id"));`);

    this.addSql(`create table "questionnaire_version" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "questionnaire_id" varchar(255) not null, "version_number" int not null, "schema_snapshot" jsonb not null, "published_at" timestamptz null, "is_active" boolean not null default false, constraint "questionnaire_version_pkey" primary key ("id"));`);
    this.addSql(`alter table "questionnaire_version" add constraint "questionnaire_version_questionnaire_id_version_number_unique" unique ("questionnaire_id", "version_number");`);

    this.addSql(`create table "questionnaire_submission" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "questionnaire_version_id" varchar(255) not null, "respondent_id" varchar(255) not null, "faculty_id" varchar(255) not null, "respondent_role" text check ("respondent_role" in ('STUDENT', 'DEAN')) not null, "semester_id" varchar(255) not null, "course_id" varchar(255) null, "department_id" varchar(255) not null, "program_id" varchar(255) not null, "campus_id" varchar(255) not null, "total_score" numeric(10,2) not null, "normalized_score" numeric(10,2) not null, "qualitative_comment" text null, "submitted_at" timestamptz not null default now(), "faculty_name_snapshot" varchar(255) not null, "faculty_employee_number_snapshot" varchar(255) null, "department_code_snapshot" varchar(255) not null, "department_name_snapshot" varchar(255) not null, "program_code_snapshot" varchar(255) not null, "program_name_snapshot" varchar(255) not null, "campus_code_snapshot" varchar(255) not null, "campus_name_snapshot" varchar(255) not null, "course_code_snapshot" varchar(255) null, "course_title_snapshot" varchar(255) null, "semester_code_snapshot" varchar(255) not null, "semester_label_snapshot" varchar(255) not null, "academic_year_snapshot" varchar(255) not null, constraint "questionnaire_submission_pkey" primary key ("id"));`);
    this.addSql(`create index "questionnaire_submission_questionnaire_version_id_index" on "questionnaire_submission" ("questionnaire_version_id");`);
    this.addSql(`create index "questionnaire_submission_campus_id_semester_id_index" on "questionnaire_submission" ("campus_id", "semester_id");`);
    this.addSql(`create index "questionnaire_submission_program_id_semester_id_index" on "questionnaire_submission" ("program_id", "semester_id");`);
    this.addSql(`create index "questionnaire_submission_department_id_semester_id_index" on "questionnaire_submission" ("department_id", "semester_id");`);
    this.addSql(`create index "questionnaire_submission_faculty_id_semester_id_index" on "questionnaire_submission" ("faculty_id", "semester_id");`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_respondent_id_faculty_id_46f83_unique" unique ("respondent_id", "faculty_id", "questionnaire_version_id", "semester_id", "course_id");`);

    this.addSql(`create table "questionnaire_answer" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "submission_id" varchar(255) not null, "question_id" varchar(255) not null, "section_id" varchar(255) not null, "dimension_code" varchar(255) not null, "numeric_value" numeric(10,2) not null, constraint "questionnaire_answer_pkey" primary key ("id"));`);

    this.addSql(`alter table "questionnaire_version" add constraint "questionnaire_version_questionnaire_id_foreign" foreign key ("questionnaire_id") references "questionnaire" ("id") on update cascade;`);

    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_questionnaire_version_id_foreign" foreign key ("questionnaire_version_id") references "questionnaire_version" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_respondent_id_foreign" foreign key ("respondent_id") references "user" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_faculty_id_foreign" foreign key ("faculty_id") references "user" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_semester_id_foreign" foreign key ("semester_id") references "semester" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_course_id_foreign" foreign key ("course_id") references "course" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_department_id_foreign" foreign key ("department_id") references "department" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_program_id_foreign" foreign key ("program_id") references "program" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_submission" add constraint "questionnaire_submission_campus_id_foreign" foreign key ("campus_id") references "campus" ("id") on update cascade;`);

    this.addSql(`alter table "questionnaire_answer" add constraint "questionnaire_answer_submission_id_foreign" foreign key ("submission_id") references "questionnaire_submission" ("id") on update cascade;`);

    this.addSql(`alter table "semester" add column "label" varchar(255) null, add column "academic_year" varchar(255) null;`);

    this.addSql(`alter table "user" add column "department_id" varchar(255) null, add column "program_id" varchar(255) null;`);
    this.addSql(`alter table "user" add constraint "user_department_id_foreign" foreign key ("department_id") references "department" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "user" add constraint "user_program_id_foreign" foreign key ("program_id") references "program" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "questionnaire_version" drop constraint "questionnaire_version_questionnaire_id_foreign";`);

    this.addSql(`alter table "questionnaire_submission" drop constraint "questionnaire_submission_questionnaire_version_id_foreign";`);

    this.addSql(`alter table "questionnaire_answer" drop constraint "questionnaire_answer_submission_id_foreign";`);

    this.addSql(`drop table if exists "dimension" cascade;`);

    this.addSql(`drop table if exists "questionnaire" cascade;`);

    this.addSql(`drop table if exists "questionnaire_version" cascade;`);

    this.addSql(`drop table if exists "questionnaire_submission" cascade;`);

    this.addSql(`drop table if exists "questionnaire_answer" cascade;`);

    this.addSql(`alter table "user" drop constraint "user_department_id_foreign";`);
    this.addSql(`alter table "user" drop constraint "user_program_id_foreign";`);

    this.addSql(`alter table "semester" drop column "label", drop column "academic_year";`);

    this.addSql(`alter table "user" drop column "department_id", drop column "program_id";`);
  }

}
