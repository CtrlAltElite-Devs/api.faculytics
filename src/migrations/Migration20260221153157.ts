import { Migration } from '@mikro-orm/migrations';

export class Migration20260221153157 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "questionnaire_draft" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "respondent_id" varchar(255) not null, "questionnaire_version_id" varchar(255) not null, "faculty_id" varchar(255) not null, "semester_id" varchar(255) not null, "course_id" varchar(255) null, "answers" jsonb not null, "qualitative_comment" text null, constraint "questionnaire_draft_pkey" primary key ("id"));`);
    this.addSql(`create index "questionnaire_draft_unique_active_without_course" on "questionnaire_draft" ("respondent_id", "questionnaire_version_id", "faculty_id", "semester_id");`);
    this.addSql(`create index "questionnaire_draft_unique_active_with_course" on "questionnaire_draft" ("respondent_id", "questionnaire_version_id", "faculty_id", "semester_id", "course_id");`);
    this.addSql(`create index "questionnaire_draft_respondent_id_updated_at_index" on "questionnaire_draft" ("respondent_id", "updated_at");`);

    this.addSql(`alter table "questionnaire_draft" add constraint "questionnaire_draft_respondent_id_foreign" foreign key ("respondent_id") references "user" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_draft" add constraint "questionnaire_draft_questionnaire_version_id_foreign" foreign key ("questionnaire_version_id") references "questionnaire_version" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_draft" add constraint "questionnaire_draft_faculty_id_foreign" foreign key ("faculty_id") references "user" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_draft" add constraint "questionnaire_draft_semester_id_foreign" foreign key ("semester_id") references "semester" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire_draft" add constraint "questionnaire_draft_course_id_foreign" foreign key ("course_id") references "course" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "questionnaire_draft" cascade;`);
  }

}
