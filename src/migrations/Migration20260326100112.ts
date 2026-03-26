import { Migration } from '@mikro-orm/migrations';

export class Migration20260326100112 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "questionnaire_type" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "name" varchar(255) not null, "code" varchar(255) not null, "description" varchar(255) null, "is_system" boolean not null default false, constraint "questionnaire_type_pkey" primary key ("id"));`);
    this.addSql(`create index "questionnaire_type_code_index" on "questionnaire_type" ("code");`);
    this.addSql(`alter table "questionnaire_type" add constraint "questionnaire_type_code_unique" unique ("code");`);

    this.addSql(`alter table "questionnaire" drop column "type";`);

    this.addSql(`alter table "questionnaire" add column "type_id" varchar(255) not null;`);
    this.addSql(`alter table "questionnaire" add constraint "questionnaire_type_id_foreign" foreign key ("type_id") references "questionnaire_type" ("id") on update cascade;`);
    this.addSql(`alter table "questionnaire" add constraint "questionnaire_type_id_unique" unique ("type_id");`);

    this.addSql(`alter table "dimension" drop constraint "dimension_code_questionnaire_type_unique";`);
    this.addSql(`alter table "dimension" drop column "questionnaire_type";`);

    this.addSql(`alter table "dimension" add column "questionnaire_type_id" varchar(255) not null;`);
    this.addSql(`alter table "dimension" add constraint "dimension_questionnaire_type_id_foreign" foreign key ("questionnaire_type_id") references "questionnaire_type" ("id") on update cascade;`);
    this.addSql(`alter table "dimension" add constraint "dimension_code_questionnaire_type_id_unique" unique ("code", "questionnaire_type_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "questionnaire" drop constraint "questionnaire_type_id_foreign";`);

    this.addSql(`alter table "dimension" drop constraint "dimension_questionnaire_type_id_foreign";`);

    this.addSql(`drop table if exists "questionnaire_type" cascade;`);

    this.addSql(`alter table "dimension" drop constraint "dimension_code_questionnaire_type_id_unique";`);
    this.addSql(`alter table "dimension" drop column "questionnaire_type_id";`);

    this.addSql(`alter table "dimension" add column "questionnaire_type" text check ("questionnaire_type" in ('FACULTY_IN_CLASSROOM', 'FACULTY_OUT_OF_CLASSROOM', 'FACULTY_FEEDBACK')) not null;`);
    this.addSql(`alter table "dimension" add constraint "dimension_code_questionnaire_type_unique" unique ("code", "questionnaire_type");`);

    this.addSql(`alter table "questionnaire" drop constraint "questionnaire_type_id_unique";`);
    this.addSql(`alter table "questionnaire" drop column "type_id";`);

    this.addSql(`alter table "questionnaire" add column "type" text check ("type" in ('FACULTY_IN_CLASSROOM', 'FACULTY_OUT_OF_CLASSROOM', 'FACULTY_FEEDBACK')) not null;`);
  }

}
