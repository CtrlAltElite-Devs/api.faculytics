import { Migration } from '@mikro-orm/migrations';

export class Migration20260216063123 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user" drop constraint "user_department_id_foreign";`);
    this.addSql(`alter table "user" drop constraint "user_program_id_foreign";`);

    this.addSql(`alter table "user" drop column "department_id", drop column "program_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" add column "department_id" varchar(255) null, add column "program_id" varchar(255) null;`);
    this.addSql(`alter table "user" add constraint "user_department_id_foreign" foreign key ("department_id") references "department" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "user" add constraint "user_program_id_foreign" foreign key ("program_id") references "program" ("id") on update cascade on delete set null;`);
  }

}
