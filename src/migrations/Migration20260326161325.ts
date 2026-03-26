import { Migration } from '@mikro-orm/migrations';

export class Migration20260326161325 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "questionnaire" drop constraint if exists "questionnaire_status_check";`,
    );
    this.addSql(
      `alter table "questionnaire" add constraint "questionnaire_status_check" check("status" in ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "questionnaire" drop constraint if exists "questionnaire_status_check";`,
    );
    this.addSql(
      `update "questionnaire" set "status" = 'DEPRECATED' where "status" = 'ARCHIVED';`,
    );
    this.addSql(
      `alter table "questionnaire" add constraint "questionnaire_status_check" check("status" in ('DRAFT', 'ACTIVE', 'DEPRECATED'));`,
    );
  }
}
