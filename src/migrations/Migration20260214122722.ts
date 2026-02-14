import { Migration } from '@mikro-orm/migrations';

export class Migration20260214122722 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "refresh_token" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "token_hash" varchar(255) not null, "user_id" varchar(255) not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, "replaced_by_token_id" varchar(255) null, "is_active" boolean not null, "browser_name" varchar(255) not null, "os" varchar(255) not null, "ip_address" varchar(255) not null, constraint "refresh_token_pkey" primary key ("id"));`);

    this.addSql(`create table "user" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "user_name" varchar(255) not null, "moodle_user_id" int not null, "first_name" varchar(255) not null, "last_name" varchar(255) not null, "user_profile_picture" varchar(255) not null, "full_name" varchar(255) null, "last_login_at" timestamptz not null, "is_active" boolean not null, constraint "user_pkey" primary key ("id"));`);
    this.addSql(`alter table "user" add constraint "user_user_name_unique" unique ("user_name");`);
    this.addSql(`alter table "user" add constraint "user_moodle_user_id_unique" unique ("moodle_user_id");`);

    this.addSql(`create table "moodle_token" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "token" varchar(255) not null, "moodle_user_id" int not null, "last_validated_at" timestamptz null, "invalidated_at" timestamptz null, "is_valid" boolean not null default true, "user_id" varchar(255) not null, constraint "moodle_token_pkey" primary key ("id"));`);
    this.addSql(`alter table "moodle_token" add constraint "moodle_token_moodle_user_id_unique" unique ("moodle_user_id");`);

    this.addSql(`create table "chatkit_thread" ("id" varchar(255) not null, "user_id" varchar(255) not null, "title" varchar(255) null, "status" jsonb not null, "metadata" jsonb not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "chatkit_thread_pkey" primary key ("id"));`);
    this.addSql(`create index "chatkit_thread_user_id_created_at_index" on "chatkit_thread" ("user_id", "created_at");`);

    this.addSql(`create table "chatkit_thread_item" ("id" varchar(255) not null, "thread_id" varchar(255) not null, "type" varchar(255) not null, "payload" jsonb not null, "created_at" timestamptz not null, constraint "chatkit_thread_item_pkey" primary key ("id"));`);
    this.addSql(`create index "chatkit_thread_item_thread_id_created_at_index" on "chatkit_thread_item" ("thread_id", "created_at");`);

    this.addSql(`alter table "moodle_token" add constraint "moodle_token_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`);

    this.addSql(`alter table "chatkit_thread" add constraint "chatkit_thread_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`);

    this.addSql(`alter table "chatkit_thread_item" add constraint "chatkit_thread_item_thread_id_foreign" foreign key ("thread_id") references "chatkit_thread" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "moodle_token" drop constraint "moodle_token_user_id_foreign";`);

    this.addSql(`alter table "chatkit_thread" drop constraint "chatkit_thread_user_id_foreign";`);

    this.addSql(`alter table "chatkit_thread_item" drop constraint "chatkit_thread_item_thread_id_foreign";`);

    this.addSql(`drop table if exists "refresh_token" cascade;`);

    this.addSql(`drop table if exists "user" cascade;`);

    this.addSql(`drop table if exists "moodle_token" cascade;`);

    this.addSql(`drop table if exists "chatkit_thread" cascade;`);

    this.addSql(`drop table if exists "chatkit_thread_item" cascade;`);
  }

}
