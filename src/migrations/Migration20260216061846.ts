import { Migration } from '@mikro-orm/migrations';

export class Migration20260216061846 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user" add column "campus_id" varchar(255) null, add column "department_id" varchar(255) null, add column "program_id" varchar(255) null;`);
    this.addSql(`alter table "user" add constraint "user_campus_id_foreign" foreign key ("campus_id") references "campus" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "user" add constraint "user_department_id_foreign" foreign key ("department_id") references "department" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "user" add constraint "user_program_id_foreign" foreign key ("program_id") references "program" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop constraint "user_campus_id_foreign";`);
    this.addSql(`alter table "user" drop constraint "user_department_id_foreign";`);
    this.addSql(`alter table "user" drop constraint "user_program_id_foreign";`);

    this.addSql(`alter table "user" drop column "campus_id", drop column "department_id", drop column "program_id";`);
  }

}
