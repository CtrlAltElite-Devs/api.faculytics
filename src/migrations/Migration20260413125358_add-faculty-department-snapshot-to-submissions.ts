import { Migration } from '@mikro-orm/migrations';

export class Migration20260413125358 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "questionnaire_submission" add column "faculty_department_id" varchar(255) null, add column "faculty_department_code_snapshot" varchar(255) null, add column "faculty_department_name_snapshot" varchar(255) null;`,
    );
    this.addSql(
      `alter table "questionnaire_submission" add constraint "questionnaire_submission_faculty_department_id_foreign" foreign key ("faculty_department_id") references "department" ("id") on update cascade on delete set null;`,
    );
    this.addSql(
      `create index "questionnaire_submission_faculty_department_id_sem_4a4b6_index" on "questionnaire_submission" ("faculty_department_id", "semester_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "questionnaire_submission" drop constraint "questionnaire_submission_faculty_department_id_foreign";`,
    );

    this.addSql(
      `drop index "questionnaire_submission_faculty_department_id_sem_4a4b6_index";`,
    );
    this.addSql(
      `alter table "questionnaire_submission" drop column "faculty_department_id", drop column "faculty_department_code_snapshot", drop column "faculty_department_name_snapshot";`,
    );
  }
}
