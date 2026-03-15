import { Migration } from '@mikro-orm/migrations';

export class Migration20260316120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "questionnaire_submission" add column "cleaned_comment" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "questionnaire_submission" drop column "cleaned_comment";`);
  }

}
