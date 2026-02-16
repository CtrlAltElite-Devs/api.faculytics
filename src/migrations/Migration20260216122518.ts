import { Migration } from '@mikro-orm/migrations';

export class Migration20260216122518 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user_institutional_role" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "user_id" varchar(255) not null, "role" varchar(255) not null, "moodle_category_id" varchar(255) not null, constraint "user_institutional_role_pkey" primary key ("id"));`);
    this.addSql(`alter table "user_institutional_role" add constraint "user_institutional_role_user_id_moodle_category_id_role_unique" unique ("user_id", "moodle_category_id", "role");`);

    this.addSql(`alter table "user_institutional_role" add constraint "user_institutional_role_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`);
    this.addSql(`alter table "user_institutional_role" add constraint "user_institutional_role_moodle_category_id_foreign" foreign key ("moodle_category_id") references "moodle_category" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "user_institutional_role" cascade;`);
  }

}
