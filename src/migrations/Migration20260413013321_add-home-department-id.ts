import { Migration } from '@mikro-orm/migrations';

export class Migration20260413013321 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "user" add column "home_department_id" varchar(255) null;`,
    );
    this.addSql(
      `alter table "user" add constraint "user_home_department_id_foreign" foreign key ("home_department_id") references "department" ("id") on update cascade on delete set null;`,
    );
    this.addSql(
      `create index "user_home_department_id_index" on "user" ("home_department_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "user_home_department_id_index";`);
    this.addSql(`alter table "user" drop constraint "user_home_department_id_foreign";`);
    this.addSql(`alter table "user" drop column "home_department_id";`);
  }
}
