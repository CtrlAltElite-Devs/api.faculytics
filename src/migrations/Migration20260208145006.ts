import { Migration } from '@mikro-orm/migrations';

export class Migration20260208145006 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "user_name" varchar(255) not null, "moodle_user_id" int not null, "first_name" varchar(255) not null, "last_name" varchar(255) not null, "user_profile_picture" varchar(255) not null, "full_name" varchar(255) null, "last_login_at" timestamptz not null, "is_active" boolean not null, constraint "user_pkey" primary key ("id"));`);
    this.addSql(`alter table "user" add constraint "user_user_name_unique" unique ("user_name");`);
    this.addSql(`alter table "user" add constraint "user_moodle_user_id_unique" unique ("moodle_user_id");`);

    this.addSql(`create table "moodle_token" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "token" varchar(255) not null, "moodle_user_id" int not null, "last_validated_at" timestamptz null, "invalidated_at" timestamptz null, "is_valid" boolean not null default true, "user_id" varchar(255) not null, constraint "moodle_token_pkey" primary key ("id"));`);
    this.addSql(`alter table "moodle_token" add constraint "moodle_token_moodle_user_id_unique" unique ("moodle_user_id");`);

    this.addSql(`alter table "moodle_token" add constraint "moodle_token_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`);
  }

}
