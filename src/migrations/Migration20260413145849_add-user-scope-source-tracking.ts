import { Migration } from '@mikro-orm/migrations';

export class Migration20260413145849 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop index "user_home_department_id_index";`);
    this.addSql(
      `alter table "user" drop constraint "user_home_department_id_foreign";`,
    );
    this.addSql(`alter table "user" drop column "home_department_id";`);

    this.addSql(
      `alter table "user" add column "department_source" varchar(255) not null default 'auto';`,
    );
    this.addSql(
      `alter table "user" add column "program_source" varchar(255) not null default 'auto';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column "program_source";`);
    this.addSql(`alter table "user" drop column "department_source";`);

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
}
