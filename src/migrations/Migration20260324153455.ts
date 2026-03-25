import { Migration } from '@mikro-orm/migrations';

export class Migration20260324153455 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "section" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "moodle_group_id" int not null, "name" varchar(255) not null, "description" varchar(255) null, "course_id" varchar(255) not null, constraint "section_pkey" primary key ("id"));`);
    this.addSql(`create index "section_moodle_group_id_index" on "section" ("moodle_group_id");`);
    this.addSql(`alter table "section" add constraint "section_moodle_group_id_unique" unique ("moodle_group_id");`);
    this.addSql(`create index "section_course_id_index" on "section" ("course_id");`);

    this.addSql(`alter table "section" add constraint "section_course_id_foreign" foreign key ("course_id") references "course" ("id") on update cascade;`);

    this.addSql(`alter table "enrollment" add column "section_id" varchar(255) null;`);
    this.addSql(`alter table "enrollment" add constraint "enrollment_section_id_foreign" foreign key ("section_id") references "section" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "enrollment_section_id_index" on "enrollment" ("section_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "enrollment" drop constraint "enrollment_section_id_foreign";`);

    this.addSql(`drop index "enrollment_section_id_index";`);
    this.addSql(`alter table "enrollment" drop column "section_id";`);

    this.addSql(`drop table if exists "section" cascade;`);
  }

}
