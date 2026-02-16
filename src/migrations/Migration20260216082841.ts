import { Migration } from '@mikro-orm/migrations';

export class Migration20260216082841 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "dimension" drop constraint "dimension_code_unique";`);

    this.addSql(`alter table "dimension" add constraint "dimension_code_questionnaire_type_unique" unique ("code", "questionnaire_type");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "dimension" drop constraint "dimension_code_questionnaire_type_unique";`);

    this.addSql(`alter table "dimension" add constraint "dimension_code_unique" unique ("code");`);
  }

}
