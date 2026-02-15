import { Migration } from '@mikro-orm/migrations';

export class Migration20260215004404 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "enrollment" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "user_id" varchar(255) not null, "course_id" varchar(255) not null, "role" varchar(255) not null, "is_active" boolean not null default true, "time_modified" timestamptz not null, constraint "enrollment_pkey" primary key ("id"));`);
    this.addSql(`create index "enrollment_user_id_index" on "enrollment" ("user_id");`);
    this.addSql(`create index "enrollment_course_id_index" on "enrollment" ("course_id");`);
    this.addSql(`alter table "enrollment" add constraint "enrollment_user_id_course_id_unique" unique ("user_id", "course_id");`);

    this.addSql(`alter table "enrollment" add constraint "enrollment_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`);
    this.addSql(`alter table "enrollment" add constraint "enrollment_course_id_foreign" foreign key ("course_id") references "course" ("id") on update cascade;`);

    this.addSql(`alter table "course" add column "is_active" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "enrollment" cascade;`);

    this.addSql(`alter table "course" drop column "is_active";`);
  }

}
