import { Migration } from '@mikro-orm/migrations';

export class Migration20260214171300 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "campus" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "moodle_category_id" int not null, "code" varchar(255) not null, "name" varchar(255) null, constraint "campus_pkey" primary key ("id"));`);
    this.addSql(`create index "campus_moodle_category_id_index" on "campus" ("moodle_category_id");`);
    this.addSql(`alter table "campus" add constraint "campus_moodle_category_id_unique" unique ("moodle_category_id");`);

    this.addSql(`create table "moodle_category" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "moodle_category_id" int not null, "name" varchar(255) not null, "description" varchar(255) null, "parent_moodle_category_id" int not null, "depth" int not null, "path" varchar(255) not null, "sort_order" int not null, "is_visible" boolean not null, "time_modified" timestamptz not null, constraint "moodle_category_pkey" primary key ("id"));`);
    this.addSql(`create index "moodle_category_moodle_category_id_index" on "moodle_category" ("moodle_category_id");`);
    this.addSql(`alter table "moodle_category" add constraint "moodle_category_moodle_category_id_unique" unique ("moodle_category_id");`);

    this.addSql(`create table "semester" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "moodle_category_id" int not null, "code" varchar(255) not null, "campus_id" varchar(255) not null, "description" varchar(255) null, constraint "semester_pkey" primary key ("id"));`);
    this.addSql(`create index "semester_moodle_category_id_index" on "semester" ("moodle_category_id");`);
    this.addSql(`alter table "semester" add constraint "semester_moodle_category_id_unique" unique ("moodle_category_id");`);

    this.addSql(`create table "department" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "moodle_category_id" int not null, "code" varchar(255) not null, "name" varchar(255) null, "semester_id" varchar(255) not null, constraint "department_pkey" primary key ("id"));`);
    this.addSql(`create index "department_moodle_category_id_index" on "department" ("moodle_category_id");`);
    this.addSql(`alter table "department" add constraint "department_moodle_category_id_unique" unique ("moodle_category_id");`);

    this.addSql(`create table "program" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "moodle_category_id" int not null, "code" varchar(255) not null, "name" varchar(255) null, "department_id" varchar(255) not null, constraint "program_pkey" primary key ("id"));`);
    this.addSql(`create index "program_moodle_category_id_index" on "program" ("moodle_category_id");`);
    this.addSql(`alter table "program" add constraint "program_moodle_category_id_unique" unique ("moodle_category_id");`);

    this.addSql(`create table "course" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "moodle_course_id" int not null, "shortname" varchar(255) not null, "fullname" varchar(255) not null, "program_id" varchar(255) not null, "start_date" timestamptz not null, "end_date" timestamptz not null, "is_visible" boolean not null, "time_modified" timestamptz not null, constraint "course_pkey" primary key ("id"));`);
    this.addSql(`create index "course_moodle_course_id_index" on "course" ("moodle_course_id");`);
    this.addSql(`alter table "course" add constraint "course_moodle_course_id_unique" unique ("moodle_course_id");`);

    this.addSql(`alter table "semester" add constraint "semester_campus_id_foreign" foreign key ("campus_id") references "campus" ("id") on update cascade;`);

    this.addSql(`alter table "department" add constraint "department_semester_id_foreign" foreign key ("semester_id") references "semester" ("id") on update cascade;`);

    this.addSql(`alter table "program" add constraint "program_department_id_foreign" foreign key ("department_id") references "department" ("id") on update cascade;`);

    this.addSql(`alter table "course" add constraint "course_program_id_foreign" foreign key ("program_id") references "program" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "semester" drop constraint "semester_campus_id_foreign";`);

    this.addSql(`alter table "department" drop constraint "department_semester_id_foreign";`);

    this.addSql(`alter table "program" drop constraint "program_department_id_foreign";`);

    this.addSql(`alter table "course" drop constraint "course_program_id_foreign";`);

    this.addSql(`drop table if exists "campus" cascade;`);

    this.addSql(`drop table if exists "moodle_category" cascade;`);

    this.addSql(`drop table if exists "semester" cascade;`);

    this.addSql(`drop table if exists "department" cascade;`);

    this.addSql(`drop table if exists "program" cascade;`);

    this.addSql(`drop table if exists "course" cascade;`);
  }

}
