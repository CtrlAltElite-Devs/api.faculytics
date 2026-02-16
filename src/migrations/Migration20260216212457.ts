import { Migration } from '@mikro-orm/migrations';

export class Migration20260216212457 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "system_config" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" varchar(255) null, "key" varchar(255) not null, "value" text not null, "description" varchar(255) null, constraint "system_config_pkey" primary key ("id"));`);
    this.addSql(`alter table "system_config" add constraint "system_config_key_unique" unique ("key");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "system_config" cascade;`);
  }

}
